import type { SocialProviderId } from '@/types';
import { packAccessToken as packInstagramToken } from '@/providers/instagram/InstagramProvider';
import { packAccessToken as packFacebookToken } from '@/providers/facebook/FacebookProvider';

/**
 * Instagram e Facebook precisam do ID da conta (ig-user-id / page-id) além
 * do token para publicar — empacotados como "id:token" (ver os respectivos
 * providers). TikTok e Kwai usam só o token. Centralizado aqui para o
 * worker não precisar conhecer essa particularidade de cada provider.
 */
export function buildProviderAccessToken(provider: SocialProviderId, providerAccountId: string, rawAccessToken: string): string {
  switch (provider) {
    case 'INSTAGRAM':
      return packInstagramToken(providerAccountId, rawAccessToken);
    case 'FACEBOOK':
      return packFacebookToken(providerAccountId, rawAccessToken);
    case 'TIKTOK':
    case 'KWAI':
    default:
      return rawAccessToken;
  }
}
