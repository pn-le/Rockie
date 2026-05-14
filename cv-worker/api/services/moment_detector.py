import structlog
from api.models.pose import FrameLandmarks
from api.models.moments import Moments

logger = structlog.get_logger()

# Window size for sustained moment detection (frames at ~10fps sampled)
MOMENT_WINDOW = 8       # ~0.8 seconds of sustained movement
MIN_FALL_DROP = 30.0    # score must drop this much suddenly to count as a fall


def _window_avg(timeline: list[float], start: int, size: int) -> float:
    window = timeline[start: start + size]
    return sum(window) / len(window) if window else 0.0


def _find_crux(timeline: list[float], window: int) -> int:
    """Index of the start of the lowest-scoring sustained window."""
    if len(timeline) <= window:
        return timeline.index(min(timeline))
    worst_avg = float("inf")
    worst_idx = 0
    for i in range(len(timeline) - window + 1):
        avg = _window_avg(timeline, i, window)
        if avg < worst_avg:
            worst_avg = avg
            worst_idx = i
    return worst_idx


def _find_best(timeline: list[float], window: int, exclude_start: int, exclude_end: int) -> int:
    """Index of the start of the best sustained window, avoiding the crux region."""
    if len(timeline) <= window:
        return timeline.index(max(timeline))
    best_avg = -1.0
    best_idx = 0
    for i in range(len(timeline) - window + 1):
        # Skip if this window overlaps the crux
        if i < exclude_end and (i + window) > exclude_start:
            continue
        avg = _window_avg(timeline, i, window)
        if avg > best_avg:
            best_avg = avg
            best_idx = i
    return best_idx


def _find_fall(frames: list[FrameLandmarks], timeline: list[float]) -> int | None:
    """
    Detect a fall: pose disappears (frame count gap) or score drops sharply.
    Returns the frame index where the fall begins, or None.
    """
    # Gap detection: if sampled frame indices jump by more than expected, pose was lost
    for i in range(1, len(frames)):
        expected_gap = frames[i].frame_index - frames[i - 1].frame_index
        if expected_gap > 6:  # more than 2x the sample rate = frames dropped = fall/off-wall
            return i - 1

    # Score drop detection: sudden large drop over 2 frames
    for i in range(2, len(timeline)):
        drop = timeline[i - 2] - timeline[i]
        if drop >= MIN_FALL_DROP:
            return i - 2

    return None


def detect_moments(frames: list[FrameLandmarks], timeline: list[float]) -> Moments:
    """
    Identify key moments in a climbing sequence.

    Args:
        frames:   pose landmark frames from extract_pose
        timeline: per-frame score from score_efficiency

    Returns:
        Moments with crux, best_sequence, and optional fall timestamps
    """
    if not frames or not timeline:
        raise ValueError("frames and timeline must be non-empty")
    if len(frames) != len(timeline):
        raise ValueError(f"frames ({len(frames)}) and timeline ({len(timeline)}) must be the same length")

    window = min(MOMENT_WINDOW, len(timeline))

    crux_idx = _find_crux(timeline, window)
    crux_ts = frames[crux_idx].timestamp_sec

    best_idx = _find_best(timeline, window, crux_idx, crux_idx + window)
    best_ts = frames[best_idx].timestamp_sec

    fall_idx = _find_fall(frames, timeline)
    fall_ts = frames[fall_idx].timestamp_sec if fall_idx is not None else None

    logger.info(
        "moment_detection.complete",
        crux_sec=crux_ts,
        best_sec=best_ts,
        fall_sec=fall_ts,
    )

    return Moments(
        crux_timestamp_sec=crux_ts,
        best_timestamp_sec=best_ts,
        fall_timestamp_sec=fall_ts,
    )
