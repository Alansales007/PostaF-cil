import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { inngest } from '../client';
import { db } from '@/lib/db';
import { childLogger } from '@/lib/logger';
import { getStorageService } from '@/services/storage';
import { probeVideo, needsTranscodeForMediaFile, transcodeToH264Aac, buildTranscodedKey } from '@/services/mediaProcessor';
import { enqueuePendingTargetsForMedia, failPendingTargetsForMedia } from '@/services/publicationService';
import { decideRetry } from '../retry-policy';

const MAX_TRANSCODE_ATTEMPTS = 3;
const READ_URL_EXPIRES_SECONDS = 60 * 60;

interface TranscodeMetadata {
  transcodeAttempts?: number;
  [key: string]: unknown;
}

/**
 * Substitui workers/transcodeWorker.ts (consumer BullMQ). Mesma lógica de
 * negócio (probe → decide se precisa converter → ffmpeg → upload →
 * libera alvos pendentes), só troca o mecanismo de controle: cada
 * tentativa é um `step.run()` isolado (o ffmpeg roda do início ao fim
 * dentro de uma única invocação — não dá pra pausar no meio de um
 * transcode em andamento), e o backoff entre tentativas usa
 * `step.sleep()` em vez de `job.moveToDelayed()`.
 *
 * Idempotência: `id: mediaId` no evento (lib/inngest/events.ts) já evita
 * duas transcodificações concorrentes do mesmo vídeo. Se mesmo assim esta
 * função rodar com o MediaFile já `READY`, só libera os alvos pendentes.
 */
export const transcodeMediaFunction = inngest.createFunction(
  {
    id: 'transcode-media',
    triggers: { event: 'media/transcode.requested' },
    concurrency: { limit: 2 },
    retries: 0,
  },
  async ({ event, step }) => {
    const { mediaId } = event.data as { mediaId: string };

    for (let attempt = 1; attempt <= MAX_TRANSCODE_ATTEMPTS; attempt++) {
      const result = await step.run(`attempt-${attempt}`, () => runTranscodeAttempt(mediaId, attempt));
      if (result.outcome !== 'retry') return;
      await step.sleep(`retry-wait-${attempt}`, result.delayMs);
    }
  },
);

type AttemptResult = { outcome: 'done' } | { outcome: 'given_up' } | { outcome: 'retry'; delayMs: number };

async function runTranscodeAttempt(mediaId: string, attempt: number): Promise<AttemptResult> {
  const log = childLogger({ mediaId, attempt });

  const media = await db.mediaFile.findUnique({ where: { id: mediaId } });
  if (!media) {
    log.warn('MediaFile não existe mais — encerrando sem ação.');
    return { outcome: 'done' };
  }

  if (media.status === 'READY') {
    log.info('Mídia já está pronta (preparada por outra execução) — só liberando alvos pendentes.');
    await enqueuePendingTargetsForMedia(media.id);
    return { outcome: 'done' };
  }

  const storage = getStorageService();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'postafacil-transcode-'));
  const outputPath = path.join(tmpDir, `${randomUUID()}.mp4`);

  try {
    const sourceUrl = await storage.getReadUrl({ key: media.storagePath, expiresInSeconds: READ_URL_EXPIRES_SECONDS });

    let videoCodec = media.videoCodec;
    let audioCodec = media.audioCodec;
    if (videoCodec === null) {
      const probe = await probeVideo(sourceUrl);
      videoCodec = probe.videoCodec;
      audioCodec = probe.audioCodec;
      await db.mediaFile.update({ where: { id: media.id }, data: { videoCodec, audioCodec } });
    }

    if (!needsTranscodeForMediaFile(media.mimeType, videoCodec, audioCodec)) {
      log.info({ videoCodec, audioCodec }, 'Vídeo já é compatível — pulando conversão.');
      await db.mediaFile.update({ where: { id: media.id }, data: { status: 'READY' } });
      await enqueuePendingTargetsForMedia(media.id);
      return { outcome: 'done' };
    }

    log.info({ videoCodec, audioCodec }, 'Iniciando transcodificação para MP4/H.264/AAC');
    await transcodeToH264Aac(sourceUrl, outputPath);

    const transcodedKey = buildTranscodedKey(media.storagePath);
    await storage.uploadFile({ key: transcodedKey, sourcePath: outputPath, contentType: 'video/mp4' });

    await db.mediaFile.update({
      where: { id: media.id },
      data: { status: 'READY', transcodedStoragePath: transcodedKey, videoCodec: 'h264', audioCodec: audioCodec ?? 'aac' },
    });

    log.info('Transcodificação concluída com sucesso');
    await enqueuePendingTargetsForMedia(media.id);
    return { outcome: 'done' };
  } catch (err) {
    const currentMeta = (media.metadata as TranscodeMetadata | null) ?? {};
    const attemptCount = (currentMeta.transcodeAttempts ?? 0) + 1;
    const message = err instanceof Error ? err.message : 'Falha desconhecida ao preparar o vídeo.';

    const decision = decideRetry({ attemptCount, maxAttempts: MAX_TRANSCODE_ATTEMPTS, errorCode: null });

    await db.mediaFile.update({
      where: { id: media.id },
      data: { metadata: { ...currentMeta, transcodeAttempts: attemptCount, transcodeError: message } },
    });

    if (decision.action === 'retry') {
      log.warn({ err, attemptCount }, 'Falha ao transcodificar — tentando de novo');
      return { outcome: 'retry', delayMs: decision.delayMs };
    }

    log.error({ err, attemptCount }, 'Falha definitiva ao transcodificar — desistindo');
    await failPendingTargetsForMedia(
      media.id,
      'Não foi possível preparar o vídeo para publicação (formato incompatível ou corrompido).',
    );
    return { outcome: 'given_up' };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
