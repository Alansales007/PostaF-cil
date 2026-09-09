import { redirect } from 'next/navigation';
import { readPendingPageSelection } from '@/lib/oauth/facebook-page-selection';
import { FacebookPagePicker } from '@/components/settings/facebook-page-picker';

export default function ChooseFacebookPagePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;
  const selection = token ? readPendingPageSelection(token) : null;

  if (!token || !selection) {
    redirect('/settings/accounts?error=invalid_state&provider=facebook');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Qual Página conectar?</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Você administra mais de uma Página do Facebook — escolha qual o PostaFácil vai usar para publicar.
        </p>
      </div>
      <FacebookPagePicker token={token} pages={selection.pages} />
    </div>
  );
}
