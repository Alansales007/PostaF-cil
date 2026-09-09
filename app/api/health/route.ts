import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness probe para orquestradores (Docker/Kubernetes/load
 * balancer) — deliberadamente pública (sem sessão), como é padrão para
 * health checks. Não vaza nada sensível, só true/false por dependência.
 */
export async function GET() {
  const [dbOk, redisOk] = await Promise.all([checkDatabase(), checkRedis()]);
  const healthy = dbOk && redisOk;

  return NextResponse.json({ status: healthy ? 'ok' : 'degraded', db: dbOk, redis: redisOk }, { status: healthy ? 200 : 503 });
}

async function checkDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
