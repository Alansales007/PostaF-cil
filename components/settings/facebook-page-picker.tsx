'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface PageOption {
  id: string;
  name: string;
  category: string | null;
}

export function FacebookPagePicker({ token, pages }: { token: string; pages: PageOption[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(pageId: string) {
    setLoadingId(pageId);
    setError(null);
    try {
      const res = await fetch('/api/social/facebook/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pageId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Não foi possível conectar esta Página.');
        setLoadingId(null);
        return;
      }
      router.push('/settings/accounts?connected=facebook');
      router.refresh();
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {pages.map((page) => (
        <Card key={page.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-medium text-slate-900 dark:text-white">{page.name}</p>
            {page.category && <p className="text-sm text-slate-500 dark:text-slate-400">{page.category}</p>}
          </div>
          <Button size="sm" onClick={() => choose(page.id)} disabled={loadingId !== null}>
            {loadingId === page.id ? 'Conectando...' : 'Escolher esta Página'}
          </Button>
        </Card>
      ))}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
