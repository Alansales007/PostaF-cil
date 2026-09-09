import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma singleton — evita esgotar conexões em dev (hot reload)
 * e é reaproveitado tanto pelo app Next.js quanto pelo processo worker.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = db;
}
