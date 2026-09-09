'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/publication/status-badge';
import { PROVIDER_LABELS, type PublicationTargetStatus, type SocialProviderId } from '@/types';
import type { StatusHistoryEntry } from '@/lib/publication/history';

export interface TargetViewModel {
  provider: SocialProviderId;
  status: PublicationTargetStatus;
  errorMessage: string | null;
  providerUrl: string | null;
  statusHistory: StatusHistoryEntry[];
}

export function PublicationTargetRow({ target, onRetry }: { target: TargetViewModel; onRetry: (provider: SocialProviderId) => Promise<void> }) {
  const [showHistory, setShowHistory] = useState(false);
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-900 dark:text-white">{PROVIDER_LABELS[target.provider]}</span>
        <div className="flex items-center gap-3">
          <StatusBadge status={target.status} />
          {target.providerUrl && (
            <a href={target.providerUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-500">
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>

      {target.status === 'FAILED' && (
        <div className="mt-2 space-y-2">
          {target.errorMessage && <p className="text-sm text-red-600 dark:text-red-400">{target.errorMessage}</p>}
          <button
            onClick={async () => {
              setRetrying(true);
              await onRetry(target.provider);
              setRetrying(false);
            }}
            disabled={retrying}
            className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-400"
          >
            {retrying ? 'Reenviando...' : 'Tentar novamente'}
          </button>
        </div>
      )}

      {target.statusHistory.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ChevronDown size={14} className={showHistory ? 'rotate-180 transition-transform' : 'transition-transform'} />
            Detalhes técnicos
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {target.statusHistory.map((entry, i) => (
                <li key={i}>
                  <span className="font-mono text-slate-400 dark:text-slate-500">{new Date(entry.at).toLocaleTimeString('pt-BR')}</span>{' '}
                  {entry.status} {entry.message && `— ${entry.message}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
