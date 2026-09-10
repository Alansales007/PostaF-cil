/**
 * Plano de divisão em chunks para o FILE_UPLOAD do Content Posting API do
 * TikTok — alternativa ao PULL_FROM_URL usada por padrão (ver
 * TikTokProvider.publishVideo()) porque não exige domínio verificado no
 * painel do TikTok, o que não é praticável de propósito genérico (o vídeo
 * pode estar em qualquer storage S3-compatible, cujo domínio o usuário do
 * PostaFácil não necessariamente controla para provar propriedade).
 *
 * Regras confirmadas na documentação oficial (Content Posting API — Media
 * Transfer Guide, setembro/2026): cada chunk deve ter entre 5MB e 64MB,
 * exceto o último, que pode ter até 128MB; `total_chunk_count` é
 * `video_size / chunk_size` arredondado para baixo (o restante da divisão
 * é absorvido pelo último chunk, nunca vira um chunk extra); mínimo 1,
 * máximo 1000 chunks; tamanho total do vídeo até 4GB.
 */
export const MIN_CHUNK_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_CHUNK_SIZE_BYTES = 64 * 1024 * 1024; // 64MB
export const MAX_FINAL_CHUNK_SIZE_BYTES = 128 * 1024 * 1024; // 128MB

export interface FileUploadChunkPlan {
  chunkSizeBytes: number;
  totalChunkCount: number;
}

export function computeFileUploadChunkPlan(videoSizeBytes: number): FileUploadChunkPlan {
  if (videoSizeBytes <= 0) {
    throw new Error('videoSizeBytes deve ser maior que zero');
  }

  // Cabe inteiro num único chunk (que nesse caso é sempre o "chunk final",
  // com teto de 128MB em vez de 64MB) — cobre também vídeos menores que os
  // 5MB mínimos normais, que não podem ser divididos de qualquer forma.
  if (videoSizeBytes <= MAX_FINAL_CHUNK_SIZE_BYTES) {
    return { chunkSizeBytes: videoSizeBytes, totalChunkCount: 1 };
  }

  const chunkSizeBytes = MAX_CHUNK_SIZE_BYTES;
  const totalChunkCount = Math.floor(videoSizeBytes / chunkSizeBytes);
  return { chunkSizeBytes, totalChunkCount };
}

/** Offsets [start, end] em bytes (inclusivos, como o Content-Range do TikTok) de um chunk específico (0-indexed). */
export function getChunkRange(chunkIndex: number, plan: FileUploadChunkPlan, videoSizeBytes: number): { start: number; end: number } {
  const start = chunkIndex * plan.chunkSizeBytes;
  const isLast = chunkIndex === plan.totalChunkCount - 1;
  const end = isLast ? videoSizeBytes - 1 : start + plan.chunkSizeBytes - 1;
  return { start, end };
}
