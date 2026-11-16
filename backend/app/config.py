from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://lab:lab@localhost:5432/lab"

    # Auth
    jwt_secret: str = "change-me-in-production"
    access_token_ttl_minutes: int = 60
    refresh_token_ttl_days: int = 30
    dev_mode: bool = False
    google_client_id: str = ""
    google_admin_emails: str = ""

    # Telegram / bot integration
    bot_token: str = ""
    internal_api_secret: str = "change-me-internal-secret"
    telegram_bot_webhook_url: str = ""

    # Misc
    pwa_public_url: str = "https://lab.example.ru"
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    scheduler_enabled: bool = True
    reserve_minutes: int = 30
    link_code_ttl_minutes: int = 10
    seed_admin_email: str = "admin@lab.test"

    @cached_property
    def google_admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.google_admin_emails.split(",") if e.strip()]

    @cached_property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()