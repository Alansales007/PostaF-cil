import pino from 'pino';

const REDACT_PATHS = [
  'accessToken',
  'refreshToken',
  'encryptedAccessToken',
  'encryptedRefreshToken',
  'password',
  'passwordHash',
  'authorization',
  'token',
  'code',
  'codeVerifier',
  'client_secret',
  'clientSecret',
];

/**
 * Logger estruturado (JSON em produção, formatado em dev).
 * Campos sensíveis são redigidos automaticamente — nunca registramos
 * tokens completos, mesmo por engano em um objeto aninhado.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACT_PATHS.flatMap((p) => [p, `*.${p}`, `**.${p}`]),
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

/** Gera um correlationId legível, ex.: PUB-20260908-A83F */
export function generateCorrelationId(prefix = 'PUB'): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `${prefix}-${y}${m}${d}-${suffix}`;
}
