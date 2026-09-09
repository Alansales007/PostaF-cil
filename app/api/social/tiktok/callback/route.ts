import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptToken } from '@/lib/crypto';
import { consumeOAuthState } from '@/lib/oauth/state';
import { getSocialProvider } from '@/providers';
import { describeTikTokError } from '@/providers/tiktok/errors';

const REDIRECT_BASE = '/settings/accounts';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    logger.info({ oauthError }, 'Usuário negou ou cancelou a autorização do TikTok');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=denied&provider=tiktok`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_callback&provider=tiktok`, req.url));
  }

  const consumed = await consumeOAuthState(state, 'TIKTOK');
  if (!consumed.ok) {
    logger.warn({ reason: consumed.reason }, 'State OAuth do TikTok inválido no callback');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_state&provider=tiktok`, req.url));
  }

  try {
    const provider = getSocialProvider('TIKTOK');
    const account = await provider.handleCallback({
      code,
      state,
      redirectUri: consumed.redirectUri,
      codeVerifier: consumed.codeVerifier ?? undefined,
    });

    await db.socialAccount.upsert({
      where: {
        userId_provider_providerAccountId: {
          userId: consumed.userId,
          provider: 'TIKTOK',
          providerAccountId: account.providerAccountId,
        },
      },
      create: {
        userId: consumed.userId,
        provider: 'TIKTOK',
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
      data: {
        userId: consumed.userId,
        action: 'social_account.connected',
        entityType: 'SocialAccount',
        entityId: account.providerAccountId,
        metadata: { provider: 'TIKTOK' },
      },
    });

    logger.info({ userId: consumed.userId, provider: 'TIKTOK' }, 'Conta do TikTok conectada com sucesso');

    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?connected=tiktok`, req.url));
  } catch (err) {
    const described = describeTikTokError(err);
    logger.error({ err, code: described.code }, 'Falha ao concluir OAuth do TikTok');
    return NextResponse.redirect(
      new URL(`${REDIRECT_BASE}?error=oauth_failed&provider=tiktok&reason=${encodeURIComponent(described.message)}`, req.url),
    );
  }
}
