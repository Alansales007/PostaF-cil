import { logger } from '@/lib/logger';
import { getEnv } from '@/lib/env';
import { startPublishWorker } from '@/workers/publishWorker';

/**
 * Bootstrap do processo worker (BullMQ). Roda separado do app Next.js
 * (`npm run worker`), pois polling de status das APIs sociais (e, mais à
 * frente, transcodificação FFmpeg) não podem viver dentro do ciclo de
 * vida de uma requisição HTTP/serverless.
 *
 * transcodeWorker e cleanupWorker continuam como placeholders — a
 * transcodificação de vídeo (MediaProcessor/FFmpeg) e o expurgo automático
 * de mídia temporária ficam para uma próxima iteração; por ora o pipeline
 * de publicação usa o vídeo original enviado pelo usuário.
 */
async function main() {
  const env = getEnv();
  logger.info({ mockMode: env.MOCK_SOCIAL_APIS }, 'PostaFácil worker iniciando...');

  const publishWorker = startPublishWorker();
  logger.info('Consumer de publicação (publish-target) no ar.');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Encerrando worker...');
    await publishWorker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Falha ao iniciar worker');
  process.exit(1);
});
