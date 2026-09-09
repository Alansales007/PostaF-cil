import { randomUUID } from 'node:crypto';
import type { SocialProviderId } from '@/types';
import { createOAuthState } from '@/lib/oauth/state';
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

/**
 * Provider simulado — usado quando MOCK_SOCIAL_APIS=true.
 * Permite testar todo o fluxo (conectar conta, validar mídia, publicar,
 * acompanhar status, falhar, tentar de novo) sem publicar nada de verdade
 * e sem precisar de credenciais reais de nenhuma plataforma.
 *
 * O "estado" de cada job de publicação simulado avança progressivamente
 * a cada chamada de getPublishStatus, para exercitar o polling assíncrono
 * do jeito que as APIs reais funcionam.
 */
export class MockProvider implements SocialProvider {
  readonly isAvailable = true;
  private jobPollCount = new Map<string, number>();

  constructor(readonly id: SocialProviderId) {}

  async connect(userId: string, redirectUri: string): Promise<OAuthConnectResult> {
    // Persistimos o state de verdade (mesma tabela oauth_states que os
    // providers reais usam) para o fluxo de CSRF ser exercitado igual em
    // desenvolvimento (MOCK_SOCIAL_APIS=true) e em produção.
    const state = await createOAuthState(userId, this.id, redirectUri);
    const url = new URL('/api/mock/oauth/authorize', redirectUri);
    url.searchParams.set('provider', this.id);
    url.searchParams.set('state', state);
    url.searchParams.set('user_id', userId);
    return { authorizationUrl: url.toString(), state };
  }

  async handleCallback(input: OAuthCallbackInput): Promise<ConnectedAccount> {
    return {
      providerAccountId: `mock_${this.id.toLowerCase()}_${input.code.slice(0, 8)}`,
      username: `demo.${this.id.toLowerCase()}`,
      displayName: `Conta demo ${this.id}`,
      avatarUrl: null,
      accessToken: `mock-access-${randomUUID()}`,
      refreshToken: `mock-refresh-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: ['mock.read', 'mock.publish'],
    };
  }

  async disconnect(): Promise<void> {
    // no-op no mock
  }

  async refreshToken(): Promise<ConnectedAccount> {
    return {
      providerAccountId: `mock_${this.id.toLowerCase()}_refreshed`,
      username: `demo.${this.id.toLowerCase()}`,
      displayName: `Conta demo ${this.id}`,
      avatarUrl: null,
      accessToken: `mock-access-${randomUUID()}`,
      refreshToken: `mock-refresh-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: ['mock.read', 'mock.publish'],
    };
  }

  async validateToken(accessToken: string): Promise<TokenValidationResult> {
    return { valid: accessToken.startsWith('mock-access-') };
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return {
      providerAccountId: `mock_${this.id.toLowerCase()}`,
      username: `demo.${this.id.toLowerCase()}`,
      displayName: `Conta demo ${this.id}`,
      avatarUrl: null,
    };
  }

  async validateMedia(input: MediaValidationInput): Promise<MediaValidationResult> {
    const reasons: string[] = [];
    if (!input.mimeType.startsWith('video/')) reasons.push('Arquivo não é um vídeo.');
    if (input.filesizeBytes > 500 * 1024 * 1024) reasons.push('Arquivo maior que 500MB.');
    return { compatible: reasons.length === 0, needsConversion: false, reasons };
  }

  async publishVideo(input: PublishVideoInput): Promise<PublishVideoResult> {
    const providerJobId = `mockjob_${randomUUID()}`;
    this.jobPollCount.set(providerJobId, 0);
    return { providerJobId };
  }

  async getPublishStatus(_accessToken: string, providerJobId: string): Promise<PublishStatusResult> {
    const count = (this.jobPollCount.get(providerJobId) ?? 0) + 1;
    this.jobPollCount.set(providerJobId, count);

    if (count < 2) {
      return { status: 'PROCESSING' };
    }
    return {
      status: 'PUBLISHED',
      providerPostId: `mockpost_${providerJobId.slice(-8)}`,
      providerUrl: `https://example.com/mock/${this.id.toLowerCase()}/${providerJobId.slice(-8)}`,
    };
  }

  async deleteTemporaryResources(): Promise<void> {
    // no-op no mock
  }
}
