import pytest
from unittest.mock import patch, MagicMock, call
from api.models.pose import FrameLandmarks, Landmark
from api.services.pose_extractor import extract_pose, FRAME_SAMPLE_RATE, MIN_VISIBILITY, LANDMARK_COUNT

_CV2_CAP = "api.services.pose_extractor.cv2.VideoCapture"
_CV2_CVT = "api.services.pose_extractor.cv2.cvtColor"
_LANDMARKER = "api.services.pose_extractor.mp_vision.PoseLandmarker"
_MP_IMAGE = "api.services.pose_extractor.mp.Image"


def _make_landmark(visibility: float = 0.9) -> MagicMock:
    lm = MagicMock()
    lm.x, lm.y, lm.z, lm.visibility = 0.5, 0.5, 0.0, visibility
    return lm


def _make_detection(avg_visibility: float = 0.9) -> MagicMock:
    detection = MagicMock()
    lms = [_make_landmark(avg_visibility) for _ in range(LANDMARK_COUNT)]
    detection.pose_landmarks = [lms]
    return detection


def _make_empty_detection() -> MagicMock:
    detection = MagicMock()
    detection.pose_landmarks = []
    return detection


def _mock_video_capture(num_frames: int, fps: float = 30.0) -> MagicMock:
    import cv2
    cap = MagicMock()
    cap.isOpened.return_value = True
    cap.get.side_effect = lambda prop: fps if prop == cv2.CAP_PROP_FPS else num_frames
    frames = [(True, MagicMock()) for _ in range(num_frames)] + [(False, None)]
    cap.read.side_effect = frames
    return cap


def _make_landmarker_mock(detections: list) -> MagicMock:
    """Returns a mock PoseLandmarker class usable as a context manager."""
    instance = MagicMock()
    instance.detect.side_effect = detections
    cls = MagicMock()
    cls.create_from_options.return_value.__enter__ = MagicMock(return_value=instance)
    cls.create_from_options.return_value.__exit__ = MagicMock(return_value=False)
    return cls


class TestExtractPose:
    def test_raises_if_video_cannot_open(self, tmp_path):
        with patch(_CV2_CAP) as mock_cap:
            mock_cap.return_value.isOpened.return_value = False
            with pytest.raises(ValueError, match="Cannot open video"):
                extract_pose(str(tmp_path / "bad.mp4"))

    def test_raises_if_no_valid_frames_detected(self, tmp_path):
        detections = [_make_empty_detection()] * 10
        landmarker_cls = _make_landmarker_mock(detections)

        with patch(_CV2_CAP) as mock_cap, \
             patch(_LANDMARKER, landmarker_cls), \
             patch(_CV2_CVT, return_value=MagicMock()), \
             patch(_MP_IMAGE):
            mock_cap.return_value = _mock_video_capture(num_frames=30)
            with pytest.raises(RuntimeError, match="No valid pose frames"):
                extract_pose(str(tmp_path / "dark.mp4"))

    def test_samples_every_nth_frame(self, tmp_path):
        num_frames = 30
        detections = [_make_detection(0.9)] * (num_frames // FRAME_SAMPLE_RATE)
        landmarker_cls = _make_landmarker_mock(detections)

        with patch(_CV2_CAP) as mock_cap, \
             patch(_LANDMARKER, landmarker_cls), \
             patch(_CV2_CVT, return_value=MagicMock()), \
             patch(_MP_IMAGE):
            mock_cap.return_value = _mock_video_capture(num_frames=num_frames)
            results = extract_pose(str(tmp_path / "climb.mp4"))

        assert len(results) == num_frames // FRAME_SAMPLE_RATE

    def test_skips_low_confidence_frames(self, tmp_path):
        detections = [
            _make_detection(0.9),
            _make_detection(MIN_VISIBILITY - 0.01),
            _make_detection(0.9),
        ]
        landmarker_cls = _make_landmarker_mock(detections)

        with patch(_CV2_CAP) as mock_cap, \
             patch(_LANDMARKER, landmarker_cls), \
             patch(_CV2_CVT, return_value=MagicMock()), \
             patch(_MP_IMAGE):
            mock_cap.return_value = _mock_video_capture(num_frames=9)
            results = extract_pose(str(tmp_path / "low.mp4"))

        assert len(results) == 2

    def test_returns_correct_landmark_structure(self, tmp_path):
        detections = [_make_detection(0.9)]
        landmarker_cls = _make_landmarker_mock(detections)

        with patch(_CV2_CAP) as mock_cap, \
             patch(_LANDMARKER, landmarker_cls), \
             patch(_CV2_CVT, return_value=MagicMock()), \
             patch(_MP_IMAGE):
            mock_cap.return_value = _mock_video_capture(num_frames=3)
            results = extract_pose(str(tmp_path / "climb.mp4"))

        assert len(results) == 1
        frame = results[0]
        assert isinstance(frame, FrameLandmarks)
        assert frame.frame_index == 0
        assert frame.timestamp_sec >= 0
        assert len(frame.landmarks) == LANDMARK_COUNT
        assert isinstance(frame.landmarks[0], Landmark)
        assert 0.0 <= frame.landmarks[0].visibility <= 1.0

    def test_timestamps_match_fps(self, tmp_path):
        fps = 30.0
        detections = [_make_detection(0.9)] * 2
        landmarker_cls = _make_landmarker_mock(detections)

        with patch(_CV2_CAP) as mock_cap, \
             patch(_LANDMARKER, landmarker_cls), \
             patch(_CV2_CVT, return_value=MagicMock()), \
             patch(_MP_IMAGE):
            mock_cap.return_value = _mock_video_capture(num_frames=6, fps=fps)
            results = extract_pose(str(tmp_path / "climb.mp4"))

        assert results[0].timestamp_sec == 0.0
        assert results[1].timestamp_sec == pytest.approx(3 / fps, abs=0.001)
