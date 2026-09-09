import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStorageService } from '@/services/storage';
import { getOwnedMediaFile } from '@/lib/media/get-owned-media-file';

export async function POST(_req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const media = await getOwnedMediaFile(params.mediaId, session.user.id);
  if (!media) {
    return NextResponse.json({ error: 'Upload não encontrado.' }, { status: 404 });
  }

  if (media.uploadSessionId && media.status === 'UPLOADING') {
    const storage = getStorageService();
    await storage.abortMultipartUpload({ key: media.storagePath, uploadId: media.uploadSessionId }).catch((err) => {
      logger.warn({ err, mediaId: media.id }, 'Falha ao abortar multipart upload no storage (prosseguindo mesmo assim)');
    });
  }

  await db.mediaFile.update({ where: { id: media.id }, data: { status: 'DELETED', deletedAt: new Date() } });
  await db.auditLog.create({
    data: { userId: session.user.id, action: 'media.upload.aborted', entityType: 'MediaFile', entityId: media.id },
  });

  return NextResponse.json({ ok: true });
}
