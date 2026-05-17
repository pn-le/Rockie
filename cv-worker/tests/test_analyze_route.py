import pytest
from unittest.mock import patch, AsyncMock, MagicMock


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


def test_analyze_without_session_id(client, mock_db):
    with patch("api.routes.analyze.run_analysis", new_callable=AsyncMock):
        response = client.post("/analyze", json={
            "job_id": "job-002",
            "video_url": "https://test.supabase.co/storage/v1/object/sign/climb-videos/test.mp4",
            "user_id": "user-002",
        })
    assert response.status_code == 202


class TestRunAnalysis:
    """Integration tests for the full run_analysis pipeline (all services mocked)."""

    @pytest.fixture
    def mock_pipeline(self, tmp_path):
        """Mock every service and external call in run_analysis."""
        from api.models.pose import FrameLandmarks, Landmark
        from api.models.moments import Moments

        fake_frame = FrameLandmarks(
            frame_index=0,
            timestamp_sec=0.0,
            landmarks=[Landmark(x=0.5, y=0.5, z=0.0, visibility=0.9)] * 33,
        )
        fake_moments = Moments(crux_timestamp_sec=5.0, best_timestamp_sec=1.0)
        fake_clips = {
            "full": str(tmp_path / "full.mp4"),
            "crux": str(tmp_path / "crux.mp4"),
        }
        for p in fake_clips.values():
            open(p, "w").close()

        fake_db = MagicMock()

        patches = {
            "db":         patch("api.routes.analyze.get_db", return_value=fake_db),
            "httpx":      patch("api.routes.analyze.httpx.AsyncClient"),
            "extract":    patch("api.routes.analyze.extract_pose", return_value=[fake_frame]),
            "score":      patch("api.routes.analyze.score_efficiency",
                                return_value=(73.5, [100.0, 73.5], {"hip_drops": 1, "barn_doors": 0, "foot_swaps": 2, "shake_events": 0})),
            "moments":    patch("api.routes.analyze.detect_moments", return_value=fake_moments),
            "annotate":   patch("api.routes.analyze.annotate_clips", return_value=fake_clips),
            "upload":     patch("api.routes.analyze.upload_clips",
                                return_value={"full": "https://signed/full", "crux": "https://signed/crux"}),
            "feedback":   patch("api.routes.analyze.generate_feedback",
                                return_value="Your hips dropped on move 3. Try flagging earlier."),
            "settings":   patch("api.routes.analyze.get_settings",
                                return_value=MagicMock(tmp_dir=str(tmp_path))),
        }
        mocks = {k: p.start() for k, p in patches.items()}
        mocks["fake_db"] = fake_db

        # httpx mock: AsyncClient returns a response with content
        http_instance = AsyncMock()
        http_instance.__aenter__ = AsyncMock(return_value=http_instance)
        http_instance.__aexit__ = AsyncMock(return_value=False)
        http_instance.get.return_value = AsyncMock(content=b"fake-video", raise_for_status=MagicMock())
        mocks["httpx"].return_value = http_instance

        yield mocks

        for p in patches.values():
            p.stop()

    @pytest.mark.asyncio
    async def test_run_analysis_marks_job_complete(self, mock_db, mock_pipeline):
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", "session-001")

        update_calls = db.table.return_value.update.call_args_list
        statuses = [c.args[0].get("status") for c in update_calls if "status" in c.args[0]]
        assert "processing" in statuses
        assert "complete" in statuses

    @pytest.mark.asyncio
    async def test_run_analysis_stores_result_fields(self, mock_db, mock_pipeline):
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        update_calls = db.table.return_value.update.call_args_list
        complete_call = next(c for c in update_calls if c.args[0].get("status") == "complete")
        result = complete_call.args[0]["result"]

        assert result["efficiency_score"] == 73.5
        assert "feedback_text" in result
        assert "clips" in result
        assert "events" in result
        assert "processed_at" in result

    @pytest.mark.asyncio
    async def test_run_analysis_includes_skeleton_frames(self, mock_db, mock_pipeline):
        """Ghost Mode: result must contain skeleton_frames list."""
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        update_calls = db.table.return_value.update.call_args_list
        complete_call = next(c for c in update_calls if c.args[0].get("status") == "complete")
        result = complete_call.args[0]["result"]

        assert "skeleton_frames" in result
        assert isinstance(result["skeleton_frames"], list)
        assert len(result["skeleton_frames"]) >= 1

    @pytest.mark.asyncio
    async def test_skeleton_frames_structure(self, mock_db, mock_pipeline):
        """Each skeleton frame must have 't' (float) and 'pts' (13 [x,y] pairs)."""
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        update_calls = db.table.return_value.update.call_args_list
        complete_call = next(c for c in update_calls if c.args[0].get("status") == "complete")
        frame = complete_call.args[0]["result"]["skeleton_frames"][0]

        assert "t" in frame
        assert isinstance(frame["t"], float)
        assert "pts" in frame
        assert len(frame["pts"]) == 13
        for pt in frame["pts"]:
            assert len(pt) == 2
            x, y = pt
            assert 0.0 <= x <= 1.0, f"x={x} out of normalized range"
            assert 0.0 <= y <= 1.0, f"y={y} out of normalized range"

    @pytest.mark.asyncio
    async def test_skeleton_frames_sorted_by_timestamp(self, mock_db, mock_pipeline):
        """Skeleton frames must be in chronological order."""
        from api.models.pose import FrameLandmarks, Landmark
        multi_frame = [
            FrameLandmarks(
                frame_index=i * 3,
                timestamp_sec=round(i * 0.1, 3),
                landmarks=[Landmark(x=0.5, y=0.5, z=0.0, visibility=0.9)] * 33,
            )
            for i in range(5)
        ]
        mock_pipeline["extract"].return_value = multi_frame

        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        update_calls = db.table.return_value.update.call_args_list
        complete_call = next(c for c in update_calls if c.args[0].get("status") == "complete")
        frames = complete_call.args[0]["result"]["skeleton_frames"]

        timestamps = [f["t"] for f in frames]
        assert timestamps == sorted(timestamps)

    @pytest.mark.asyncio
    async def test_result_includes_fatigue_field(self, mock_db, mock_pipeline):
        """Fatigue detection result must always be present in result (even if None)."""
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        update_calls = db.table.return_value.update.call_args_list
        complete_call = next(c for c in update_calls if c.args[0].get("status") == "complete")
        result = complete_call.args[0]["result"]

        assert "fatigue" in result

    @pytest.mark.asyncio
    async def test_run_analysis_updates_session_score(self, mock_db, mock_pipeline):
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", "session-abc")

        sessions_calls = [c for c in db.table.call_args_list if c.args[0] == "sessions"]
        assert len(sessions_calls) >= 1

    @pytest.mark.asyncio
    async def test_run_analysis_marks_failed_on_error(self, mock_db, mock_pipeline):
        db = mock_pipeline["fake_db"]
        mock_pipeline["extract"].side_effect = RuntimeError("MediaPipe failed")
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        update_calls = db.table.return_value.update.call_args_list
        statuses = [c.args[0].get("status") for c in update_calls if "status" in c.args[0]]
        assert "failed" in statuses

    @pytest.mark.asyncio
    async def test_run_analysis_no_session_id_skips_session_update(self, mock_db, mock_pipeline):
        db = mock_pipeline["fake_db"]
        from api.routes.analyze import run_analysis
        await run_analysis("job-001", "https://signed/video.mp4", "user-001", None)

        sessions_calls = [c for c in db.table.call_args_list if c.args[0] == "sessions"]
        assert len(sessions_calls) == 0
