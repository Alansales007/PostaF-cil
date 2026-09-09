import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnv } from '@/lib/env';
import { getStorageService } from '@/services/storage';
import { getMediaFileMetadata, getOwnedMediaFile } from '@/lib/media/get-owned-media-file';
import { isLikelyVideoContainer } from '@/lib/upload/magic-bytes';

const schema = z.object({
  // limite alinhado ao MAX_PARTS de lib/upload/part-plan.ts — corta cedo um
  // corpo JSON absurdamente grande antes de qualquer outro processamento.
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) })).min(1).max(9500),
  checksum: z.string().optional(),
  duration: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos para concluir o upload.' }, { status: 400 });
  }

  const media = await getOwnedMediaFile(params.mediaId, session.user.id);
  if (!media) {
    return NextResponse.json({ error: 'Upload não encontrado.' }, { status: 404 });
  }
  if (media.status !== 'UPLOADING' || !media.uploadSessionId) {
    return NextResponse.json({ error: 'Este upload não está mais em andamento.' }, { status: 409 });
  }

  const metadata = getMediaFileMetadata(media.metadata);
  if (metadata && parsed.data.parts.length !== metadata.totalParts) {
    return NextResponse.json(
      { error: `Upload incompleto: ${parsed.data.parts.length} de ${metadata.totalParts} partes recebidas.` },
      { status: 409 },
    );
  }

  const storage = getStorageService();

  let sizeBytes: number;
  try {
    const result = await storage.completeMultipartUpload({
      key: media.storagePath,
      uploadId: media.uploadSessionId,
      parts: parsed.data.parts,
    });
    sizeBytes = result.sizeBytes;
  } catch (err) {
    logger.error({ err, mediaId: media.id }, 'Falha ao concluir upload multipart no storage');
    return NextResponse.json({ error: 'Não foi possível concluir o upload no armazenamento.' }, { status: 502 });
  }

  // Integridade #1: tamanho final tem que bater com o declarado no /init.
  const declaredSize = Number(media.filesize);
  if (sizeBytes !== declaredSize) {
    logger.warn({ mediaId: media.id, sizeBytes, declaredSize }, 'Tamanho final do upload diverge do declarado');
    await failMedia(media.id, 'SIZE_MISMATCH', 'O tamanho do arquivo enviado não confere com o esperado.');
    return NextResponse.json({ error: 'O tamanho do arquivo enviado não confere com o esperado.' }, { status: 422 });
  }

  // Integridade #2: os primeiros bytes precisam parecer um container de vídeo de verdade.
  try {
    const header = await storage.readHeaderBytes({ key: media.storagePath, length: 64 });
    if (!isLikelyVideoContainer(header)) {
      await failMedia(media.id, 'INVALID_CONTAINER', 'O arquivo enviado não parece ser um vídeo válido.');
      await storage.deleteObject({ key: media.storagePath }).catch(() => {});
      return NextResponse.json({ error: 'O arquivo enviado não parece ser um vídeo válido.' }, { status: 422 });
    }
  } catch (err) {
    logger.error({ err, mediaId: media.id }, 'Falha ao validar cabeçalho do vídeo');
  }

  const env = getEnv();
  const deleteAfterAt = new Date(Date.now() + env.MEDIA_RETENTION_HOURS * 60 * 60 * 1000);

  const updated = await db.mediaFile.update({
    where: { id: media.id },
    data: {
      status: 'UPLOADED',
      checksum: parsed.data.checksum,
      duration: parsed.data.duration,
      width: parsed.data.width,
      height: parsed.data.height,
      deleteAfterAt,
    },
  });

  await db.auditLog.create({
    data: { userId: session.user.id, action: 'media.upload.completed', entityType: 'MediaFile', entityId: media.id },
  });

  logger.info({ mediaId: media.id, sizeBytes }, 'Upload de mídia concluído');

  return NextResponse.json({
    mediaId: updated.id,
    status: updated.status,
    filesize: updated.filesize.toString(),
    duration: updated.duration,
    width: updated.width,
    height: updated.height,
  });
}

async function failMedia(mediaId: string, errorCode: string, errorMessage: string) {
  await db.mediaFile.update({
    where: { id: mediaId },
    data: { status: 'FAILED', metadata: { errorCode, errorMessage } },
  });
}
