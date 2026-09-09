import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptToken } from '@/lib/crypto';
import { consumeOAuthState } from '@/lib/oauth/state';
import { getSocialProvider } from '@/providers';
import { describeInstagramError } from '@/providers/instagram/errors';

const REDIRECT_BASE = '/settings/accounts';

// Callback de OAuth real (redirect vindo da plataforma) — nunca deve ser
// avaliado em build; não usa cookies(), então o Next.js poderia tentar
// otimizá-lo como estático sem isso.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error') || url.searchParams.get('error_code');

  if (oauthError) {
    logger.info({ oauthError }, 'Usuário negou ou cancelou a autorização do Instagram');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=denied&provider=instagram`, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_callback&provider=instagram`, req.url));
  }

  const consumed = await consumeOAuthState(state, 'INSTAGRAM');
  if (!consumed.ok) {
    logger.warn({ reason: consumed.reason }, 'State OAuth do Instagram inválido no callback');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_state&provider=instagram`, req.url));
  }

  try {
    const provider = getSocialProvider('INSTAGRAM');
    const account = await provider.handleCallback({ code, state, redirectUri: consumed.redirectUri });

    await db.socialAccount.upsert({
      where: {
        userId_provider_providerAccountId: {
          userId: consumed.userId,
          provider: 'INSTAGRAM',
          providerAccountId: account.providerAccountId,
        },
      },
      create: {
        userId: consumed.userId,
        provider: 'INSTAGRAM',
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
        metadata: { provider: 'INSTAGRAM' },
      },
    });

    logger.info({ userId: consumed.userId, provider: 'INSTAGRAM' }, 'Conta do Instagram conectada com sucesso');

    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?connected=instagram`, req.url));
  } catch (err) {
    const described = describeInstagramError(err);
    logger.error({ err, code: described.code }, 'Falha ao concluir OAuth do Instagram');
    return NextResponse.redirect(
      new URL(`${REDIRECT_BASE}?error=oauth_failed&provider=instagram&reason=${encodeURIComponent(described.message)}`, req.url),
    );
  }
}
