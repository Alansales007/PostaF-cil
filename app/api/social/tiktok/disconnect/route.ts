import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { decryptToken } from '@/lib/crypto';
import { getSocialProvider } from '@/providers';
import { logger } from '@/lib/logger';
import { deleteSocialAccount, SocialAccountHasPublicationsError } from '@/lib/social/disconnect-social-account';

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const account = await db.socialAccount.findFirst({ where: { userId: session.user.id, provider: 'TIKTOK' } });
  if (!account) {
    return NextResponse.json({ error: 'Nenhuma conta do TikTok conectada.' }, { status: 404 });
  }

  try {
    const provider = getSocialProvider('TIKTOK');
    await provider.disconnect(decryptToken(account.encryptedAccessToken));
  } catch (err) {
    logger.warn({ err, accountId: account.id }, 'Falha ao revogar o token do TikTok (prosseguindo mesmo assim)');
  }

  try {
    await deleteSocialAccount(account.id);
  } catch (err) {
    if (err instanceof SocialAccountHasPublicationsError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'social_account.disconnected', entityType: 'SocialAccount', entityId: account.id, metadata: { provider: 'TIKTOK' } },
  });

  return NextResponse.json({ ok: true });
}
