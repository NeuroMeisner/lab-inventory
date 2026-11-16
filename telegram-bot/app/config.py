from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    bot_token: str = ""                          # пусто => MOCK-режим
    backend_url: str = "http://localhost:8000/api/v1"
    internal_api_secret: str = "change-me-internal-secret"
    pwa_public_url: str = "https://lab.example.ru"
    webhook_port: int = 8080
    webhook_path: str = "/bot/webhook"


settings = Settings()