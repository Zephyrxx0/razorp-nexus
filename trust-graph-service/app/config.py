from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    port: int = 8001
    database_url: str = "postgresql://nexus:nexus_dev_password@localhost:5432/nexus"
    rehydrate_days: int = 30
    periodic_sweep_interval_sec: int = 300


settings = Settings()
