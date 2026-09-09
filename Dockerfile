# Imagem do app Next.js (frontend + API routes). O worker (fila BullMQ)
# roda em processo/container separado — ver Dockerfile.worker — nunca
# dentro deste.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# --ignore-scripts: prisma generate roda de novo no estágio builder, depois
# do schema.prisma já estar copiado (aqui ainda não está).
RUN npm ci --ignore-scripts

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# Garante que o engine do Prisma vai junto mesmo se o file-tracing do
# Next.js não pegar tudo sozinho (workaround comum com output: standalone).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
