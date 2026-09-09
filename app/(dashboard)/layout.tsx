import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { DashboardHeader } from '@/components/dashboard/header';
import { BottomNav } from '@/components/dashboard/bottom-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <DashboardHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
      <BottomNav />
    </div>
  );
}
