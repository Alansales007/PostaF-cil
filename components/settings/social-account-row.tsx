'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SocialAccountStatus, SocialProviderId } from '@/types';

const PROVIDER_ICON: Record<SocialProviderId, string> = {
  INSTAGRAM: '/providers/instagram.svg',
  FACEBOOK: '/providers/facebook.svg',
  TIKTOK: '/providers/tiktok.svg',
  KWAI: '/providers/kwai.svg',
};

const PROVIDER_COLOR: Record<SocialProviderId, string> = {
  INSTAGRAM: 'bg-gradient-to-br from-fuchsia-500 to-amber-400',
  FACEBOOK: 'bg-[#1877F2]',
  TIKTOK: 'bg-slate-900 dark:bg-white',
  KWAI: 'bg-[#FF7A00]',
};

interface Props {
  provider: SocialProviderId;
  label: string;
  account: {
    username: string | null;
    displayName: string | null;
    status: SocialAccountStatus;
    avatarUrl: string | null;
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
  const [error, setError] = useState<string | null>(null);
  // Fotos de perfil vêm de um CDN externo (da própria rede social) e podem
  // expirar ou bloquear o link a qualquer momento — se a imagem falhar,
  // volta pro ícone da marca em vez de deixar um espaço quebrado.
  const [avatarFailed, setAvatarFailed] = useState(false);

  async function handleDisconnect() {
    if (!disconnectEndpoint) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(disconnectEndpoint, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Não foi possível desconectar esta conta.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  }

  const needsReconnect = account?.status === 'EXPIRED' || account?.status === 'ERROR' || account?.status === 'REVOKED';
  const showAvatar = Boolean(account?.avatarUrl) && !avatarFailed;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-white',
              !showAvatar && PROVIDER_COLOR[provider],
            )}
          >
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- vem de um host externo (CDN da rede social); next/image exigiria configurar remotePatterns, que evitamos de propósito (ver next.config.mjs)
              <img
                src={account!.avatarUrl!}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <Image src={PROVIDER_ICON[provider]} alt="" width={18} height={18} />
            )}
          </div>

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
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  );
}
