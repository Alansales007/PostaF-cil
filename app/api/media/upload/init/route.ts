import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import path from 'node:path';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { getStorageService } from '@/services/storage';
import { computePartPlan } from '@/lib/upload/part-plan';

const initSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  filesizeBytes: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const env = getEnv();
  const limit = rateLimit(`media-upload-init:${session.user.id}`, 20, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Muitas tentativas de upload. Aguarde um instante.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
  }

  const { filename, mimeType, filesizeBytes } = parsed.data;

  if (!env.ALLOWED_VIDEO_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: `Formato "${mimeType}" não suportado. Envie um vídeo em MP4, MOV ou WebM.` },
      { status: 415 },
    );
  }

  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (filesizeBytes > maxBytes) {
    return NextResponse.json(
      { error: `O vídeo excede o limite de ${env.MAX_UPLOAD_SIZE_MB}MB.` },
      { status: 413 },
    );
  }

  const plan = computePartPlan(filesizeBytes);
  const storage = getStorageService();

  const mediaFile = await db.mediaFile.create({
    data: {
      userId: session.user.id,
      originalFilename: filename,
      storagePath: '', // preenchido após criar o upload multipart, abaixo
      storageProvider: storage.providerName,
      mimeType,
      filesize: BigInt(filesizeBytes),
      status: 'UPLOADING',
    },
  });

  const ext = path.extname(filename) || '.mp4';
  const key = `users/${session.user.id}/media/${mediaFile.id}/original${ext}`;

  const { uploadId } = await storage.createMultipartUpload({ key, contentType: mimeType });

  await db.mediaFile.update({
    where: { id: mediaFile.id },
    data: {
      storagePath: key,
      uploadSessionId: uploadId,
      metadata: { partSize: plan.partSize, totalParts: plan.totalParts },
    },
  });

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'media.upload.initiated',
      entityType: 'MediaFile',
      entityId: mediaFile.id,
    },
  });

  logger.info({ mediaId: mediaFile.id, userId: session.user.id, totalParts: plan.totalParts }, 'Upload de mídia iniciado');

  return NextResponse.json({
    mediaId: mediaFile.id,
    uploadId,
    partSize: plan.partSize,
    totalParts: plan.totalParts,
  });
}
