import { describe, expect, it } from 'vitest';
import { validateTikTokMedia } from '@/providers/tiktok/constraints';

describe('providers/tiktok/constraints', () => {
  it('aprova um vídeo vertical dentro dos limites estáticos', () => {
    const result = validateTikTokMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 20 * 1024 * 1024,
      durationSeconds: 45,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(true);
  });

  it('não impõe limite fixo de duração (validado dinamicamente via Creator Info)', () => {
    const result = validateTikTokMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 1024,
      durationSeconds: 600, // 10 minutos — não deve ser rejeitado estaticamente
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(true);
  });

  it('rejeita arquivo maior que 4GB', () => {
    const result = validateTikTokMedia({
      mimeType: 'video/mp4',
      filesizeBytes: 5 * 1024 * 1024 * 1024,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    });
    expect(result.compatible).toBe(false);
  });

  it('sinaliza conversão para formato não suportado', () => {
    const result = validateTikTokMedia({
      mimeType: 'video/x-msvideo',
      filesizeBytes: 1024,
      durationSeconds: 30,
      width: 1080,
      height: 1920,
    });
    expect(result.needsConversion).toBe(true);
  });
});
