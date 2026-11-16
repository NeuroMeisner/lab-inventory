from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Security / CORS
    internal_api_secret: str = ""          # если задан — требуем заголовок X-Internal-Secret
    cors_origins: str = "http://localhost:5173,http://localhost:4173"

    # Printer
    printer_model: str = "QL-800"          # QL-700 / QL-800 / QL-810W / QL-820NWB / QL-1100 ...
    printer_address: str = ""              # tcp://192.168.1.100:9100 | usb://0x04f9:0x209e | file:/tmp/out.prn
    label_size: str = "62x100"             # Brother DK-11202 (предвысеченная 62×100 мм)
    printer_dry_run: bool = False          # рендер без отправки на принтер

    # Labels
    label_dpi: int = 300

    @cached_property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()