import { afterEach, describe, expect, it } from 'vitest';
import { KwaiProvider } from '@/providers/kwai/KwaiProvider';
import { KwaiNotAvailableError } from '@/providers/kwai/errors';
import { __resetEnvCacheForTests } from '@/lib/env';

describe('providers/kwai/KwaiProvider', () => {
  afterEach(() => {
    delete process.env.KWAI_API_AVAILABLE;
    __resetEnvCacheForTests();
  });

  it('fica indisponível por padrão (sem aprovação da plataforma)', () => {
    const provider = new KwaiProvider();
    expect(provider.isAvailable).toBe(false);
  });

  it('reflete KWAI_API_AVAILABLE=true quando configurado', () => {
    process.env.KWAI_API_AVAILABLE = 'true';
    __resetEnvCacheForTests();
    const provider = new KwaiProvider();
    expect(provider.isAvailable).toBe(true);
  });

  it('todo método de ação lança KwaiNotAvailableError', async () => {
    const provider = new KwaiProvider();

    await expect(provider.connect('user-1', 'http://localhost')).rejects.toThrow(KwaiNotAvailableError);
    await expect(provider.handleCallback({ code: 'x', state: 'y', redirectUri: 'http://localhost' })).rejects.toThrow(
      KwaiNotAvailableError,
    );
    await expect(provider.disconnect('token')).rejects.toThrow(KwaiNotAvailableError);
    await expect(provider.refreshToken('token')).rejects.toThrow(KwaiNotAvailableError);
    await expect(provider.getAccountInfo('token')).rejects.toThrow(KwaiNotAvailableError);
    await expect(
      provider.publishVideo({ accessToken: 'token', videoUrl: 'https://x.com/v.mp4', caption: 'oi', correlationId: 'PUB-1' }),
    ).rejects.toThrow(KwaiNotAvailableError);
    await expect(provider.getPublishStatus('token', 'job-1')).rejects.toThrow(KwaiNotAvailableError);
  });

  it('validateToken não lança — retorna inválido com motivo claro', async () => {
    const provider = new KwaiProvider();
    const result = await provider.validateToken('qualquer-token');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/aguardando autorização/);
  });

  it('validateMedia nunca aprova, mas explica o motivo em vez de só reprovar mudo', async () => {
    const provider = new KwaiProvider();
    const result = await provider.validateMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 1000,
      durationSeconds: 20,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/aguardando autorização/);
  });
});
