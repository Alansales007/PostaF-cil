import Image from 'next/image';
import { PROVIDER_LABELS, SOCIAL_PROVIDERS, type SocialProviderId } from '@/types';
import { cn } from '@/lib/utils';

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
  connectedProviders: SocialProviderId[];
  selected: SocialProviderId[];
  onChange: (next: SocialProviderId[]) => void;
}

export function NetworkSelector({ connectedProviders, selected, onChange }: Props) {
  function toggle(provider: SocialProviderId) {
    onChange(selected.includes(provider) ? selected.filter((p) => p !== provider) : [...selected, provider]);
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SOCIAL_PROVIDERS.map((provider) => {
        const connected = connectedProviders.includes(provider);
        const checked = selected.includes(provider);
        return (
          <button
            key={provider}
            type="button"
            disabled={!connected}
            onClick={() => toggle(provider)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
              checked
                ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/30'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
              !connected && 'cursor-not-allowed opacity-50',
            )}
            title={connected ? undefined : `Conecte o ${PROVIDER_LABELS[provider]} em Configurações para selecionar`}
          >
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white', PROVIDER_COLOR[provider])}>
              <Image src={PROVIDER_ICON[provider]} alt="" width={16} height={16} />
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-slate-900 dark:text-white">{PROVIDER_LABELS[provider]}</span>
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                checked ? 'border-brand-500 bg-brand-500' : 'border-slate-300 dark:border-slate-600',
              )}
            >
              {checked && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
