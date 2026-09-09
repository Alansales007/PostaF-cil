import { describe, expect, it } from 'vitest';
import { validateInstagramMedia } from '@/providers/instagram/constraints';

describe('providers/instagram/constraints', () => {
  it('aprova um Reel vertical dentro dos limites', () => {
    const result = validateInstagramMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 20 * 1024 * 1024,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('rejeita vídeo mais curto que o mínimo de 5s', () => {
    const result = validateInstagramMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 1024,
      durationSeconds: 2,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.some((r) => r.includes('curto'))).toBe(true);
  });

  it('rejeita vídeo mais longo que o máximo de 90s', () => {
    const result = validateInstagramMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 1024,
      durationSeconds: 120,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(false);
    expect(result.reasons.some((r) => r.includes('longo'))).toBe(true);
  });

  it('sinaliza necessidade de conversão para formato fora de MP4/MOV', () => {
    const result = validateInstagramMedia({
      mimeType: 'video/webm',
      filesizeBytes: 1024,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    });
    expect(result.needsConversion).toBe(true);
  });

  it('sinaliza necessidade de conversão para proporção muito diferente de 9:16', () => {
    const result = validateInstagramMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 1024,
      durationSeconds: 30,
      width: 1920,
      height: 1080, // 16:9, horizontal
    });
    expect(result.needsConversion).toBe(true);
  });
});
