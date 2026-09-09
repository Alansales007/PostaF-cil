import { describe, expect, it } from 'vitest';
import { computeBackoffMs, decideRetry, isPermanentError } from '@/lib/inngest/retry-policy';

describe('lib/inngest/retry-policy', () => {
  it('reconhece códigos de erro permanentes', () => {
    expect(isPermanentError('TOKEN_EXPIRED')).toBe(true);
    expect(isPermanentError('MISSING_SCOPE')).toBe(true);
    expect(isPermanentError('MEDIA_REJECTED')).toBe(true);
  });

  it('trata códigos desconhecidos ou ausentes como temporários', () => {
    expect(isPermanentError('ALGO_DESCONHECIDO')).toBe(false);
    expect(isPermanentError(undefined)).toBe(false);
    expect(isPermanentError(null)).toBe(false);
  });

  it('o backoff cresce exponencialmente com o número de tentativas', () => {
    const a1 = computeBackoffMs(1);
    const a2 = computeBackoffMs(2);
    const a3 = computeBackoffMs(3);
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
  });

  it('o backoff tem um teto máximo mesmo com muitas tentativas', () => {
    const veryLate = computeBackoffMs(50);
    expect(veryLate).toBeLessThanOrEqual(15 * 60 * 1000 * 1.1); // teto + até 10% de jitter
  });

  it('decideRetry desiste imediatamente em erro permanente, mesmo na 1ª tentativa', () => {
    const decision = decideRetry({ attemptCount: 1, maxAttempts: 5, errorCode: 'TOKEN_EXPIRED' });
    expect(decision).toEqual({ action: 'give_up', reason: 'permanent_error' });
  });

  it('decideRetry tenta de novo em erro temporário, dentro do limite de tentativas', () => {
    const decision = decideRetry({ attemptCount: 2, maxAttempts: 5, errorCode: 'RATE_LIMITED' });
    expect(decision.action).toBe('retry');
  });

  it('decideRetry desiste ao atingir o máximo de tentativas, mesmo com erro temporário', () => {
    const decision = decideRetry({ attemptCount: 5, maxAttempts: 5, errorCode: 'RATE_LIMITED' });
    expect(decision).toEqual({ action: 'give_up', reason: 'max_attempts_reached' });
  });
});
