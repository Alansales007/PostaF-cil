import type { SocialProviderId } from '@/types';

/**
 * Contrato comum que toda rede social deve implementar.
 * Cada provider concreto (Instagram/Facebook/TikTok/Kwai) é independente:
 * nenhuma lógica de outra rede deve vazar para dentro dele.
 */

export interface OAuthConnectResult {
  /** URL para redirecionar o usuário (authorization endpoint da plataforma) */
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackInput {
  code: string;
  state: string;
  /** Precisa ser idêntico ao redirect_uri usado em connect() — exigido na troca do code pela maioria das plataformas. */
  redirectUri: string;
  codeVerifier?: string;
}

export interface ConnectedAccount {
  providerAccountId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
}

export interface AccountInfo {
  providerAccountId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  raw?: unknown;
}

export interface MediaValidationInput {
  mimeType: string;
  filesizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export interface MediaValidationResult {
  compatible: boolean;
  needsConversion: boolean;
  reasons: string[];
}

export interface PublishVideoInput {
  accessToken: string;
  videoUrl: string;
  caption: string;
  title?: string;
  correlationId: string;
}

export interface PublishVideoResult {
  /** ID de acompanhamento assíncrono da plataforma (container_id, publish_id, etc.) */
  providerJobId: string;
}

export type PublishJobStatus = 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';

export interface PublishStatusResult {
  status: PublishJobStatus;
  providerPostId?: string;
  providerUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Quando a plataforma pede para aguardar antes de nova checagem (rate limit) */
  retryAfterSeconds?: number;
}

export interface SocialProvider {
  readonly id: SocialProviderId;
  /** false quando a API oficial ainda não está liberada para o app/região (ex.: Kwai) */
  readonly isAvailable: boolean;

  connect(userId: string, redirectUri: string): Promise<OAuthConnectResult>;
  handleCallback(input: OAuthCallbackInput): Promise<ConnectedAccount>;
  disconnect(accessToken: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<ConnectedAccount>;
  validateToken(accessToken: string): Promise<TokenValidationResult>;
  getAccountInfo(accessToken: string): Promise<AccountInfo>;
  validateMedia(input: MediaValidationInput): Promise<MediaValidationResult>;
  publishVideo(input: PublishVideoInput): Promise<PublishVideoResult>;
  getPublishStatus(accessToken: string, providerJobId: string): Promise<PublishStatusResult>;
  deleteTemporaryResources(providerJobId: string): Promise<void>;
}
