'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PublicationTargetRow, type TargetViewModel } from '@/components/publication/publication-target-row';
import { usePublicationEvents } from '@/hooks/use-publication-events';

interface Props {
  publicationId: string;
  caption: string;
  createdAt: string;
  scheduledAt: string | null;
  timezone: string | null;
  initialTargets: TargetViewModel[];
}

export function PublicationDetail({ publicationId, caption, createdAt, scheduledAt, timezone, initialTargets }: Props) {
  const router = useRouter();
  const [targets, setTargets] = useState(initialTargets);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isFutureSchedule = scheduledAt ? new Date(scheduledAt).getTime() > Date.now() : false;
  const canCancel = isFutureSchedule && targets.every((t) => t.status === 'QUEUED');

  usePublicationEvents((event) => {
    if (event.publicationId !== publicationId) return;
    setTargets((prev) =>
      prev.map((t) =>
        t.provider === event.provider
          ? {
              ...t,
              status: event.status,
              providerUrl: event.providerUrl ?? t.providerUrl,
              errorMessage: event.errorMessage ?? t.errorMessage,
            }
          : t,
      ),
    );
  });

  async function handleRetry(provider: string) {
    const res = await fetch(`/api/publications/${publicationId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    if (res.ok) {
      setTargets((prev) => prev.map((t) => (t.provider === provider ? { ...t, status: 'QUEUED', errorMessage: null } : t)));
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    const res = await fetch(`/api/publications/${publicationId}/cancel`, { method: 'POST' });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setCancelError(data.error ?? 'Não foi possível cancelar.');
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Publicação</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{new Date(createdAt).toLocaleString('pt-BR')}</p>
      </div>

      {isFutureSchedule && scheduledAt && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <CalendarClock size={16} className="text-brand-500" />
              Agendado para {new Date(scheduledAt).toLocaleString('pt-BR')}
              {timezone && ` (${timezone})`}
            </span>
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-sm font-medium text-red-600 hover:underline disabled:opacity-60 dark:text-red-400"
              >
                {cancelling ? 'Cancelando...' : 'Cancelar agendamento'}
              </button>
            )}
          </CardContent>
        </Card>
      )}
      {cancelError && <p className="text-sm text-red-600 dark:text-red-400">{cancelError}</p>}

      {caption && (
        <Card>
          <CardContent className="py-3 text-sm text-slate-700 dark:text-slate-300">{caption}</CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {targets.map((target) => (
          <PublicationTargetRow key={target.provider} target={target} onRetry={handleRetry} />
        ))}
      </div>
    </div>
  );
}
