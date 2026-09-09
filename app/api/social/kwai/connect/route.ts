import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { getSocialProvider } from '@/providers';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Inicia o OAuth do Kwai — só funciona de verdade em modo mock
 * (MOCK_SOCIAL_APIS=true) ou quando KWAI_API_AVAILABLE=true (credenciais
 * aprovadas pela plataforma). Ver providers/kwai/KwaiProvider.ts.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const env = getEnv();
  const limit = rateLimit(`social-connect:kwai:${session.user.id}`, 10, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.redirect(new URL('/settings/accounts?error=rate_limited', req.url));
  }

  const provider = getSocialProvider('KWAI');
  if (!provider.isAvailable) {
    return NextResponse.redirect(new URL('/settings/accounts?error=platform_unavailable&provider=kwai', req.url));
  }

  const redirectUri = env.KWAI_REDIRECT_URI || new URL('/api/social/kwai/callback', env.APP_URL).toString();
  const { authorizationUrl } = await provider.connect(session.user.id, redirectUri);

  return NextResponse.redirect(authorizationUrl);
}
