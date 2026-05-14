import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-service-key")


@pytest.fixture
def mock_db():
    import api.db  # ensure module is imported before patching
    with patch("api.db.get_db") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
def client(mock_db):
    from api.config import get_settings
    get_settings.cache_clear()

    from api.db import get_db
    get_db.cache_clear()

    from main import app
    return TestClient(app)


@pytest.fixture
def sample_video_path(tmp_path):
    # Minimal valid MP4 — 1x1 pixel, 1 frame (for unit tests that need a file path)
    import subprocess, shutil
    video_path = tmp_path / "sample.mp4"
    if shutil.which("ffmpeg"):
        subprocess.run([
            "ffmpeg", "-f", "lavfi", "-i", "color=c=black:size=640x480:rate=30",
            "-t", "3", "-c:v", "libx264", "-y", str(video_path)
        ], capture_output=True)
    else:
        # Fallback: empty file (tests that need real video will skip)
        video_path.write_bytes(b"")
    return str(video_path)
