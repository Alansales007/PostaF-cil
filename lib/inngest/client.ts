import { Inngest } from 'inngest';

/**
 * Cliente Inngest — substitui a conexão Redis/BullMQ. Não existe processo
 * permanente: o Inngest Cloud chama de volta a rota app/api/inngest/route.ts
 * a cada "step" de uma função, e a Vercel só roda código quando há trabalho
 * de verdade (ver docs/ARCHITECTURE.md).
 */
export const inngest = new Inngest({ id: 'postafacil' });
