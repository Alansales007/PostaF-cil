import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const account = await db.socialAccount.findFirst({ where: { userId: session.user.id, provider: 'KWAI' } });
  if (!account) {
    return NextResponse.json({ error: 'Nenhuma conta do Kwai conectada.' }, { status: 404 });
  }

  // Sem chamada de revogação real (ver providers/kwai/KwaiProvider.ts) — só remove localmente.
  await db.socialAccount.delete({ where: { id: account.id } });
  await db.auditLog.create({
    data: { userId: session.user.id, action: 'social_account.disconnected', entityType: 'SocialAccount', entityId: account.id, metadata: { provider: 'KWAI' } },
  });

  return NextResponse.json({ ok: true });
}
