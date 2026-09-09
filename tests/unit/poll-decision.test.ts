import { describe, expect, it } from 'vitest';
import { decidePollOutcome, shouldStartNewJob } from '@/lib/queue/poll-decision';

describe('lib/queue/poll-decision', () => {
  it('shouldStartNewJob é true só quando ainda não existe um container/job na plataforma', () => {
    expect(shouldStartNewJob({ providerContainerId: null })).toBe(true);
    expect(shouldStartNewJob({ providerContainerId: 'abc123' })).toBe(false);
  });

  it('status PUBLISHED do provider vira outcome "published"', () => {
    const outcome = decidePollOutcome({ providerStatus: 'PUBLISHED', attemptCount: 1, maxAttempts: 5 });
    expect(outcome).toEqual({ kind: 'published' });
  });

  it('status PROCESSING continua monitorando com delay padrão', () => {
    const outcome = decidePollOutcome({ providerStatus: 'PROCESSING', attemptCount: 1, maxAttempts: 5 });
    expect(outcome.kind).toBe('still_processing');
  });

  it('respeita o retryAfterSeconds do provider em vez do delay padrão', () => {
    const outcome = decidePollOutcome({ providerStatus: 'PROCESSING', attemptCount: 1, maxAttempts: 5, retryAfterSeconds: 60 });
    expect(outcome).toEqual({ kind: 'still_processing', delayMs: 60_000 });
  });

  it('status FAILED com erro temporário e tentativas disponíveis => failed_retry', () => {
    const outcome = decidePollOutcome({ providerStatus: 'FAILED', errorCode: 'RATE_LIMITED', attemptCount: 1, maxAttempts: 5 });
    expect(outcome.kind).toBe('failed_retry');
  });

  it('status FAILED com erro permanente => failed_final imediatamente', () => {
    const outcome = decidePollOutcome({ providerStatus: 'FAILED', errorCode: 'TOKEN_EXPIRED', attemptCount: 1, maxAttempts: 5 });
    expect(outcome).toEqual({ kind: 'failed_final' });
  });

  it('status FAILED sem mais tentativas disponíveis => failed_final', () => {
    const outcome = decidePollOutcome({ providerStatus: 'FAILED', errorCode: 'RATE_LIMITED', attemptCount: 5, maxAttempts: 5 });
    expect(outcome).toEqual({ kind: 'failed_final' });
  });
});
