import type { Prisma } from '@prisma/client';

export interface StatusHistoryEntry {
  at: string; // ISO timestamp
  status: string;
  message?: string;
}

const MAX_HISTORY_ENTRIES = 50;

/**
 * Acrescenta uma entrada ao histórico técnico de um PublicationTarget
 * (campo `statusHistory`, JSON) — alimenta a tela de "Detalhes da
 * publicação". Função pura: recebe o valor atual (como veio do Prisma,
 * tipo `unknown`/JsonValue) e devolve o novo array, sem tocar no banco.
 * O retorno já vem tipado como `Prisma.InputJsonValue` para poder ser
 * atribuído direto a um campo Json em `db.*.update`/`create`.
 */
export function appendHistoryEntry(current: unknown, entry: StatusHistoryEntry): Prisma.InputJsonValue {
  const existing = Array.isArray(current) ? (current as StatusHistoryEntry[]) : [];
  const next = [...existing, entry];
  const trimmed = next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next;
  return trimmed as unknown as Prisma.InputJsonValue;
}
