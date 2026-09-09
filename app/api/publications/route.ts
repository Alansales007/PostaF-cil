import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getEnv } from '@/lib/env';
import { createPublication, listPublicationsForUser, PublicationValidationError, type PublicationListFilter } from '@/services/publicationService';
import { SOCIAL_PROVIDERS } from '@/types';

const providerEnum = z.enum(SOCIAL_PROVIDERS as [string, ...string[]]);

const createSchema = z.object({
  mediaId: z.string().min(1),
  title: z.string().max(200).optional(),
  generalCaption: z.string().max(5000).default(''),
  useSameCaption: z.boolean().default(true),
  customCaptions: z.record(providerEnum, z.string().max(5000)).optional(),
  // no máximo uma rede de cada (SOCIAL_PROVIDERS só tem 4 valores) — evita
  // que uma rede repetida quebre a criação no meio da transação por causa
  // da constraint @@unique([publicationId, provider]) do banco.
  providers: z
    .array(providerEnum)
    .min(1)
    .max(SOCIAL_PROVIDERS.length)
    .refine((arr) => new Set(arr).size === arr.length, { message: 'Cada rede só pode ser selecionada uma vez.' }),
  deleteAfterPublish: z.boolean().optional(),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const env = getEnv();
  const limit = rateLimit(`publications-create:${session.user.id}`, 20, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas publicações em pouco tempo. Aguarde um instante.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
  }

  try {
    const publication = await createPublication(session.user.id, parsed.data as Parameters<typeof createPublication>[1]);
    return NextResponse.json({ publication }, { status: 201 });
  } catch (err) {
    if (err instanceof PublicationValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const filter = (req.nextUrl.searchParams.get('filter') ?? 'all') as PublicationListFilter;
  const publications = await listPublicationsForUser(session.user.id, filter);

  return NextResponse.json({
    publications: publications.map(serializePublication),
  });
}

function serializePublication(p: Awaited<ReturnType<typeof listPublicationsForUser>>[number]) {
  return { ...p, media: { ...p.media, filesize: p.media.filesize.toString() } };
}
