import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getEnv } from '@/lib/env';
import { consumeOAuthState } from '@/lib/oauth/state';
import { createPendingPageSelection } from '@/lib/oauth/facebook-page-selection';
import { upsertFacebookAccount } from '@/lib/social/facebook-account';
import { getSocialProvider } from '@/providers';
import { FacebookProvider } from '@/providers/facebook/FacebookProvider';
import { describeFacebookError } from '@/providers/facebook/errors';

const REDIRECT_BASE = '/settings/accounts';

// Callback de OAuth real — ver a mesma observação em instagram/callback/route.ts.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error') || url.searchParams.get('error_code');

  if (oauthError) {
    logger.info({ oauthError }, 'Usuário negou ou cancelou a autorização do Facebook');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=denied&provider=facebook`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_callback&provider=facebook`, req.url));
  }

  const consumed = await consumeOAuthState(state, 'FACEBOOK');
  if (!consumed.ok) {
    logger.warn({ reason: consumed.reason }, 'State OAuth do Facebook inválido no callback');
    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=invalid_state&provider=facebook`, req.url));
  }

  const env = getEnv();

  try {
    if (env.MOCK_SOCIAL_APIS) {
      // Modo mock: fluxo genérico de conta única, igual ao Instagram.
      const provider = getSocialProvider('FACEBOOK');
      const account = await provider.handleCallback({ code, state, redirectUri: consumed.redirectUri });
      await upsertFacebookAccount(consumed.userId, account.providerAccountId, account.displayName, null, account.accessToken);
      return NextResponse.redirect(new URL(`${REDIRECT_BASE}?connected=facebook`, req.url));
    }

    // Modo real: o Facebook pode devolver várias Páginas para o mesmo
    // login — decidir qual conectar é responsabilidade desta rota, não do
    // contrato genérico SocialProvider (ver nota em FacebookProvider).
    const provider = new FacebookProvider();
    const pages = await provider.exchangeCodeForManagedPages(code, consumed.redirectUri);

    if (pages.length === 0) {
      return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=no_pages&provider=facebook`, req.url));
    }

    if (pages.length === 1) {
      const page = pages[0]!;
      await upsertFacebookAccount(consumed.userId, page.id, page.name, page.category ?? null, page.access_token, page.picture?.data?.url ?? null);
      return NextResponse.redirect(new URL(`${REDIRECT_BASE}?connected=facebook`, req.url));
    }

    const selectionToken = createPendingPageSelection(
      consumed.userId,
      pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category ?? null,
        avatarUrl: p.picture?.data?.url ?? null,
        accessToken: p.access_token,
      })),
    );
    const chooseUrl = new URL('/settings/accounts/facebook/choose', req.url);
    chooseUrl.searchParams.set('token', selectionToken);
    return NextResponse.redirect(chooseUrl);
  } catch (err) {
    const described = describeFacebookError(err);
    logger.error({ err, code: described.code }, 'Falha ao concluir OAuth do Facebook');
    return NextResponse.redirect(
      new URL(`${REDIRECT_BASE}?error=oauth_failed&provider=facebook&reason=${encodeURIComponent(described.message)}`, req.url),
    );
  }
}
