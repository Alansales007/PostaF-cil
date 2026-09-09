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
import { validateFacebookMedia } from './constraints';
import { describeFacebookError } from './errors';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  finishReelUpload,
  getManagedPages,
  getPageProfile,
  getVideoPermalink,
  getVideoStatus,
  startReelUploadSession,
  uploadReelFromUrl,
} from './api';

/**
 * Facebook Pages via Facebook Login for Business + Video API (Reels).
 * Ver providers/facebook/api.ts para os endpoints exatos e a data em que
 * foram conferidos contra a documentação oficial.
 *
 * Particularidades em relação ao contrato genérico SocialProvider:
 *
 * 1. O OAuth do Facebook devolve um token de USUÁRIO, mas quem publica é a
 *    PÁGINA — cada Página tem seu próprio access_token, obtido em
 *    GET /me/accounts. Como o usuário pode administrar mais de uma
 *    Página, `handleCallback()` sozinho não decide qual conectar: quando
 *    há mais de uma, a rota de callback (app/api/social/facebook/callback)
 *    detecta isso e redireciona para uma tela de escolha antes de chamar
 *    o equivalente ao "upsert" de conta — ver lib/oauth/facebook-page-selection.ts.
 *    `handleCallback()` aqui devolve a lista de Páginas disponíveis
 *    dentro de `scopes` como um JSON serializado quando há mais de uma,
 *    e a própria conta (já resolvida) quando há só uma.
 *
 * 2. Token de Página derivado de um token de usuário de longa duração não
 *    expira (só é invalidado por revogação/troca de senha) — por isso
 *    `refreshToken()` aqui não tem um mecanismo de renovação de verdade
 *    (não guardamos o token de usuário original): ele só valida se o
 *    token de Página ainda funciona.
 */
export class FacebookProvider implements SocialProvider {
  readonly id = 'FACEBOOK' as const;
  readonly isAvailable = true;

  async connect(userId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const state = await createOAuthState(userId, 'FACEBOOK', redirectUri);
    return { authorizationUrl: buildAuthorizationUrl(state, redirectUri), state };
  }

  /**
   * Troca o code por um token de usuário de longa duração e busca as
   * Páginas administradas. Não decide sozinho qual Página conectar —
   * isso é responsabilidade da rota de callback (ver nota da classe).
   */
  async exchangeCodeForManagedPages(code: string, redirectUri: string) {
    const shortLived = await exchangeCodeForToken(code, redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const pages = await getManagedPages(longLived.access_token);
    return pages;
  }

  async handleCallback(_input: OAuthCallbackInput): Promise<ConnectedAccount> {
    throw new Error(
      'FacebookProvider.handleCallback() não é usado diretamente — a rota de callback chama exchangeCodeForManagedPages() ' +
        'porque o Facebook pode retornar mais de uma Página para o mesmo login.',
    );
  }

  async disconnect(_accessToken: string): Promise<void> {
    // Não há endpoint de revogação server-to-server documentado para este
    // fluxo — "desconectar" remove a conta do nosso banco (rota chamadora).
    // Revogação completa: usuário > Configurações do Facebook > Apps e
    // sites > remover o PostaFácil.
  }

  async refreshToken(refreshToken: string): Promise<ConnectedAccount> {
    // Não guardamos o token de usuário original, então não há como
    // re-derivar um novo token de Página aqui — só confirmamos que o
    // token de Página atual ainda é válido (ver nota da classe).
    const info = await this.getAccountInfo(refreshToken);
    return {
      providerAccountId: info.providerAccountId,
      username: null,
      displayName: info.displayName,
      avatarUrl: info.avatarUrl,
      accessToken: refreshToken,
      refreshToken: null,
      expiresAt: null,
      scopes: [],
    };
  }

  async validateToken(accessToken: string): Promise<TokenValidationResult> {
    try {
      await this.getAccountInfo(accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: describeFacebookError(err).message };
    }
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const { pageId, accessToken: pageToken } = splitAccessToken(accessToken);
    const profile = await getPageProfile(pageId, pageToken);
    return {
      providerAccountId: profile.id,
      username: null,
      displayName: profile.name,
      avatarUrl: profile.picture?.data?.url ?? null,
      raw: profile,
    };
  }

  async validateMedia(input: MediaValidationInput): Promise<MediaValidationResult> {
    return validateFacebookMedia(input);
  }

  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    const { pageId, accessToken } = splitAccessToken(input.accessToken);

    try {
      const session = await startReelUploadSession(pageId, accessToken);
      await uploadReelFromUrl(session.video_id, accessToken, input.videoUrl);
      await finishReelUpload(pageId, accessToken, { videoId: session.video_id, description: input.caption });
      return { providerJobId: session.video_id };
    } catch (err) {
      throw new Error(describeFacebookError(err).message);
    }
  }

  async getPublishStatus(accessToken: string, providerJobId: string): Promise<PublishStatusResult> {
    const { pageId: _pageId, accessToken: token } = splitAccessToken(accessToken);

    try {
      const status = await getVideoStatus(providerJobId, token);
      const phaseStatuses = [status.uploading_phase?.status, status.processing_phase?.status, status.publishing_phase?.status].filter(
        Boolean,
      );

      const hasError = status.video_status === 'error' || phaseStatuses.some((s) => s?.toLowerCase().includes('error'));
      if (hasError) {
        return { status: 'FAILED', errorCode: 'PROCESSING_ERROR', errorMessage: 'O Facebook não conseguiu processar o vídeo.' };
      }

      const isReady = status.video_status === 'ready';
      if (!isReady) {
        return { status: 'PROCESSING' };
      }

      const permalink = await getVideoPermalink(providerJobId, token);
      return { status: 'PUBLISHED', providerPostId: providerJobId, providerUrl: permalink ?? undefined };
    } catch (err) {
      const described = describeFacebookError(err);
      if (described.code === 'RATE_LIMITED') {
        return { status: 'PROCESSING', retryAfterSeconds: 60 };
      }
      return { status: 'FAILED', errorCode: described.code, errorMessage: described.message };
    }
  }

  async deleteTemporaryResources(): Promise<void> {
    // Não há um endpoint de exclusão explícita da sessão de upload do Reel.
  }
}

/** Ver providers/instagram/InstagramProvider.ts — mesmo padrão de empacotamento "id:token". */
export function packAccessToken(pageId: string, accessToken: string): string {
  return `${pageId}:${accessToken}`;
}

export function splitAccessToken(packed: string): { pageId: string; accessToken: string } {
  const separatorIndex = packed.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error('accessToken do Facebook mal formado (esperado "pageId:token").');
  }
  return { pageId: packed.slice(0, separatorIndex), accessToken: packed.slice(separatorIndex + 1) };
}
