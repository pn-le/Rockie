import os
import cv2
import structlog
from api.models.pose import FrameLandmarks, PoseIndex
from api.models.moments import Moments

logger = structlog.get_logger()

CLIP_DURATION_SEC = 8.0    # seconds each moment clip spans
MAX_WIDTH = 1280
MAX_HEIGHT = 720
FOURCC = cv2.VideoWriter_fourcc(*"mp4v")

# Skeleton connections to draw (MediaPipe Pose subset relevant to climbing)
SKELETON_EDGES = [
    # Torso
    (PoseIndex.LEFT_SHOULDER,  PoseIndex.RIGHT_SHOULDER),
    (PoseIndex.LEFT_SHOULDER,  PoseIndex.LEFT_HIP),
    (PoseIndex.RIGHT_SHOULDER, PoseIndex.RIGHT_HIP),
    (PoseIndex.LEFT_HIP,       PoseIndex.RIGHT_HIP),
    # Arms
    (PoseIndex.LEFT_SHOULDER,  PoseIndex.LEFT_ELBOW),
    (PoseIndex.LEFT_ELBOW,     PoseIndex.LEFT_WRIST),
    (PoseIndex.RIGHT_SHOULDER, PoseIndex.RIGHT_ELBOW),
    (PoseIndex.RIGHT_ELBOW,    PoseIndex.RIGHT_WRIST),
    # Legs
    (PoseIndex.LEFT_HIP,       PoseIndex.LEFT_KNEE),
    (PoseIndex.LEFT_KNEE,      PoseIndex.LEFT_ANKLE),
    (PoseIndex.RIGHT_HIP,      PoseIndex.RIGHT_KNEE),
    (PoseIndex.RIGHT_KNEE,     PoseIndex.RIGHT_ANKLE),
    (PoseIndex.LEFT_ANKLE,     PoseIndex.LEFT_FOOT_INDEX),
    (PoseIndex.RIGHT_ANKLE,    PoseIndex.RIGHT_FOOT_INDEX),
]

# Rockie brand colours
COLOR_JOINT = (0, 255, 180)   # teal-green
COLOR_EDGE  = (255, 200, 0)   # amber
COLOR_TEXT  = (255, 255, 255)
COLOR_BAR_BG = (30, 30, 30)
COLOR_BAR_FG = (0, 220, 120)


def _resize_frame(frame, max_w: int, max_h: int):
    h, w = frame.shape[:2]
    if w <= max_w and h <= max_h:
        return frame
    scale = min(max_w / w, max_h / h)
    return cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _draw_skeleton(frame, landmarks: list, score: float | None = None):
    h, w = frame.shape[:2]

    # Draw edges
    for a, b in SKELETON_EDGES:
        lm_a, lm_b = landmarks[a], landmarks[b]
        if lm_a.visibility > 0.4 and lm_b.visibility > 0.4:
            pt_a = (int(lm_a.x * w), int(lm_a.y * h))
            pt_b = (int(lm_b.x * w), int(lm_b.y * h))
            cv2.line(frame, pt_a, pt_b, COLOR_EDGE, 2, cv2.LINE_AA)

    # Draw joints
    for lm in landmarks:
        if lm.visibility > 0.4:
            pt = (int(lm.x * w), int(lm.y * h))
            cv2.circle(frame, pt, 4, COLOR_JOINT, -1, cv2.LINE_AA)

    # Score HUD (bottom-left)
    if score is not None:
        bar_x, bar_y, bar_w, bar_h = 16, h - 40, 160, 20
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + bar_w, bar_y + bar_h), COLOR_BAR_BG, -1)
        fill_w = int(bar_w * max(0.0, min(1.0, score / 100.0)))
        cv2.rectangle(frame, (bar_x, bar_y), (bar_x + fill_w, bar_y + bar_h), COLOR_BAR_FG, -1)
        cv2.putText(frame, f"{score:.0f}/100", (bar_x + bar_w + 8, bar_y + 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_TEXT, 1, cv2.LINE_AA)

    return frame


def _build_frame_map(landmarks: list[FrameLandmarks]) -> dict[int, FrameLandmarks]:
    """Map video frame_index → nearest sampled FrameLandmarks."""
    return {f.frame_index: f for f in landmarks}


def _nearest_landmarks(frame_idx: int, frame_map: dict, sorted_keys: list) -> FrameLandmarks | None:
    if not sorted_keys:
        return None
    # Binary search for nearest
    lo, hi = 0, len(sorted_keys) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_keys[mid] < frame_idx:
            lo = mid + 1
        else:
            hi = mid
    # Compare lo and lo-1
    if lo > 0 and abs(sorted_keys[lo - 1] - frame_idx) < abs(sorted_keys[lo] - frame_idx):
        lo -= 1
    return frame_map[sorted_keys[lo]]


def _write_clip(
    cap: cv2.VideoCapture,
    out_path: str,
    start_frame: int,
    end_frame: int,
    fps: float,
    frame_map: dict,
    sorted_keys: list,
    score: float | None,
) -> str:
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    writer = None

    for _ in range(end_frame - start_frame):
        ret, frame = cap.read()
        if not ret:
            break

        frame = _resize_frame(frame, MAX_WIDTH, MAX_HEIGHT)
        h, w = frame.shape[:2]

        if writer is None:
            writer = cv2.VideoWriter(out_path, FOURCC, fps, (w, h))

        frame_idx = int(cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1
        nearest = _nearest_landmarks(frame_idx, frame_map, sorted_keys)
        if nearest:
            frame = _draw_skeleton(frame, nearest.landmarks, score)

        writer.write(frame)

    if writer:
        writer.release()

    return out_path


def annotate_clips(
    video_path: str,
    landmarks: list[FrameLandmarks],
    moments: Moments,
    job_id: str,
    tmp_dir: str,
    timeline: list[float] | None = None,
) -> dict[str, str]:
    """
    Produce annotated video clips for each key moment.

    Returns:
        dict with keys: full, crux, best_sequence, fall (optional)
        Values are local file paths.
    """
    log = logger.bind(job_id=job_id)
    os.makedirs(tmp_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    half_clip = int(CLIP_DURATION_SEC / 2 * fps)

    frame_map = _build_frame_map(landmarks)
    sorted_keys = sorted(frame_map.keys())

    # Overall score for HUD (final timeline value)
    overall_score = timeline[-1] if timeline else None

    def _clip_bounds(center_sec: float) -> tuple[int, int]:
        center = int(center_sec * fps)
        start = max(0, center - half_clip)
        end = min(total_frames, start + int(CLIP_DURATION_SEC * fps))
        return start, end

    paths: dict[str, str] = {}

    try:
        # Full annotated video
        full_path = os.path.join(tmp_dir, f"{job_id}_full.mp4")
        _write_clip(cap, full_path, 0, total_frames, fps, frame_map, sorted_keys, overall_score)
        paths["full"] = full_path
        log.info("clip.written", clip="full", path=full_path)

        # Crux clip
        crux_path = os.path.join(tmp_dir, f"{job_id}_crux.mp4")
        s, e = _clip_bounds(moments.crux_timestamp_sec)
        # Score at crux = lowest in that window
        crux_score = min(timeline[int(s / fps * 10): int(e / fps * 10) + 1]) if timeline else None
        _write_clip(cap, crux_path, s, e, fps, frame_map, sorted_keys, crux_score)
        paths["crux"] = crux_path
        log.info("clip.written", clip="crux", path=crux_path)

        # Best sequence clip
        best_path = os.path.join(tmp_dir, f"{job_id}_best.mp4")
        s, e = _clip_bounds(moments.best_timestamp_sec)
        _write_clip(cap, best_path, s, e, fps, frame_map, sorted_keys, overall_score)
        paths["best_sequence"] = best_path
        log.info("clip.written", clip="best", path=best_path)

        # Fall clip (optional)
        if moments.fall_timestamp_sec is not None:
            fall_path = os.path.join(tmp_dir, f"{job_id}_fall.mp4")
            s, e = _clip_bounds(moments.fall_timestamp_sec)
            _write_clip(cap, fall_path, s, e, fps, frame_map, sorted_keys, overall_score)
            paths["fall"] = fall_path
            log.info("clip.written", clip="fall", path=fall_path)

    finally:
        cap.release()

    return paths
