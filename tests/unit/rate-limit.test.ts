import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('lib/rate-limit', () => {
  it('permite requisições até o limite e bloqueia a partir daí', () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(rateLimit(key, 2, 60_000).allowed).toBe(true);
    const third = rateLimit(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('usa chaves independentes por bucket', () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    rateLimit(keyA, 1, 60_000);
    expect(rateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });
});
