import { describe, expect, it } from 'vitest';
import { appendHistoryEntry, type StatusHistoryEntry } from '@/lib/publication/history';

describe('lib/publication/history — appendHistoryEntry', () => {
  it('cria o array a partir de null', () => {
    const result = appendHistoryEntry(null, { at: '2026-01-01T00:00:00Z', status: 'QUEUED' }) as unknown as StatusHistoryEntry[];
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('QUEUED');
  });

  it('acrescenta ao histórico existente preservando a ordem', () => {
    const existing: StatusHistoryEntry[] = [{ at: '2026-01-01T00:00:00Z', status: 'QUEUED' }];
    const result = appendHistoryEntry(existing, { at: '2026-01-01T00:01:00Z', status: 'PROCESSING' }) as unknown as StatusHistoryEntry[];
    expect(result).toHaveLength(2);
    expect(result[1]!.status).toBe('PROCESSING');
  });

  it('ignora um valor atual que não é um array (ex.: JSON corrompido)', () => {
    const result = appendHistoryEntry({ nao: 'é um array' }, { at: '2026-01-01T00:00:00Z', status: 'QUEUED' }) as unknown as StatusHistoryEntry[];
    expect(result).toHaveLength(1);
  });

  it('trunca o histórico em 50 entradas, mantendo as mais recentes', () => {
    const existing: StatusHistoryEntry[] = Array.from({ length: 50 }, (_, i) => ({ at: String(i), status: 'PROCESSING' }));
    const result = appendHistoryEntry(existing, { at: 'novo', status: 'PUBLISHED' }) as unknown as StatusHistoryEntry[];
    expect(result).toHaveLength(50);
    expect(result[result.length - 1]!.at).toBe('novo');
    expect(result[0]!.at).toBe('1'); // a mais antiga (índice 0) foi descartada
  });
});
