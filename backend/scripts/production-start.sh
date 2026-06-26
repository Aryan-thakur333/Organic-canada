#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Production startup script for Eatsie / Organic Canada Medusa backend.
# Usage:  bash scripts/production-start.sh
#
# Prerequisites:
#   - DATABASE_URL, JWT_SECRET, COOKIE_SECRET, MEDUSA_BACKEND_URL, STORE_CORS,
#     ADMIN_CORS, AUTH_CORS must be set in the environment or .env file.
#   - PostgreSQL must be reachable at DATABASE_URL.
#   - Redis is recommended (REDIS_URL) but not required.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_NAME="eatsie-backend"

echo "[${APP_NAME}] Starting production boot sequence..."

# ── 1. Environment validation ────────────────────────────────────────────────
REQUIRED_VARS=(
  "DATABASE_URL"
  "JWT_SECRET"
  "COOKIE_SECRET"
  "MEDUSA_BACKEND_URL"
  "STORE_CORS"
  "ADMIN_CORS"
  "AUTH_CORS"
)

MISSING=0
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    echo "[${APP_NAME}] ERROR: Missing required environment variable: ${VAR}"
    MISSING=1
  fi
done

if [ "${MISSING}" -eq 1 ]; then
  echo "[${APP_NAME}] Aborting due to missing environment variables."
  exit 1
fi

# Validate secret length — 32+ character minimum
SECRETS_OK=1
for VAR in "JWT_SECRET" "COOKIE_SECRET"; do
  VALUE="${!VAR}"
  LEN="${#VALUE}"
  if [ "${LEN}" -lt 32 ]; then
    echo "[${APP_NAME}] ERROR: ${VAR} is only ${LEN} characters long (minimum 32 required)."
    echo "[${APP_NAME}]        Generate a secure value with:"
    echo "[${APP_NAME}]          node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
    SECRETS_OK=0
  fi
done

if [ "${SECRETS_OK}" -eq 0 ]; then
  echo "[${APP_NAME}] Aborting due to weak secrets."
  exit 1
fi

echo "[${APP_NAME}] Environment validated."

# ── 2. Database migrations ──────────────────────────────────────────────────
echo "[${APP_NAME}] Running database migrations..."
npx medusa db:migrate
npx medusa db:sync-links
echo "[${APP_NAME}] Database migrations complete."

# ── 3. Start server ──────────────────────────────────────────────────────────
echo "[${APP_NAME}] Starting Medusa server..."
exec npx medusa start
