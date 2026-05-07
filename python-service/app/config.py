"""
Application configuration using Pydantic Settings.

Reads from environment variables. For local dev, can be loaded from .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration."""

    # Service
    service_name: str = "labbook-python-service"
    log_level: str = "INFO"

    # Auth — shared secret with Cloud Functions
    python_service_api_key: str = "change-me-in-production"

    # Firebase
    firebase_project_id: str = "lab-manager-268a6"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Singleton
settings = Settings()
