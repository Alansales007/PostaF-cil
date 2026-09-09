import IORedis, { type Redis } from 'ioredis';
import { getEnv } from '@/lib/env';

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

/**
 * Conexão Redis compartilhada — usada tanto pela fila BullMQ quanto pelo
 * pub/sub de eventos em tempo real (lib/realtime/publish-events.ts).
 * BullMQ exige maxRetriesPerRequest: null nesta conexão.
 */
export function getRedis(): Redis {
  if (global.__redis) return global.__redis;

  const redis = new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    global.__redis = redis;
  }

  return redis;
}
