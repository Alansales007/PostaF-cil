import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptToken } from '@/lib/crypto';
import { consumeOAuthState } from '@/lib/oauth/state';
import { getSocialProvider } from '@/providers';

const REDIRECT_BASE = '/settings/accounts';

/** Só é alcançável de verdade em modo mock — em modo real, /connect já barra antes de chegar aqui. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_callback&provider=kwai`, req.url));
  }

  const consumed = await consumeOAuthState(state, 'KWAI');
  if (!consumed.ok) {
    logger.warn({ reason: consumed.reason }, 'State OAuth do Kwai inválido no callback');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_state&provider=kwai`, req.url));
  }

  try {
    const provider = getSocialProvider('KWAI');
    const account = await provider.handleCallback({ code, state, redirectUri: consumed.redirectUri });

    await db.socialAccount.upsert({
      where: {
        userId_provider_providerAccountId: { userId: consumed.userId, provider: 'KWAI', providerAccountId: account.providerAccountId },
      },
      create: {
        userId: consumed.userId,
        provider: 'KWAI',
        providerAccountId: account.providerAccountId,
        username: account.username,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        encryptedAccessToken: encryptToken(account.accessToken),
        encryptedRefreshToken: account.refreshToken ? encryptToken(account.refreshToken) : null,
        tokenExpiresAt: account.expiresAt,
        scopes: account.scopes,
        status: 'ACTIVE',
      },
      update: {
        username: account.username,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        encryptedAccessToken: encryptToken(account.accessToken),
        encryptedRefreshToken: account.refreshToken ? encryptToken(account.refreshToken) : null,
        tokenExpiresAt: account.expiresAt,
        scopes: account.scopes,
        status: 'ACTIVE',
      },
    });

    await db.auditLog.create({
      data: { userId: consumed.userId, action: 'social_account.connected', entityType: 'SocialAccount', entityId: account.providerAccountId, metadata: { provider: 'KWAI' } },
    });

    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?connected=kwai`, req.url));
  } catch (err) {
    logger.error({ err }, 'Falha ao concluir OAuth do Kwai');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=oauth_failed&provider=kwai`, req.url));
  }
}
