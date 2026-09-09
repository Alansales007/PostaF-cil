import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * Simula a tela de consentimento de uma rede social. Só existe quando
 * MOCK_SOCIAL_APIS=true — deixa testar o fluxo de "Conectar" ponta a ponta
 * (clique → redirect → callback → conta conectada) sem nenhuma credencial
 * real. Um usuário de verdade veria aqui a tela do Instagram/TikTok/etc.
 * pedindo para aceitar as permissões; aqui já "aceitamos" na hora.
 */
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.MOCK_SOCIAL_APIS) {
    return NextResponse.json({ error: 'Disponível apenas com MOCK_SOCIAL_APIS=true.' }, { status: 404 });
  }

  const provider = req.nextUrl.searchParams.get('provider')?.toLowerCase();
  const state = req.nextUrl.searchParams.get('state');
  if (!provider || !state) {
    return NextResponse.json({ error: 'Parâmetros de simulação ausentes.' }, { status: 400 });
  }

  const callbackUrl = new URL(`/api/social/${provider}/callback`, env.APP_URL);
  callbackUrl.searchParams.set('code', `mock-code-${randomUUID()}`);
  callbackUrl.searchParams.set('state', state);

  return NextResponse.redirect(callbackUrl);
}
