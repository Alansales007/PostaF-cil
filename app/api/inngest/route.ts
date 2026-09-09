import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { publishTargetFunction } from '@/lib/inngest/functions/publish-target';
import { transcodeMediaFunction } from '@/lib/inngest/functions/transcode-media';

/**
 * Único ponto de entrada das funções serverless que substituem o worker
 * BullMQ. O Inngest Cloud chama esta rota a cada "step" de cada função —
 * não existe processo próprio rodando entre chamadas.
 *
 * maxDuration=300 exige "Fluid Compute" habilitado no projeto Vercel
 * (Project Settings → Functions) — sem isso, o teto do plano Hobby é bem
 * menor e a transcodificação de vídeos maiores pode não caber num único
 * `step.run()` (ver docs/ARCHITECTURE.md, seção de riscos).
 */
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [publishTargetFunction, transcodeMediaFunction],
});
