#!/bin/sh
# Migrate, then serve. Migrations run on boot rather than as a release step so
# a fresh volume is usable without a separate command.
set -e

echo "[entrypoint] running migrations"
alembic upgrade head

# Seed reference data once. seed.py is idempotent — it upserts CB1-CB7, the
# locked training calendar and the 17 asset placeholders, so re-running it on
# every boot is a no-op after the first. Demo people are NOT seeded (no --demo).
#
# The admin credentials come from the environment. seed.py's defaults are
# fine locally but `cuos-admin` must never reach a public URL, so a deployment
# is expected to set CU_ADMIN_PASSWORD.
if [ "${CU_SEED_ON_BOOT:-1}" = "1" ]; then
  echo "[entrypoint] seeding reference data"
  SEED_ARGS=""
  [ -n "$CU_ADMIN_EMAIL" ] && SEED_ARGS="$SEED_ARGS --admin-email $CU_ADMIN_EMAIL"
  [ -n "$CU_ADMIN_PASSWORD" ] && SEED_ARGS="$SEED_ARGS --admin-password $CU_ADMIN_PASSWORD"
  if [ -z "$CU_ADMIN_PASSWORD" ]; then
    echo "[entrypoint] WARNING: CU_ADMIN_PASSWORD unset — seeding the default password"
  fi
  # shellcheck disable=SC2086
  python seed.py $SEED_ARGS || echo "[entrypoint] seed skipped (already present)"
fi

echo "[entrypoint] starting uvicorn on :${PORT:-8010} with a single worker"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8010}" \
  --workers 1 \
  --proxy-headers \
  --forwarded-allow-ips '*'
