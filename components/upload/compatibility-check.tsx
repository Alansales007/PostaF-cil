'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PROVIDER_LABELS, type SocialProviderId } from '@/types';

interface ValidationResult {
  provider: SocialProviderId;
  compatible: boolean;
  needsConversion: boolean;
  reasons: string[];
}

export function CompatibilityCheck({ mediaId }: { mediaId: string }) {
  const [results, setResults] = useState<ValidationResult[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/media/${mediaId}/validate`)
      .then((res) => res.json())
      .then((data) => active && setResults(data.results))
      .catch(() => active && setResults([]));
    return () => {
      active = false;
    };
  }, [mediaId]);

  if (!results) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Verificando compatibilidade com cada rede...
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-slate-100 dark:divide-slate-800">
      {results.map((r) => (
        <div key={r.provider} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="font-medium text-slate-900 dark:text-white">{PROVIDER_LABELS[r.provider]}</span>
          {r.compatible ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={16} /> Compatível
            </span>
          ) : r.needsConversion ? (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={16} /> Necessita conversão
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400" title={r.reasons.join(' ')}>
              <XCircle size={16} /> Incompatível
            </span>
          )}
        </div>
      ))}
    </Card>
  );
}
