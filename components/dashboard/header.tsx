import Image from 'next/image';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LogoutButton } from '@/components/dashboard/logout-button';

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex items-center gap-2">
        <Image src="/icon.png" alt="" width={28} height={28} className="rounded-lg" />
        <span className="text-base font-semibold text-slate-900 dark:text-white">PostaFácil</span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
