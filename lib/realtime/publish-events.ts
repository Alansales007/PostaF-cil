import IORedis from 'ioredis';
import { getEnv } from '@/lib/env';
import { getRedis } from '@/lib/redis';
import type { PublicationTargetStatus, SocialProviderId } from '@/types';

const CHANNEL = 'postafacil:publication-events';

export interface PublicationEvent {
  userId: string;
  publicationId: string;
  provider: SocialProviderId;
  status: PublicationTargetStatus;
  providerUrl?: string | null;
  errorMessage?: string | null;
}

/** Publica uma atualização de status — o worker chama isso a cada mudança de PublicationTarget. */
export async function publishEvent(event: PublicationEvent): Promise<void> {
  await getRedis().publish(CHANNEL, JSON.stringify(event));
}

/**
 * Assina o canal de eventos. Usa uma conexão Redis própria (dedicada),
 * como o ioredis exige para clientes em modo subscriber — não dá para
 * reaproveitar a conexão de comandos normais (a mesma usada pelo BullMQ).
 */
export function subscribeToPublishEvents(onEvent: (event: PublicationEvent) => void): () => void {
  const subscriber = new IORedis(getEnv().REDIS_URL);

  subscriber.subscribe(CHANNEL).catch(() => {
    // se a inscrição falhar (ex.: Redis fora do ar), o SSE simplesmente não
    // recebe atualizações — o cliente pode recarregar a página manualmente.
  });

  subscriber.on('message', (_channel, message) => {
    try {
      onEvent(JSON.parse(message) as PublicationEvent);
    } catch {
      // mensagem malformada — ignora em vez de derrubar a conexão SSE
    }
  });

  return () => {
    subscriber.disconnect();
  };
}
