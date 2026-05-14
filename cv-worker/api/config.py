from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    supabase_url: str
    supabase_service_key: str
    allowed_origin: str = "http://localhost:3000"
    tmp_dir: str = "/tmp/rockie"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
