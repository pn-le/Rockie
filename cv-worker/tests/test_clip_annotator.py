import os
import pytest
from unittest.mock import patch, MagicMock, call
from api.models.pose import FrameLandmarks, Landmark, PoseIndex
from api.models.moments import Moments
from api.services.clip_annotator import (
    annotate_clips,
    _resize_frame,
    _draw_skeleton,
    _nearest_landmarks,
    _build_frame_map,
    CLIP_DURATION_SEC,
    MAX_WIDTH,
    MAX_HEIGHT,
)
import numpy as np


def _make_landmark(x=0.5, y=0.5, visibility=0.9) -> Landmark:
    return Landmark(x=x, y=y, z=0.0, visibility=visibility)


def _make_frame(frame_index: int) -> FrameLandmarks:
    return FrameLandmarks(
        frame_index=frame_index,
        timestamp_sec=frame_index / 30.0,
        landmarks=[_make_landmark() for _ in range(33)],
    )


def _make_moments(crux=5.0, best=1.0, fall=None) -> Moments:
    return Moments(crux_timestamp_sec=crux, best_timestamp_sec=best, fall_timestamp_sec=fall)


class TestResizeFrame:
    def test_no_resize_when_within_bounds(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        result = _resize_frame(frame, MAX_WIDTH, MAX_HEIGHT)
        assert result.shape == (480, 640, 3)

    def test_resizes_oversized_frame(self):
        frame = np.zeros((1440, 2560, 3), dtype=np.uint8)
        result = _resize_frame(frame, MAX_WIDTH, MAX_HEIGHT)
        h, w = result.shape[:2]
        assert w <= MAX_WIDTH
        assert h <= MAX_HEIGHT

    def test_preserves_aspect_ratio(self):
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        result = _resize_frame(frame, MAX_WIDTH, MAX_HEIGHT)
        orig_ratio = 1920 / 1080
        new_ratio = result.shape[1] / result.shape[0]
        assert abs(orig_ratio - new_ratio) < 0.01


class TestDrawSkeleton:
    def test_returns_frame(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        landmarks = [_make_landmark() for _ in range(33)]
        result = _draw_skeleton(frame, landmarks, score=75.0)
        assert result is frame  # modifies in-place

    def test_draws_without_error_on_low_visibility(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        landmarks = [_make_landmark(visibility=0.1) for _ in range(33)]  # all below threshold
        result = _draw_skeleton(frame, landmarks)
        assert result is not None

    def test_score_hud_drawn_when_score_provided(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        landmarks = [_make_landmark() for _ in range(33)]
        _draw_skeleton(frame, landmarks, score=85.0)
        # Check that pixels in the HUD region changed (bar was drawn)
        assert frame[frame.shape[0] - 40:, :200].any()


class TestNearestLandmarks:
    def test_finds_exact_match(self):
        frames = [_make_frame(0), _make_frame(3), _make_frame(6)]
        frame_map = _build_frame_map(frames)
        sorted_keys = sorted(frame_map.keys())
        result = _nearest_landmarks(3, frame_map, sorted_keys)
        assert result.frame_index == 3

    def test_finds_nearest_when_no_exact(self):
        frames = [_make_frame(0), _make_frame(3), _make_frame(6)]
        frame_map = _build_frame_map(frames)
        sorted_keys = sorted(frame_map.keys())
        result = _nearest_landmarks(4, frame_map, sorted_keys)
        assert result.frame_index == 3  # closer to 3 than 6

    def test_returns_none_for_empty(self):
        result = _nearest_landmarks(5, {}, [])
        assert result is None


class TestAnnotateClips:
    def _mock_cap(self, total_frames=300, fps=30.0):
        cap = MagicMock()
        cap.isOpened.return_value = True
        cap.get.side_effect = lambda prop: fps if prop == 5 else total_frames
        cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        return cap

    def test_raises_if_video_cannot_open(self, tmp_path):
        with patch("api.services.clip_annotator.cv2.VideoCapture") as mock_cap:
            mock_cap.return_value.isOpened.return_value = False
            with pytest.raises(ValueError, match="Cannot open video"):
                annotate_clips(
                    "bad.mp4",
                    [_make_frame(0)],
                    _make_moments(),
                    "job-001",
                    str(tmp_path),
                )

    def test_returns_required_clip_keys(self, tmp_path):
        frames = [_make_frame(i * 3) for i in range(100)]
        moments = _make_moments(crux=5.0, best=1.0, fall=None)

        with patch("api.services.clip_annotator.cv2.VideoCapture") as mock_cap, \
             patch("api.services.clip_annotator.cv2.VideoWriter") as mock_writer:
            mock_cap.return_value = self._mock_cap()
            mock_writer.return_value = MagicMock()

            paths = annotate_clips(frames[0].timestamp_sec.__class__ and "test.mp4",
                                   frames, moments, "job-001", str(tmp_path))

        assert "full" in paths
        assert "crux" in paths
        assert "best_sequence" in paths
        assert "fall" not in paths  # no fall moment

    def test_returns_fall_clip_when_fall_detected(self, tmp_path):
        frames = [_make_frame(i * 3) for i in range(100)]
        moments = _make_moments(crux=5.0, best=1.0, fall=8.0)

        with patch("api.services.clip_annotator.cv2.VideoCapture") as mock_cap, \
             patch("api.services.clip_annotator.cv2.VideoWriter") as mock_writer:
            mock_cap.return_value = self._mock_cap()
            mock_writer.return_value = MagicMock()

            paths = annotate_clips("test.mp4", frames, moments, "job-002", str(tmp_path))

        assert "fall" in paths

    def test_clip_paths_use_job_id(self, tmp_path):
        frames = [_make_frame(i * 3) for i in range(100)]
        moments = _make_moments()

        with patch("api.services.clip_annotator.cv2.VideoCapture") as mock_cap, \
             patch("api.services.clip_annotator.cv2.VideoWriter") as mock_writer:
            mock_cap.return_value = self._mock_cap()
            mock_writer.return_value = MagicMock()

            paths = annotate_clips("test.mp4", frames, moments, "my-job-xyz", str(tmp_path))

        for path in paths.values():
            assert "my-job-xyz" in path
