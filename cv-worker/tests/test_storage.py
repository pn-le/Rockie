import pytest
from unittest.mock import patch, MagicMock, mock_open
from api.services.storage import upload_clips, delete_clips, BUCKET, SIGNED_URL_EXPIRY_SEC

_GET_DB = "api.services.storage.get_db"


def _mock_db():
    db = MagicMock()
    db.storage.from_.return_value.create_signed_url.return_value = {
        "signedURL": "https://supabase.co/storage/signed/clip.mp4?token=abc"
    }
    return db


class TestUploadClips:
    def test_uploads_each_clip_and_returns_signed_urls(self, tmp_path):
        clips = {
            "full": str(tmp_path / "full.mp4"),
            "crux": str(tmp_path / "crux.mp4"),
        }
        for path in clips.values():
            (tmp_path / path.split("/")[-1]).write_bytes(b"fake-video-data")

        db = _mock_db()
        with patch(_GET_DB, return_value=db):
            result = upload_clips(clips, "job-001")

        assert set(result.keys()) == {"full", "crux"}
        assert all("signedURL" in url or "signed" in url for url in result.values())
        assert db.storage.from_.return_value.upload.call_count == 2

    def test_skips_missing_files(self, tmp_path):
        clips = {
            "full": str(tmp_path / "full.mp4"),
            "crux": "/nonexistent/crux.mp4",
        }
        (tmp_path / "full.mp4").write_bytes(b"data")

        db = _mock_db()
        with patch(_GET_DB, return_value=db):
            result = upload_clips(clips, "job-002")

        assert "full" in result
        assert "crux" not in result
        assert db.storage.from_.return_value.upload.call_count == 1

    def test_uses_job_id_as_folder_prefix(self, tmp_path):
        clips = {"crux": str(tmp_path / "crux.mp4")}
        (tmp_path / "crux.mp4").write_bytes(b"data")

        db = _mock_db()
        with patch(_GET_DB, return_value=db):
            upload_clips(clips, "my-job-xyz")

        upload_call = db.storage.from_.return_value.upload.call_args
        assert upload_call.kwargs["path"].startswith("my-job-xyz/")

    def test_uses_correct_bucket(self, tmp_path):
        clips = {"full": str(tmp_path / "full.mp4")}
        (tmp_path / "full.mp4").write_bytes(b"data")

        db = _mock_db()
        with patch(_GET_DB, return_value=db):
            upload_clips(clips, "job-003")

        db.storage.from_.assert_called_with(BUCKET)

    def test_returns_empty_dict_for_empty_input(self):
        db = _mock_db()
        with patch(_GET_DB, return_value=db):
            result = upload_clips({}, "job-004")
        assert result == {}

    def test_signed_url_uses_7_day_expiry(self, tmp_path):
        clips = {"full": str(tmp_path / "full.mp4")}
        (tmp_path / "full.mp4").write_bytes(b"data")

        db = _mock_db()
        with patch(_GET_DB, return_value=db):
            upload_clips(clips, "job-005")

        sign_call = db.storage.from_.return_value.create_signed_url.call_args
        assert sign_call.kwargs["expires_in"] == SIGNED_URL_EXPIRY_SEC


class TestDeleteClips:
    def test_removes_all_job_clips(self):
        db = _mock_db()
        db.storage.from_.return_value.list.return_value = [
            {"name": "full.mp4"},
            {"name": "crux.mp4"},
        ]
        with patch(_GET_DB, return_value=db):
            delete_clips("job-006")

        remove_call = db.storage.from_.return_value.remove.call_args
        removed_paths = remove_call.args[0]
        assert "job-006/full.mp4" in removed_paths
        assert "job-006/crux.mp4" in removed_paths

    def test_no_remove_when_no_files(self):
        db = _mock_db()
        db.storage.from_.return_value.list.return_value = []
        with patch(_GET_DB, return_value=db):
            delete_clips("job-007")
        db.storage.from_.return_value.remove.assert_not_called()
