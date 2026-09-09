'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PROVIDER_LABELS, type SocialProviderId } from '@/types';

const ERROR_MESSAGES: Record<string, string> = {
  denied: 'Você cancelou a autorização — nenhuma conta foi conectada.',
  invalid_state: 'A sessão de conexão expirou ou é inválida. Tente conectar novamente.',
  invalid_callback: 'Resposta inesperada da plataforma. Tente novamente.',
  not_configured: 'Esta integração ainda não tem credenciais configuradas no servidor.',
  rate_limited: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
  oauth_failed: 'Não foi possível concluir a conexão.',
  no_pages: 'Nenhuma Página do Facebook encontrada. Você precisa ser administrador de pelo menos uma Página.',
  platform_unavailable: 'Integração aguardando autorização da plataforma.',
};

export function ConnectionBanner() {
  const params = useSearchParams();
  const connected = params.get('connected') as SocialProviderId | null;
  const error = params.get('error');
  const provider = params.get('provider') as SocialProviderId | null;
  const reason = params.get('reason');

  if (!connected && !error) return null;

  if (connected) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        <CheckCircle2 size={16} />
        {PROVIDER_LABELS[connected] ?? connected} conectado com sucesso.
      </div>
    );
  }

  const message = (reason && decodeURIComponent(reason)) || (error ? ERROR_MESSAGES[error] : null) || 'Não foi possível concluir a operação.';

  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
      <XCircle size={16} />
      {provider ? `${PROVIDER_LABELS[provider] ?? provider}: ` : ''}
      {message}
    </div>
  );
}
