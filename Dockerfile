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
# Google Analytics 4 ID (G-…); unset = no analytics script and no analytics section in the privacy policy
ARG NEXT_PUBLIC_GA_ID
# reader-site switches (src/lib/beats.ts, src/lib/labels.ts): 1/0, unset = crypto lowered, AI labels hidden
ARG NEXT_PUBLIC_CRYPTO_LOW_PROFILE
ARG NEXT_PUBLIC_AI_DISCLOSURE
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ARG RAILWAY_GIT_COMMIT_SHA=local
ARG SEED_ON_EMPTY=0
# 법정 표기 overrides: pages are prerendered here, so the footer needs them at build time
# (RUN steps see ARGs as env vars). Changes take effect on the next deploy.
ARG LEGAL_TITLE
ARG LEGAL_REG_NO
ARG LEGAL_REG_DATE
ARG LEGAL_PUBLISHER
ARG LEGAL_EDITOR
ARG LEGAL_ADDRESS
ARG LEGAL_PHONE
ARG LEGAL_YOUTH_OFFICER
ARG LEGAL_EMAIL
ARG LEGAL_FOUNDED_AT
ARG LEGAL_COMPANY
ARG LEGAL_BIZ_NO
ARG LEGAL_PRIVACY_OFFICER
ARG LEGAL_REPORT_EMAIL
# earlier names for the same fields (src/lib/site.ts LEGAL_FIELDS alias), read when LEGAL_* is unset
ARG SITE_COMPANY
ARG SITE_REG_NO
ARG SITE_REG_DATE
ARG SITE_PUBLISHER
ARG SITE_EDITOR
ARG SITE_ADDRESS
ARG SITE_PHONE
ARG SITE_BIZ_NO
ARG SITE_YOUTH_OFFICER
ARG SITE_PRIVACY_OFFICER
ARG SITE_EMAIL
ARG SITE_REPORT_EMAIL
ARG SITE_PUB_DATE
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_CRYPTO_LOW_PROFILE=$NEXT_PUBLIC_CRYPTO_LOW_PROFILE \
    NEXT_PUBLIC_AI_DISCLOSURE=$NEXT_PUBLIC_AI_DISCLOSURE \
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    NEXT_DEPLOYMENT_ID=$RAILWAY_GIT_COMMIT_SHA
# migrate → optional sample seed → next build. A script, not inline: BuildKit logs RUN lines
# with build args filled in, and DATABASE_PUBLIC_URL holds the database password.
RUN sh scripts/docker-build.sh

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
