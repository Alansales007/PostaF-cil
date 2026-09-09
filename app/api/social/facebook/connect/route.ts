import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { getSocialProvider } from '@/providers';
import { rateLimit } from '@/lib/rate-limit';

/** Inicia o OAuth do Facebook — navegação de browser (não é uma chamada fetch/JSON). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const env = getEnv();
  const limit = rateLimit(`social-connect:facebook:${session.user.id}`, 10, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.redirect(new URL('/settings/accounts?error=rate_limited', req.url));
  }

  if ((!env.META_APP_ID || !env.META_APP_SECRET) && !env.MOCK_SOCIAL_APIS) {
    return NextResponse.redirect(new URL('/settings/accounts?error=not_configured&provider=facebook', req.url));
  }

  const redirectUri = env.META_REDIRECT_URI || new URL('/api/social/facebook/callback', env.APP_URL).toString();
  const provider = getSocialProvider('FACEBOOK');
  const { authorizationUrl } = await provider.connect(session.user.id, redirectUri);

  return NextResponse.redirect(authorizationUrl);
}
