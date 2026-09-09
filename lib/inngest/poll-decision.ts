import { decideRetry } from './retry-policy';
import type { PublishJobStatus } from '@/providers/SocialProvider';

/**
 * Decide o que fazer depois de consultar getPublishStatus() de um
 * provider — lógica pura (sem Inngest/Prisma), para a função real e os
 * testes usarem exatamente a mesma decisão.
 */
export interface PollOutcomeInput {
  providerStatus: PublishJobStatus;
  errorCode?: string | null;
  retryAfterSeconds?: number;
  attemptCount: number;
  maxAttempts: number;
}

export type PollOutcome =
  | { kind: 'still_processing'; delayMs: number }
  | { kind: 'published' }
  | { kind: 'failed_retry'; delayMs: number }
  | { kind: 'failed_final' };

export function decidePollOutcome(input: PollOutcomeInput): PollOutcome {
  if (input.providerStatus === 'PUBLISHED') {
    return { kind: 'published' };
  }

  if (input.providerStatus === 'FAILED') {
    const decision = decideRetry({ attemptCount: input.attemptCount, maxAttempts: input.maxAttempts, errorCode: input.errorCode });
    return decision.action === 'retry' ? { kind: 'failed_retry', delayMs: decision.delayMs } : { kind: 'failed_final' };
  }

  // PENDING ou PROCESSING — continua monitorando. Se o provider pediu para
  // esperar (rate limit), respeitamos o tempo exato em vez do backoff padrão.
  const delayMs = input.retryAfterSeconds ? input.retryAfterSeconds * 1000 : 5_000;
  return { kind: 'still_processing', delayMs };
}

/**
 * Idempotência: nunca criar um segundo container/job na plataforma para o
 * mesmo alvo. Se já existe um providerContainerId, a função deve só
 * continuar monitorando (getPublishStatus), nunca chamar publishVideo() de novo.
 */
export function shouldStartNewJob(target: { providerContainerId: string | null }): boolean {
  return !target.providerContainerId;
}
