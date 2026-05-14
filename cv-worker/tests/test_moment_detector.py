import pytest
from api.models.pose import FrameLandmarks, Landmark
from api.models.moments import Moments
from api.services.moment_detector import (
    detect_moments,
    MOMENT_WINDOW,
    MIN_FALL_DROP,
    _find_crux,
    _find_best,
    _find_fall,
)


def _make_frame(frame_index: int, fps: float = 10.0) -> FrameLandmarks:
    lm = Landmark(x=0.5, y=0.5, z=0.0, visibility=0.9)
    return FrameLandmarks(
        frame_index=frame_index,
        timestamp_sec=round(frame_index / fps, 3),
        landmarks=[lm] * 33,
    )


def _sequential_frames(n: int, fps: float = 10.0) -> list[FrameLandmarks]:
    """Frames with consecutive frame_index values (no gaps)."""
    return [_make_frame(i * 3, fps) for i in range(n)]  # sample every 3rd = 10fps


class TestFindCrux:
    def test_finds_lowest_window(self):
        # Low scores in the middle
        timeline = [90.0] * 5 + [50.0] * MOMENT_WINDOW + [90.0] * 5
        idx = _find_crux(timeline, MOMENT_WINDOW)
        assert idx == 5  # starts at the low region

    def test_single_frame_timeline(self):
        idx = _find_crux([42.0], 1)
        assert idx == 0

    def test_all_equal_scores(self):
        idx = _find_crux([80.0] * 20, MOMENT_WINDOW)
        assert 0 <= idx <= 20 - MOMENT_WINDOW


class TestFindBest:
    def test_finds_highest_window_outside_crux(self):
        # High scores at start, crux in middle, mediocre at end
        timeline = [95.0] * 8 + [40.0] * MOMENT_WINDOW + [70.0] * 8
        crux_start = 8
        crux_end = 8 + MOMENT_WINDOW
        idx = _find_best(timeline, MOMENT_WINDOW, crux_start, crux_end)
        assert idx == 0  # best is at the start

    def test_excludes_crux_region(self):
        # Need at least MOMENT_WINDOW frames on each side of the crux for a valid non-overlapping window
        pad = MOMENT_WINDOW
        timeline = [60.0] * pad + [100.0] * MOMENT_WINDOW + [60.0] * pad
        crux_start = pad
        crux_end = pad + MOMENT_WINDOW
        idx = _find_best(timeline, MOMENT_WINDOW, crux_start, crux_end)
        # Returned window must not overlap the crux region
        assert not (idx < crux_end and idx + MOMENT_WINDOW > crux_start)


class TestFindFall:
    def test_no_fall_in_clean_sequence(self):
        frames = _sequential_frames(20)
        timeline = [100.0] * 20
        result = _find_fall(frames, timeline)
        assert result is None

    def test_detects_frame_gap(self):
        frames = _sequential_frames(10)
        # Introduce a large gap between frames 4 and 5
        frames[5] = FrameLandmarks(
            frame_index=frames[4].frame_index + 30,  # 30-frame gap = pose lost
            timestamp_sec=frames[4].timestamp_sec + 3.0,
            landmarks=[Landmark(x=0.5, y=0.5, z=0.0, visibility=0.9)] * 33,
        )
        timeline = [100.0] * 10
        result = _find_fall(frames, timeline)
        assert result == 4  # fall starts at frame before the gap

    def test_detects_score_drop(self):
        frames = _sequential_frames(20)
        timeline = [100.0] * 8 + [100.0 - MIN_FALL_DROP - 5] * 12  # big drop
        result = _find_fall(frames, timeline)
        assert result is not None
        assert result <= 8


class TestDetectMoments:
    def test_raises_on_empty_inputs(self):
        with pytest.raises(ValueError):
            detect_moments([], [])

    def test_raises_on_mismatched_lengths(self):
        frames = _sequential_frames(5)
        with pytest.raises(ValueError, match="same length"):
            detect_moments(frames, [100.0] * 3)

    def test_returns_moments_model(self):
        frames = _sequential_frames(20)
        timeline = [90.0] * 5 + [50.0] * MOMENT_WINDOW + [90.0] * 7
        result = detect_moments(frames, timeline)
        assert isinstance(result, Moments)

    def test_crux_timestamp_is_at_low_region(self):
        frames = _sequential_frames(20)
        # Low scores from frame 6 onward
        timeline = [95.0] * 5 + [40.0] * 15
        result = detect_moments(frames, timeline)
        # Crux should be in the second half
        assert result.crux_timestamp_sec >= frames[5].timestamp_sec

    def test_best_timestamp_is_at_high_region(self):
        frames = _sequential_frames(20)
        # High at start, bad in middle, mediocre at end
        timeline = [99.0] * 5 + [30.0] * MOMENT_WINDOW + [60.0] * 7
        result = detect_moments(frames, timeline)
        assert result.best_timestamp_sec <= frames[5].timestamp_sec

    def test_fall_is_none_for_clean_sequence(self):
        frames = _sequential_frames(20)
        timeline = [85.0] * 10 + [70.0] * 10
        result = detect_moments(frames, timeline)
        assert result.fall_timestamp_sec is None

    def test_fall_detected_on_gap(self):
        frames = _sequential_frames(15)
        frames[8] = FrameLandmarks(
            frame_index=frames[7].frame_index + 40,
            timestamp_sec=frames[7].timestamp_sec + 4.0,
            landmarks=[Landmark(x=0.5, y=0.5, z=0.0, visibility=0.9)] * 33,
        )
        timeline = [90.0] * 15
        result = detect_moments(frames, timeline)
        assert result.fall_timestamp_sec is not None

    def test_all_timestamps_within_clip_bounds(self):
        frames = _sequential_frames(25)
        timeline = [95.0] * 8 + [40.0] * MOMENT_WINDOW + [75.0] * 9
        result = detect_moments(frames, timeline)
        clip_start = frames[0].timestamp_sec
        clip_end = frames[-1].timestamp_sec
        assert clip_start <= result.crux_timestamp_sec <= clip_end
        assert clip_start <= result.best_timestamp_sec <= clip_end
