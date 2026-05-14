import pytest
from api.models.pose import FrameLandmarks, Landmark, PoseIndex
from api.services.efficiency_scorer import (
    score_efficiency,
    DEDUCTION_HIP_DROP,
    DEDUCTION_BARN_DOOR,
    DEDUCTION_FOOT_SWAP,
    DEDUCTION_SHAKE,
    SHAKE_WINDOW,
    HIP_DROP_THRESHOLD,
    BARN_DOOR_ANGLE_DEG,
)


def _make_landmark(x=0.5, y=0.5, z=0.0, visibility=0.9) -> Landmark:
    return Landmark(x=x, y=y, z=z, visibility=visibility)


def _make_frame(frame_index: int = 0, landmarks: list[Landmark] | None = None) -> FrameLandmarks:
    if landmarks is None:
        landmarks = [_make_landmark() for _ in range(33)]
    return FrameLandmarks(
        frame_index=frame_index,
        timestamp_sec=frame_index / 30.0,
        landmarks=landmarks,
    )


def _neutral_landmarks() -> list[Landmark]:
    """33 landmarks in a neutral standing pose — no events should fire."""
    lms = [_make_landmark() for _ in range(33)]
    # Shoulders at top, hips in middle, ankles at bottom — all horizontally aligned
    lms[PoseIndex.LEFT_SHOULDER]  = _make_landmark(x=0.4, y=0.2)
    lms[PoseIndex.RIGHT_SHOULDER] = _make_landmark(x=0.6, y=0.2)
    lms[PoseIndex.LEFT_HIP]       = _make_landmark(x=0.4, y=0.5)
    lms[PoseIndex.RIGHT_HIP]      = _make_landmark(x=0.6, y=0.5)
    lms[PoseIndex.LEFT_ANKLE]     = _make_landmark(x=0.4, y=0.9)
    lms[PoseIndex.RIGHT_ANKLE]    = _make_landmark(x=0.6, y=0.9)
    lms[PoseIndex.LEFT_WRIST]     = _make_landmark(x=0.3, y=0.3)
    lms[PoseIndex.RIGHT_WRIST]    = _make_landmark(x=0.7, y=0.3)
    lms[PoseIndex.LEFT_KNEE]      = _make_landmark(x=0.4, y=0.7)
    lms[PoseIndex.RIGHT_KNEE]     = _make_landmark(x=0.6, y=0.7)
    return lms


class TestScoreEfficiency:
    def test_raises_on_empty_frames(self):
        with pytest.raises(ValueError, match="No frames"):
            score_efficiency([])

    def test_perfect_score_for_neutral_pose(self):
        frames = [_make_frame(i, _neutral_landmarks()) for i in range(10)]
        score, timeline, events = score_efficiency(frames)
        assert score == 100.0
        assert all(s == 100.0 for s in timeline)
        assert events["hip_drops"] == 0
        assert events["barn_doors"] == 0
        assert events["foot_swaps"] == 0
        assert events["shake_events"] == 0

    def test_score_floor_is_zero(self):
        # Artificially create many events to drive score below 0
        frames = []
        for i in range(60):
            lms = _neutral_landmarks()
            # Big hip drop every frame
            lms[PoseIndex.LEFT_HIP]  = _make_landmark(x=0.4, y=0.5 + i * 0.05)
            lms[PoseIndex.RIGHT_HIP] = _make_landmark(x=0.6, y=0.5 + i * 0.05)
            frames.append(_make_frame(i, lms))
        score, _, _ = score_efficiency(frames)
        assert score >= 0.0

    def test_detects_hip_drop(self):
        frames = []
        # Frame 0: neutral hips
        lms0 = _neutral_landmarks()
        frames.append(_make_frame(0, lms0))

        # Frame 1: hips drop significantly (y increases a lot)
        lms1 = _neutral_landmarks()
        body_height = 0.9 - 0.2  # ankle_y - shoulder_y
        drop = HIP_DROP_THRESHOLD * body_height + 0.02  # just over threshold
        lms1[PoseIndex.LEFT_HIP]  = _make_landmark(x=0.4, y=0.5 + drop)
        lms1[PoseIndex.RIGHT_HIP] = _make_landmark(x=0.6, y=0.5 + drop)
        frames.append(_make_frame(1, lms1))

        score, _, events = score_efficiency(frames)
        assert events["hip_drops"] >= 1
        assert score == pytest.approx(100.0 - DEDUCTION_HIP_DROP, abs=1.0)

    def test_detects_barn_door(self):
        lms = _neutral_landmarks()
        # Rotate shoulders dramatically while hips stay level
        # shoulders: one much higher than the other → large angle vs horizontal
        lms[PoseIndex.LEFT_SHOULDER]  = _make_landmark(x=0.3, y=0.1)
        lms[PoseIndex.RIGHT_SHOULDER] = _make_landmark(x=0.7, y=0.5)  # big tilt
        # hips stay horizontal
        lms[PoseIndex.LEFT_HIP]  = _make_landmark(x=0.4, y=0.5)
        lms[PoseIndex.RIGHT_HIP] = _make_landmark(x=0.6, y=0.5)

        frames = [_make_frame(0, lms)]
        _, _, events = score_efficiency(frames)
        assert events["barn_doors"] >= 1

    def test_detects_foot_swap(self):
        lms0 = _neutral_landmarks()
        frames = [_make_frame(0, lms0)]

        # Only left ankle moves a lot; right stays — XOR triggers swap detection
        lms1 = _neutral_landmarks()
        lms1[PoseIndex.LEFT_ANKLE] = _make_landmark(x=0.4, y=0.3)  # moved up ~40% body height
        # right ankle unchanged at y=0.9
        frames.append(_make_frame(1, lms1))

        _, _, events = score_efficiency(frames)
        assert events["foot_swaps"] >= 1

    def test_no_foot_swap_when_both_feet_move(self):
        """Both feet moving = whole-body intentional move, not a swap."""
        lms0 = _neutral_landmarks()
        frames = [_make_frame(0, lms0)]

        lms1 = _neutral_landmarks()
        lms1[PoseIndex.LEFT_ANKLE]  = _make_landmark(x=0.4, y=0.3)
        lms1[PoseIndex.RIGHT_ANKLE] = _make_landmark(x=0.6, y=0.3)
        frames.append(_make_frame(1, lms1))

        _, _, events = score_efficiency(frames)
        assert events["foot_swaps"] == 0

    def test_detects_shake(self):
        frames = []
        # Create SHAKE_WINDOW frames with highly variable wrist positions
        for i in range(SHAKE_WINDOW):
            lms = _neutral_landmarks()
            # Alternate wrists left/right wildly
            offset = 0.3 if i % 2 == 0 else -0.3
            lms[PoseIndex.LEFT_WRIST]  = _make_landmark(x=0.3 + offset, y=0.3)
            lms[PoseIndex.RIGHT_WRIST] = _make_landmark(x=0.7 - offset, y=0.3)
            frames.append(_make_frame(i, lms))

        _, _, events = score_efficiency(frames)
        assert events["shake_events"] >= 1

    def test_timeline_length_matches_frames(self):
        frames = [_make_frame(i, _neutral_landmarks()) for i in range(15)]
        score, timeline, _ = score_efficiency(frames)
        assert len(timeline) == len(frames)

    def test_timeline_is_non_increasing(self):
        """Score can only stay flat or decrease over time — never increases."""
        frames = []
        for i in range(20):
            lms = _neutral_landmarks()
            if i % 3 == 0:
                # inject hip drop
                lms[PoseIndex.LEFT_HIP]  = _make_landmark(x=0.4, y=0.7)
                lms[PoseIndex.RIGHT_HIP] = _make_landmark(x=0.6, y=0.7)
            frames.append(_make_frame(i, lms))

        _, timeline, _ = score_efficiency(frames)
        for i in range(1, len(timeline)):
            assert timeline[i] <= timeline[i - 1]

    def test_score_matches_expected_deductions(self):
        """One of each event type should produce the expected total deduction."""
        frames = []

        # Frame 0: neutral
        frames.append(_make_frame(0, _neutral_landmarks()))

        # Frame 1: hip drop
        lms1 = _neutral_landmarks()
        body_h = 0.9 - 0.2
        lms1[PoseIndex.LEFT_HIP]  = _make_landmark(x=0.4, y=0.5 + HIP_DROP_THRESHOLD * body_h + 0.02)
        lms1[PoseIndex.RIGHT_HIP] = _make_landmark(x=0.6, y=0.5 + HIP_DROP_THRESHOLD * body_h + 0.02)
        frames.append(_make_frame(1, lms1))

        score, _, events = score_efficiency(frames)
        expected = 100.0 - (
            events["hip_drops"] * DEDUCTION_HIP_DROP
            + events["barn_doors"] * DEDUCTION_BARN_DOOR
            + events["foot_swaps"] * DEDUCTION_FOOT_SWAP
            + events["shake_events"] * DEDUCTION_SHAKE
        )
        assert score == pytest.approx(max(0.0, expected), abs=0.1)
