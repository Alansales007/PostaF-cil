'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NetworkSelector } from '@/components/publication/network-selector';
import { CaptionEditor } from '@/components/publication/caption-editor';
import { SchedulePicker } from '@/components/publication/schedule-picker';
import type { SocialProviderId } from '@/types';

interface Props {
  mediaId: string;
  connectedProviders: SocialProviderId[];
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function PublishPanel({ mediaId, connectedProviders }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<SocialProviderId[]>(connectedProviders);
  const [generalCaption, setGeneralCaption] = useState('');
  const [useSameCaption, setUseSameCaption] = useState(true);
  const [customCaptions, setCustomCaptions] = useState<Partial<Record<SocialProviderId, string>>>({});
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = detectTimezone();

  async function handlePublish() {
    setError(null);

    if (scheduleEnabled && !scheduleValue) {
      setError('Escolha a data e a hora do agendamento.');
      return;
    }

    setPublishing(true);
    try {
      // `datetime-local` representa horário local (wall-clock) do navegador —
      // new Date() interpreta esse formato exatamente como horário local,
      // então o UTC resultante já reflete o fuso detectado corretamente.
      const scheduledAt = scheduleEnabled ? new Date(scheduleValue).toISOString() : undefined;

      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          generalCaption,
          useSameCaption,
          customCaptions: useSameCaption ? undefined : customCaptions,
          providers: selected,
          scheduledAt,
          timezone: scheduleEnabled ? timezone : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível publicar.');
        setPublishing(false);
        return;
      }
      router.push(`/publications/${data.publication.id}`);
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      {connectedProviders.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          Conecte pelo menos uma rede social em Configurações antes de publicar.
        </p>
      ) : (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Publicar em</label>
            <NetworkSelector connectedProviders={connectedProviders} selected={selected} onChange={setSelected} />
          </div>

          <CaptionEditor
            selectedProviders={selected}
            generalCaption={generalCaption}
            onGeneralCaptionChange={setGeneralCaption}
            useSameCaption={useSameCaption}
            onUseSameCaptionChange={setUseSameCaption}
            customCaptions={customCaptions}
            onCustomCaptionChange={(provider, value) => setCustomCaptions((prev) => ({ ...prev, [provider]: value }))}
          />

          <SchedulePicker
            scheduleEnabled={scheduleEnabled}
            onToggle={setScheduleEnabled}
            value={scheduleValue}
            onChange={setScheduleValue}
            timezone={timezone}
          />

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button className="w-full gap-2" disabled={selected.length === 0 || publishing} onClick={handlePublish}>
            {scheduleEnabled ? <CalendarClock size={18} /> : <Send size={18} />}
            {publishing ? 'Enviando...' : scheduleEnabled ? 'Agendar publicação' : 'Publicar'}
          </Button>
        </>
      )}
    </div>
  );
}
