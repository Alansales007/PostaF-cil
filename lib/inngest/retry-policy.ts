/**
 * Política de retry — lógica pura, sem I/O, para ser testável sem precisar
 * de infraestrutura real. As funções Inngest (lib/inngest/functions/*) só
 * chamam essas funções para decidir o que fazer; quem manda mensagem de
 * rede é sempre o SocialProvider.
 */

/** Códigos de erro que nenhuma quantidade de retry resolve — precisam de ação do usuário (reconectar, trocar o vídeo). */
const PERMANENT_ERROR_CODES = new Set([
  'TOKEN_EXPIRED',
  'MISSING_SCOPE',
  'MISSING_PERMISSION',
  'INVALID_CONTAINER',
  'MEDIA_REJECTED',
  'SIZE_MISMATCH',
]);

export function isPermanentError(errorCode: string | undefined | null): boolean {
  if (!errorCode) return false;
  return PERMANENT_ERROR_CODES.has(errorCode);
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60 * 1000; // 15 minutos

/** Backoff exponencial com jitter — tentativa 1 => ~5s, 2 => ~10s, 3 => ~20s, ... até o teto. */
export function computeBackoffMs(attemptCount: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const jitter = Math.floor(capped * 0.1 * Math.random());
  return capped + jitter;
}

export interface RetryDecisionInput {
  attemptCount: number;
  maxAttempts: number;
  errorCode?: string | null;
}

export type RetryDecision =
  | { action: 'retry'; delayMs: number }
  | { action: 'give_up'; reason: 'permanent_error' | 'max_attempts_reached' };

/** Decide se um alvo que falhou deve tentar de novo, e com que atraso. */
export function decideRetry(input: RetryDecisionInput): RetryDecision {
  if (isPermanentError(input.errorCode)) {
    return { action: 'give_up', reason: 'permanent_error' };
  }
  if (input.attemptCount >= input.maxAttempts) {
    return { action: 'give_up', reason: 'max_attempts_reached' };
  }
  return { action: 'retry', delayMs: computeBackoffMs(input.attemptCount) };
}
