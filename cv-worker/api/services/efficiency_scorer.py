import math
import structlog
from api.models.pose import FrameLandmarks, PoseIndex

logger = structlog.get_logger()

# Scoring deductions per event (points off 100)
DEDUCTION_HIP_DROP = 3
DEDUCTION_BARN_DOOR = 5
DEDUCTION_FOOT_SWAP = 2
DEDUCTION_SHAKE = 2

# Detection thresholds
HIP_DROP_THRESHOLD = 0.08       # hip y drops > 8% of body height between frames
BARN_DOOR_ANGLE_DEG = 25.0      # shoulder/hip line misalignment beyond 25°
FOOT_SWAP_THRESHOLD = 0.22      # one ankle moves > 22% body height while other is stable
SHAKE_VARIANCE_THRESHOLD = 4e-3 # wrist variance over 5-frame window (high = pumped arms)
SHAKE_WINDOW = 5

# Cooldowns (frames between repeated counts of the same event type)
FOOT_SWAP_COOLDOWN = 10   # ~1 second at 10fps sampled
SHAKE_COOLDOWN = 15       # ~1.5 seconds

# Max deduction per category — prevents any single event type from zeroing the score
MAX_DEDUCTION_HIP_DROP  = 15
MAX_DEDUCTION_BARN_DOOR = 15
MAX_DEDUCTION_FOOT_SWAP = 20
MAX_DEDUCTION_SHAKE     = 20


def _dist(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def _midpoint_y(a, b) -> float:
    return (a.y + b.y) / 2


def _body_height(lms) -> float:
    """Approximate body height: shoulder midpoint to ankle midpoint."""
    shoulder_y = _midpoint_y(lms[PoseIndex.LEFT_SHOULDER], lms[PoseIndex.RIGHT_SHOULDER])
    ankle_y = _midpoint_y(lms[PoseIndex.LEFT_ANKLE], lms[PoseIndex.RIGHT_ANKLE])
    return abs(ankle_y - shoulder_y) or 0.5  # fallback avoids division by zero


def _vec_angle_deg(ax, ay, bx, by) -> float:
    """Angle in degrees between two 2D vectors."""
    dot = ax * bx + ay * by
    mag_a = math.hypot(ax, ay)
    mag_b = math.hypot(bx, by)
    if mag_a < 1e-6 or mag_b < 1e-6:
        return 0.0
    cos_theta = max(-1.0, min(1.0, dot / (mag_a * mag_b)))
    return math.degrees(math.acos(cos_theta))


def _detect_hip_drop(prev_lms, curr_lms) -> bool:
    prev_hip_y = _midpoint_y(prev_lms[PoseIndex.LEFT_HIP], prev_lms[PoseIndex.RIGHT_HIP])
    curr_hip_y = _midpoint_y(curr_lms[PoseIndex.LEFT_HIP], curr_lms[PoseIndex.RIGHT_HIP])
    body_h = _body_height(curr_lms)
    # y increases downward — positive delta means hips dropped
    return (curr_hip_y - prev_hip_y) > HIP_DROP_THRESHOLD * body_h


def _detect_barn_door(lms) -> bool:
    """
    Barn door: shoulders and hips are misaligned (body rotating away from wall).
    Measured as angle between the shoulder line vector and the hip line vector.
    """
    ls, rs = lms[PoseIndex.LEFT_SHOULDER], lms[PoseIndex.RIGHT_SHOULDER]
    lh, rh = lms[PoseIndex.LEFT_HIP], lms[PoseIndex.RIGHT_HIP]
    shoulder_angle = _vec_angle_deg(rs.x - ls.x, rs.y - ls.y, 1, 0)
    hip_angle = _vec_angle_deg(rh.x - lh.x, rh.y - lh.y, 1, 0)
    return abs(shoulder_angle - hip_angle) > BARN_DOOR_ANGLE_DEG


def _detect_foot_swap(prev_lms, curr_lms) -> bool:
    """
    One foot moves a lot while the other stays — unnecessary repositioning.
    If BOTH feet move, it's an intentional whole-body move, not a swap.
    """
    body_h = _body_height(curr_lms)
    threshold = FOOT_SWAP_THRESHOLD * body_h
    left_moved = _dist(prev_lms[PoseIndex.LEFT_ANKLE], curr_lms[PoseIndex.LEFT_ANKLE]) > threshold
    right_moved = _dist(prev_lms[PoseIndex.RIGHT_ANKLE], curr_lms[PoseIndex.RIGHT_ANKLE]) > threshold
    return left_moved != right_moved  # XOR: exactly one foot moved significantly


def _variance(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return sum((v - mean) ** 2 for v in values) / len(values)


def _detect_shake(window: list[FrameLandmarks]) -> bool:
    """High wrist position variance over a short window = pumped/shaking arms."""
    lw_x = [f.landmarks[PoseIndex.LEFT_WRIST].x for f in window]
    lw_y = [f.landmarks[PoseIndex.LEFT_WRIST].y for f in window]
    rw_x = [f.landmarks[PoseIndex.RIGHT_WRIST].x for f in window]
    rw_y = [f.landmarks[PoseIndex.RIGHT_WRIST].y for f in window]
    return (
        _variance(lw_x) + _variance(lw_y) + _variance(rw_x) + _variance(rw_y)
    ) > SHAKE_VARIANCE_THRESHOLD


def score_efficiency(
    frames: list[FrameLandmarks],
) -> tuple[float, list[float], dict]:
    """
    Compute climbing efficiency score from pose landmark sequence.

    Returns:
        score      — float 0–100
        timeline   — per-frame score (same length as frames)
        events     — dict with counts: hip_drops, barn_doors, foot_swaps, shake_events
    """
    if not frames:
        raise ValueError("No frames to score")

    hip_drops = 0
    barn_doors = 0
    foot_swaps = 0
    shake_events = 0

    frame_events: list[int] = [0] * len(frames)

    last_foot_swap = -FOOT_SWAP_COOLDOWN
    last_shake = -SHAKE_COOLDOWN

    for i, frame in enumerate(frames):
        lms = frame.landmarks

        # Barn door — single-frame detection
        if _detect_barn_door(lms):
            barn_doors += 1
            frame_events[i] += DEDUCTION_BARN_DOOR

        if i > 0:
            prev_lms = frames[i - 1].landmarks

            if _detect_hip_drop(prev_lms, lms):
                hip_drops += 1
                frame_events[i] += DEDUCTION_HIP_DROP

            if _detect_foot_swap(prev_lms, lms) and (i - last_foot_swap) >= FOOT_SWAP_COOLDOWN:
                foot_swaps += 1
                last_foot_swap = i
                frame_events[i] += DEDUCTION_FOOT_SWAP

        if i >= SHAKE_WINDOW - 1 and (i - last_shake) >= SHAKE_COOLDOWN:
            window = frames[i - SHAKE_WINDOW + 1: i + 1]
            if _detect_shake(window):
                shake_events += 1
                last_shake = i
                frame_events[i] += DEDUCTION_SHAKE

    total_deductions = min(
        min(hip_drops * DEDUCTION_HIP_DROP,   MAX_DEDUCTION_HIP_DROP)
        + min(barn_doors * DEDUCTION_BARN_DOOR, MAX_DEDUCTION_BARN_DOOR)
        + min(foot_swaps * DEDUCTION_FOOT_SWAP, MAX_DEDUCTION_FOOT_SWAP)
        + min(shake_events * DEDUCTION_SHAKE,   MAX_DEDUCTION_SHAKE),
        70,  # absolute max deduction — score floor of 30 for any real climb
    )

    score = max(0.0, round(100.0 - total_deductions, 1))

    # Build timeline: running score from start
    timeline: list[float] = []
    running_deductions = 0
    for i in range(len(frames)):
        running_deductions += frame_events[i]
        timeline.append(max(0.0, round(100.0 - running_deductions, 1)))

    events = {
        "hip_drops": hip_drops,
        "barn_doors": barn_doors,
        "foot_swaps": foot_swaps,
        "shake_events": shake_events,
    }

    logger.info(
        "efficiency_scoring.complete",
        score=score,
        **events,
    )

    return score, timeline, events
