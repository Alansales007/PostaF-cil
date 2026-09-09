import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness probe — deliberadamente pública (sem sessão), como é
 * padrão para health checks. Não vaza nada sensível, só true/false por
 * dependência. Só checa o Postgres: não há mais Redis (fila/tempo real
 * agora são Inngest + polling — ver docs/ARCHITECTURE.md).
 */
export async function GET() {
  const dbOk = await checkDatabase();

  return NextResponse.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk }, { status: dbOk ? 200 : 503 });
}

async function checkDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
