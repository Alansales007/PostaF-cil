import { getEnv } from '@/lib/env';

/**
 * Cliente de baixo nível para TikTok Login Kit + Content Posting API
 * (Direct Post). Endpoints e parâmetros conferidos na documentação oficial
 * em setembro/2026:
 *   - developers.tiktok.com/doc/login-kit-overview
 *   - developers.tiktok.com/doc/oauth-user-access-token-management
 *   - developers.tiktok.com/docs/en/content-posting-api-get-started
 *   - developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status
 *
 * Revalide periodicamente — o TikTok muda parâmetros e exige auditoria
 * para funcionalidades avançadas.
 */

export class TikTokApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly logId?: string,
  ) {
    super(message);
    this.name = 'TikTokApiError';
  }
}

async function parseTikTokResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);

  // A API v2 usa duas formas de erro: OAuth clássico ({error, error_description})
  // e o envelope {data, error:{code,message,log_id}} do Content Posting API.
  const oauthError = data?.error && typeof data.error === 'string' ? data.error : null;
  const apiError = data?.error && typeof data.error === 'object' ? data.error : null;

  if (!res.ok || (apiError && apiError.code && apiError.code !== 'ok')) {
    throw new TikTokApiError(
      apiError?.message ?? data?.error_description ?? oauthError ?? `TikTok retornou HTTP ${res.status}`,
      apiError?.code ?? oauthError ?? undefined,
      apiError?.log_id,
    );
  }

  return data as T;
}

function apiBaseUrl(): string {
  return 'https://open.tiktokapis.com/v2';
}

export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish'];

export function buildAuthorizationUrl(state: string, redirectUri: string, codeChallenge: string): string {
  const env = getEnv();
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY ?? '');
  url.searchParams.set('scope', TIKTOK_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface TikTokTokenResult {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 86400s (24h)
  refresh_expires_in: number; // 31536000s (365 dias)
  open_id: string;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(code: string, redirectUri: string, codeVerifier: string): Promise<TikTokTokenResult> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY ?? '',
    client_secret: env.TIKTOK_CLIENT_SECRET ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(`${apiBaseUrl()}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  return parseTikTokResponse<TikTokTokenResult>(res);
}

export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokenResult> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY ?? '',
    client_secret: env.TIKTOK_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(`${apiBaseUrl()}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  return parseTikTokResponse<TikTokTokenResult>(res);
}

export async function revokeToken(accessToken: string): Promise<void> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY ?? '',
    client_secret: env.TIKTOK_CLIENT_SECRET ?? '',
    token: accessToken,
  });

  await fetch(`${apiBaseUrl()}/oauth/revoke/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

export interface TikTokUser {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
}

export async function getUserInfo(accessToken: string): Promise<TikTokUser> {
  const url = new URL(`${apiBaseUrl()}/user/info/`);
  url.searchParams.set('fields', 'open_id,union_id,avatar_url,display_name');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await parseTikTokResponse<{ data: { user: TikTokUser } }>(res);
  return data.data.user;
}

export type TikTokPrivacyLevel = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';

export interface TikTokCreatorInfo {
  creator_username: string;
  creator_nickname: string;
  creator_avatar_url: string;
  privacy_level_options: TikTokPrivacyLevel[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

/**
 * Obrigatório consultar antes de publicar — além de retornar as opções de
 * privacidade disponíveis para a conta, é a fonte real do limite de
 * duração aceito (varia por conta/região, não é um valor fixo do app).
 */
export async function queryCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetch(`${apiBaseUrl()}/post/publish/creator_info/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
  });
  const data = await parseTikTokResponse<{ data: TikTokCreatorInfo }>(res);
  return data.data;
}

export interface DirectPostOptions {
  title: string;
  privacyLevel: TikTokPrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export async function initDirectPostFromUrl(
  accessToken: string,
  input: DirectPostOptions & { videoUrl: string },
): Promise<{ publish_id: string }> {
  const res = await fetch(`${apiBaseUrl()}/post/publish/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: input.title,
        privacy_level: input.privacyLevel,
        disable_comment: input.disableComment ?? false,
        disable_duet: input.disableDuet ?? false,
        disable_stitch: input.disableStitch ?? false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: input.videoUrl,
      },
    }),
  });
  const data = await parseTikTokResponse<{ data: { publish_id: string } }>(res);
  return data.data;
}

export interface DirectPostFileUploadSession {
  publish_id: string;
  upload_url: string;
}

/** Alternativa a PULL_FROM_URL — não exige domínio verificado, mas o vídeo precisa ser enviado em chunks para `upload_url`. */
export async function initDirectPostFileUpload(
  accessToken: string,
  input: DirectPostOptions & { videoSizeBytes: number; chunkSizeBytes: number; totalChunkCount: number },
): Promise<DirectPostFileUploadSession> {
  const res = await fetch(`${apiBaseUrl()}/post/publish/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: input.title,
        privacy_level: input.privacyLevel,
        disable_comment: input.disableComment ?? false,
        disable_duet: input.disableDuet ?? false,
        disable_stitch: input.disableStitch ?? false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: input.videoSizeBytes,
        chunk_size: input.chunkSizeBytes,
        total_chunk_count: input.totalChunkCount,
      },
    }),
  });
  const data = await parseTikTokResponse<{ data: DirectPostFileUploadSession }>(res);
  return data.data;
}

/** Envia um chunk do vídeo (FILE_UPLOAD) — protocolo de Content-Range do próprio TikTok, distinto do nosso upload multipart interno. */
export async function uploadDirectPostChunk(
  uploadUrl: string,
  chunk: Uint8Array,
  range: { start: number; end: number; totalSize: number },
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${range.start}-${range.end}/${range.totalSize}`,
      'Content-Length': String(chunk.length),
    },
    body: Buffer.from(chunk),
  });
  if (!res.ok) {
    throw new TikTokApiError(`Falha ao enviar chunk do vídeo para o TikTok (HTTP ${res.status})`);
  }
}

export type TikTokPublishStatusValue =
  | 'PROCESSING_UPLOAD'
  | 'PROCESSING_DOWNLOAD'
  | 'SEND_TO_USER_INBOX'
  | 'PUBLISH_COMPLETE'
  | 'FAILED';

export interface TikTokPublishStatus {
  status: TikTokPublishStatusValue;
  fail_reason?: string;
  publicaly_available_post_id?: string[];
}

export async function getPublishStatus(accessToken: string, publishId: string): Promise<TikTokPublishStatus> {
  const res = await fetch(`${apiBaseUrl()}/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = await parseTikTokResponse<{ data: TikTokPublishStatus }>(res);
  return data.data;
}
