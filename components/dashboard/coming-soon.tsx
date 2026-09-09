import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-900/40 dark:text-brand-300">
          <Icon size={26} />
        </div>
        <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
        <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </CardContent>
    </Card>
  );
}
