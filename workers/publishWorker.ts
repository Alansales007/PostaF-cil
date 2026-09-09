import { DelayedError, Worker, type Job } from 'bullmq';
import { getRedis } from '@/lib/redis';
import { db } from '@/lib/db';
import { childLogger } from '@/lib/logger';
import { getSocialProvider } from '@/providers';
import { getValidAccessToken } from '@/services/tokenService';
import { getStorageService } from '@/services/storage';
import { buildProviderAccessToken } from '@/lib/social/access-token-for-provider';
import { appendHistoryEntry } from '@/lib/publication/history';
import { publishEvent } from '@/lib/realtime/publish-events';
import { aggregatePublicationStatus } from '@/lib/publication/status';
import { decidePollOutcome, shouldStartNewJob } from '@/lib/queue/poll-decision';
import { decideRetry } from '@/lib/queue/retry-policy';
import { PUBLISH_QUEUE_NAME, type PublishJobData } from '@/lib/queue/publish-queue';
import type { PublicationTargetStatus, SocialProviderId } from '@/types';

const READ_URL_EXPIRES_SECONDS = 24 * 60 * 60;

/**
 * Consumer BullMQ que processa um PublicationTarget por vez.
 *
 * Idempotência: nunca chama SocialProvider.publishVideo() duas vezes para
 * o mesmo alvo — uma vez que existe `providerContainerId`, só faz polling
 * (getPublishStatus). Enquanto o alvo ainda está em andamento, o job se
 * reagenda nele mesmo via `job.moveToDelayed()` (padrão oficial do BullMQ
 * para jobs de longa duração/polling — https://docs.bullmq.io/patterns/process-step-jobs),
 * em vez de enfileirar um job novo — por isso um mesmo alvo nunca é
 * processado por duas execuções concorrentes.
 */
async function processPublishJob(job: Job<PublishJobData>, token?: string): Promise<void> {
  const log = childLogger({ jobId: job.id, publicationTargetId: job.data.publicationTargetId });

  const target = await db.publicationTarget.findUnique({
    where: { id: job.data.publicationTargetId },
    include: { publication: { include: { media: true } }, socialAccount: true },
  });

  if (!target) {
    log.warn('PublicationTarget não existe mais — encerrando job sem ação.');
    return;
  }

  // Idempotência: se por qualquer motivo o job rodar de novo depois do
  // alvo já ter chegado a um estado terminal, não faz nada.
  if (target.status === 'PUBLISHED' || target.status === 'CANCELLED') {
    log.info({ status: target.status }, 'Alvo já está em estado terminal — nada a fazer.');
    return;
  }

  const provider = getSocialProvider(target.provider);
  const storage = getStorageService();

  const { accessToken } = await getValidAccessToken(target.socialAccount);
  const packedToken = buildProviderAccessToken(target.provider, target.socialAccount.providerAccountId, accessToken);
  // Prefere a versão transcodificada (MP4/H.264/AAC) quando o MediaProcessor
  // precisou gerar uma — o arquivo original em storagePath nunca é usado
  // para publicar se não for compatível, e nunca é alterado.
  const storageKey = target.publication.media.transcodedStoragePath ?? target.publication.media.storagePath;
  const videoUrl = await storage.getReadUrl({ key: storageKey, expiresInSeconds: READ_URL_EXPIRES_SECONDS });
  const caption = target.customCaption ?? target.publication.generalCaption ?? '';

  if (shouldStartNewJob(target)) {
    await startPublishing(job, token, target, provider, packedToken, videoUrl, caption, log);
    return;
  }

  await pollPublishStatus(job, token, target, provider, packedToken, log);
}

async function startPublishing(
  job: Job<PublishJobData>,
  token: string | undefined,
  target: Awaited<ReturnType<typeof loadTarget>>,
  provider: ReturnType<typeof getSocialProvider>,
  packedToken: string,
  videoUrl: string,
  caption: string,
  log: ReturnType<typeof childLogger>,
) {
  await updateTargetStatus(target.id, 'PROCESSING', { message: 'Iniciando publicação...' });

  try {
    const result = await provider.publishVideo({
      accessToken: packedToken,
      videoUrl,
      caption,
      title: target.publication.title ?? undefined,
      correlationId: target.publication.correlationId,
    });

    await db.publicationTarget.update({
      where: { id: target.id },
      data: {
        providerContainerId: result.providerJobId,
        attemptCount: target.attemptCount + 1,
        lastAttemptAt: new Date(),
        statusHistory: appendHistoryEntry(target.statusHistory, {
          at: new Date().toISOString(),
          status: 'PROCESSING',
          message: 'Publicação iniciada na plataforma — aguardando processamento.',
        }),
      },
    });

    await job.moveToDelayed(Date.now() + 5_000, token);
    throw new DelayedError();
  } catch (err) {
    if (err instanceof DelayedError) throw err;

    const attemptCount = target.attemptCount + 1;
    const message = err instanceof Error ? err.message : 'Falha desconhecida ao iniciar a publicação.';
    // Erros ao INICIAR a publicação (antes de existir um container/job na
    // plataforma) são tratados como retryable por padrão — a classificação
    // fina de erro permanente vs. temporário usa o errorCode estruturado
    // que só existe na fase de polling (getPublishStatus).
    const decision = decideRetry({ attemptCount, maxAttempts: target.maxAttempts, errorCode: null });

    if (decision.action === 'retry') {
      await db.publicationTarget.update({
        where: { id: target.id },
        data: {
          attemptCount,
          lastAttemptAt: new Date(),
          errorMessage: message,
          statusHistory: appendHistoryEntry(target.statusHistory, { at: new Date().toISOString(), status: 'PROCESSING', message }),
        },
      });
      await job.moveToDelayed(Date.now() + decision.delayMs, token);
      throw new DelayedError();
    }

    log.error({ err }, 'Falha definitiva ao iniciar publicação — máximo de tentativas atingido');
    await finalizeAsFailed(target, 'MAX_ATTEMPTS', message, attemptCount);
    throw new Error(message);
  }
}

async function pollPublishStatus(
  job: Job<PublishJobData>,
  token: string | undefined,
  target: Awaited<ReturnType<typeof loadTarget>>,
  provider: ReturnType<typeof getSocialProvider>,
  packedToken: string,
  log: ReturnType<typeof childLogger>,
) {
  const result = await provider.getPublishStatus(packedToken, target.providerContainerId!);
  const outcome = decidePollOutcome({
    providerStatus: result.status,
    errorCode: result.errorCode,
    retryAfterSeconds: result.retryAfterSeconds,
    attemptCount: target.attemptCount,
    maxAttempts: target.maxAttempts,
  });

  switch (outcome.kind) {
    case 'published': {
      await db.publicationTarget.update({
        where: { id: target.id },
        data: {
          status: 'PUBLISHED',
          providerPostId: result.providerPostId,
          providerUrl: result.providerUrl,
          publishedAt: new Date(),
          statusHistory: appendHistoryEntry(target.statusHistory, {
            at: new Date().toISOString(),
            status: 'PUBLISHED',
            message: 'Publicado com sucesso.',
          }),
        },
      });
      await onTargetSettled(target.publicationId, target.provider, 'PUBLISHED', result.providerUrl);
      return;
    }
    case 'still_processing': {
      await job.moveToDelayed(Date.now() + outcome.delayMs, token);
      throw new DelayedError();
    }
    case 'failed_retry': {
      const attemptCount = target.attemptCount + 1;
      await db.publicationTarget.update({
        where: { id: target.id },
        data: {
          attemptCount,
          lastAttemptAt: new Date(),
          providerContainerId: null, // container morreu — a próxima tentativa cria um novo, não reusa
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          statusHistory: appendHistoryEntry(target.statusHistory, {
            at: new Date().toISOString(),
            status: 'PROCESSING',
            message: result.errorMessage ?? 'Tentando novamente após erro temporário.',
          }),
        },
      });
      await job.moveToDelayed(Date.now() + outcome.delayMs, token);
      throw new DelayedError();
    }
    case 'failed_final': {
      log.error({ errorCode: result.errorCode }, 'Falha definitiva reportada pela plataforma');
      await finalizeAsFailed(target, result.errorCode ?? 'FAILED', result.errorMessage ?? 'Falha ao publicar.', target.attemptCount + 1);
      throw new Error(result.errorMessage ?? 'Falha ao publicar.');
    }
  }
}

async function finalizeAsFailed(target: Awaited<ReturnType<typeof loadTarget>>, errorCode: string, errorMessage: string, attemptCount: number) {
  await db.publicationTarget.update({
    where: { id: target.id },
    data: {
      status: 'FAILED',
      attemptCount,
      lastAttemptAt: new Date(),
      errorCode,
      errorMessage,
      statusHistory: appendHistoryEntry(target.statusHistory, { at: new Date().toISOString(), status: 'FAILED', message: errorMessage }),
    },
  });
  await onTargetSettled(target.publicationId, target.provider, 'FAILED', null, errorMessage);
}

async function updateTargetStatus(targetId: string, status: PublicationTargetStatus, extra: { message: string }) {
  const target = await db.publicationTarget.findUnique({ where: { id: targetId }, include: { publication: true } });
  if (!target) return;
  await db.publicationTarget.update({
    where: { id: targetId },
    data: {
      status,
      statusHistory: appendHistoryEntry(target.statusHistory, { at: new Date().toISOString(), status, message: extra.message }),
    },
  });
  await publishEvent({ userId: target.publication.userId, publicationId: target.publicationId, provider: target.provider, status });
}

/** Depois que um alvo chega a um estado terminal, recalcula o status agregado da Publication e avisa o SSE. */
async function onTargetSettled(
  publicationId: string,
  provider: SocialProviderId,
  status: 'PUBLISHED' | 'FAILED',
  providerUrl?: string | null,
  errorMessage?: string | null,
) {
  const publication = await db.publication.findUnique({ where: { id: publicationId }, include: { targets: true } });
  if (!publication) return;

  const aggregated = aggregatePublicationStatus(publication.targets.map((t) => t.status));
  await db.publication.update({ where: { id: publicationId }, data: { status: aggregated } });

  await publishEvent({ userId: publication.userId, publicationId, provider, status, providerUrl, errorMessage });
}

async function loadTarget(id: string) {
  return db.publicationTarget.findUniqueOrThrow({
    where: { id },
    include: { publication: { include: { media: true } }, socialAccount: true },
  });
}

let worker: Worker<PublishJobData> | undefined;

/** Chamado por workers/index.ts para subir o consumer. */
export function startPublishWorker(): Worker<PublishJobData> {
  if (worker) return worker;

  worker = new Worker<PublishJobData>(PUBLISH_QUEUE_NAME, processPublishJob, { connection: getRedis(), concurrency: 5 });

  worker.on('failed', (job, err) => {
    childLogger({ jobId: job?.id }).error({ err }, 'Job de publicação falhou definitivamente');
  });

  return worker;
}
