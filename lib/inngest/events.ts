import { inngest } from './client';

/**
 * Substitui lib/queue/publish-queue.ts + lib/queue/transcode-queue.ts
 * (BullMQ). Cada `inngest.send()` dispara imediatamente a função
 * correspondente (lib/inngest/functions/*) — não existe fila própria para
 * administrar: o agendamento ("publicar às X horas") acontece *dentro* da
 * função, via `step.sleepUntil`, não aqui.
 */

/**
 * Enfileira o processamento de um alvo de publicação.
 *
 * `dedupeId` é a âncora de idempotência do Inngest (equivalente ao jobId do
 * BullMQ): por padrão é o próprio publicationTargetId — reenviar o mesmo
 * evento com o mesmo id dentro de 24h é ignorado como duplicata. Um
 * `dedupeId` explícito só é necessário para o retry manual do usuário,
 * depois que a run anterior já terminou (ver retryPublicationTarget).
 */
export async function enqueuePublishTarget(
  publicationTargetId: string,
  opts?: { scheduledAt?: Date | null; dedupeId?: string },
): Promise<void> {
  await inngest.send({
    name: 'publication/target.queued',
    data: { publicationTargetId, scheduledAt: opts?.scheduledAt ? opts.scheduledAt.toISOString() : null },
    id: opts?.dedupeId ?? publicationTargetId,
  });
}

/**
 * Cancela uma publicação agendada antes que ela comece a ser processada —
 * substitui o `job.remove()` do BullMQ. A função `publish-target` está
 * configurada com `cancelOn` ouvindo este evento (ver
 * lib/inngest/functions/publish-target.ts); funciona tanto enquanto ela
 * ainda está dormindo até o horário agendado quanto durante o polling.
 */
export async function cancelPublishTarget(publicationTargetId: string): Promise<void> {
  await inngest.send({ name: 'publication/target.cancelled', data: { publicationTargetId } });
}

/**
 * `id: mediaId`: se duas publicações usarem o mesmo vídeo ao mesmo tempo,
 * só uma transcodificação de verdade acontece dentro da janela de dedupe
 * de 24h do Inngest — mesma âncora de idempotência usada no BullMQ.
 *
 * Não carrega qual publicação disparou o evento de propósito: quando
 * termina, `enqueuePendingTargetsForMedia()` busca no banco TODAS as
 * publicações que estejam esperando este mediaId, não só a que criou o
 * evento primeiro.
 */
export async function enqueueTranscode(mediaId: string): Promise<void> {
  await inngest.send({ name: 'media/transcode.requested', data: { mediaId }, id: mediaId });
}
