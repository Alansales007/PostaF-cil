/**
 * Regras puras de agendamento — sem tocar em banco/fila, para serem
 * testáveis isoladamente. `createPublication()` usa isso para decidir o
 * delay do BullMQ; a UI usa `MIN_LEAD_TIME_MS` para desabilitar horários
 * bem próximos demais do agora.
 */
export const MIN_LEAD_TIME_MS = 60_000; // pelo menos 1 minuto no futuro

export class InvalidScheduleError extends Error {}

/** Valida um horário de agendamento e devolve o delay (ms) até lá — 0 significa "publicar agora". */
export function computeScheduleDelayMs(scheduledAt: Date | null, now: Date = new Date()): number {
  if (!scheduledAt) return 0;

  const delay = scheduledAt.getTime() - now.getTime();
  if (delay < MIN_LEAD_TIME_MS) {
    throw new InvalidScheduleError('Escolha um horário pelo menos 1 minuto no futuro.');
  }
  return delay;
}

/** Uma publicação só pode ser cancelada antes de qualquer alvo ter começado a ser processado de verdade. */
export function isCancellable(targetStatuses: string[]): boolean {
  return targetStatuses.every((s) => s === 'QUEUED');
}
