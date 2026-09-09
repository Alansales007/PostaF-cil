import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { decryptToken } from '@/lib/crypto';
import { getSocialProvider } from '@/providers';
import { logger } from '@/lib/logger';

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const account = await db.socialAccount.findFirst({ where: { userId: session.user.id, provider: 'FACEBOOK' } });
  if (!account) {
    return NextResponse.json({ error: 'Nenhuma Página do Facebook conectada.' }, { status: 404 });
  }

  try {
    const provider = getSocialProvider('FACEBOOK');
    await provider.disconnect(decryptToken(account.encryptedAccessToken));
  } catch (err) {
    logger.warn({ err, accountId: account.id }, 'Falha ao notificar o Facebook sobre a desconexão (prosseguindo mesmo assim)');
  }

  await db.socialAccount.delete({ where: { id: account.id } });
  await db.auditLog.create({
    data: { userId: session.user.id, action: 'social_account.disconnected', entityType: 'SocialAccount', entityId: account.id, metadata: { provider: 'FACEBOOK' } },
  });

  return NextResponse.json({
    ok: true,
    note: 'Página removida do PostaFácil. Para revogar totalmente o acesso, remova o PostaFácil em Facebook > Configurações > Apps e sites.',
  });
}
