import { describe, expect, it } from 'vitest';
import { evaluateOAuthState, type OAuthStateRecordLike } from '@/lib/oauth/state';

function makeRecord(overrides: Partial<OAuthStateRecordLike> = {}): OAuthStateRecordLike {
  return {
    id: 'state-1',
    userId: 'user-1',
    provider: 'INSTAGRAM',
    redirectUri: 'http://localhost:3000/api/social/instagram/callback',
    codeVerifier: null,
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
}

describe('lib/oauth/state — evaluateOAuthState (proteção CSRF)', () => {
  it('aceita um state válido e não usado', () => {
    const result = evaluateOAuthState(makeRecord(), 'INSTAGRAM');
    expect(result.ok).toBe(true);
  });

  it('rejeita quando o state não existe', () => {
    const result = evaluateOAuthState(null, 'INSTAGRAM');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejeita quando o provider não confere (state trocado entre redes)', () => {
    const result = evaluateOAuthState(makeRecord({ provider: 'TIKTOK' }), 'INSTAGRAM');
    expect(result).toEqual({ ok: false, reason: 'wrong_provider' });
  });

  it('rejeita reuso de um state já consumido (replay do callback)', () => {
    const result = evaluateOAuthState(makeRecord({ usedAt: new Date() }), 'INSTAGRAM');
    expect(result).toEqual({ ok: false, reason: 'already_used' });
  });

  it('rejeita um state expirado', () => {
    const result = evaluateOAuthState(makeRecord({ expiresAt: new Date(Date.now() - 1000) }), 'INSTAGRAM');
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });
});
