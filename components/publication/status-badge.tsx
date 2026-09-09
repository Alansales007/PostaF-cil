import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import type { PublicationTargetStatus } from '@/types';

const CONFIG: Record<PublicationTargetStatus, { icon: typeof CheckCircle2; label: string; className: string; spin?: boolean }> = {
  QUEUED: { icon: Clock, label: 'Na fila', className: 'text-slate-400 dark:text-slate-500' },
  PROCESSING: { icon: Loader2, label: 'Processando', className: 'text-brand-500', spin: true },
  PUBLISHING: { icon: Loader2, label: 'Publicando', className: 'text-brand-500', spin: true },
  PUBLISHED: { icon: CheckCircle2, label: 'Publicado', className: 'text-emerald-600 dark:text-emerald-400' },
  FAILED: { icon: XCircle, label: 'Falha', className: 'text-red-600 dark:text-red-400' },
  CANCELLED: { icon: XCircle, label: 'Cancelado', className: 'text-slate-400 dark:text-slate-500' },
};

export function StatusBadge({ status }: { status: PublicationTargetStatus }) {
  const { icon: Icon, label, className, spin } = CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className}`}>
      <Icon size={16} className={spin ? 'animate-spin' : undefined} />
      {label}
    </span>
  );
}
