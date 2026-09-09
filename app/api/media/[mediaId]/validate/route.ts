import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOwnedMediaFile } from '@/lib/media/get-owned-media-file';
import { getSocialProvider } from '@/providers';
import { SOCIAL_PROVIDERS } from '@/types';

/**
 * Pré-validação técnica por plataforma (formato, tamanho, duração etc.),
 * chamando SocialProvider.validateMedia() de cada rede. Com
 * MOCK_SOCIAL_APIS=true isso já funciona de ponta a ponta contra o
 * MockProvider; os limites reais de cada rede entram junto das
 * integrações reais (ETAPAS 3-6).
 */
export async function GET(_req: NextRequest, { params }: { params: { mediaId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const media = await getOwnedMediaFile(params.mediaId, session.user.id);
  if (!media) {
    return NextResponse.json({ error: 'Vídeo não encontrado.' }, { status: 404 });
  }

  const input = {
    mimeType: media.mimeType,
    filesizeBytes: Number(media.filesize),
    durationSeconds: media.duration,
    width: media.width,
    height: media.height,
  };

  const results = await Promise.all(
    SOCIAL_PROVIDERS.map(async (id) => {
      try {
        const provider = getSocialProvider(id);
        const result = await provider.validateMedia(input);
        return { provider: id, ...result };
      } catch {
        return { provider: id, compatible: false, needsConversion: false, reasons: ['Não foi possível validar.'] };
      }
    }),
  );

  return NextResponse.json({ results });
}
