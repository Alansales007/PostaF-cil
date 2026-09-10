import { describe, expect, it } from 'vitest';
import {
  computeFileUploadChunkPlan,
  getChunkRange,
  MIN_CHUNK_SIZE_BYTES,
  MAX_CHUNK_SIZE_BYTES,
  MAX_FINAL_CHUNK_SIZE_BYTES,
} from '@/providers/tiktok/file-upload-plan';

describe('providers/tiktok/file-upload-plan', () => {
  it('envia vídeos pequenos (menores que o mínimo de 5MB) como um único chunk', () => {
    const videoSizeBytes = 2 * 1024 * 1024; // 2MB
    const plan = computeFileUploadChunkPlan(videoSizeBytes);
    expect(plan.totalChunkCount).toBe(1);
    expect(plan.chunkSizeBytes).toBe(videoSizeBytes);
  });

  it('envia vídeos até 128MB (teto do último chunk) como um único chunk', () => {
    const plan = computeFileUploadChunkPlan(MAX_FINAL_CHUNK_SIZE_BYTES);
    expect(plan.totalChunkCount).toBe(1);
    expect(plan.chunkSizeBytes).toBe(MAX_FINAL_CHUNK_SIZE_BYTES);
  });

  it('usa chunks de 64MB para vídeos maiores, com o restante absorvido pelo último chunk', () => {
    const videoSizeBytes = MAX_FINAL_CHUNK_SIZE_BYTES + 1024; // pouco acima do teto de um chunk único
    const plan = computeFileUploadChunkPlan(videoSizeBytes);
    expect(plan.chunkSizeBytes).toBe(MAX_CHUNK_SIZE_BYTES);
    expect(plan.totalChunkCount).toBe(Math.floor(videoSizeBytes / MAX_CHUNK_SIZE_BYTES));
  });

  it('cobre o vídeo inteiro sem lacunas nem sobreposição entre chunks, e o último chunk nunca passa de 128MB', () => {
    const videoSizeBytes = 300 * 1024 * 1024 + 12345; // não múltiplo exato do chunkSize
    const plan = computeFileUploadChunkPlan(videoSizeBytes);

    let covered = -1;
    for (let i = 0; i < plan.totalChunkCount; i++) {
      const { start, end } = getChunkRange(i, plan, videoSizeBytes);
      expect(start).toBe(covered + 1);
      const isLast = i === plan.totalChunkCount - 1;
      const chunkLength = end - start + 1;
      if (isLast) {
        expect(chunkLength).toBeLessThanOrEqual(MAX_FINAL_CHUNK_SIZE_BYTES);
      } else {
        expect(chunkLength).toBeGreaterThanOrEqual(MIN_CHUNK_SIZE_BYTES);
        expect(chunkLength).toBeLessThanOrEqual(MAX_CHUNK_SIZE_BYTES);
      }
      covered = end;
    }
    expect(covered).toBe(videoSizeBytes - 1);
  });

  it('rejeita tamanho de vídeo inválido', () => {
    expect(() => computeFileUploadChunkPlan(0)).toThrow();
    expect(() => computeFileUploadChunkPlan(-1)).toThrow();
  });
});
