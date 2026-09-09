import { describe, expect, it, vi, beforeEach } from 'vitest';

const mediaFileFindUnique = vi.fn();
const socialAccountFindMany = vi.fn();
const transactionMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    mediaFile: { findUnique: (...args: unknown[]) => mediaFileFindUnique(...args) },
    socialAccount: { findMany: (...args: unknown[]) => socialAccountFindMany(...args) },
    $transaction: (...args: unknown[]) => transactionMock(...args),
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/inngest/events', () => ({
  enqueuePublishTarget: (...args: unknown[]) => enqueueMock(...args),
  cancelPublishTarget: vi.fn(),
  enqueueTranscode: vi.fn(),
}));

const { createPublication, PublicationValidationError } = await import('@/services/publicationService');
const { SOCIAL_PROVIDERS } = await import('@/types');
const FIRST_PROVIDER = SOCIAL_PROVIDERS[0]!;

const baseInput = {
  mediaId: 'media-1',
  generalCaption: 'legenda',
  useSameCaption: true,
  providers: [FIRST_PROVIDER],
};

describe('services/publicationService — createPublication (validação)', () => {
  beforeEach(() => {
    mediaFileFindUnique.mockReset();
    socialAccountFindMany.mockReset();
    transactionMock.mockReset();
    enqueueMock.mockReset();
  });

  it('rejeita quando nenhuma rede foi selecionada', async () => {
    await expect(createPublication('user-1', { ...baseInput, providers: [] })).rejects.toThrow(PublicationValidationError);
    expect(mediaFileFindUnique).not.toHaveBeenCalled();
  });

  it('rejeita quando o vídeo não existe', async () => {
    mediaFileFindUnique.mockResolvedValue(null);
    await expect(createPublication('user-1', baseInput)).rejects.toThrow('Vídeo não encontrado.');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o vídeo pertence a outro usuário (IDOR)', async () => {
    mediaFileFindUnique.mockResolvedValue({ id: 'media-1', userId: 'outro-usuario', status: 'UPLOADED' });
    await expect(createPublication('user-1', baseInput)).rejects.toThrow('Vídeo não encontrado.');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejeita quando o vídeo ainda não terminou de ser processado', async () => {
    mediaFileFindUnique.mockResolvedValue({ id: 'media-1', userId: 'user-1', status: 'UPLOADING' });
    await expect(createPublication('user-1', baseInput)).rejects.toThrow(/ainda não terminou/);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejeita quando alguma rede selecionada não está conectada', async () => {
    mediaFileFindUnique.mockResolvedValue({ id: 'media-1', userId: 'user-1', status: 'UPLOADED' });
    socialAccountFindMany.mockResolvedValue([]); // nenhuma conta conectada
    await expect(createPublication('user-1', baseInput)).rejects.toThrow(/Conecte antes de publicar/);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('rejeita um agendamento no passado antes de tocar no banco', async () => {
    mediaFileFindUnique.mockResolvedValue({ id: 'media-1', userId: 'user-1', status: 'UPLOADED' });
    socialAccountFindMany.mockResolvedValue([{ id: 'acc-1', provider: 'INSTAGRAM' }]);
    await expect(
      createPublication('user-1', { ...baseInput, scheduledAt: new Date(Date.now() - 60_000).toISOString() }),
    ).rejects.toThrow(PublicationValidationError);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
