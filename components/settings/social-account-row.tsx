'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import type { SocialAccountStatus, SocialProviderId } from '@/types';

interface Props {
  provider: SocialProviderId;
  label: string;
  account: {
    username: string | null;
    displayName: string | null;
    status: SocialAccountStatus;
  } | null;
  /** href de /api/social/[provider]/connect quando o OAuth já está implementado. */
  connectHref: string | null;
  disconnectEndpoint: string | null;
  unavailableReason: string | null;
}

const STATUS_LABEL: Record<SocialAccountStatus, string> = {
  ACTIVE: 'Conectado',
  EXPIRED: 'Autorização expirada',
  REVOKED: 'Acesso revogado',
  ERROR: 'Erro na conexão',
  PENDING: 'Aguardando autorização',
};

export function SocialAccountRow({ provider, label, account, connectHref, disconnectEndpoint, unavailableReason }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDisconnect() {
    if (!disconnectEndpoint) return;
    setLoading(true);
    try {
      await fetch(disconnectEndpoint, { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const needsReconnect = account?.status === 'EXPIRED' || account?.status === 'ERROR' || account?.status === 'REVOKED';

  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium text-slate-900 dark:text-white">{label}</p>
        {account ? (
          <p
            className={`mt-0.5 flex items-center gap-1 text-sm ${needsReconnect ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}
          >
            {needsReconnect ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {account.username ? `@${account.username}` : account.displayName || STATUS_LABEL[account.status]}
            {needsReconnect && ` — ${STATUS_LABEL[account.status]}`}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{unavailableReason ?? 'Não conectado'}</p>
        )}
      </div>

      <div className="shrink-0">
        {account && !needsReconnect && disconnectEndpoint && (
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-60 dark:text-slate-400"
          >
            {loading ? 'Removendo...' : 'Desconectar'}
          </button>
        )}
        {(!account || needsReconnect) && connectHref && (
          <a href={connectHref} className={buttonVariants('secondary', 'sm')}>
            {needsReconnect ? 'Reconectar' : 'Conectar'}
          </a>
        )}
      </div>
    </Card>
  );
}
