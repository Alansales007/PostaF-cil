import { inngest } from '../client';
import { db } from '@/lib/db';
import { childLogger } from '@/lib/logger';
import { getSocialProvider } from '@/providers';
import { getValidAccessToken } from '@/services/tokenService';
import { getStorageService } from '@/services/storage';
import { buildProviderAccessToken } from '@/lib/social/access-token-for-provider';
import { appendHistoryEntry } from '@/lib/publication/history';
import { aggregatePublicationStatus } from '@/lib/publication/status';
import { decidePollOutcome, shouldStartNewJob } from '../poll-decision';
import { decideRetry } from '../retry-policy';

const READ_URL_EXPIRES_SECONDS = 24 * 60 * 60;
// Rede de segurança contra loop infinito por bug — a parada de verdade é
// `target.maxAttempts` (via decideRetry/decidePollOutcome), sempre bem menor.
const MAX_ITERATIONS = 500;

/**
 * Substitui workers/publishWorker.ts (consumer BullMQ). Mesma lógica de
 * negócio (idempotência via providerContainerId, classificação de erro,
 * backoff), só troca o mecanismo de controle: em vez de
 * `job.moveToDelayed()` + `throw new DelayedError()`, cada "tick" é um
 * `step.run()` que devolve o que fazer a seguir, e o próprio `step.sleep()`
 * do Inngest pausa a função sem manter nenhum processo rodando enquanto
 * espera (https://www.inngest.com/docs/guides/multi-step-functions).
 *
 * Idempotência: nunca chama SocialProvider.publishVideo() duas vezes para
 * o mesmo alvo — uma vez que existe `providerContainerId`, só faz polling.
 */
export const publishTargetFunction = inngest.createFunction(
  {
    id: 'publish-target',
    triggers: { event: 'publication/target.queued' },
    concurrency: { limit: 5 },
    // Todo retry já é decidido manualmente por decideRetry/decidePollOutcome
    // (mesmo comportamento do BullMQ, que também não usa `attempts` nativo)
    // — sem isso, o retry automático do Inngest duplicaria a lógica.
    retries: 0,
    // Cancela a run em andamento (mesmo enquanto ela ainda está dormindo em
    // step.sleepUntil, esperando o horário agendado) quando chega um evento
    // com o mesmo publicationTargetId — ver cancelPublishTarget() em
    // lib/inngest/events.ts.
    cancelOn: [{ event: 'publication/target.cancelled', match: 'data.publicationTargetId' }],
  },
  async ({ event, step }) => {
    const { publicationTargetId, scheduledAt } = event.data as {
      publicationTargetId: string;
      scheduledAt: string | null;
    };

    if (scheduledAt && new Date(scheduledAt).getTime() > Date.now()) {
      await step.sleepUntil('wait-for-schedule', scheduledAt);
    }

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = await step.run(`tick-${i}`, () => processTick(publicationTargetId));
      if (result.action === 'stop') return;
      await step.sleep(`wait-${i}`, result.delayMs);
    }
  },
);

type TickResult = { action: 'stop' } | { action: 'sleep'; delayMs: number };

async function processTick(publicationTargetId: string): Promise<TickResult> {
  const log = childLogger({ publicationTargetId });

  const target = await loadTarget(publicationTargetId);
  if (!target) {
    log.warn('PublicationTarget não existe mais — encerrando sem ação.');
    return { action: 'stop' };
  }

  // Idempotência: se por qualquer motivo esta função rodar de novo depois
  // do alvo já ter chegado a um estado terminal, não faz nada.
  if (target.status === 'PUBLISHED' || target.status === 'CANCELLED') {
    log.info({ status: target.status }, 'Alvo já está em estado terminal — nada a fazer.');
    return { action: 'stop' };
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
    return startPublishing(target, provider, packedToken, videoUrl, caption, log);
  }

  return pollPublishStatus(target, provider, packedToken, log);
}

async function startPublishing(
  target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>,
  provider: ReturnType<typeof getSocialProvider>,
  packedToken: string,
  videoUrl: string,
  caption: string,
  log: ReturnType<typeof childLogger>,
): Promise<TickResult> {
  await db.publicationTarget.update({
    where: { id: target.id },
    data: {
      status: 'PROCESSING',
      statusHistory: appendHistoryEntry(target.statusHistory, { at: new Date().toISOString(), status: 'PROCESSING', message: 'Iniciando publicação...' }),
    },
  });

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

    return { action: 'sleep', delayMs: 5_000 };
  } catch (err) {
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
      return { action: 'sleep', delayMs: decision.delayMs };
    }

    log.error({ err }, 'Falha definitiva ao iniciar publicação — máximo de tentativas atingido');
    await finalizeAsFailed(target, 'MAX_ATTEMPTS', message, attemptCount);
    return { action: 'stop' };
  }
}

async function pollPublishStatus(
  target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>,
  provider: ReturnType<typeof getSocialProvider>,
  packedToken: string,
  log: ReturnType<typeof childLogger>,
): Promise<TickResult> {
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
      await onTargetSettled(target.publicationId);
      return { action: 'stop' };
    }
    case 'still_processing': {
      return { action: 'sleep', delayMs: outcome.delayMs };
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
      return { action: 'sleep', delayMs: outcome.delayMs };
    }
    case 'failed_final': {
      log.error({ errorCode: result.errorCode }, 'Falha definitiva reportada pela plataforma');
      await finalizeAsFailed(target, result.errorCode ?? 'FAILED', result.errorMessage ?? 'Falha ao publicar.', target.attemptCount + 1);
      return { action: 'stop' };
    }
  }
}

async function finalizeAsFailed(
  target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>,
  errorCode: string,
  errorMessage: string,
  attemptCount: number,
) {
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
  await onTargetSettled(target.publicationId);
}

/** Depois que um alvo chega a um estado terminal, recalcula o status agregado da Publication. */
async function onTargetSettled(publicationId: string): Promise<void> {
  const publication = await db.publication.findUnique({ where: { id: publicationId }, include: { targets: true } });
  if (!publication) return;

  const aggregated = aggregatePublicationStatus(publication.targets.map((t) => t.status));
  await db.publication.update({ where: { id: publicationId }, data: { status: aggregated } });
}

function loadTarget(id: string) {
  return db.publicationTarget.findUnique({
    where: { id },
    include: { publication: { include: { media: true } }, socialAccount: true },
  });
}
