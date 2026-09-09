import type { PublicationStatus, PublicationTargetStatus } from '@/types';

/**
 * Deriva o status agregado da Publication a partir do status de cada
 * PublicationTarget — lógica pura, sem tocar no banco, para ser fácil de
 * testar e para o worker e a API concordarem sempre no mesmo resultado.
 */
export function aggregatePublicationStatus(targetStatuses: PublicationTargetStatus[]): PublicationStatus {
  if (targetStatuses.length === 0) return 'DRAFT';

  const isTerminal = (s: PublicationTargetStatus) => s === 'PUBLISHED' || s === 'FAILED' || s === 'CANCELLED';

  if (targetStatuses.every((s) => s === 'PUBLISHED')) return 'PUBLISHED';

  if (targetStatuses.every(isTerminal)) {
    const anyPublished = targetStatuses.some((s) => s === 'PUBLISHED');
    return anyPublished ? 'PARTIAL_SUCCESS' : 'FAILED';
  }

  if (targetStatuses.some((s) => s === 'PUBLISHING')) return 'PUBLISHING';
  if (targetStatuses.some((s) => s === 'PROCESSING')) return 'PROCESSING';
  return 'QUEUED';
}
