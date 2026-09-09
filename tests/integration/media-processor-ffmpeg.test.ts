import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { probeVideo, needsTranscode, transcodeToH264Aac } from '@/services/mediaProcessor';

/**
 * Teste de integração de verdade: gera um vídeo sintético com codecs
 * propositalmente incompatíveis (mpeg4/mp3 num container AVI — nada de
 * H.264/AAC/MP4), roda o probe real, confirma que precisa transcodificar,
 * transcodifica de verdade com o MediaProcessor e confere com ffprobe que
 * a saída é H.264/AAC. Sem mocks — os binários do ffmpeg-static/ffprobe-static
 * rodam de verdade neste ambiente.
 */
describe('services/mediaProcessor — pipeline real de transcodificação', () => {
  const tmpDir = path.join(os.tmpdir(), `postafacil-mediaprocessor-test-${Date.now()}`);
  const incompatiblePath = path.join(tmpDir, 'sample.avi');
  const transcodedPath = path.join(tmpDir, 'transcoded.mp4');

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await generateSyntheticVideo(incompatiblePath);
  }, 30_000);

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('detecta corretamente que o arquivo sintético (mpeg4/mp3 em AVI) precisa de conversão', async () => {
    const probe = await probeVideo(incompatiblePath);
    expect(probe.videoCodec).toBe('mpeg4');
    expect(probe.audioCodec).toBe('mp3');
    expect(needsTranscode(probe)).toBe(true);
  }, 15_000);

  it('transcodifica de verdade para H.264/AAC preservando a resolução original', async () => {
    const before = await probeVideo(incompatiblePath);

    await transcodeToH264Aac(incompatiblePath, transcodedPath);

    const after = await probeVideo(transcodedPath);
    expect(after.videoCodec).toBe('h264');
    expect(after.audioCodec).toBe('aac');
    expect(needsTranscode(after)).toBe(false);

    // não alterou a resolução/proporção do original
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);

    // o arquivo original continua intacto (nunca é sobrescrito)
    const originalStillThere = await fs.stat(incompatiblePath);
    expect(originalStillThere.isFile()).toBe(true);
  }, 30_000);
});

function generateSyntheticVideo(outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static não retornou um caminho de binário nesta plataforma.'));
      return;
    }
    const args = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=15:duration=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:v',
      'mpeg4',
      '-c:a',
      'mp3',
      '-t',
      '1',
      outputPath,
    ];
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Falha ao gerar vídeo de teste: ${stderr.slice(-1000)}`))));
  });
}
