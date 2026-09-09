import { logger } from '@/lib/logger';
import { getEnv } from '@/lib/env';
import { startPublishWorker } from '@/workers/publishWorker';
import { startTranscodeWorker } from '@/workers/transcodeWorker';

/**
 * Bootstrap do processo worker (BullMQ). Roda separado do app Next.js
 * (`npm run worker`), pois polling de status das APIs sociais e
 * transcodificação FFmpeg não podem viver dentro do ciclo de vida de uma
 * requisição HTTP/serverless.
 *
 * cleanupWorker continua como placeholder — o expurgo automático de mídia
 * temporária fica para uma próxima iteração.
 */
async function main() {
  const env = getEnv();
  logger.info({ mockMode: env.MOCK_SOCIAL_APIS }, 'PostaFácil worker iniciando...');

  const publishWorker = startPublishWorker();
  const transcodeWorker = startTranscodeWorker();
  logger.info('Consumers de publicação (publish-target) e transcodificação (transcode-media) no ar.');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Encerrando worker...');
    await Promise.all([publishWorker.close(), transcodeWorker.close()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Falha ao iniciar worker');
  process.exit(1);
});
