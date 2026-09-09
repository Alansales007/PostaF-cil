/**
 * Calcula o plano de divisão em partes (chunks) de um upload multipart,
 * usado tanto no servidor (rota /init, fonte da verdade) quanto no
 * cliente (para fatiar o File exatamente do mesmo jeito).
 *
 * S3 exige partes de no mínimo 5MB (exceto a última) e no máximo 10000
 * partes por upload — por isso, para arquivos muito grandes, aumentamos
 * o tamanho da parte em vez de simplesmente dividir por um valor fixo.
 */
export const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024; // limite mínimo do S3
const MAX_PARTS = 9500; // margem de segurança abaixo do limite de 10000 do S3

export interface PartPlan {
  partSize: number;
  totalParts: number;
}

export function computePartPlan(filesizeBytes: number): PartPlan {
  if (filesizeBytes <= 0) {
    throw new Error('filesizeBytes deve ser maior que zero');
  }

  let partSize = DEFAULT_PART_SIZE_BYTES;
  let totalParts = Math.ceil(filesizeBytes / partSize);

  if (totalParts > MAX_PARTS) {
    partSize = Math.max(MIN_PART_SIZE_BYTES, Math.ceil(filesizeBytes / MAX_PARTS));
    totalParts = Math.ceil(filesizeBytes / partSize);
  }

  return { partSize, totalParts };
}

/** Offsets [start, end) em bytes de uma parte específica (1-indexed, como no S3). */
export function getPartRange(partNumber: number, plan: PartPlan, filesizeBytes: number): { start: number; end: number } {
  const start = (partNumber - 1) * plan.partSize;
  const end = Math.min(start + plan.partSize, filesizeBytes);
  return { start, end };
}
