import { describe, expect, it } from 'vitest';
import {
  parseProbeOutput,
  needsTranscode,
  needsTranscodeForMediaFile,
  buildFfmpegArgs,
  buildTranscodedKey,
} from '@/services/mediaProcessor';

describe('services/mediaProcessor — parseProbeOutput', () => {
  it('extrai codec de vídeo/áudio, container, duração e resolução', () => {
    const result = parseProbeOutput({
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.5' },
    });

    expect(result).toEqual({
      videoCodec: 'h264',
      audioCodec: 'aac',
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 12.5,
      width: 1080,
      height: 1920,
    });
  });

  it('lida com vídeo sem faixa de áudio', () => {
    const result = parseProbeOutput({ streams: [{ codec_type: 'video', codec_name: 'h264' }], format: {} });
    expect(result.audioCodec).toBeNull();
  });

  it('lida com saída vazia sem quebrar', () => {
    const result = parseProbeOutput({});
    expect(result).toEqual({ videoCodec: null, audioCodec: null, formatName: null, durationSeconds: null, width: null, height: null });
  });
});

describe('services/mediaProcessor — needsTranscode (a partir de um probe)', () => {
  it('não precisa transcodificar um MP4 H.264/AAC', () => {
    const probe = { videoCodec: 'h264', audioCodec: 'aac', formatName: 'mov,mp4,m4a,3gp,3g2,mj2', durationSeconds: 10, width: 1080, height: 1920 };
    expect(needsTranscode(probe)).toBe(false);
  });

  it('precisa transcodificar HEVC (comum em vídeos do iPhone)', () => {
    const probe = { videoCodec: 'hevc', audioCodec: 'aac', formatName: 'mov,mp4,m4a,3gp,3g2,mj2', durationSeconds: 10, width: 1080, height: 1920 };
    expect(needsTranscode(probe)).toBe(true);
  });

  it('precisa transcodificar um container WebM mesmo com VP9/Opus', () => {
    const probe = { videoCodec: 'vp9', audioCodec: 'opus', formatName: 'matroska,webm', durationSeconds: 10, width: 1080, height: 1920 };
    expect(needsTranscode(probe)).toBe(true);
  });

  it('aceita vídeo mudo (sem faixa de áudio) em H.264', () => {
    const probe = { videoCodec: 'h264', audioCodec: null, formatName: 'mov,mp4,m4a,3gp,3g2,mj2', durationSeconds: 10, width: 1080, height: 1920 };
    expect(needsTranscode(probe)).toBe(false);
  });
});

describe('services/mediaProcessor — needsTranscodeForMediaFile (campos salvos no banco)', () => {
  it('não precisa transcodificar quando mimeType é mp4 e os codecs já são h264/aac', () => {
    expect(needsTranscodeForMediaFile('video/mp4', 'h264', 'aac')).toBe(false);
  });

  it('precisa transcodificar um .mov (mesmo que seja h264/aac) — normaliza o container', () => {
    expect(needsTranscodeForMediaFile('video/quicktime', 'h264', 'aac')).toBe(true);
  });

  it('precisa transcodificar quando o codec de vídeo não é h264', () => {
    expect(needsTranscodeForMediaFile('video/mp4', 'hevc', 'aac')).toBe(true);
  });

  it('trata codec desconhecido (nunca probado) como "precisa transcodificar", por segurança', () => {
    expect(needsTranscodeForMediaFile('video/mp4', null, null)).toBe(true);
  });
});

describe('services/mediaProcessor — buildFfmpegArgs', () => {
  it('monta os argumentos com os codecs e flags esperados, sem alterar proporção/escala', () => {
    const args = buildFfmpegArgs('/tmp/in.mov', '/tmp/out.mp4');

    expect(args).toContain('/tmp/in.mov');
    expect(args).toContain('/tmp/out.mp4');
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart']));
    expect(args).not.toContain('-vf');
    expect(args).not.toContain('-aspect');
  });

  it('input vem antes do output no array de argumentos', () => {
    const args = buildFfmpegArgs('/tmp/in.mov', '/tmp/out.mp4');
    expect(args.indexOf('/tmp/in.mov')).toBeLessThan(args.indexOf('/tmp/out.mp4'));
  });
});

describe('services/mediaProcessor — buildTranscodedKey', () => {
  it('gera um caminho irmão do original, nunca sobrescrevendo-o', () => {
    const key = buildTranscodedKey('users/u1/media/m1/original.mov');
    expect(key).toBe('users/u1/media/m1/transcoded.mp4');
    expect(key).not.toBe('users/u1/media/m1/original.mov');
  });
});
