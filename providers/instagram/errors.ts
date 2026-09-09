import { InstagramApiError } from './api';

/**
 * Traduz erros da Graph API em mensagens que uma pessoa entende, em vez de
 * só "Error 400" — como pedido na tela de detalhes da publicação.
 */
export function describeInstagramError(err: unknown): { code: string; message: string; reconnectRequired: boolean } {
  if (err instanceof InstagramApiError) {
    // Código 190 = token inválido/expirado (padrão em toda a família Graph API da Meta).
    if (err.code === 190) {
      return {
        code: 'TOKEN_EXPIRED',
        message: 'O Instagram recusou a publicação porque sua autorização expirou.',
        reconnectRequired: true,
      };
    }
    if (err.code === 4 || err.code === 17 || err.code === 32) {
      return {
        code: 'RATE_LIMITED',
        message: 'O Instagram está limitando as chamadas no momento. Tentaremos novamente automaticamente.',
        reconnectRequired: false,
      };
    }
    if (err.code === 9007) {
      return {
        code: 'MEDIA_REJECTED',
        message: 'O Instagram recusou o vídeo — verifique o formato, duração e proporção.',
        reconnectRequired: false,
      };
    }
    return { code: `IG_${err.code ?? 'UNKNOWN'}`, message: err.message, reconnectRequired: false };
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Instagram.',
    reconnectRequired: false,
  };
}
