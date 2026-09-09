import { db } from '@/lib/db';

/**
 * Carrega um MediaFile garantindo que pertence ao usuário autenticado.
 * Usado por todas as rotas de upload para nunca deixar um usuário
 * manipular (ler status, enviar partes, completar/abortar) o upload de
 * outra pessoa.
 */
export async function getOwnedMediaFile(mediaId: string, userId: string) {
  const media = await db.mediaFile.findUnique({ where: { id: mediaId } });
  if (!media || media.userId !== userId) return null;
  return media;
}

export interface MediaFileMetadata {
  partSize: number;
  totalParts: number;
}

export function getMediaFileMetadata(metadata: unknown): MediaFileMetadata | null {
  if (
    metadata &&
    typeof metadata === 'object' &&
    'partSize' in metadata &&
    'totalParts' in metadata &&
    typeof (metadata as Record<string, unknown>).partSize === 'number' &&
    typeof (metadata as Record<string, unknown>).totalParts === 'number'
  ) {
    return metadata as unknown as MediaFileMetadata;
  }
  return null;
}
