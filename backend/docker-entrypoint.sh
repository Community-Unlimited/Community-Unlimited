#!/bin/sh
# Migrate, then serve. Migrations run on boot rather than as a release step so
# a fresh volume is usable without a separate command.
set -e

echo "[entrypoint] running migrations"
alembic upgrade head

# Seed reference data once. seed.py is idempotent — it upserts CB1-CB7 and the
# 17 asset placeholders, so re-running it on every boot is a no-op after the
# first. Draft training calendar slots are skipped unless CU_SEED_CALENDAR=1,
# and demo people are NOT seeded (no --demo).
#
# The admin credentials come from the environment. seed.py's defaults are
# fine locally but `cuos-admin` must never reach a public URL, so a deployment
# is expected to set CU_ADMIN_PASSWORD.
if [ "${CU_SEED_ON_BOOT:-1}" = "1" ]; then
  echo "[entrypoint] seeding reference data"
  set --
  if [ "${CU_SEED_CALENDAR:-0}" != "1" ]; then
    set -- "$@" --no-calendar
  fi
  if [ -n "${CU_ADMIN_EMAIL:-}" ]; then
    set -- "$@" --admin-email "$CU_ADMIN_EMAIL"
  fi
  if [ -n "${CU_ADMIN_PASSWORD:-}" ]; then
    set -- "$@" --admin-password "$CU_ADMIN_PASSWORD"
  elif [ "${CU_ENV:-development}" = "production" ]; then
    echo "[entrypoint] WARNING: CU_ADMIN_PASSWORD unset in production — skipping admin seed"
    set -- "$@" --skip-admin
  else
    echo "[entrypoint] WARNING: CU_ADMIN_PASSWORD unset — seeding the default dev password"
  fi
  python seed.py "$@" || echo "[entrypoint] seed skipped (already present)"
fi

echo "[entrypoint] starting uvicorn on :${PORT:-8010} with a single worker"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8010}" \
  --workers 1 \
  --proxy-headers \
  --forwarded-allow-ips '*'
