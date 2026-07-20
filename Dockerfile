FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /frontend
COPY front end/package.json front end/package-lock.json ./
RUN npm ci
COPY front end/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

COPY ollama-backend/pyproject.toml ./
COPY ollama-backend/app ./app
COPY ollama-backend/scripts ./scripts
RUN pip install --upgrade pip && pip install .

COPY --from=frontend-builder /frontend/package.json /frontend/package-lock.json ./frontend/
COPY --from=frontend-builder /frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /frontend/.next ./frontend/.next
COPY docker/supervisord.conf /etc/supervisor/conf.d/ollama-gateway.conf

RUN groupadd --system app \
    && useradd --system --gid app --create-home app \
    && chown -R app:app /app

USER app
EXPOSE 3000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/ollama-gateway.conf"]
