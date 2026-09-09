import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { path as ffprobePath } from 'ffprobe-static';

function requireFfmpegPath(): string {
  if (!ffmpegPath) {
    throw new Error('Binário do ffmpeg não encontrado para esta plataforma (ffmpeg-static retornou null).');
  }
  return ffmpegPath;
}

/**
 * MediaProcessor — transcodificação server-side via FFmpeg (binário
 * estático via ffmpeg-static/ffprobe-static, sem dependência do sistema
 * operacional ter FFmpeg instalado).
 *
 * Regra de ouro: o arquivo original enviado pelo usuário NUNCA é
 * sobrescrito — este serviço sempre lê de um caminho e escreve em outro.
 * Preferencial (conforme especificado): MP4, H.264, AAC, preservando a
 * melhor qualidade possível, a proporção original e a sincronia de áudio
 * (nenhum filtro de corte/escala é aplicado — só recodificação de
 * container/codec).
 */

export interface VideoProbeResult {
  videoCodec: string | null;
  audioCodec: string | null;
  formatName: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

/** Roda o ffprobe (JSON output) e extrai codec de vídeo/áudio, container e resolução. */
export function probeVideo(filePath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath];
    const proc = spawn(ffprobePath, args);

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe falhou (código ${code}): ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(parseProbeOutput(JSON.parse(stdout)));
      } catch (err) {
        reject(err);
      }
    });
  });
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}
interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string };
}

export function parseProbeOutput(data: FfprobeOutput): VideoProbeResult {
  const streams = data.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  return {
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    formatName: data.format?.format_name ?? null,
    durationSeconds: data.format?.duration ? Number(data.format.duration) : null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
  };
}

/**
 * Decide se o vídeo precisa ser recodificado. Só container/codec entram
 * nessa conta — proporção "fora do recomendado" é só um aviso ao usuário
 * (ver as constraints de cada provider), nunca um motivo para
 * cortar/redimensionar o vídeo dele sem pedir.
 */
export function needsTranscode(probe: VideoProbeResult): boolean {
  const hasCompatibleContainer = (probe.formatName ?? '').split(',').some((f) => f === 'mp4' || f === 'mov,mp4,m4a,3gp,3g2,mj2');
  const hasCompatibleVideoCodec = probe.videoCodec === 'h264';
  const hasCompatibleAudioCodec = probe.audioCodec === 'aac' || probe.audioCodec === null; // vídeo sem áudio é aceitável como está
  return !(hasCompatibleContainer && hasCompatibleVideoCodec && hasCompatibleAudioCodec);
}

/**
 * Mesma decisão de `needsTranscode()`, mas a partir dos campos já
 * persistidos no MediaFile (preenchidos uma vez, no upload) em vez de um
 * probe fresco — usado por `publicationService.createPublication()` para
 * decidir se precisa acionar o transcodeWorker antes de publicar.
 *
 * `videoCodec === null` (nunca foi possível probar o arquivo) é tratado
 * como "precisa transcodificar" — mais seguro presumir incompatibilidade
 * do que arriscar publicar algo nunca verificado.
 */
export function needsTranscodeForMediaFile(mimeType: string, videoCodec: string | null, audioCodec: string | null): boolean {
  if (videoCodec === null) return true;
  const isMp4Container = mimeType === 'video/mp4';
  const hasCompatibleVideoCodec = videoCodec === 'h264';
  const hasCompatibleAudioCodec = audioCodec === 'aac' || audioCodec === null;
  return !(isMp4Container && hasCompatibleVideoCodec && hasCompatibleAudioCodec);
}

/** Onde a versão transcodificada fica guardada — nunca sobrescreve o `storagePath` original. */
export function buildTranscodedKey(originalStoragePath: string): string {
  const dir = originalStoragePath.slice(0, originalStoragePath.lastIndexOf('/') + 1);
  return `${dir}transcoded.mp4`;
}

/**
 * Argumentos do ffmpeg extraídos numa função pura para poderem ser
 * testados sem precisar rodar o binário de verdade.
 *
 * -c:v libx264 -pix_fmt yuv420p: H.264 com subamostragem de cor universal
 *   (compatível com todo player/rede, incluindo os mais antigos).
 * -crf 18 -preset slow: qualidade alta preservada (CRF baixo = menos perda).
 * -c:a aac -b:a 192k: áudio AAC em bitrate alto, sem perder sincronia
 *   (o ffmpeg resample/ressincroniza automaticamente ao recodificar).
 * -movflags +faststart: MP4 pronto para streaming progressivo.
 * Sem "-vf scale"/"-aspect": a resolução e a proporção originais são
 * preservadas exatamente como vieram.
 */
export function buildFfmpegArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y', // sobrescreve o outputPath se já existir (nunca o input)
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function transcodeToH264Aac(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(requireFfmpegPath(), buildFfmpegArgs(inputPath, outputPath));

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000); // não deixa o log crescer sem limite
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg falhou (código ${code}): ${stderr.slice(-2000)}`));
    });
  });
}
