import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { SessionProvider } from '@/components/providers/session-provider';

// Todo o app é autenticado/dinâmico por natureza (sessão, banco, fila) —
// nenhuma página aqui se beneficia de geração estática. Forçar isso na
// raiz evita que o Next.js tente pré-renderizar páginas no build (quando
// não há uma requisição real, nem sempre há um Postgres/Redis alcançável,
// e o próprio next-auth precisa de contexto de requisição para montar a
// URL da sessão — sem isso, o build quebra com "Invalid URL").
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'PostaFácil',
  description: 'Publique uma vez. Conecte o seu mundo.',
  manifest: '/manifest.json',
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#6631ff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <SessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
