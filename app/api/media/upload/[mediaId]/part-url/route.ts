import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getStorageService } from '@/services/storage';
import { getMediaFileMetadata, getOwnedMediaFile } from '@/lib/media/get-owned-media-file';
import { rateLimit } from '@/lib/rate-limit';
import { getEnv } from '@/lib/env';

const schema = z.object({ partNumber: z.number().int().positive() });

export async function POST(req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const env = getEnv();
  const limit = rateLimit(`media-upload-part-url:${session.user.id}`, 600, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas requisições de upload em pouco tempo.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'partNumber inválido.' }, { status: 400 });
  }

  const media = await getOwnedMediaFile(params.mediaId, session.user.id);
  if (!media) {
    return NextResponse.json({ error: 'Upload não encontrado.' }, { status: 404 });
  }
  if (media.status !== 'UPLOADING' || !media.uploadSessionId) {
    return NextResponse.json({ error: 'Este upload não está mais em andamento.' }, { status: 409 });
  }

  const metadata = getMediaFileMetadata(media.metadata);
  if (!metadata || parsed.data.partNumber > metadata.totalParts) {
    return NextResponse.json({ error: 'Número de parte fora do plano de upload.' }, { status: 400 });
  }

  const storage = getStorageService();
  const { url, expiresAt } = await storage.getPartUploadUrl({
    key: media.storagePath,
    uploadId: media.uploadSessionId,
    partNumber: parsed.data.partNumber,
  });

  return NextResponse.json({ url, expiresAt });
}
