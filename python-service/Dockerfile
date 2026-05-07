# syntax=docker/dockerfile:1.7
# Multi-stage build for FastAPI + uv on Cloud Run

# ============================================================
# Stage 1: Build dependencies with uv
# ============================================================
FROM python:3.13-slim AS builder

# Install uv (fast Python package installer)
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

WORKDIR /app

# Copy only dependency files first (cache layer)
COPY pyproject.toml ./
COPY uv.lock* ./

# Install dependencies into a virtual environment
# --no-install-project: skip installing the project itself
# --no-dev: production deps only
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
RUN uv sync --frozen --no-install-project --no-dev || \
    uv sync --no-install-project --no-dev

# ============================================================
# Stage 2: Runtime
# ============================================================
FROM python:3.13-slim AS runtime

# Cloud Run requirements:
# - Listen on $PORT env var
# - Bind to 0.0.0.0
# - Single worker (Cloud Run scales by instance, not worker)
# - Stateless

# System dependencies (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY app/ ./app/
COPY pyproject.toml ./

# Create non-root user
RUN adduser --disabled-password --gecos "" --no-create-home appuser && \
    chown -R appuser:appuser /app
USER appuser

# Use venv binaries
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080
EXPOSE 8080

# Health check (Cloud Run has its own, this is for local Docker)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health').read()" || exit 1

# Single worker — Cloud Run scales by adding instances
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1
