import type { MediaValidationInput, MediaValidationResult } from '@/providers/SocialProvider';

/**
 * Requisitos técnicos para Reels em Páginas do Facebook. Valores
 * conservadores alinhados aos de Instagram Reels (9:16, 5-90s, até 4GB) —
 * a Meta vem tratando a maioria dos vídeos de Página como "Reels" sem um
 * teto de duração fixo desde meados de 2025, mas mantemos esses limites
 * como padrão seguro até confirmar o comportamento atual da conta/app em
 * produção. Revalidar periodicamente.
 */
export const FACEBOOK_REELS_CONSTRAINTS = {
  minDurationSeconds: 5,
  maxDurationSeconds: 90,
  recommendedAspectRatio: 9 / 16,
  aspectRatioTolerance: 0.15,
  maxFilesizeBytes: 4 * 1024 * 1024 * 1024, // 4GB
  acceptedMimeTypes: ['video/mp4', 'video/quicktime'],
};

export function validateFacebookMedia(input: MediaValidationInput): MediaValidationResult {
  const c = FACEBOOK_REELS_CONSTRAINTS;
  const reasons: string[] = [];
  let needsConversion = false;

  if (!c.acceptedMimeTypes.includes(input.mimeType)) {
    needsConversion = true;
    reasons.push('Formato do arquivo não é MP4/MOV — será convertido antes de publicar.');
  }

  if (input.filesizeBytes > c.maxFilesizeBytes) {
    reasons.push('Arquivo excede o tamanho máximo (4GB).');
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
      reasons.push('Proporção fora do recomendado (9:16) para o formato Reels.');
    }
  }

  const hardFailure = reasons.some((r) => r.includes('curto') || r.includes('longo') || r.includes('excede'));

  return { compatible: !hardFailure && !needsConversion, needsConversion, reasons };
}
