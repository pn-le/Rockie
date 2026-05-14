from unittest.mock import patch, AsyncMock


def test_analyze_returns_202(client, mock_db):
    with patch("api.routes.analyze.run_analysis", new_callable=AsyncMock):
        response = client.post("/analyze", json={
            "job_id": "job-001",
            "video_url": "https://test.supabase.co/storage/v1/object/sign/climb-videos/test.mp4",
            "user_id": "user-001",
            "session_id": "session-001",
        })
    assert response.status_code == 202
    body = response.json()
    assert body["job_id"] == "job-001"
    assert body["status"] == "queued"


def test_analyze_missing_fields_returns_422(client):
    response = client.post("/analyze", json={"job_id": "job-001"})
    assert response.status_code == 422
