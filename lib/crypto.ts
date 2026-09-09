import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { getEnv } from './env';

/**
 * Criptografia em repouso dos tokens OAuth (access/refresh token) usando
 * AES-256-GCM. Nunca armazene tokens em texto plano no banco, e nunca
 * logue o valor decifrado (ver lib/logger.ts -> redact).
 *
 * Formato armazenado: base64(iv) . base64(authTag) . base64(ciphertext)
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const { TOKEN_ENCRYPTION_KEY } = getEnv();
  return Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Payload de token criptografado em formato inválido');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Mostra só os últimos 4 caracteres — seguro para logs/telas técnicas. */
export function maskToken(token: string | null | undefined): string {
  if (!token) return '—';
  if (token.length <= 4) return '****';
  return `****${token.slice(-4)}`;
}
