import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * Assinatura HMAC genérica para pacotinhos de estado de curta duração que
 * precisam viajar por uma URL/query string sem um banco por trás — usada
 * pelas "URLs pré-assinadas" do storage local de desenvolvimento e pelo
 * fluxo de seleção de Página do Facebook (múltiplas Páginas retornadas no
 * OAuth). Nunca guarde segredo em texto puro aqui dentro — combine com
 * lib/crypto.ts (AES-256-GCM) para qualquer token de acesso real.
 */
function getSecret(): Buffer {
  return Buffer.from(getEnv().TOKEN_ENCRYPTION_KEY, 'hex');
}

export function signToken<T extends { exp: number }>(payload: T): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken<T extends { exp: number }>(token: string): T | null {
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expectedSig = createHmac('sha256', getSecret()).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
