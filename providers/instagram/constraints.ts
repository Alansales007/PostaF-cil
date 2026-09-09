import type { MediaValidationInput, MediaValidationResult } from '@/providers/SocialProvider';

/**
 * Requisitos técnicos para Reels no Instagram, conforme a documentação
 * oficial de Content Publishing (verificados em setembro/2026 — revalidar
 * periodicamente, a Meta ajusta esses limites com alguma frequência):
 *
 *   - Proporção recomendada 9:16 (vertical)
 *   - Duração entre 5 e 90 segundos
 *   - Container MP4 ou MOV, vídeo H.264/HEVC, áudio AAC até 48kHz
 *   - O vídeo precisa estar acessível por uma URL HTTPS pública/assinada
 *     (o container é criado a partir de `video_url`, não de upload binário)
 *
 * Aqui validamos só o que dá para checar a partir dos metadados já lidos
 * no upload (duração/resolução/mimeType/tamanho) — sem inspecionar o codec,
 * que exige o FFprobe do MediaProcessor (ETAPA 7).
 */
export const INSTAGRAM_REELS_CONSTRAINTS = {
  minDurationSeconds: 5,
  maxDurationSeconds: 90,
  recommendedAspectRatio: 9 / 16,
  aspectRatioTolerance: 0.15,
  maxFilesizeBytes: 1024 * 1024 * 1024, // 1GB — limite prático conservador
  acceptedMimeTypes: ['video/mp4', 'video/quicktime'],
};

export function validateInstagramMedia(input: MediaValidationInput): MediaValidationResult {
  const c = INSTAGRAM_REELS_CONSTRAINTS;
  const reasons: string[] = [];
  let needsConversion = false;

  if (!c.acceptedMimeTypes.includes(input.mimeType)) {
    needsConversion = true;
    reasons.push('Formato do arquivo não é MP4/MOV — será convertido antes de publicar.');
  }

  if (input.filesizeBytes > c.maxFilesizeBytes) {
    reasons.push('Arquivo excede o tamanho máximo recomendado para Reels.');
  }

  if (input.durationSeconds != null) {
    if (input.durationSeconds < c.minDurationSeconds) {
      reasons.push(`Vídeo muito curto para Reels (mínimo ${c.minDurationSeconds}s).`);
    } else if (input.durationSeconds > c.maxDurationSeconds) {
      reasons.push(`Vídeo muito longo para Reels (máximo ${c.maxDurationSeconds}s).`);
    }
  }

  if (input.width && input.height) {
    const ratio = input.width / input.height;
    const diff = Math.abs(ratio - c.recommendedAspectRatio);
    if (diff > c.aspectRatioTolerance) {
      needsConversion = true;
      reasons.push('Proporção fora do recomendado (9:16) — pode ser cortado/enquadrado pelo Instagram.');
    }
  }

  const hardFailure = reasons.some((r) => r.includes('curto') || r.includes('longo') || r.includes('excede'));

  return { compatible: !hardFailure && !needsConversion, needsConversion, reasons };
}
