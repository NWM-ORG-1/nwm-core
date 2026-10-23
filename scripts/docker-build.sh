#!/bin/sh
# Image build step (Dockerfile, builder stage): migrate → optional sample seed → next build.
# The database URL is read from the environment here rather than written into the RUN
# line, because BuildKit prints RUN lines with build args filled in — the URL carries
# the database password and would end up in the build log.
set -eu

if [ -z "${DATABASE_PUBLIC_URL:-}" ]; then
  echo "✗ DATABASE_PUBLIC_URL build arg is missing (Railway: \${{Postgres.DATABASE_PUBLIC_URL}})" >&2
  exit 1
fi
export DATABASE_URL="$DATABASE_PUBLIC_URL"

# expand-only migrations → optional first-deploy sample seed → prerender with data
npm run db:migrate
if [ "${SEED_ON_EMPTY:-0}" = "1" ]; then
  npm run db:seed -- --if-empty
fi
npm run build
