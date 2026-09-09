import { describe, expect, it, vi } from 'vitest';
import { MockProvider } from '@/providers/mock/MockProvider';

// connect() persiste o state OAuth via Prisma (mesma tabela que os
// providers reais usam) — mockamos o db aqui para continuar sendo um
// teste unitário rápido, sem depender de um Postgres real. vi.mock é
// hoisted para o topo do arquivo pelo Vitest, então funciona mesmo
// declarado depois do import acima.
vi.mock('@/lib/db', () => ({
  db: { oAuthState: { create: vi.fn().mockResolvedValue({}) } },
}));

describe('providers/mock/MockProvider', () => {
  it('conclui o fluxo de conexão OAuth simulado', async () => {
    const provider = new MockProvider('INSTAGRAM');
    const connect = await provider.connect('user-1', 'http://localhost:3000');
    expect(connect.authorizationUrl).toContain('provider=INSTAGRAM');

    const account = await provider.handleCallback({
      code: 'abc12345',
      state: connect.state,
      redirectUri: 'http://localhost:3000',
    });
    expect(account.accessToken).toMatch(/^mock-access-/);
    expect(account.providerAccountId).toContain('instagram');
  });

  it('avança o status de publicação de PROCESSING para PUBLISHED entre chamadas', async () => {
    const provider = new MockProvider('TIKTOK');
    const { providerJobId } = await provider.publishVideo({
      accessToken: 'mock-access-x',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'legenda de teste',
      correlationId: 'PUB-TEST-0001',
    });

    const first = await provider.getPublishStatus('mock-access-x', providerJobId);
    expect(first.status).toBe('PROCESSING');

    const second = await provider.getPublishStatus('mock-access-x', providerJobId);
    expect(second.status).toBe('PUBLISHED');
    expect(second.providerPostId).toBeDefined();
  });

  it('reprova mídia que não é vídeo', async () => {
    const provider = new MockProvider('FACEBOOK');
    const result = await provider.validateMedia({
      mimeType: 'image/png',
      filesizeBytes: 1000,
      durationSeconds: null,
      width: 100,
      height: 100,
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
