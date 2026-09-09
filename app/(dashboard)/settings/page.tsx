import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Configurações</h1>
      <Link href="/settings/accounts">
        <Card className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
          <CardContent className="flex items-center gap-3 py-4">
            <Users size={18} className="text-slate-500 dark:text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Contas conectadas</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gerencie Instagram, Facebook, TikTok e Kwai</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
