import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SocialProviderId } from '@/types';

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
  connected: boolean;
  accountLabel?: string | null;
  /** false quando a API oficial da plataforma ainda não está liberada (ex.: Kwai sem aprovação) */
  platformAvailable: boolean;
  /** false enquanto o fluxo OAuth desta rede ainda não foi implementado (etapas 3-6) */
  connectImplemented: boolean;
}

export function SocialAccountCard({
  provider,
  label,
  connected,
  accountLabel,
  platformAvailable,
  connectImplemented,
}: Props) {
  return (
    <Card className="flex flex-col items-center gap-2 px-3 py-4 text-center">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl text-white', PROVIDER_COLOR[provider])}>
        <Image src={PROVIDER_ICON[provider]} alt="" width={22} height={22} />
      </div>
      <span className="text-sm font-medium text-slate-900 dark:text-white">{label}</span>

      {connected ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={14} /> {accountLabel || 'Conectado'}
        </span>
      ) : !platformAvailable ? (
        <span className="text-[11px] leading-tight text-slate-400 dark:text-slate-500">
          Integração aguardando autorização da plataforma
        </span>
      ) : connectImplemented ? (
        <a
          href={`/api/social/${provider.toLowerCase()}/connect`}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Conectar
        </a>
      ) : (
        <button
          disabled
          title="Disponível em uma próxima etapa"
          className="text-xs font-medium text-brand-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-brand-400"
        >
          Conectar
        </button>
      )}
    </Card>
  );
}
