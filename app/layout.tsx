import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { SessionProvider } from '@/components/providers/session-provider';

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
