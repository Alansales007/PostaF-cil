'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListChecks, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/publications', label: 'Publicações', icon: ListChecks },
  { href: '/settings/accounts', label: 'Contas', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
              active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
