import { TikTokApiError } from './api';

const FAIL_REASON_MESSAGES: Record<string, string> = {
  file_format_check_failed: 'O TikTok recusou o vídeo — formato de arquivo não suportado.',
  duration_check_failed: 'O TikTok recusou o vídeo — duração fora do permitido para esta conta.',
  frame_rate_check_failed: 'O TikTok recusou o vídeo — taxa de quadros não suportada.',
  picture_size_check_failed: 'O TikTok recusou o vídeo — resolução não suportada.',
  video_pull_failed: 'O TikTok não conseguiu baixar o vídeo da URL fornecida.',
  photo_pull_failed: 'O TikTok não conseguiu baixar o arquivo da URL fornecida.',
  publish_cancelled: 'A publicação foi cancelada.',
  auth_removed: 'A autorização desta conta foi removida.',
  spam_risk_too_many_posts: 'O TikTok limitou a publicação por excesso de posts recentes.',
  spam_risk_user_banned_from_posting: 'Esta conta está temporariamente impedida de publicar pelo TikTok.',
  spam_risk_text: 'O TikTok recusou a legenda por parecer spam.',
  spam_risk: 'O TikTok sinalizou risco de spam nesta publicação.',
  internal: 'Erro interno do TikTok ao processar o vídeo.',
};

/** Traduz o `fail_reason` do status de publicação em uma mensagem compreensível. */
export function describeFailReason(failReason: string | undefined): string | null {
  if (!failReason) return null;
  return FAIL_REASON_MESSAGES[failReason] ?? `O TikTok recusou a publicação (${failReason}).`;
}

export function describeTikTokError(err: unknown): { code: string; message: string; reconnectRequired: boolean } {
  if (err instanceof TikTokApiError) {
    if (err.code === 'access_token_invalid' || err.code === 'invalid_grant') {
      return {
        code: 'TOKEN_EXPIRED',
        message: 'O TikTok recusou o vídeo porque sua autorização expirou.',
        reconnectRequired: true,
      };
    }
    if (err.code === 'scope_not_authorized' || err.code === 'scope_permission_missed') {
      return {
        code: 'MISSING_SCOPE',
        message: 'Faltam permissões para publicar no TikTok. Reconecte concedendo acesso à publicação de vídeos.',
        reconnectRequired: true,
      };
    }
    if (err.code === 'rate_limit_exceeded') {
      return {
        code: 'RATE_LIMITED',
        message: 'O TikTok está limitando as chamadas no momento. Tentaremos novamente automaticamente.',
        reconnectRequired: false,
      };
    }
    return { code: `TT_${err.code ?? 'UNKNOWN'}`, message: err.message, reconnectRequired: false };
  }

  return {
    code: 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Erro desconhecido ao falar com o TikTok.',
    reconnectRequired: false,
  };
}
