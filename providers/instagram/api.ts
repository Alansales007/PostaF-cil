import { getEnv } from '@/lib/env';

/**
 * Cliente de baixo nível para a Instagram API with Instagram Login
 * ("Business Login for Instagram") + Instagram Graph API de publicação.
 *
 * Endpoints e parâmetros conferidos na documentação oficial da Meta em
 * setembro/2026 (developers.facebook.com/docs/instagram-platform):
 *   - Autorização:        https://www.instagram.com/oauth/authorize
 *   - Troca code→token:   https://api.instagram.com/oauth/access_token
 *   - Token de longa vida: https://graph.instagram.com/access_token
 *   - Refresh:             https://graph.instagram.com/refresh_access_token
 *   - Perfil / publicação: https://graph.instagram.com/{version}/...
 *
 * Revalide esta lista periodicamente — a Meta muda nomes de escopo e
 * versões da Graph API com alguma frequência.
 */

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }
}

async function parseGraphResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new InstagramApiError(
      err?.message ?? `Instagram retornou HTTP ${res.status}`,
      err?.code,
      err?.error_subcode,
      err?.fbtrace_id,
    );
  }
  return data as T;
}

function graphBaseUrl(): string {
  return `https://graph.instagram.com/${getEnv().INSTAGRAM_GRAPH_API_VERSION}`;
}

export const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

export function buildAuthorizationUrl(state: string, redirectUri: string): string {
  const env = getEnv();
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', env.INSTAGRAM_APP_ID ?? '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', INSTAGRAM_SCOPES.join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

export interface ShortLivedTokenResult {
  access_token: string;
  user_id: string;
  permissions?: string[];
}

/** Troca o `code` da autorização por um token de curta duração (válido ~1h, uso único). */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<ShortLivedTokenResult> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID ?? '',
    client_secret: env.INSTAGRAM_APP_SECRET ?? '',
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  return parseGraphResponse<ShortLivedTokenResult>(res);
}

export interface LongLivedTokenResult {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos (tipicamente 60 dias)
}

/** Troca o token de curta duração por um de longa duração (~60 dias). */
export async function exchangeForLongLivedToken(shortLivedAccessToken: string): Promise<LongLivedTokenResult> {
  const env = getEnv();
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', env.INSTAGRAM_APP_SECRET ?? '');
  url.searchParams.set('access_token', shortLivedAccessToken);

  const res = await fetch(url.toString());
  return parseGraphResponse<LongLivedTokenResult>(res);
}

/**
 * Renova um token de longa duração já existente (precisa ter pelo menos
 * 24h de idade e ainda não ter expirado). Estende por mais ~60 dias.
 */
export async function refreshLongLivedToken(longLivedAccessToken: string): Promise<LongLivedTokenResult> {
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', longLivedAccessToken);

  const res = await fetch(url.toString());
  return parseGraphResponse<LongLivedTokenResult>(res);
}

export interface InstagramProfile {
  user_id: string;
  username: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
}

export async function getProfile(accessToken: string): Promise<InstagramProfile> {
  const url = new URL(`${graphBaseUrl()}/me`);
  url.searchParams.set('fields', 'user_id,username,name,account_type,profile_picture_url');
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString());
  return parseGraphResponse<InstagramProfile>(res);
}

export async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  input: { videoUrl: string; caption: string; mediaType?: 'REELS' | 'VIDEO' },
): Promise<{ id: string }> {
  const url = new URL(`${graphBaseUrl()}/${igUserId}/media`);
  const body = new URLSearchParams({
    video_url: input.videoUrl,
    media_type: input.mediaType ?? 'REELS',
    caption: input.caption,
    access_token: accessToken,
  });

  const res = await fetch(url.toString(), { method: 'POST', body });
  return parseGraphResponse<{ id: string }>(res);
}

export type ContainerStatusCode = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

export async function getContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<{ status_code: ContainerStatusCode; status?: string }> {
  const url = new URL(`${graphBaseUrl()}/${containerId}`);
  url.searchParams.set('fields', 'status_code,status');
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString());
  return parseGraphResponse(res);
}

export async function publishContainer(igUserId: string, accessToken: string, creationId: string): Promise<{ id: string }> {
  const url = new URL(`${graphBaseUrl()}/${igUserId}/media_publish`);
  const body = new URLSearchParams({ creation_id: creationId, access_token: accessToken });

  const res = await fetch(url.toString(), { method: 'POST', body });
  return parseGraphResponse<{ id: string }>(res);
}

export async function getMediaPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const url = new URL(`${graphBaseUrl()}/${mediaId}`);
    url.searchParams.set('fields', 'permalink');
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url.toString());
    const data = await parseGraphResponse<{ permalink?: string }>(res);
    return data.permalink ?? null;
  } catch {
    return null; // não é crítico — a publicação já foi feita, só não temos o link ainda
  }
}
