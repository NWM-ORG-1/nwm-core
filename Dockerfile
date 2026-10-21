# syntax=docker/dockerfile:1.7
# NWM — Next.js 16 standalone image for Railway.
# The build talks to Postgres (prerendering pages with real data), so Railway must
# pass DATABASE_PUBLIC_URL as a build arg: builds cannot reach the private network.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_PUBLIC_URL
ARG NEXT_PUBLIC_SITE_URL=https://newweb.media
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ARG RAILWAY_GIT_COMMIT_SHA=local
ARG SEED_ON_EMPTY=0
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    NEXT_DEPLOYMENT_ID=$RAILWAY_GIT_COMMIT_SHA
RUN test -n "$DATABASE_PUBLIC_URL" || (echo "✗ DATABASE_PUBLIC_URL build arg is missing (Railway: \${{Postgres.DATABASE_PUBLIC_URL}})" && exit 1)
# expand-only migrations → optional first-deploy sample seed → prerender with data
RUN DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:migrate \
 && if [ "$SEED_ON_EMPTY" = "1" ]; then DATABASE_URL="$DATABASE_PUBLIC_URL" npm run db:seed -- --if-empty; fi \
 && DATABASE_URL="$DATABASE_PUBLIC_URL" npm run build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
