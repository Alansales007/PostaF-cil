import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { Plus } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { SocialAccountCard } from '@/components/dashboard/social-account-card';
import { PROVIDER_LABELS, SOCIAL_PROVIDERS } from '@/types';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const env = getEnv();

  const accounts = session?.user?.id
    ? await db.socialAccount.findMany({ where: { userId: session.user.id } })
    : [];

  const byProvider = new Map(accounts.map((a) => [a.provider, a]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Olá{session?.user?.name ? `, ${session.user.name}` : ''} 👋</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Suas redes conectadas</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SOCIAL_PROVIDERS.map((provider) => {
          const account = byProvider.get(provider);
          // Kwai depende de aprovação prévia da plataforma (não há uma API
          // pública de publicação de vídeo hoje — ver providers/kwai) —
          // mas em modo mock ela é exercitada igual às demais, pois o
          // objetivo do modo mock é testar o sistema inteiro de ponta a
          // ponta independentemente do que já está aprovado de verdade.
          const platformAvailable = provider === 'KWAI' ? env.MOCK_SOCIAL_APIS || env.KWAI_API_AVAILABLE : true;
          return (
            <SocialAccountCard
              key={provider}
              provider={provider}
              label={PROVIDER_LABELS[provider]}
              connected={Boolean(account)}
              accountLabel={account?.username ? `@${account.username}` : account?.displayName}
              platformAvailable={platformAvailable}
              connectImplemented
            />
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Selecione um vídeo, escreva a legenda e publique em todas as redes de uma vez.
          </p>
          <Link href="/publications/new" className={buttonVariants('primary', 'md', 'w-full sm:w-auto')}>
            <Plus size={18} /> Nova publicação
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
