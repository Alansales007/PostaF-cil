import type {
  AccountInfo,
  ConnectedAccount,
  MediaValidationInput,
  MediaValidationResult,
  OAuthCallbackInput,
  OAuthConnectResult,
  PublishStatusResult,
  PublishVideoInput,
  PublishVideoResult,
  SocialProvider,
  TokenValidationResult,
} from '@/providers/SocialProvider';
import { createOAuthState } from '@/lib/oauth/state';
import { validateInstagramMedia } from './constraints';
import { describeInstagramError } from './errors';
import {
  buildAuthorizationUrl,
  createMediaContainer,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getContainerStatus,
  getMediaPermalink,
  getProfile,
  publishContainer,
  refreshLongLivedToken,
} from './api';

/**
 * Instagram via "Instagram API with Instagram Login" (Business Login for
 * Instagram) + Content Publishing API. Ver providers/instagram/api.ts para
 * os endpoints exatos e a data em que foram conferidos contra a
 * documentação oficial.
 *
 * Particularidade deste provider em relação ao contrato genérico
 * SocialProvider: o Instagram não usa refresh_token separado — o mesmo
 * access_token de longa duração (60 dias) é renovado nele mesmo. Por isso
 * `refreshToken()` aqui recebe o próprio access_token atual (não um
 * refresh_token distinto) e devolve um novo access_token com validade
 * estendida.
 *
 * Outra particularidade: a Graph API não expõe um endpoint de "publicar
 * agora" separado de "publicar quando o container terminar de processar" —
 * então `getPublishStatus()` é responsável por, ao detectar o container
 * FINISHED, chamar media_publish e só então retornar PUBLISHED. Isso é
 * consistente com o contrato (o worker faz polling até um estado terminal).
 */
export class InstagramProvider implements SocialProvider {
  readonly id = 'INSTAGRAM' as const;
  readonly isAvailable = true;

  async connect(userId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const state = await createOAuthState(userId, 'INSTAGRAM', redirectUri);
    return { authorizationUrl: buildAuthorizationUrl(state, redirectUri), state };
  }

  async handleCallback(input: OAuthCallbackInput): Promise<ConnectedAccount> {
    if (!input.redirectUri) {
      throw new Error('redirectUri é obrigatório para concluir o OAuth do Instagram.');
    }

    const shortLived = await exchangeCodeForToken(input.code, input.redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const profile = await getProfile(longLived.access_token);

    return {
      providerAccountId: profile.user_id,
      username: profile.username,
      displayName: profile.name ?? null,
      avatarUrl: profile.profile_picture_url ?? null,
      accessToken: longLived.access_token,
      refreshToken: null, // Instagram não usa refresh_token separado — ver nota da classe
      expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
      scopes: shortLived.permissions ?? [],
    };
  }

  async disconnect(_accessToken: string): Promise<void> {
    // A Graph API do Instagram (graph.instagram.com) não documenta um
    // endpoint de revogação server-to-server para este fluxo de login.
    // "Desconectar" aqui remove/à marca a conta como revogada no nosso
    // banco (feito pela rota que chama este método); a revogação completa
    // do lado do Instagram precisa ser feita pelo usuário em
    // Instagram > Configurações > Apps e mídia > Permissões do site.
  }

  async refreshToken(refreshToken: string): Promise<ConnectedAccount> {
    // Aqui `refreshToken` é, na prática, o access_token de longa duração
    // atual (ver nota da classe) — a Graph API exige que ele tenha pelo
    // menos 24h de idade e ainda não tenha expirado.
    const refreshed = await refreshLongLivedToken(refreshToken);
    const profile = await getProfile(refreshed.access_token);

    return {
      providerAccountId: profile.user_id,
      username: profile.username,
      displayName: profile.name ?? null,
      avatarUrl: profile.profile_picture_url ?? null,
      accessToken: refreshed.access_token,
      refreshToken: null,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      scopes: [],
    };
  }

  async validateToken(accessToken: string): Promise<TokenValidationResult> {
    try {
      await getProfile(accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: describeInstagramError(err).message };
    }
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const profile = await getProfile(accessToken);
    return {
      providerAccountId: profile.user_id,
      username: profile.username,
      displayName: profile.name ?? null,
      avatarUrl: profile.profile_picture_url ?? null,
      raw: profile,
    };
  }

  async validateMedia(input: MediaValidationInput): Promise<MediaValidationResult> {
    return validateInstagramMedia(input);
  }

  /**
   * Cria o media container do Reel. `input.videoUrl` precisa ser uma URL
   * HTTPS acessível publicamente (ou assinada) — a Graph API busca o vídeo
   * a partir dela, não recebe upload binário direto.
   */
  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    // O providerAccountId (ig-user-id) precisa ser resolvido pelo chamador
    // (publicationService, ETAPA 7) e embutido no accessToken/contexto —
    // por ora, assumimos que ele vem concatenado como "igUserId:token" para
    // manter a assinatura genérica do contrato sem alterar a interface.
    const { igUserId, accessToken } = splitAccessToken(input.accessToken);

    try {
      const container = await createMediaContainer(igUserId, accessToken, {
        videoUrl: input.videoUrl,
        caption: input.caption,
      });
      return { providerJobId: container.id };
    } catch (err) {
      const described = describeInstagramError(err);
      throw new Error(described.message);
    }
  }

  async getPublishStatus(accessToken: string, providerJobId: string): Promise<PublishStatusResult> {
    const { igUserId, accessToken: token } = splitAccessToken(accessToken);

    try {
      const status = await getContainerStatus(providerJobId, token);

      if (status.status_code === 'IN_PROGRESS') {
        return { status: 'PROCESSING' };
      }
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        return { status: 'FAILED', errorCode: status.status_code, errorMessage: 'O Instagram não conseguiu processar o vídeo.' };
      }

      // FINISHED (ou já PUBLISHED, se checarmos de novo por algum motivo) -> publica de fato.
      const published = await publishContainer(igUserId, token, providerJobId);
      const permalink = await getMediaPermalink(published.id, token);

      return {
        status: 'PUBLISHED',
        providerPostId: published.id,
        providerUrl: permalink ?? undefined,
      };
    } catch (err) {
      const described = describeInstagramError(err);
      if (described.code === 'RATE_LIMITED') {
        return { status: 'PROCESSING', retryAfterSeconds: 60 };
      }
      return { status: 'FAILED', errorCode: described.code, errorMessage: described.message };
    }
  }

  async deleteTemporaryResources(): Promise<void> {
    // A Meta expira containers não publicados automaticamente após 24h —
    // não há um endpoint de exclusão explícita do container em si.
  }
}

/**
 * Empacota igUserId + accessToken em uma única string para caber na
 * assinatura genérica `publishVideo({ accessToken })` do contrato
 * SocialProvider sem precisar alterá-la — o publicationService (ETAPA 7)
 * é responsável por montar essa string a partir do SocialAccount.
 */
export function packAccessToken(igUserId: string, accessToken: string): string {
  return `${igUserId}:${accessToken}`;
}

export function splitAccessToken(packed: string): { igUserId: string; accessToken: string } {
  const separatorIndex = packed.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error('accessToken do Instagram mal formado (esperado "igUserId:token").');
  }
  return { igUserId: packed.slice(0, separatorIndex), accessToken: packed.slice(separatorIndex + 1) };
}
