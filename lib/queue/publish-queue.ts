import { Queue } from 'bullmq';
import { getRedis } from '@/lib/redis';

export const PUBLISH_QUEUE_NAME = 'publish-target';

export interface PublishJobData {
  publicationTargetId: string;
}

let queue: Queue<PublishJobData> | undefined;

function getQueue(): Queue<PublishJobData> {
  if (!queue) {
    queue = new Queue<PublishJobData>(PUBLISH_QUEUE_NAME, { connection: getRedis() });
  }
  return queue;
}

/**
 * Enfileira o processamento de um alvo de publicação.
 *
 * Por padrão, jobId = o próprio publicationTargetId: é a âncora de
 * idempotência do BullMQ para a primeira tentativa (adicionar de novo com
 * o mesmo jobId enquanto o job ainda está ativo/esperando é inofensivo —
 * o BullMQ ignora o duplicado). Enquanto um alvo está "em voo", o próprio
 * worker se reagenda com `job.moveToDelayed()` (mesmo job, sem re-enfileirar)
 * — ver workers/publishWorker.ts. Um `jobId` explícito só é necessário para
 * o retry manual do usuário, depois que o job anterior já terminou.
 */
export async function enqueuePublishTarget(publicationTargetId: string, opts?: { delayMs?: number; jobId?: string }): Promise<void> {
  await getQueue().add(
    'publish',
    { publicationTargetId },
    {
      jobId: opts?.jobId ?? publicationTargetId,
      delay: opts?.delayMs ?? 0,
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  );
}

/**
 * Remove um job ainda esperando (agendado no futuro ou na fila, mas não
 * "em voo") — usado para cancelar uma publicação agendada antes da hora.
 * Não faz nada (silenciosamente) se o job já começou ou não existe mais.
 */
export async function removeQueuedJob(jobId: string): Promise<void> {
  const job = await getQueue().getJob(jobId);
  if (!job) return;

  const state = await job.getState();
  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
  }
}
