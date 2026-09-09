import { describe, expect, it } from 'vitest';
import { FacebookApiError } from '@/providers/facebook/api';
import { describeFacebookError } from '@/providers/facebook/errors';

describe('providers/facebook/errors', () => {
  it('traduz o código 190 (token inválido) pedindo reconexão', () => {
    const result = describeFacebookError(new FacebookApiError('Invalid OAuth access token', 190));
    expect(result.code).toBe('TOKEN_EXPIRED');
    expect(result.reconnectRequired).toBe(true);
  });

  it('traduz erro de permissão faltando pedindo reconexão', () => {
    const result = describeFacebookError(new FacebookApiError('Missing permission', 200));
    expect(result.code).toBe('MISSING_PERMISSION');
    expect(result.reconnectRequired).toBe(true);
  });

  it('traduz rate limit sem pedir reconexão', () => {
    const result = describeFacebookError(new FacebookApiError('Too many calls', 4));
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.reconnectRequired).toBe(false);
  });
});
