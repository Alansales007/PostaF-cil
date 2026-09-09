import type {
  AccountInfo,
  ConnectedAccount,
  MediaValidationInput,
  MediaValidationResult,
  OAuthCallbackInput,
  OAuthConnectResult,
  PublishStatusResult,
  PublishVideoInput,
  PublishVideoResult,
  SocialProvider,
  TokenValidationResult,
} from '@/providers/SocialProvider';
import { getEnv } from '@/lib/env';
import { KwaiNotAvailableError } from './errors';

/**
 * KwaiProvider — pesquisa feita em setembro/2026, antes de escrever
 * qualquer chamada de rede, como nas demais integrações:
 *
 *   - developers.kwai.com hoje serve um painel interno ("MAPI 管理平台" —
 *     Plataforma de Gestão MAPI), não um developer portal de self-service.
 *   - O único produto com OAuth e escopos publicamente documentados é o
 *     **Kwai for Business / Magnetic Engine** (kwai-marketing-api) — uma
 *     API de **anúncios/marketing** (gestão de campanhas), não de
 *     publicação de conteúdo orgânico em nome de um usuário.
 *   - Não encontrei nenhum escopo equivalente a "user_video_publish"
 *     publicamente documentado, nem um endpoint de upload/publicação de
 *     vídeo self-service.
 *
 * Conclusão: não existe hoje uma "Kwai Open Platform" pública de
 * publicação de vídeo equivalente à Instagram Graph API, TikTok Content
 * Posting API ou Facebook Video API. Nenhuma chamada de rede é
 * implementada aqui — inventar endpoints violaria a regra fundamental do
 * projeto de nunca supor parâmetros/rotas sem confirmação oficial.
 *
 * O provider fica com o contrato pronto (útil se a Kwai abrir acesso
 * self-service no futuro, ou se você conseguir credenciais via parceria
 * comercial direta) e a UI mostra "Integração aguardando autorização da
 * plataforma" enquanto `KWAI_API_AVAILABLE` não estiver true.
 */
export class KwaiProvider implements SocialProvider {
  readonly id = 'KWAI' as const;
  readonly isAvailable: boolean;

  constructor() {
    this.isAvailable = getEnv().KWAI_API_AVAILABLE;
  }

  async connect(_userId: string, _redirectUri: string): Promise<OAuthConnectResult> {
    throw new KwaiNotAvailableError();
  }

  async handleCallback(_input: OAuthCallbackInput): Promise<ConnectedAccount> {
    throw new KwaiNotAvailableError();
  }

  async disconnect(_accessToken: string): Promise<void> {
    throw new KwaiNotAvailableError();
  }

  async refreshToken(_refreshToken: string): Promise<ConnectedAccount> {
    throw new KwaiNotAvailableError();
  }

  async validateToken(_accessToken: string): Promise<TokenValidationResult> {
    return { valid: false, reason: 'Integração aguardando autorização da plataforma.' };
  }

  async getAccountInfo(_accessToken: string): Promise<AccountInfo> {
    throw new KwaiNotAvailableError();
  }

  /** Validação técnica genérica — não depende de a API estar liberada, então pode rodar mesmo assim. */
  async validateMedia(input: MediaValidationInput): Promise<MediaValidationResult> {
    const reasons: string[] = ['Integração aguardando autorização da plataforma — validação abaixo é só uma estimativa genérica.'];
    if (!input.mimeType.startsWith('video/')) reasons.push('Arquivo não é um vídeo.');
    return { compatible: false, needsConversion: false, reasons };
  }

  async publishVideo(_input: PublishVideoInput): Promise<PublishVideoResult> {
    throw new KwaiNotAvailableError();
  }

  async getPublishStatus(_accessToken: string, _providerJobId: string): Promise<PublishStatusResult> {
    throw new KwaiNotAvailableError();
  }

  async deleteTemporaryResources(): Promise<void> {
    // nada a limpar — nenhuma chamada real é feita
  }
}
