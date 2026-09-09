import Link from 'next/link';
import { Film, CalendarClock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/publication/status-badge';
import { PROVIDER_LABELS } from '@/types';
import type { PublicationTargetStatus, SocialProviderId } from '@/types';

export interface PublicationCardData {
  id: string;
  generalCaption: string | null;
  createdAt: string;
  scheduledAt: string | null;
  mediaFilename: string;
  targets: { provider: SocialProviderId; status: PublicationTargetStatus }[];
}

export function PublicationCard({ publication }: { publication: PublicationCardData }) {
  const isFutureSchedule = publication.scheduledAt ? new Date(publication.scheduledAt).getTime() > Date.now() : false;

  return (
    <Link href={`/publications/${publication.id}`}>
      <Card className="flex gap-3 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <Film size={20} className="text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {publication.generalCaption || publication.mediaFilename}
          </p>
          {isFutureSchedule ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400">
              <CalendarClock size={12} /> Agendado para {new Date(publication.scheduledAt!).toLocaleString('pt-BR')}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {new Date(publication.createdAt).toLocaleString('pt-BR')}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {publication.targets.map((t) => (
              <span key={t.provider} className="flex items-center gap-1 text-xs">
                <span className="font-medium text-slate-500 dark:text-slate-400">{PROVIDER_LABELS[t.provider]}</span>
                <StatusBadge status={t.status} />
              </span>
            ))}
          </div>
        </div>
      </Card>
    </Link>
  );
}
