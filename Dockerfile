# CU-OS — one image, one service.
#
# Stage 1 builds the React SPA; stage 2 runs FastAPI and serves that build from
# the same origin. One URL means no CORS, no VITE_API_BASE_URL, and one thing
# to deploy and pay for.
#
# Build context is the REPO ROOT (both frontend/ and backend/ are needed).

# --- stage 1: frontend ------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /fe

# Lockfile first so dependency install caches independently of source edits.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# No VITE_API_BASE_URL: unset means the client calls relative /api, which is
# exactly right when the API serves this bundle.
RUN npm run build

# --- stage 2: api + static --------------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Installed from pyproject.toml rather than a duplicated list, which would
# silently drift and break production on an ImportError.
COPY backend/pyproject.toml backend/alembic.ini backend/seed.py ./
COPY backend/alembic ./alembic
COPY backend/app ./app
RUN pip install --no-cache-dir .

# The compiled SPA. app.main mounts this when present and falls back to
# index.html for client-side routes.
COPY --from=frontend /fe/dist ./static

# SQLite lives on a mounted volume. Without one the database is recreated empty
# on every deploy — fine for a demo, not for real registrations.
ENV CU_DATABASE_URL=sqlite:////data/cuos.db \
    CU_STATIC_DIR=/app/static
RUN mkdir -p /data

COPY backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV PORT=8010
EXPOSE 8010

CMD ["./docker-entrypoint.sh"]
