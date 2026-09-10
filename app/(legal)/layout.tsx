import Link from 'next/link';
import Image from 'next/image';

// Páginas públicas (Política de Privacidade, Termos de Uso) — exigidas pelos
// portais de desenvolvedor (Meta, TikTok) para App Review, e também de
// interesse de qualquer usuário real do PostaFácil. Fora de (auth) e
// (dashboard) de propósito: não exigem sessão nem redirecionam ninguém.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image src="/logo.png" alt="PostaFácil" width={140} height={40} className="h-8 w-auto" />
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">{children}</main>
    </div>
  );
}
