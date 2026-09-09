import { describe, expect, it } from 'vitest';
import { validateFacebookMedia } from '@/providers/facebook/constraints';

describe('providers/facebook/constraints', () => {
  it('aprova um Reel vertical dentro dos limites', () => {
    const result = validateFacebookMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 20 * 1024 * 1024,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(true);
  });

  it('rejeita vídeo mais longo que 90s', () => {
    const result = validateFacebookMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 1024,
      durationSeconds: 200,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(false);
  });

  it('sinaliza conversão para arquivo maior que o limite de 4GB', () => {
    const result = validateFacebookMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 5 * 1024 * 1024 * 1024,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(false);
  });
});
