import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { readPendingPageSelection, decryptSelectedPageToken } from '@/lib/oauth/facebook-page-selection';
import { upsertFacebookAccount } from '@/lib/social/facebook-account';

const schema = z.object({ token: z.string().min(1), pageId: z.string().min(1) });

/** Conclui a conexão do Facebook depois que o usuário escolheu qual Página usar. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const env = getEnv();
  const limit = rateLimit(`social-finalize:facebook:${session.user.id}`, 20, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas em pouco tempo. Aguarde um instante.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const selection = readPendingPageSelection(parsed.data.token);
  if (!selection || selection.userId !== session.user.id) {
    return NextResponse.json({ error: 'Esta seleção expirou. Conecte o Facebook novamente.' }, { status: 410 });
  }

  const page = selection.pages.find((p) => p.id === parsed.data.pageId);
  if (!page) {
    return NextResponse.json({ error: 'Página não encontrada nesta seleção.' }, { status: 404 });
  }

  const pageAccessToken = decryptSelectedPageToken(page);
  await upsertFacebookAccount(session.user.id, page.id, page.name, page.category, pageAccessToken, page.avatarUrl);

  return NextResponse.json({ ok: true });
}
