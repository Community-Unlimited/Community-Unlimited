# CU-OS API
#
# Single-process on purpose. The WhatsApp reminder sweep is an in-process
# asyncio loop, so a second worker double-sends every reminder. Scale by making
# the machine bigger, never by adding workers or replicas.

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install from pyproject.toml rather than repeating the dependency list here.
# A duplicated list silently drifts — someone adds a dependency, the app works
# locally, and production dies on an ImportError. The cost is that a code change
# reinstalls dependencies; the image is small enough that this is the better
# trade.
COPY pyproject.toml alembic.ini seed.py ./
COPY alembic ./alembic
COPY app ./app
RUN pip install --no-cache-dir .

# SQLite lives on a mounted volume. Without one the database is recreated empty
# on every deploy — fine for a smoke test, not for real registrations.
ENV CU_DATABASE_URL=sqlite:////data/cuos.db
RUN mkdir -p /data

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Hosts inject PORT; default matches local dev.
ENV PORT=8010
EXPOSE 8010

CMD ["./docker-entrypoint.sh"]
