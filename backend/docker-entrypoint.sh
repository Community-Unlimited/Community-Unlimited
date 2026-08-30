#!/bin/sh
# Migrate, then serve. Migrations run on boot rather than as a release step so
# a fresh volume is usable without a separate command.
set -e

echo "[entrypoint] running migrations"
alembic upgrade head

# Seed reference data once. seed.py is idempotent — it upserts CB1-CB7, the
# locked training calendar and the 17 asset placeholders, so re-running it on
# every boot is a no-op after the first.
if [ "${CU_SEED_ON_BOOT:-1}" = "1" ]; then
  echo "[entrypoint] seeding reference data"
  python seed.py || echo "[entrypoint] seed skipped (already present)"
fi

echo "[entrypoint] starting uvicorn on :${PORT:-8010} with a single worker"
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8010}" \
  --workers 1 \
  --proxy-headers \
  --forwarded-allow-ips '*'
