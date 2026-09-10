import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptToken } from '@/lib/crypto';

/**
 * Upsert de uma SocialAccount do Facebook — usado tanto pelo callback OAuth
 * (quando o usuário administra só uma Página) quanto pela rota de
 * finalização depois da tela de escolha (quando administra várias).
 */
export async function upsertFacebookAccount(
  userId: string,
  pageId: string,
  pageName: string | null,
  category: string | null,
  pageAccessToken: string,
  avatarUrl: string | null = null,
) {
  await db.socialAccount.upsert({
    where: { userId_provider_providerAccountId: { userId, provider: 'FACEBOOK', providerAccountId: pageId } },
    create: {
      userId,
      provider: 'FACEBOOK',
      providerAccountId: pageId,
      username: null,
      displayName: pageName,
      avatarUrl,
      encryptedAccessToken: encryptToken(pageAccessToken),
      encryptedRefreshToken: null,
      tokenExpiresAt: null, // token de Página derivado de token de longa duração não expira
      scopes: [],
      metadata: category ? { category } : undefined,
      status: 'ACTIVE',
    },
    update: {
      displayName: pageName,
      avatarUrl,
      encryptedAccessToken: encryptToken(pageAccessToken),
      status: 'ACTIVE',
    },
  });

  await db.auditLog.create({
    data: { userId, action: 'social_account.connected', entityType: 'SocialAccount', entityId: pageId, metadata: { provider: 'FACEBOOK' } },
  });

  logger.info({ userId, provider: 'FACEBOOK', pageId }, 'Página do Facebook conectada com sucesso');
}
