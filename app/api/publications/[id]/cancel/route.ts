import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { cancelScheduledPublication, PublicationValidationError } from '@/services/publicationService';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const env = getEnv();
  const limit = rateLimit(`publication-cancel:${session.user.id}`, 30, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas em pouco tempo. Aguarde um instante.' }, { status: 429 });
  }

  try {
    await cancelScheduledPublication(session.user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PublicationValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
