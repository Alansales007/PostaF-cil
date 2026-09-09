import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { retryPublicationTarget, PublicationValidationError } from '@/services/publicationService';
import { SOCIAL_PROVIDERS, type SocialProviderId } from '@/types';

const schema = z.object({ provider: z.enum(SOCIAL_PROVIDERS as [SocialProviderId, ...SocialProviderId[]]) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const env = getEnv();
  const limit = rateLimit(`publication-retry:${session.user.id}`, 30, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas em pouco tempo. Aguarde um instante.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Rede inválida.' }, { status: 400 });
  }

  try {
    const target = await retryPublicationTarget(session.user.id, params.id, parsed.data.provider);
    return NextResponse.json({ target });
  } catch (err) {
    if (err instanceof PublicationValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
