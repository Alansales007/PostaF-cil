'use client';

interface Props {
  scheduleEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  timezone: string;
}

function minDateTimeLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 1000); // 2 min de margem
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SchedulePicker({ scheduleEnabled, onToggle, value, onChange, timezone }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onToggle(false)}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
            !scheduleEnabled
              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          Publicar agora
        </button>
        <button
          type="button"
          onClick={() => onToggle(true)}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
            scheduleEnabled
              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          Agendar
        </button>
      </div>

      {scheduleEnabled && (
        <div className="space-y-1.5">
          <input
            type="datetime-local"
            value={value}
            min={minDateTimeLocal()}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500">Fuso horário: {timezone} (detectado do seu navegador)</p>
        </div>
      )}
    </div>
  );
}
