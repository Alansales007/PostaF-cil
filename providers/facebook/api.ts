import { getEnv } from '@/lib/env';

/**
 * Cliente de baixo nível para Facebook Login for Business + Graph API de
 * Páginas + Video API (Reels). Endpoints e parâmetros conferidos na
 * documentação oficial da Meta em setembro/2026:
 *   - developers.facebook.com/documentation/facebook-login/facebook-login-for-business
 *   - developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 *   - developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
 *   - developers.facebook.com/docs/video-api/guides/reels-publishing/
 *   - developers.facebook.com/docs/graph-api/reference/video-status/
 *
 * Revalide periodicamente — a Meta muda nomes de escopo e versões da
 * Graph API com alguma frequência.
 */

export class FacebookApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly fbtraceId?: string,
  ) {
    super(message);
    this.name = 'FacebookApiError';
  }
}

async function parseGraphResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new FacebookApiError(
      err?.message ?? `Facebook retornou HTTP ${res.status}`,
      err?.code,
      err?.error_subcode,
      err?.fbtrace_id,
    );
  }
  return data as T;
}

function graphBaseUrl(): string {
  return `https://graph.facebook.com/${getEnv().META_GRAPH_API_VERSION}`;
}

export const FACEBOOK_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];

export function buildAuthorizationUrl(state: string, redirectUri: string): string {
  const env = getEnv();
  const url = new URL(`https://www.facebook.com/${env.META_GRAPH_API_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID ?? '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);

  // Facebook Login for Business substitui `scope` por `config_id` quando
  // uma Login Configuration foi criada no painel do app (recomendado pela
  // Meta); sem isso, o dialog clássico por `scope` ainda funciona.
  if (env.FACEBOOK_CONFIG_ID) {
    url.searchParams.set('config_id', env.FACEBOOK_CONFIG_ID);
  } else {
    url.searchParams.set('scope', FACEBOOK_SCOPES.join(','));
  }

  return url.toString();
}

export interface ShortLivedTokenResult {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<ShortLivedTokenResult> {
  const env = getEnv();
  const url = new URL(`${graphBaseUrl()}/oauth/access_token`);
  url.searchParams.set('client_id', env.META_APP_ID ?? '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('client_secret', env.META_APP_SECRET ?? '');
  url.searchParams.set('code', code);

  const res = await fetch(url.toString());
  return parseGraphResponse<ShortLivedTokenResult>(res);
}

export interface LongLivedTokenResult {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos (tipicamente ~60 dias)
}

export async function exchangeForLongLivedToken(shortLivedAccessToken: string): Promise<LongLivedTokenResult> {
  const env = getEnv();
  const url = new URL(`${graphBaseUrl()}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', env.META_APP_ID ?? '');
  url.searchParams.set('client_secret', env.META_APP_SECRET ?? '');
  url.searchParams.set('fb_exchange_token', shortLivedAccessToken);

  const res = await fetch(url.toString());
  return parseGraphResponse<LongLivedTokenResult>(res);
}

export interface FacebookPage {
  id: string;
  name: string;
  category?: string;
  access_token: string;
}

/** Páginas que o usuário administra — cada uma já vem com seu próprio access_token (não expira, salvo revogação). */
export async function getManagedPages(userAccessToken: string): Promise<FacebookPage[]> {
  const url = new URL(`${graphBaseUrl()}/me/accounts`);
  url.searchParams.set('fields', 'id,name,category,access_token');
  url.searchParams.set('access_token', userAccessToken);

  const res = await fetch(url.toString());
  const data = await parseGraphResponse<{ data: FacebookPage[] }>(res);
  return data.data ?? [];
}

export async function getPageProfile(pageId: string, pageAccessToken: string): Promise<{ id: string; name: string; picture?: { data?: { url?: string } } }> {
  const url = new URL(`${graphBaseUrl()}/${pageId}`);
  url.searchParams.set('fields', 'id,name,picture');
  url.searchParams.set('access_token', pageAccessToken);

  const res = await fetch(url.toString());
  return parseGraphResponse(res);
}

export interface StartReelSessionResult {
  video_id: string;
  upload_url: string;
}

export async function startReelUploadSession(pageId: string, pageAccessToken: string): Promise<StartReelSessionResult> {
  const url = new URL(`${graphBaseUrl()}/${pageId}/video_reels`);
  const body = new URLSearchParams({ upload_phase: 'start', access_token: pageAccessToken });

  const res = await fetch(url.toString(), { method: 'POST', body });
  return parseGraphResponse<StartReelSessionResult>(res);
}

/**
 * Envia o vídeo para o servidor de upload (rupload.facebook.com), a partir
 * de uma URL já hospedada (nosso storage) — sem precisar reenviar o
 * binário pelo nosso servidor.
 */
export async function uploadReelFromUrl(videoId: string, pageAccessToken: string, videoUrl: string): Promise<void> {
  const version = getEnv().META_GRAPH_API_VERSION;
  const res = await fetch(`https://rupload.facebook.com/video-upload/${version}/${videoId}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageAccessToken}`,
      file_url: videoUrl,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new FacebookApiError(data?.error?.message ?? `Falha ao enviar vídeo para o Facebook (HTTP ${res.status})`, data?.error?.code);
  }
}

export type FacebookVideoState = 'PUBLISHED' | 'SCHEDULED' | 'DRAFT';

export async function finishReelUpload(
  pageId: string,
  pageAccessToken: string,
  input: { videoId: string; description: string; videoState?: FacebookVideoState },
): Promise<void> {
  const url = new URL(`${graphBaseUrl()}/${pageId}/video_reels`);
  const body = new URLSearchParams({
    upload_phase: 'finish',
    video_id: input.videoId,
    video_state: input.videoState ?? 'PUBLISHED',
    description: input.description,
    access_token: pageAccessToken,
  });

  const res = await fetch(url.toString(), { method: 'POST', body });
  await parseGraphResponse<{ success: boolean }>(res);
}

export type FacebookVideoStatusValue = 'ready' | 'processing' | 'error';

export interface FacebookVideoStatus {
  video_status?: FacebookVideoStatusValue;
  uploading_phase?: { status?: string };
  processing_phase?: { status?: string };
  publishing_phase?: { status?: string };
}

export async function getVideoStatus(videoId: string, pageAccessToken: string): Promise<FacebookVideoStatus> {
  const url = new URL(`${graphBaseUrl()}/${videoId}`);
  url.searchParams.set('fields', 'status');
  url.searchParams.set('access_token', pageAccessToken);

  const res = await fetch(url.toString());
  const data = await parseGraphResponse<{ status?: FacebookVideoStatus }>(res);
  return data.status ?? {};
}

export async function getVideoPermalink(videoId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const url = new URL(`${graphBaseUrl()}/${videoId}`);
    url.searchParams.set('fields', 'permalink_url');
    url.searchParams.set('access_token', pageAccessToken);
    const res = await fetch(url.toString());
    const data = await parseGraphResponse<{ permalink_url?: string }>(res);
    return data.permalink_url ?? null;
  } catch {
    return null; // campo não confirmado oficialmente para este objeto — best-effort
  }
}
