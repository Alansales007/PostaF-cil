import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 dark:from-slate-950 dark:to-slate-950">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image src="/logo.png" alt="PostaFácil" width={220} height={64} priority className="h-auto w-52" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Publique uma vez. Conecte o seu mundo.</p>
      </div>
      <div className="w-full max-w-sm animate-fade-in">{children}</div>
    </div>
  );
}
