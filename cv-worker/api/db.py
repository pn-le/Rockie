from functools import lru_cache
from supabase import create_client, Client
from .config import get_settings


@lru_cache(maxsize=1)
def get_db() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)
