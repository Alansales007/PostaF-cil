import { signToken, verifyToken } from '@/lib/signed-token';
import { encryptToken, decryptToken } from '@/lib/crypto';

const SELECTION_TTL_MS = 10 * 60 * 1000;

export interface FacebookPageOption {
  id: string;
  name: string;
  category: string | null;
  /** Token de acesso da Página já cifrado (AES-256-GCM) — nunca fica em texto puro na URL. */
  encryptedAccessToken: string;
}

interface PendingSelectionPayload {
  userId: string;
  pages: FacebookPageOption[];
  exp: number;
}

/**
 * Quando o usuário administra mais de uma Página do Facebook, o callback
 * OAuth não sabe qual delas conectar sozinho — em vez de guardar isso em
 * uma tabela nova só para esse estado transitório, empacotamos a lista
 * (com os tokens de cada Página já cifrados) num token assinado de curta
 * duração e mandamos o usuário escolher em /settings/accounts/facebook/choose.
 */
export function createPendingPageSelection(userId: string, pages: { id: string; name: string; category: string | null; accessToken: string }[]): string {
  const payload: PendingSelectionPayload = {
    userId,
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      encryptedAccessToken: encryptToken(p.accessToken),
    })),
    exp: Date.now() + SELECTION_TTL_MS,
  };
  return signToken(payload);
}

export interface ResolvedPageSelection {
  userId: string;
  pages: FacebookPageOption[];
}

export function readPendingPageSelection(token: string): ResolvedPageSelection | null {
  const payload = verifyToken<PendingSelectionPayload>(token);
  if (!payload) return null;
  return { userId: payload.userId, pages: payload.pages };
}

/** Decifra o token de uma Página específica dentro de uma seleção pendente já validada. */
export function decryptSelectedPageToken(page: FacebookPageOption): string {
  return decryptToken(page.encryptedAccessToken);
}
