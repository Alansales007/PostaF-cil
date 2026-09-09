import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOwnedMediaFile } from '@/lib/media/get-owned-media-file';
import { getStorageService } from '@/services/storage';

/** URL temporária de leitura do vídeo já enviado — usada para pré-visualização. */
export async function GET(_req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const media = await getOwnedMediaFile(params.mediaId, session.user.id);
  if (!media || media.status === 'DELETED') {
    return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
  }

  const storage = getStorageService();
  const url = await storage.getReadUrl({ key: media.storagePath, expiresInSeconds: 3600 });

  return NextResponse.json({ url });
}
