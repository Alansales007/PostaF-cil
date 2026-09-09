import { Queue } from 'bullmq';
import { getRedis } from '@/lib/redis';

export const TRANSCODE_QUEUE_NAME = 'transcode-media';

export interface TranscodeJobData {
  mediaId: string;
}

let queue: Queue<TranscodeJobData> | undefined;

function getQueue(): Queue<TranscodeJobData> {
  if (!queue) {
    queue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE_NAME, { connection: getRedis() });
  }
  return queue;
}

/**
 * jobId = mediaId: se duas publicações usarem o mesmo vídeo ao mesmo
 * tempo, só uma transcodificação de verdade acontece — a segunda chamada
 * com o mesmo jobId é ignorada pelo BullMQ enquanto a primeira ainda não
 * terminou (mesma âncora de idempotência usada em publish-queue.ts).
 *
 * Não carrega qual publicação disparou o job de propósito: quando termina,
 * `enqueuePendingTargetsForMedia()` busca no banco TODAS as publicações
 * que estejam esperando este mediaId (não só a que criou o job primeiro),
 * então nenhuma fica perdida se o mesmo vídeo for reaproveitado enquanto
 * a conversão ainda está em andamento.
 */
export async function enqueueTranscode(mediaId: string): Promise<void> {
  await getQueue().add(
    'transcode',
    { mediaId },
    { jobId: mediaId, removeOnComplete: { age: 24 * 60 * 60 }, removeOnFail: { age: 7 * 24 * 60 * 60 } },
  );
}
