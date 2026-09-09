import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getStorageService } from '@/services/storage';
import { getMediaFileMetadata, getOwnedMediaFile } from '@/lib/media/get-owned-media-file';

/**
 * Lista as partes que o storage já confirma ter recebido para este upload.
 * A fonte da verdade é o próprio backend de armazenamento (S3 ListParts,
 * ou o meta.json do disco local) — não uma tabela nossa — para que a
 * retomada funcione mesmo depois de fechar a aba, trocar de rede ou
 * reabrir em outro dispositivo com o mesmo mediaId.
 */
export async function GET(req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const media = await getOwnedMediaFile(params.mediaId, session.user.id);
  if (!media) {
    return NextResponse.json({ error: 'Upload não encontrado.' }, { status: 404 });
  }
  if (!media.uploadSessionId) {
    return NextResponse.json({ error: 'Este upload ainda não foi inicializado corretamente.' }, { status: 409 });
  }

  const metadata = getMediaFileMetadata(media.metadata);
  const storage = getStorageService();
  const parts = await storage.listUploadedParts({ key: media.storagePath, uploadId: media.uploadSessionId });

  return NextResponse.json({
    status: media.status,
    partSize: metadata?.partSize ?? null,
    totalParts: metadata?.totalParts ?? null,
    uploadedParts: parts,
  });
}
