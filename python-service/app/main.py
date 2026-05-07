"""
FastAPI application entry point.

Endpoints:
- GET  /              — root (returns service info)
- GET  /health        — health check (used by Cloud Run + local Docker)
- POST /verify-auth   — test endpoint for shared-secret auth

Future endpoints (Round 131+):
- POST /xrd/analyze
- POST /raman/deconvolve
- POST /uvvis/tauc-advanced
- POST /pl/multi-gauss
- POST /eis/fit-nyquist
- POST /ms/flat-band
- POST /xps/peak-fit
- ... (see /AI_ARCHITECTURE.md Section 3.2)
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.auth import require_service_auth
from app.config import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """App lifecycle hooks."""
    # Startup
    print(f"[{settings.service_name}] Starting v{__version__}")
    print(f"[{settings.service_name}] Environment: {settings.log_level}")
    yield
    # Shutdown
    print(f"[{settings.service_name}] Shutting down")


app = FastAPI(
    title="LabBook BKU Python Compute Service",
    description="Materials informatics compute service (XRD, Raman, EIS, DFT, etc.)",
    version=__version__,
    lifespan=lifespan,
    # Disable docs in production for security; enable for dev
    docs_url="/docs" if settings.log_level == "DEBUG" else None,
    redoc_url="/redoc" if settings.log_level == "DEBUG" else None,
)

# CORS — only allow Cloud Functions to call (configured at deploy time)
# For local dev, allow all
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restricted via Cloud Run ingress in production
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ============================================================
# Public endpoints (no auth)
# ============================================================

@app.get("/")
async def root():
    """Service info."""
    return {
        "service": settings.service_name,
        "version": __version__,
        "status": "running",
        "docs": "/docs (debug only)",
    }


@app.get("/health")
async def health():
    """Health check for Cloud Run + load balancer."""
    return {
        "status": "healthy",
        "version": __version__,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================
# Authenticated endpoints
# ============================================================

@app.post("/verify-auth", dependencies=[Depends(require_service_auth)])
async def verify_auth(request: Request):
    """
    Test endpoint to verify shared-secret auth is working.
    Returns request metadata if auth succeeds.
    """
    return {
        "message": "Auth successful",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "client_ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }


# ============================================================
# Error handlers
# ============================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler. Logs but doesn't leak details."""
    print(f"[ERROR] {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )
