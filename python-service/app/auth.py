"""
Service-to-service authentication.

Strategy: Shared secret in HTTP header.
- Cloud Functions adds `X-Service-Auth: <secret>` to every request
- Python service verifies the header matches expected value

Future: Switch to GCP service account ID tokens (more robust).
"""

from fastapi import Header, HTTPException, status

from app.config import settings


async def require_service_auth(
    x_service_auth: str | None = Header(default=None, alias="X-Service-Auth"),
) -> None:
    """
    FastAPI dependency to verify service-to-service auth header.

    Raises HTTPException 401 if header missing or value mismatch.
    """
    if x_service_auth is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Service-Auth header",
        )

    if x_service_auth != settings.python_service_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid X-Service-Auth header",
        )
