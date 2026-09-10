import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { PROVIDER_LABELS, SOCIAL_PROVIDERS } from '@/types';
import { SocialAccountRow } from '@/components/settings/social-account-row';
import { ConnectionBanner } from '@/components/settings/connection-banner';

export default async function AccountsSettingsPage() {
  const session = await getServerSession(authOptions);
  const env = getEnv();

  const accounts = session?.user?.id
    ? await db.socialAccount.findMany({ where: { userId: session.user.id } })
    : [];
  const byProvider = new Map(accounts.map((a) => [a.provider, a]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Contas conectadas</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Gerencie o acesso do PostaFácil a cada rede social</p>
      </div>

      <Suspense>
        <ConnectionBanner />
      </Suspense>

      <div className="space-y-3">
        {SOCIAL_PROVIDERS.map((provider) => {
          const account = byProvider.get(provider);
          const lower = provider.toLowerCase();

          // Todas as quatro redes têm o fluxo OAuth implementado; o Kwai só
          // fica de fato disponível em modo mock ou com aprovação real da
          // plataforma (ver providers/kwai/KwaiProvider.ts).
          const implemented = true;
          const platformAvailable = provider === 'KWAI' ? env.MOCK_SOCIAL_APIS || env.KWAI_API_AVAILABLE : true;

          return (
            <SocialAccountRow
              key={provider}
              provider={provider}
              label={PROVIDER_LABELS[provider]}
              account={
                account
                  ? { username: account.username, displayName: account.displayName, status: account.status, avatarUrl: account.avatarUrl }
                  : null
              }
              connectHref={implemented && platformAvailable ? `/api/social/${lower}/connect` : null}
              disconnectEndpoint={implemented ? `/api/social/${lower}/disconnect` : null}
              unavailableReason={
                !platformAvailable
                  ? 'Integração aguardando autorização da plataforma'
                  : !implemented
                    ? 'Disponível em uma próxima etapa'
                    : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}
