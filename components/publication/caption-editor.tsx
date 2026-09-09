'use client';

import { useState } from 'react';
import { CAPTION_LIMITS, PROVIDER_LABELS, type SocialProviderId } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  selectedProviders: SocialProviderId[];
  generalCaption: string;
  onGeneralCaptionChange: (value: string) => void;
  useSameCaption: boolean;
  onUseSameCaptionChange: (value: boolean) => void;
  customCaptions: Partial<Record<SocialProviderId, string>>;
  onCustomCaptionChange: (provider: SocialProviderId, value: string) => void;
}

export function CaptionEditor({
  selectedProviders,
  generalCaption,
  onGeneralCaptionChange,
  useSameCaption,
  onUseSameCaptionChange,
  customCaptions,
  onCustomCaptionChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<SocialProviderId | null>(selectedProviders[0] ?? null);
  const tab = activeTab && selectedProviders.includes(activeTab) ? activeTab : selectedProviders[0] ?? null;

  const limit = useSameCaption
    ? Math.min(...selectedProviders.map((p) => CAPTION_LIMITS[p]), Infinity)
    : tab
      ? CAPTION_LIMITS[tab]
      : Infinity;

  const currentValue = useSameCaption ? generalCaption : tab ? (customCaptions[tab] ?? generalCaption) : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Legenda</label>
        <button
          type="button"
          onClick={() => onUseSameCaptionChange(!useSameCaption)}
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          {useSameCaption ? 'Personalizar por rede' : 'Usar a mesma legenda em todas'}
        </button>
      </div>

      {!useSameCaption && selectedProviders.length > 0 && (
        <div className="flex gap-1 overflow-x-auto">
          {selectedProviders.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setActiveTab(p)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === p
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300',
              )}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={currentValue}
        onChange={(e) => {
          if (useSameCaption || !tab) onGeneralCaptionChange(e.target.value);
          else onCustomCaptionChange(tab, e.target.value);
        }}
        rows={4}
        maxLength={Number.isFinite(limit) ? limit : undefined}
        placeholder="Escreva a legenda da publicação..."
        className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {Number.isFinite(limit) && (
        <p className="text-right text-xs text-slate-400 dark:text-slate-500">
          {currentValue.length} / {limit}
        </p>
      )}
    </div>
  );
}
