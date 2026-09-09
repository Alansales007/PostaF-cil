# Imagem do app Next.js (frontend + API routes). O worker (fila BullMQ)
# roda em processo/container separado — ver Dockerfile.worker — nunca
# dentro deste.
#
# Base "slim" (Debian, glibc) em vez de "alpine" (musl) de propósito: o
# binário do ffmpeg-static (usado pelo MediaProcessor para detectar codec
# logo após o upload) é compilado contra glibc e não roda de forma
# confiável em Alpine — um gotcha comum e bem documentado desse pacote.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# --ignore-scripts: prisma generate roda de novo no estágio builder, depois
# do schema.prisma já estar copiado (aqui ainda não está).
RUN npm ci --ignore-scripts

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# Garante que o engine do Prisma vai junto mesmo se o file-tracing do
# Next.js não pegar tudo sozinho (workaround comum com output: standalone).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# Idem para os binários do ffmpeg/ffprobe — o file-tracing do Next.js não
# segue a resolução de caminho dinâmica (baseada em process.platform)
# que esses dois pacotes fazem internamente.
COPY --from=builder /app/node_modules/ffmpeg-static ./node_modules/ffmpeg-static
COPY --from=builder /app/node_modules/ffprobe-static ./node_modules/ffprobe-static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
