"""Configuration settings for Nexus Agent."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://nexus_app:nexus_app_dev_secret@localhost:5432/nexus"
    trust_graph_url: str = "http://localhost:8001"
    nexus_razorpay_mock: bool = True
    encryption_key: str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    google_api_key: str = ""
    port: int = 8000


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
