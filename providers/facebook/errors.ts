import { FacebookApiError } from './api';

/** Mesma família de códigos de erro da Graph API usada pelo Instagram — ver providers/instagram/errors.ts. */
export function describeFacebookError(err: unknown): { code: string; message: string; reconnectRequired: boolean } {
  if (err instanceof FacebookApiError) {
    if (err.code === 190) {
      return {
        code: 'TOKEN_EXPIRED',
        message: 'O Facebook recusou a publicação porque sua autorização expirou.',
        reconnectRequired: true,
      };
    }
    if (err.code === 4 || err.code === 17 || err.code === 32) {
      return {
        code: 'RATE_LIMITED',
        message: 'O Facebook está limitando as chamadas no momento. Tentaremos novamente automaticamente.',
        reconnectRequired: false,
      };
    }
    if (err.code === 200 || err.code === 10) {
      return {
        code: 'MISSING_PERMISSION',
        message: 'Faltam permissões da Página para publicar. Reconecte concedendo acesso à Página.',
        reconnectRequired: true,
      };
    }
    return { code: `FB_${err.code ?? 'UNKNOWN'}`, message: err.message, reconnectRequired: false };
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Facebook.',
    reconnectRequired: false,
  };
}
