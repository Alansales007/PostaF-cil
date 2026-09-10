import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Lançado quando a conta não pode ser removida porque ainda tem
 * PublicationTarget(s) apontando para ela (histórico de publicações) — a
 * constraint de chave estrangeira do banco proíbe a exclusão nesse caso.
 */
export class SocialAccountHasPublicationsError extends Error {}

/**
 * Remove uma conta social do banco, traduzindo a violação de chave
 * estrangeira (conta com publicações associadas) num erro claro em vez de
 * deixar o Prisma estourar um 500 genérico nas 4 rotas de disconnect.
 *
 * Encontrado ao conectar uma conta real do Instagram nesta sessão: contas
 * de teste com publicações associadas não conseguiam ser desconectadas.
 */
export async function deleteSocialAccount(accountId: string): Promise<void> {
  try {
    await db.socialAccount.delete({ where: { id: accountId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new SocialAccountHasPublicationsError(
        'Esta conta tem publicações registradas e ainda não pode ser desconectada — em uma próxima atualização isso será possível preservando o histórico de publicações.',
      );
    }
    throw err;
  }
}
