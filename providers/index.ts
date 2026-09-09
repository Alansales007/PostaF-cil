import type { SocialProviderId } from '@/types';
import type { SocialProvider } from '@/providers/SocialProvider';
import { MockProvider } from '@/providers/mock/MockProvider';
import { InstagramProvider } from '@/providers/instagram/InstagramProvider';
import { FacebookProvider } from '@/providers/facebook/FacebookProvider';
import { TikTokProvider } from '@/providers/tiktok/TikTokProvider';
import { KwaiProvider } from '@/providers/kwai/KwaiProvider';
import { getEnv } from '@/lib/env';

/**
 * Fábrica central de providers. Cada rota/serviço deve obter o provider
 * por aqui em vez de instanciar a classe diretamente — assim o modo mock
 * fica centralizado e o restante do sistema (fila, publicationService,
 * UI de status) funciona de forma idêntica com dados reais ou simulados.
 */
export function getSocialProvider(id: SocialProviderId): SocialProvider {
  const { MOCK_SOCIAL_APIS } = getEnv();

  if (MOCK_SOCIAL_APIS) {
    return new MockProvider(id);
  }

  switch (id) {
    case 'INSTAGRAM':
      return new InstagramProvider();
    case 'FACEBOOK':
      return new FacebookProvider();
    case 'TIKTOK':
      return new TikTokProvider();
    case 'KWAI':
      // Sempre instanciável — isAvailable reflete KWAI_API_AVAILABLE (ver
      // providers/kwai/KwaiProvider.ts para o porquê de não haver uma API
      // pública de publicação de vídeo da Kwai hoje).
      return new KwaiProvider();
    default:
      throw new Error(
        `Provider real "${id}" ainda não implementado. Defina MOCK_SOCIAL_APIS=true para desenvolvimento.`,
      );
  }
}
