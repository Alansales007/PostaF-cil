/**
 * Tipos compartilhados entre frontend e backend.
 * Espelham os enums do Prisma como union types simples para uso
 * seguro em componentes client (que não podem importar @prisma/client).
 */

export type SocialProviderId = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'KWAI';

export const SOCIAL_PROVIDERS: SocialProviderId[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'KWAI'];

export const PROVIDER_LABELS: Record<SocialProviderId, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  KWAI: 'Kwai',
};

/** Limite de legenda por plataforma — ver constraints de cada provider para regras completas. */
export const CAPTION_LIMITS: Record<SocialProviderId, number> = {
  INSTAGRAM: 2200,
  FACEBOOK: 63206,
  TIKTOK: 2200,
  KWAI: 1000,
};

export type SocialAccountStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ERROR' | 'PENDING';

export type MediaFileStatus = 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';

export type PublicationStatus =
  | 'DRAFT'
  | 'UPLOADING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'PARTIAL_SUCCESS'
  | 'CANCELLED';

export type PublicationTargetStatus = 'QUEUED' | 'PROCESSING' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED';

export interface SocialAccountSummary {
  id: string;
  provider: SocialProviderId;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: SocialAccountStatus;
}
