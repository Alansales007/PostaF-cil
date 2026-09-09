import { describe, expect, it } from 'vitest';
import { packAccessToken, splitAccessToken } from '@/providers/instagram/InstagramProvider';

describe('providers/instagram — empacotamento de igUserId + token', () => {
  it('faz round-trip preservando igUserId e token', () => {
    const packed = packAccessToken('17841400000000000', 'IGQVJ...token-de-teste');
    const { igUserId, accessToken } = splitAccessToken(packed);
    expect(igUserId).toBe('17841400000000000');
    expect(accessToken).toBe('IGQVJ...token-de-teste');
  });

  it('rejeita string mal formada (sem separador)', () => {
    expect(() => splitAccessToken('token-sem-id')).toThrow();
  });
});
