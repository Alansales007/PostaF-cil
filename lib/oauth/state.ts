import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { Provider } from '@prisma/client';

const STATE_TTL_MINUTES = 10;

/**
 * Cria e persiste um `state` de OAuth (proteção CSRF) para um provider.
 * Usado por toda rota /api/social/[provider]/connect, e conferido pela
 * respectiva /callback antes de trocar o code por um token.
 */
export async function createOAuthState(userId: string, provider: Provider, redirectUri: string, codeVerifier?: string) {
  const state = randomUUID();
  await db.oAuthState.create({
    data: {
      userId,
      provider,
      state,
      redirectUri,
      codeVerifier,
      expiresAt: new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000),
    },
  });
  return state;
}

export type ConsumeStateResult =
  | { ok: true; userId: string; redirectUri: string; codeVerifier: string | null }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_used' | 'wrong_provider' };

export interface OAuthStateRecordLike {
  id: string;
  userId: string;
  provider: Provider;
  redirectUri: string;
  codeVerifier: string | null;
  usedAt: Date | null;
  expiresAt: Date;
}

/**
 * Regra de validação do state, isolada da leitura no banco — testável sem
 * precisar de um Postgres real (o I/O fica só em `consumeOAuthState`).
 */
export function evaluateOAuthState(
  record: OAuthStateRecordLike | null,
  provider: Provider,
  now: Date = new Date(),
): ConsumeStateResult {
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.provider !== provider) return { ok: false, reason: 'wrong_provider' };
  if (record.usedAt) return { ok: false, reason: 'already_used' };
  if (record.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' };

  return { ok: true, userId: record.userId, redirectUri: record.redirectUri, codeVerifier: record.codeVerifier };
}

/**
 * Valida e marca como usado um `state` recebido no callback. Cada state só
 * pode ser consumido uma vez (evita replay do redirect de callback).
 */
export async function consumeOAuthState(state: string, provider: Provider): Promise<ConsumeStateResult> {
  const record = await db.oAuthState.findUnique({ where: { state } });
  const result = evaluateOAuthState(record, provider);

  if (result.ok) {
    await db.oAuthState.update({ where: { id: record!.id }, data: { usedAt: new Date() } });
  }

  return result;
}
