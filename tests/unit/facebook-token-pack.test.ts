import { describe, expect, it } from 'vitest';
import { packAccessToken, splitAccessToken } from '@/providers/facebook/FacebookProvider';

describe('providers/facebook — empacotamento de pageId + token', () => {
  it('faz round-trip preservando pageId e token', () => {
    const packed = packAccessToken('112233445566', 'EAAG...token-de-pagina');
    const { pageId, accessToken } = splitAccessToken(packed);
    expect(pageId).toBe('112233445566');
    expect(accessToken).toBe('EAAG...token-de-pagina');
  });

  it('rejeita string mal formada (sem separador)', () => {
    expect(() => splitAccessToken('token-sem-id')).toThrow();
  });
});
