import { describe, expect, it } from 'vitest';
import { InstagramApiError } from '@/providers/instagram/api';
import { describeInstagramError } from '@/providers/instagram/errors';

describe('providers/instagram/errors', () => {
  it('traduz o código 190 (token inválido) pedindo reconexão', () => {
    const result = describeInstagramError(new InstagramApiError('Invalid OAuth access token', 190));
    expect(result.code).toBe('TOKEN_EXPIRED');
    expect(result.reconnectRequired).toBe(true);
    expect(result.message).not.toMatch(/error 190/i);
  });

  it('traduz códigos de rate limit sem pedir reconexão', () => {
    const result = describeInstagramError(new InstagramApiError('Too many calls', 4));
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.reconnectRequired).toBe(false);
  });

  it('cai num fallback legível para erros desconhecidos', () => {
    const result = describeInstagramError(new Error('algo genérico'));
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('algo genérico');
  });
});
