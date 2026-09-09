import type { MediaValidationInput, MediaValidationResult } from '@/providers/SocialProvider';

/**
 * Diferente de Instagram/Facebook, o TikTok não expõe um limite fixo de
 * duração por app — o valor real (`max_video_post_duration_sec`) vem da
 * consulta a Creator Info, por conta/região (ver providers/tiktok/api.ts,
 * queryCreatorInfo). Por isso aqui só validamos o que é realmente estático:
 * formato de arquivo, tamanho e proporção recomendada. A checagem de
 * duração específica acontece em tempo de publicação, não na pré-validação
 * genérica exibida antes de conectar as contas.
 */
export const TIKTOK_CONSTRAINTS = {
  recommendedAspectRatio: 9 / 16,
  aspectRatioTolerance: 0.2,
  maxFilesizeBytes: 4 * 1024 * 1024 * 1024, // 4GB
  acceptedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
};

export function validateTikTokMedia(input: MediaValidationInput): MediaValidationResult {
  const c = TIKTOK_CONSTRAINTS;
  const reasons: string[] = [];
  let needsConversion = false;

  if (!c.acceptedMimeTypes.includes(input.mimeType)) {
    needsConversion = true;
    reasons.push('Formato do arquivo não é MP4/MOV/WebM — será convertido antes de publicar.');
  }

  if (input.filesizeBytes > c.maxFilesizeBytes) {
    reasons.push('Arquivo excede o tamanho máximo (4GB).');
  }

  if (input.width && input.height) {
    const ratio = input.width / input.height;
    const diff = Math.abs(ratio - c.recommendedAspectRatio);
    if (diff > c.aspectRatioTolerance) {
      needsConversion = true;
      reasons.push('Proporção fora do recomendado (9:16) para o TikTok.');
    }
  }

  const hardFailure = reasons.some((r) => r.includes('excede'));

  return { compatible: !hardFailure && !needsConversion, needsConversion, reasons };
}
