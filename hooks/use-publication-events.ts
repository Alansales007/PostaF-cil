'use client';

import { useEffect, useRef } from 'react';
import type { PublicationTargetStatus, SocialProviderId } from '@/types';

export interface PublicationTargetUpdate {
  userId: string;
  publicationId: string;
  provider: SocialProviderId;
  status: PublicationTargetStatus;
  providerUrl?: string | null;
  errorMessage?: string | null;
}

/**
 * Assina o SSE de /api/events e chama `onUpdate` a cada mudança de status
 * de PublicationTarget. Usa um ref para o callback para não precisar
 * reabrir a conexão a cada render do componente que usa o hook.
 */
export function usePublicationEvents(onUpdate: (event: PublicationTargetUpdate) => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('publication-target-update', (e: MessageEvent) => {
      try {
        callbackRef.current(JSON.parse(e.data) as PublicationTargetUpdate);
      } catch {
        // mensagem malformada — ignora
      }
    });

    return () => source.close();
  }, []);
}
