# SatQuery AI — one image for the venue: the built interface and the API on
# one origin, offline after build (OPS-03, OPS-06).
#
#   docker compose up            http://127.0.0.1:8000
#
# Two stages: Node builds web/dist; the runtime image is Python only, so the
# venue machine carries no Node, and nothing is fetched once it is running.

# ---- 1. the interface -------------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 2. the service ---------------------------------------------------------
FROM python:3.13-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    SATQUERY_HOME=/app SATQUERY_VAR=/data
WORKDIR /app
COPY pyproject.toml README.md ./
COPY satquery/ satquery/
RUN pip install --no-compile . && useradd --system --uid 10001 satquery \
    && mkdir -p /data /app/adapters && chown satquery /data
# the interface, the built-in scenes and the recorded evaluation runs
COPY --from=web /src/web/dist web/dist
COPY web/public web/public
# M1's pack manifest and pre-computed answers (never its weights) where the
# runtime reads packs, and the measured calibration the Results page draws.
COPY models/adapters/ /app/adapters/
COPY models/results/ /app/models/results/
USER satquery
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"
CMD ["satquery", "serve", "--host", "0.0.0.0", "--port", "8000", "--var", "/data", "--adapters", "/app/adapters"]
