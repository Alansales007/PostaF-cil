import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPublicationForUser } from '@/services/publicationService';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const publication = await getPublicationForUser(session.user.id, params.id);
  if (!publication) {
    return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404 });
  }

  return NextResponse.json({
    publication: {
      ...publication,
      media: { ...publication.media, filesize: publication.media.filesize.toString() },
    },
  });
}
