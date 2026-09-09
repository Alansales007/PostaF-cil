import { randomBytes, createHash } from 'node:crypto';

/**
 * PKCE do TikTok tem uma particularidade em relação ao padrão OAuth mais
 * comum: o code_challenge é o SHA-256 do code_verifier **em hex**, não em
 * base64url (confirmado na documentação oficial do Login Kit).
 */
export function generateCodeVerifier(): string {
  // 96 bytes em base64url ~= 128 caracteres (limite máximo aceito pelo TikTok)
  return randomBytes(96).toString('base64url').slice(0, 128);
}

export function deriveCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('hex');
}
