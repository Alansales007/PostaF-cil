'use client';

import { useEffect, useRef } from 'react';
import type { PublicationTargetStatus } from '@/types';

const TERMINAL_STATUSES: PublicationTargetStatus[] = ['PUBLISHED', 'FAILED', 'CANCELLED'];
const POLL_INTERVAL_MS = 3_000;

/**
 * Estratégia de tempo real nº1: polling simples via GET /api/publications/[id]
 * (rota já existente — nenhum endpoint novo). Substitui o SSE+Redis
 * pub/sub anterior (lib/realtime/publish-events.ts) para não depender de
 * nenhuma infraestrutura extra num volume de ~20 publicações/dia.
 *
 * Ponto de extensão: se o volume crescer e um push instantâneo (SSE/
 * WebSocket) voltar a valer a pena, troque só a implementação deste hook —
 * a assinatura (publicationId, targets, setTargets) pode continuar igual.
 */
export function usePublicationStatusPolling<T extends { status: PublicationTargetStatus }>(
  publicationId: string,
  targets: T[],
  setTargets: (next: T[]) => void,
): void {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    // Nada em andamento — não faz nenhuma requisição.
    if (targetsRef.current.every((t) => TERMINAL_STATUSES.includes(t.status))) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/publications/${publicationId}`);
        if (!res.ok || cancelled) return;
        const { publication } = await res.json();
        if (cancelled) return;
        setTargets(publication.targets);
        if ((publication.targets as T[]).every((t) => TERMINAL_STATUSES.includes(t.status))) {
          clearInterval(interval);
        }
      } catch {
        // erro de rede passageiro — tenta de novo no próximo tick
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Reavalia a cada mudança de `targets` (ex.: retry manual reabre o
    // polling) — o guard acima evita reiniciar o intervalo à toa quando já
    // está tudo terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicationId, targets]);
}
