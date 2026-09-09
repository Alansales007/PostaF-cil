import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { subscribeToPublishEvents } from '@/lib/realtime/publish-events';

export const dynamic = 'force-dynamic';

const PING_INTERVAL_MS = 25_000;

/**
 * Server-Sent Events com o status de publicação em tempo real. Escolhido
 * em vez de WebSocket porque é mais simples atrás de proxies/CDN comuns e
 * funciona bem no Safari do iPhone (EventSource nativo, sem biblioteca).
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Não autenticado.', { status: 401 });
  }
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let pingTimer: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('connected', { ok: true });

      unsubscribe = subscribeToPublishEvents((event) => {
        if (event.userId !== userId) return; // cada usuário só vê os próprios eventos
        send('publication-target-update', event);
      });

      // mantém a conexão viva atrás de proxies que fecham streams ociosos
      pingTimer = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, PING_INTERVAL_MS);
    },
    cancel() {
      clearInterval(pingTimer);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
