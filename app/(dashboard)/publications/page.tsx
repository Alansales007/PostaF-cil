import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listPublicationsForUser, type PublicationListFilter } from '@/services/publicationService';
import { PublicationCard } from '@/components/publication/publication-card';
import { ComingSoon } from '@/components/dashboard/coming-soon';
import { ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

const FILTERS: { value: PublicationListFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'processing', label: 'Processando' },
  { value: 'failed', label: 'Com erro' },
  { value: 'scheduled', label: 'Agendados' },
];

export default async function PublicationsPage({ searchParams }: { searchParams: { filter?: string } }) {
  const session = await getServerSession(authOptions);
  const filter = (searchParams.filter as PublicationListFilter) ?? 'all';

  if (!session?.user?.id) {
    return <ComingSoon icon={ListChecks} title="Histórico de publicações" description="Entre para ver suas publicações." />;
  }

  const publications = await listPublicationsForUser(session.user.id, filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Publicações</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Histórico e status de cada publicação</p>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === 'all' ? '/publications' : `/publications?filter=${f.value}`}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              filter === f.value
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {publications.length === 0 ? (
        <ComingSoon icon={ListChecks} title="Nenhuma publicação por aqui" description="Suas publicações aparecem aqui assim que forem criadas." />
      ) : (
        <div className="space-y-2">
          {publications.map((p) => (
            <PublicationCard
              key={p.id}
              publication={{
                id: p.id,
                generalCaption: p.generalCaption,
                createdAt: p.createdAt.toISOString(),
                scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
                mediaFilename: p.media.originalFilename,
                targets: p.targets.map((t) => ({ provider: t.provider, status: t.status })),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
