import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateCodeVerifier, deriveCodeChallenge } from '@/providers/tiktok/pkce';

describe('providers/tiktok/pkce', () => {
  it('gera um code_verifier dentro do tamanho aceito pelo TikTok (43-128 chars)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('gera verifiers diferentes a cada chamada', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });

  it('deriva o code_challenge como SHA-256 do verifier em HEX (não base64url)', () => {
    const verifier = 'verifier-de-teste-fixo-para-comparacao-determinista';
    const challenge = deriveCodeChallenge(verifier);
    const expected = createHash('sha256').update(verifier).digest('hex');

    expect(challenge).toBe(expected);
    expect(challenge).toMatch(/^[0-9a-f]{64}$/); // hex de 32 bytes = 64 chars
  });
});
