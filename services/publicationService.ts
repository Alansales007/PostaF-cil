import type { PublicationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { generateCorrelationId, logger } from '@/lib/logger';
import { enqueuePublishTarget, removeQueuedJob } from '@/lib/queue/publish-queue';
import { enqueueTranscode } from '@/lib/queue/transcode-queue';
import { appendHistoryEntry } from '@/lib/publication/history';
import { computeScheduleDelayMs, isCancellable, InvalidScheduleError } from '@/lib/publication/schedule';
import { needsTranscodeForMediaFile } from '@/services/mediaProcessor';
import { aggregatePublicationStatus } from '@/lib/publication/status';
import type { SocialProviderId } from '@/types';

export class PublicationValidationError extends Error {}

export interface CreatePublicationInput {
  mediaId: string;
  title?: string;
  generalCaption: string;
  useSameCaption: boolean;
  customCaptions?: Partial<Record<SocialProviderId, string>>;
  providers: SocialProviderId[];
  deleteAfterPublish?: boolean;
  /** ISO 8601 — quando ausente/no passado, publica imediatamente. */
  scheduledAt?: string;
  /** Fuso horário IANA detectado no navegador (ex.: "America/Sao_Paulo") — só para exibição/auditoria. */
  timezone?: string;
}

/**
 * Cria a Publication + um PublicationTarget por rede selecionada e
 * enfileira cada um independentemente — cada rede é processada e pode
 * falhar/repetir sem afetar as demais (ver workers/publishWorker.ts).
 */
export async function createPublication(userId: string, input: CreatePublicationInput) {
  if (input.providers.length === 0) {
    throw new PublicationValidationError('Selecione pelo menos uma rede social.');
  }

  const media = await db.mediaFile.findUnique({ where: { id: input.mediaId } });
  if (!media || media.userId !== userId) {
    throw new PublicationValidationError('Vídeo não encontrado.');
  }
  if (media.status !== 'UPLOADED' && media.status !== 'READY') {
    throw new PublicationValidationError('Este vídeo ainda não terminou de ser enviado/processado.');
  }

  const accounts = await db.socialAccount.findMany({
    where: { userId, provider: { in: input.providers } },
  });
  const accountByProvider = new Map(accounts.map((a) => [a.provider, a]));

  const notConnected = input.providers.filter((p) => !accountByProvider.has(p));
  if (notConnected.length > 0) {
    throw new PublicationValidationError(`Conecte antes de publicar: ${notConnected.join(', ')}.`);
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new PublicationValidationError('Data de agendamento inválida.');
  }

  let delayMs: number;
  try {
    delayMs = computeScheduleDelayMs(scheduledAt);
  } catch (err) {
    if (err instanceof InvalidScheduleError) throw new PublicationValidationError(err.message);
    throw err;
  }

  const correlationId = generateCorrelationId('PUB');

  const publication = await db.$transaction(async (tx) => {
    const created = await tx.publication.create({
      data: {
        userId,
        mediaId: media.id,
        title: input.title,
        generalCaption: input.generalCaption,
        useSameCaption: input.useSameCaption,
        deleteAfterPublish: input.deleteAfterPublish ?? false,
        scheduledAt,
        timezone: input.timezone,
        correlationId,
        status: 'QUEUED',
      },
    });

    for (const provider of input.providers) {
      const account = accountByProvider.get(provider)!;
      await tx.publicationTarget.create({
        data: {
          publicationId: created.id,
          socialAccountId: account.id,
          provider,
          customCaption: input.useSameCaption ? null : (input.customCaptions?.[provider] ?? input.generalCaption),
          status: 'QUEUED',
          statusHistory: appendHistoryEntry(null, {
            at: new Date().toISOString(),
            status: 'QUEUED',
            message: scheduledAt ? `Agendado para ${scheduledAt.toISOString()}.` : 'Publicação criada.',
          }),
        },
      });
    }

    return tx.publication.findUniqueOrThrow({ where: { id: created.id }, include: { targets: true } });
  });

  // Se o vídeo já é MP4/H.264/AAC (ou já foi transcodificado antes por
  // outra publicação), publica direto. Senão, prepara o vídeo primeiro —
  // o transcodeWorker é quem libera os alvos desta publicação (e de
  // qualquer outra publicação que esteja esperando o mesmo vídeo) assim
  // que terminar. Nunca altera o arquivo original.
  if (media.status !== 'READY' && needsTranscodeForMediaFile(media.mimeType, media.videoCodec, media.audioCodec)) {
    await db.mediaFile.update({ where: { id: media.id }, data: { status: 'PROCESSING' } });
    await enqueueTranscode(media.id);
  } else {
    await Promise.all(publication.targets.map((target) => enqueuePublishTarget(target.id, { delayMs })));
  }

  await db.auditLog.create({
    data: { userId, action: 'publication.created', entityType: 'Publication', entityId: publication.id, correlationId },
  });

  return publication;
}

/**
 * Enfileira os alvos ainda não iniciados de toda publicação que estava
 * esperando este vídeo terminar de ser preparado (pode ser mais de uma,
 * se o mesmo vídeo foi usado em publicações diferentes enquanto a
 * primeira transcodificação ainda rodava). Recalcula o delay de cada
 * alvo a partir do agendamento de cada publicação — não de um valor
 * congelado no momento da criação — para respeitar o horário certo mesmo
 * que a transcodificação tenha demorado.
 */
export async function enqueuePendingTargetsForMedia(mediaId: string): Promise<void> {
  const targets = await db.publicationTarget.findMany({
    where: { status: 'QUEUED', publication: { mediaId } },
    include: { publication: true },
  });

  await Promise.all(
    targets.map((target) => {
      const delayMs = target.publication.scheduledAt
        ? Math.max(0, target.publication.scheduledAt.getTime() - Date.now())
        : 0;
      return enqueuePublishTarget(target.id, { delayMs });
    }),
  );
}

/** Quando a transcodificação falha definitivamente, marca como FAILED todo alvo que dependia dela. */
export async function failPendingTargetsForMedia(mediaId: string, errorMessage: string): Promise<void> {
  const targets = await db.publicationTarget.findMany({ where: { status: 'QUEUED', publication: { mediaId } } });

  for (const target of targets) {
    await db.publicationTarget.update({
      where: { id: target.id },
      data: {
        status: 'FAILED',
        errorCode: 'TRANSCODE_FAILED',
        errorMessage,
        statusHistory: appendHistoryEntry(target.statusHistory, { at: new Date().toISOString(), status: 'FAILED', message: errorMessage }),
      },
    });
  }

  const publicationIds = [...new Set(targets.map((t) => t.publicationId))];
  for (const publicationId of publicationIds) {
    const publication = await db.publication.findUnique({ where: { id: publicationId }, include: { targets: true } });
    if (!publication) continue;
    await db.publication.update({
      where: { id: publicationId },
      data: { status: aggregatePublicationStatus(publication.targets.map((t) => t.status)) },
    });
  }

  logger.warn({ mediaId, affectedTargets: targets.length }, 'Transcodificação falhou definitivamente — alvos marcados como FAILED');
}

export async function getPublicationForUser(userId: string, publicationId: string) {
  const publication = await db.publication.findUnique({
    where: { id: publicationId },
    include: { targets: { include: { socialAccount: true } }, media: true },
  });
  if (!publication || publication.userId !== userId) return null;
  return publication;
}

export type PublicationListFilter = 'all' | 'published' | 'processing' | 'failed' | 'scheduled';

export async function listPublicationsForUser(userId: string, filter: PublicationListFilter = 'all') {
  // "Agendados" não é um status — é qualquer publicação com scheduledAt no
  // futuro que ainda não começou a ser processada de verdade.
  if (filter === 'scheduled') {
    return db.publication.findMany({
      where: { userId, scheduledAt: { gt: new Date() }, status: 'QUEUED' },
      include: { targets: true, media: true },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
  }

  const statusIn: Record<Exclude<PublicationListFilter, 'scheduled'>, PublicationStatus[] | undefined> = {
    all: undefined,
    published: ['PUBLISHED'],
    processing: ['DRAFT', 'UPLOADING', 'QUEUED', 'PROCESSING', 'PUBLISHING'],
    failed: ['FAILED', 'PARTIAL_SUCCESS'],
  };

  const statuses = statusIn[filter];

  return db.publication.findMany({
    where: {
      userId,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: { targets: true, media: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/** Tenta de novo exclusivamente a rede que falhou — nunca republica as que já deram certo. */
export async function retryPublicationTarget(userId: string, publicationId: string, provider: SocialProviderId) {
  const publication = await db.publication.findUnique({
    where: { id: publicationId },
    include: { targets: true },
  });
  if (!publication || publication.userId !== userId) {
    throw new PublicationValidationError('Publicação não encontrada.');
  }

  const target = publication.targets.find((t) => t.provider === provider);
  if (!target) {
    throw new PublicationValidationError('Esta publicação não tem um alvo para essa rede.');
  }
  if (target.status !== 'FAILED') {
    throw new PublicationValidationError('Só é possível tentar de novo um alvo que falhou.');
  }

  const updated = await db.publicationTarget.update({
    where: { id: target.id },
    data: {
      status: 'QUEUED',
      providerContainerId: null,
      errorCode: null,
      errorMessage: null,
      nextRetryAt: null,
      statusHistory: appendHistoryEntry(target.statusHistory, {
        at: new Date().toISOString(),
        status: 'QUEUED',
        message: 'Nova tentativa solicitada pelo usuário.',
      }),
    },
  });

  await enqueuePublishTarget(target.id, { jobId: `${target.id}:retry:${Date.now()}` });

  await db.auditLog.create({
    data: { userId, action: 'publication_target.retry', entityType: 'PublicationTarget', entityId: target.id, correlationId: publication.correlationId },
  });

  return updated;
}

/**
 * Cancela uma publicação agendada antes que qualquer alvo comece a ser
 * processado — remove o job ainda esperando na fila (BullMQ) de cada
 * alvo. Depois que uma rede já começou a publicar, não é mais possível
 * cancelar as demais isoladamente por aqui (use retry por rede se alguma falhar).
 */
export async function cancelScheduledPublication(userId: string, publicationId: string) {
  const publication = await db.publication.findUnique({ where: { id: publicationId }, include: { targets: true } });
  if (!publication || publication.userId !== userId) {
    throw new PublicationValidationError('Publicação não encontrada.');
  }
  if (!isCancellable(publication.targets.map((t) => t.status))) {
    throw new PublicationValidationError('Esta publicação já começou a ser processada e não pode mais ser cancelada.');
  }

  await Promise.all(publication.targets.map((t) => removeQueuedJob(t.id)));

  await db.$transaction([
    db.publicationTarget.updateMany({ where: { publicationId }, data: { status: 'CANCELLED' } }),
    db.publication.update({ where: { id: publicationId }, data: { status: 'CANCELLED' } }),
  ]);

  await db.auditLog.create({
    data: { userId, action: 'publication.cancelled', entityType: 'Publication', entityId: publicationId, correlationId: publication.correlationId },
  });
}
