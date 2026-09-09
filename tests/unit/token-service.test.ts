import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SocialAccount } from '@prisma/client';
import { encryptToken } from '@/lib/crypto';

const updateMock = vi.fn().mockResolvedValue({});
const refreshTokenMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: { socialAccount: { update: (...args: unknown[]) => updateMock(...args) } },
}));

vi.mock('@/providers', () => ({
  getSocialProvider: () => ({ refreshToken: (...args: unknown[]) => refreshTokenMock(...args) }),
}));

const { getValidAccessToken } = await import('@/services/tokenService');

function makeAccount(overrides: Partial<{ tokenExpiresAt: Date | null; accessToken: string }> = {}) {
  const accessToken = overrides.accessToken ?? 'token-atual';
  return {
    id: 'account-1',
    provider: 'INSTAGRAM',
    encryptedAccessToken: encryptToken(accessToken),
    tokenExpiresAt: overrides.tokenExpiresAt === undefined ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : overrides.tokenExpiresAt,
    // demais campos não são lidos por getValidAccessToken
  } as unknown as SocialAccount;
}

describe('services/tokenService — getValidAccessToken', () => {
  beforeEach(() => {
    updateMock.mockClear();
    refreshTokenMock.mockClear();
  });

  it('devolve o token atual sem renovar quando ainda falta bastante para expirar', async () => {
    const account = makeAccount({ tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    const result = await getValidAccessToken(account);

    expect(result).toEqual({ accessToken: 'token-atual', refreshed: false });
    expect(refreshTokenMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('nunca tenta renovar uma conta sem data de expiração conhecida (ex.: token de Página do Facebook)', async () => {
    const account = makeAccount({ tokenExpiresAt: null });
    const result = await getValidAccessToken(account);

    expect(result.refreshed).toBe(false);
    expect(refreshTokenMock).not.toHaveBeenCalled();
  });

  it('renova proativamente quando está perto de expirar, e persiste o novo token cifrado', async () => {
    refreshTokenMock.mockResolvedValue({ accessToken: 'token-novo', expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) });
    const account = makeAccount({ tokenExpiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) }); // faltam só 2 dias

    const result = await getValidAccessToken(account);

    expect(result).toEqual({ accessToken: 'token-novo', refreshed: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as { where: { id: string }; data: { status: string; encryptedAccessToken: string } };
    expect(call.where.id).toBe('account-1');
    expect(call.data.status).toBe('ACTIVE');
    expect(call.data.encryptedAccessToken).not.toBe(account.encryptedAccessToken); // token novo, cifrado de novo
  });

  it('se a renovação falhar, mantém o token atual utilizável e marca a conta como ERROR', async () => {
    refreshTokenMock.mockRejectedValue(new Error('token revogado pela plataforma'));
    const account = makeAccount({ tokenExpiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), accessToken: 'token-antigo' });

    const result = await getValidAccessToken(account);

    expect(result).toEqual({ accessToken: 'token-antigo', refreshed: false });
    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { status: 'ERROR' } });
  });
});
