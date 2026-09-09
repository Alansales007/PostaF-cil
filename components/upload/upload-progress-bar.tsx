import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type { UploadPhase, UploadProgress } from '@/lib/upload/chunked-uploader';

const PHASE_LABEL: Record<UploadPhase, string> = {
  idle: '',
  initializing: 'Iniciando upload...',
  uploading: 'Enviando vídeo...',
  completing: 'Finalizando...',
  done: 'Upload concluído',
  error: 'Falha no upload',
  cancelled: 'Upload cancelado',
};

interface Props {
  phase: UploadPhase;
  progress: UploadProgress | null;
  error: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function UploadProgressBar({ phase, progress, error, onCancel, onRetry }: Props) {
  const percent = progress?.percent ?? 0;

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
          {phase === 'done' && <CheckCircle2 size={16} className="text-emerald-500" />}
          {phase === 'error' && <XCircle size={16} className="text-red-500" />}
          {(phase === 'uploading' || phase === 'initializing' || phase === 'completing') && (
            <Loader2 size={16} className="animate-spin text-brand-500" />
          )}
          {PHASE_LABEL[phase]}
        </span>
        {progress && phase === 'uploading' && (
          <span className="text-slate-500 dark:text-slate-400">
            {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)}
          </span>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-200"
          style={{ width: `${phase === 'done' ? 100 : percent}%` }}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-3 pt-1">
        {(phase === 'uploading' || phase === 'initializing') && onCancel && (
          <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-500 hover:underline dark:text-slate-400">
            Cancelar
          </button>
        )}
        {phase === 'error' && onRetry && (
          <button type="button" onClick={onRetry} className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
