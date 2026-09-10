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
import { generateCodeVerifier, deriveCodeChallenge } from './pkce';
import { validateTikTokMedia } from './constraints';
import { describeFailReason, describeTikTokError } from './errors';
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchVideoRange,
  fetchVideoSizeBytes,
  getPublishStatus,
  getUserInfo,
  initDirectPostFileUpload,
  queryCreatorInfo,
  refreshAccessToken,
  revokeToken,
  uploadDirectPostChunk,
  type TikTokPrivacyLevel,
} from './api';
import { computeFileUploadChunkPlan, getChunkRange, type FileUploadChunkPlan } from './file-upload-plan';

/**
 * TikTok via Login Kit (OAuth 2.0 + PKCE obrigatório) + Content Posting API
 * (Direct Post). Ver providers/tiktok/api.ts para os endpoints exatos e a
 * data em que foram conferidos contra a documentação oficial.
 *
 * Particularidades em relação ao contrato genérico SocialProvider:
 *
 * 1. PKCE é obrigatório — `connect()` gera o par verifier/challenge e
 *    persiste o verifier em `oauth_states.codeVerifier` (mesma tabela dos
 *    outros providers); `handleCallback()` exige `input.codeVerifier`.
 * 2. Diferente de Instagram/Facebook, o TikTok usa o par access_token
 *    (24h) + refresh_token (365 dias) clássico — o único dos três que
 *    mapeia 1:1 com `refreshToken()` do contrato.
 * 3. `publishVideo()` consulta Creator Info antes de publicar (exigido
 *    pela API) e, por segurança, usa SELF_ONLY como nível de privacidade
 *    padrão — apps não auditados só podem publicar em privado mesmo que
 *    peçam outro nível, e um nível diferente exige consentimento explícito
 *    do usuário na tela de publicação (ETAPA 7), não uma escolha unilateral
 *    do backend.
 * 4. `disconnect()` aqui é o único dos três que consegue revogar de
 *    verdade no servidor (POST /v2/oauth/revoke/) — Instagram e Facebook
 *    não documentam um equivalente.
 */
export class TikTokProvider implements SocialProvider {
  readonly id = 'TIKTOK' as const;
  readonly isAvailable = true;

  async connect(userId: string, redirectUri: string): Promise<OAuthConnectResult> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);
    const state = await createOAuthState(userId, 'TIKTOK', redirectUri, codeVerifier);
    return { authorizationUrl: buildAuthorizationUrl(state, redirectUri, codeChallenge), state };
  }

  async handleCallback(input: OAuthCallbackInput): Promise<ConnectedAccount> {
    if (!input.codeVerifier) {
      throw new Error('code_verifier ausente — o PKCE do TikTok não pode ser concluído.');
    }

    const token = await exchangeCodeForToken(input.code, input.redirectUri, input.codeVerifier);
    const user = await getUserInfo(token.access_token);

    return {
      providerAccountId: user.open_id,
      username: null,
      displayName: user.display_name ?? null,
      avatarUrl: user.avatar_url ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope ? token.scope.split(',') : [],
    };
  }

  async disconnect(accessToken: string): Promise<void> {
    await revokeToken(accessToken);
  }

  async refreshToken(refreshToken: string): Promise<ConnectedAccount> {
    const token = await refreshAccessToken(refreshToken);
    const user = await getUserInfo(token.access_token);

    return {
      providerAccountId: user.open_id,
      username: null,
      displayName: user.display_name ?? null,
      avatarUrl: user.avatar_url ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope ? token.scope.split(',') : [],
    };
  }

  async validateToken(accessToken: string): Promise<TokenValidationResult> {
    try {
      await getUserInfo(accessToken);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: describeTikTokError(err).message };
    }
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const user = await getUserInfo(accessToken);
    return {
      providerAccountId: user.open_id,
      username: null,
      displayName: user.display_name ?? null,
      avatarUrl: user.avatar_url ?? null,
      raw: user,
    };
  }

  async validateMedia(input: MediaValidationInput): Promise<MediaValidationResult> {
    return validateTikTokMedia(input);
  }

  /**
   * Publica via FILE_UPLOAD, não PULL_FROM_URL — de propósito. PULL_FROM_URL
   * exigiria verificar a propriedade do domínio do vídeo no painel do
   * TikTok, o que não é praticável de forma genérica (o vídeo pode estar em
   * qualquer storage S3-compatible, cujo domínio o usuário do PostaFácil
   * não necessariamente consegue provar que possui — ex.: o endpoint
   * compartilhado do Cloudflare R2). FILE_UPLOAD não tem essa exigência.
   *
   * Lê o vídeo do storage em pedaços via Range HTTP e reenvia cada pedaço
   * ao `upload_url` do TikTok (ver providers/tiktok/file-upload-plan.ts
   * para as regras de tamanho de chunk) — nunca baixa o arquivo inteiro de
   * uma vez só. Consulta Creator Info antes, como a API exige, e usa
   * SELF_ONLY por padrão — ver nota da classe.
   */
  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    try {
      const creatorInfo = await queryCreatorInfo(input.accessToken);
      const privacyLevel = pickDefaultPrivacyLevel(creatorInfo.privacy_level_options);

      const videoSizeBytes = await fetchVideoSizeBytes(input.videoUrl);
      const plan = computeFileUploadChunkPlan(videoSizeBytes);

      const session = await initDirectPostFileUpload(input.accessToken, {
        title: input.caption,
        privacyLevel,
        disableComment: creatorInfo.comment_disabled,
        disableDuet: creatorInfo.duet_disabled,
        disableStitch: creatorInfo.stitch_disabled,
        videoSizeBytes,
        chunkSizeBytes: plan.chunkSizeBytes,
        totalChunkCount: plan.totalChunkCount,
      });

      await uploadVideoInChunks(input.videoUrl, session.upload_url, videoSizeBytes, plan);

      return { providerJobId: session.publish_id };
    } catch (err) {
      throw new Error(describeTikTokError(err).message);
    }
  }

  async getPublishStatus(accessToken: string, providerJobId: string): Promise<PublishStatusResult> {
    try {
      const status = await getPublishStatus(accessToken, providerJobId);

      if (status.status === 'FAILED') {
        return {
          status: 'FAILED',
          errorCode: status.fail_reason ?? 'FAILED',
          errorMessage: describeFailReason(status.fail_reason) ?? 'O TikTok recusou a publicação.',
        };
      }

      if (status.status === 'PUBLISH_COMPLETE') {
        const postId = status.publicaly_available_post_id?.[0];
        return { status: 'PUBLISHED', providerPostId: postId ?? providerJobId };
      }

      // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX
      return { status: 'PROCESSING' };
    } catch (err) {
      const described = describeTikTokError(err);
      if (described.code === 'RATE_LIMITED') {
        // A API permite só 30 chamadas/min por token neste endpoint.
        return { status: 'PROCESSING', retryAfterSeconds: 30 };
      }
      return { status: 'FAILED', errorCode: described.code, errorMessage: described.message };
    }
  }

  async deleteTemporaryResources(): Promise<void> {
    // Não há um endpoint de exclusão explícita da sessão de publicação.
  }
}

/**
 * Apps não auditados só publicam como privado de qualquer forma — usamos
 * SELF_ONLY como padrão seguro sempre que disponível, mesmo que a conta
 * já tenha acesso a níveis mais abertos. Uma escolha explícita de outro
 * nível deve vir de um consentimento do usuário na tela de publicação
 * (ETAPA 7), não de uma decisão automática do backend.
 */
function pickDefaultPrivacyLevel(options: TikTokPrivacyLevel[]): TikTokPrivacyLevel {
  if (options.includes('SELF_ONLY')) return 'SELF_ONLY';
  return options[0] ?? 'SELF_ONLY';
}

/**
 * Envia os chunks em sequência (exigido pela API do TikTok — "file chunks
 * must be uploaded sequentially") — nunca em paralelo. Cada chunk é lido
 * do storage e reenviado ao TikTok um de cada vez, sem manter o vídeo
 * inteiro em memória.
 */
async function uploadVideoInChunks(videoUrl: string, uploadUrl: string, videoSizeBytes: number, plan: FileUploadChunkPlan): Promise<void> {
  for (let chunkIndex = 0; chunkIndex < plan.totalChunkCount; chunkIndex++) {
    const { start, end } = getChunkRange(chunkIndex, plan, videoSizeBytes);
    const chunk = await fetchVideoRange(videoUrl, start, end);
    await uploadDirectPostChunk(uploadUrl, chunk, { start, end, totalSize: videoSizeBytes });
  }
}
