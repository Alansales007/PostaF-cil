import { describe, expect, it } from 'vitest';
import { computeScheduleDelayMs, InvalidScheduleError, isCancellable, MIN_LEAD_TIME_MS } from '@/lib/publication/schedule';

describe('lib/publication/schedule — computeScheduleDelayMs', () => {
  it('retorna 0 quando não há agendamento (publicar agora)', () => {
    expect(computeScheduleDelayMs(null)).toBe(0);
  });

  it('calcula o delay corretamente para um horário futuro válido', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const scheduledAt = new Date('2026-01-01T12:10:00Z');
    expect(computeScheduleDelayMs(scheduledAt, now)).toBe(10 * 60 * 1000);
  });

  it('rejeita um horário no passado', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const scheduledAt = new Date('2026-01-01T11:00:00Z');
    expect(() => computeScheduleDelayMs(scheduledAt, now)).toThrow(InvalidScheduleError);
  });

  it('rejeita um horário próximo demais do agora (menor que o lead time mínimo)', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const scheduledAt = new Date(now.getTime() + MIN_LEAD_TIME_MS - 1);
    expect(() => computeScheduleDelayMs(scheduledAt, now)).toThrow(InvalidScheduleError);
  });

  it('aceita um horário exatamente no limite do lead time mínimo', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const scheduledAt = new Date(now.getTime() + MIN_LEAD_TIME_MS);
    expect(computeScheduleDelayMs(scheduledAt, now)).toBe(MIN_LEAD_TIME_MS);
  });
});

describe('lib/publication/schedule — isCancellable', () => {
  it('permite cancelar quando nenhum alvo começou a ser processado', () => {
    expect(isCancellable(['QUEUED', 'QUEUED'])).toBe(true);
  });

  it('não permite cancelar se qualquer alvo já avançou', () => {
    expect(isCancellable(['QUEUED', 'PROCESSING'])).toBe(false);
    expect(isCancellable(['PUBLISHED'])).toBe(false);
    expect(isCancellable(['FAILED'])).toBe(false);
  });

  it('lista vazia é considerada cancelável (nada a impedir)', () => {
    expect(isCancellable([])).toBe(true);
  });
});
