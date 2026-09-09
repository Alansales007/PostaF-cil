import type { SocialAccount } from '@prisma/client';
import { db } from '@/lib/db';
import { decryptToken, encryptToken, maskToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { getSocialProvider } from '@/providers';
import type { SocialProviderId } from '@/types';

const REFRESH_THRESHOLD_MS = 5 * 24 * 60 * 60 * 1000; // renova com 5 dias de antecedência

export interface ValidAccessTokenResult {
  accessToken: string;
  refreshed: boolean;
}

/**
 * Devolve um access_token utilizável para a conta social, renovando
 * proativamente perto da expiração (ex.: Instagram, cujo token de longa
 * duração dura ~60 dias e precisa ser renovado antes de expirar de vez).
 * Se a renovação falhar, marca a conta como ERROR para a UI oferecer
 * "Reconectar" em vez de a publicação simplesmente falhar sem explicação.
 */
export async function getValidAccessToken(account: SocialAccount): Promise<ValidAccessTokenResult> {
  const currentToken = decryptToken(account.encryptedAccessToken);

  const expiresSoon = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS : false;

  if (!expiresSoon) {
    return { accessToken: currentToken, refreshed: false };
  }

  try {
    const provider = getSocialProvider(account.provider as SocialProviderId);
    const refreshed = await provider.refreshToken(currentToken);

    await db.socialAccount.update({
      where: { id: account.id },
      data: {
        encryptedAccessToken: encryptToken(refreshed.accessToken),
        tokenExpiresAt: refreshed.expiresAt,
        status: 'ACTIVE',
      },
    });

    logger.info({ accountId: account.id, provider: account.provider }, 'Token de conta social renovado com sucesso');
    return { accessToken: refreshed.accessToken, refreshed: true };
  } catch (err) {
    logger.warn(
      { accountId: account.id, provider: account.provider, tokenSuffix: maskToken(currentToken), err },
      'Falha ao renovar token — marcando conta como ERROR',
    );
    await db.socialAccount.update({ where: { id: account.id }, data: { status: 'ERROR' } });
    // Ainda devolve o token atual — pode funcionar até o momento exato da expiração.
    return { accessToken: currentToken, refreshed: false };
  }
}
