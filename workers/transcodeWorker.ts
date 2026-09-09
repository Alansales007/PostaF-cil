import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DelayedError, Worker, type Job } from 'bullmq';
import { getRedis } from '@/lib/redis';
import { db } from '@/lib/db';
import { childLogger } from '@/lib/logger';
import { getStorageService } from '@/services/storage';
import { probeVideo, needsTranscodeForMediaFile, transcodeToH264Aac, buildTranscodedKey } from '@/services/mediaProcessor';
import { enqueuePendingTargetsForMedia, failPendingTargetsForMedia } from '@/services/publicationService';
import { decideRetry } from '@/lib/queue/retry-policy';
import { TRANSCODE_QUEUE_NAME, type TranscodeJobData } from '@/lib/queue/transcode-queue';

const MAX_TRANSCODE_ATTEMPTS = 3;
const READ_URL_EXPIRES_SECONDS = 60 * 60;

interface TranscodeMetadata {
  transcodeAttempts?: number;
  [key: string]: unknown;
}

/**
 * Consumer BullMQ que prepara um vídeo (MediaFile) para publicação quando
 * o original não está em MP4/H.264/AAC. Nunca sobrescreve o arquivo
 * original — lê da URL do storage (ffmpeg/ffprobe suportam HTTP(S)
 * nativamente, sem precisar baixar o arquivo inteiro antes) e escreve a
 * versão convertida em um caminho novo.
 *
 * Idempotência: se por qualquer motivo este job rodar de novo depois do
 * MediaFile já estar READY, só libera os alvos pendentes sem rodar o
 * FFmpeg de novo. E se o vídeo estiver sendo usado por mais de uma
 * publicação ao mesmo tempo, `enqueuePendingTargetsForMedia` libera todas
 * elas — não só a que originalmente disparou este job.
 */
async function processTranscodeJob(job: Job<TranscodeJobData>, token?: string): Promise<void> {
  const log = childLogger({ jobId: job.id, mediaId: job.data.mediaId });

  const media = await db.mediaFile.findUnique({ where: { id: job.data.mediaId } });
  if (!media) {
    log.warn('MediaFile não existe mais — encerrando job sem ação.');
    return;
  }

  if (media.status === 'READY') {
    log.info('Mídia já está pronta (preparada por outro job) — só liberando alvos pendentes.');
    await enqueuePendingTargetsForMedia(media.id);
    return;
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
      return;
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
  } catch (err) {
    if (err instanceof DelayedError) throw err;

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
      await job.moveToDelayed(Date.now() + decision.delayMs, token);
      throw new DelayedError();
    }

    log.error({ err, attemptCount }, 'Falha definitiva ao transcodificar — desistindo');
    await failPendingTargetsForMedia(
      media.id,
      'Não foi possível preparar o vídeo para publicação (formato incompatível ou corrompido).',
    );
    throw new Error(message);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

let worker: Worker<TranscodeJobData> | undefined;

export function startTranscodeWorker(): Worker<TranscodeJobData> {
  if (worker) return worker;

  worker = new Worker<TranscodeJobData>(TRANSCODE_QUEUE_NAME, processTranscodeJob, { connection: getRedis(), concurrency: 2 });

  worker.on('failed', (job, err) => {
    childLogger({ jobId: job?.id }).error({ err }, 'Job de transcodificação falhou definitivamente');
  });

  return worker;
}
