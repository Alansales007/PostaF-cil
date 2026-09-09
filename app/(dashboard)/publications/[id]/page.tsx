import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPublicationForUser } from '@/services/publicationService';
import { PublicationDetail } from '@/components/publication/publication-detail';
import type { StatusHistoryEntry } from '@/lib/publication/history';

export default async function PublicationDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const publication = await getPublicationForUser(session.user.id, params.id);
  if (!publication) notFound();

  const targets = publication.targets.map((t) => ({
    provider: t.provider,
    status: t.status,
    errorMessage: t.errorMessage,
    providerUrl: t.providerUrl,
    statusHistory: Array.isArray(t.statusHistory) ? (t.statusHistory as unknown as StatusHistoryEntry[]) : [],
  }));

  return (
    <PublicationDetail
      publicationId={publication.id}
      caption={publication.generalCaption ?? ''}
      createdAt={publication.createdAt.toISOString()}
      scheduledAt={publication.scheduledAt ? publication.scheduledAt.toISOString() : null}
      timezone={publication.timezone}
      initialTargets={targets}
    />
  );
}
