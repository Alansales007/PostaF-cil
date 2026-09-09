import { describe, expect, it } from 'vitest';
import { aggregatePublicationStatus } from '@/lib/publication/status';

describe('lib/publication/status — aggregatePublicationStatus', () => {
  it('sem alvos => DRAFT', () => {
    expect(aggregatePublicationStatus([])).toBe('DRAFT');
  });

  it('todos publicados => PUBLISHED', () => {
    expect(aggregatePublicationStatus(['PUBLISHED', 'PUBLISHED'])).toBe('PUBLISHED');
  });

  it('todos falharam => FAILED', () => {
    expect(aggregatePublicationStatus(['FAILED', 'FAILED'])).toBe('FAILED');
  });

  it('mistura de sucesso e falha, todos terminais => PARTIAL_SUCCESS', () => {
    expect(aggregatePublicationStatus(['PUBLISHED', 'FAILED'])).toBe('PARTIAL_SUCCESS');
  });

  it('algum ainda publicando => PUBLISHING (tem prioridade sobre PROCESSING)', () => {
    expect(aggregatePublicationStatus(['PUBLISHING', 'QUEUED'])).toBe('PUBLISHING');
  });

  it('algum ainda processando, nenhum publicando => PROCESSING', () => {
    expect(aggregatePublicationStatus(['PROCESSING', 'QUEUED'])).toBe('PROCESSING');
  });

  it('tudo na fila, nada processado ainda => QUEUED', () => {
    expect(aggregatePublicationStatus(['QUEUED', 'QUEUED'])).toBe('QUEUED');
  });

  it('um publicado e outro ainda processando => não é terminal, reflete o que está em andamento', () => {
    expect(aggregatePublicationStatus(['PUBLISHED', 'PROCESSING'])).toBe('PROCESSING');
  });

  it('publicado + cancelado (terminal) => PARTIAL_SUCCESS, não PUBLISHED', () => {
    expect(aggregatePublicationStatus(['PUBLISHED', 'CANCELLED'])).toBe('PARTIAL_SUCCESS');
  });
});
