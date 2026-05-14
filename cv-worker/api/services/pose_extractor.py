import os
import structlog
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from api.models.pose import FrameLandmarks, Landmark

logger = structlog.get_logger()

FRAME_SAMPLE_RATE = 3
MIN_VISIBILITY = 0.6
LANDMARK_COUNT = 33

_DEFAULT_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "models", "pose_landmarker.task"
)


def extract_pose(video_path: str, model_path: str = _DEFAULT_MODEL_PATH) -> list[FrameLandmarks]:
    """
    Extract pose landmarks from a climbing video using the MediaPipe Tasks API.

    Returns a list of FrameLandmarks for sampled frames that meet the
    visibility threshold. Raises ValueError if video can't be opened,
    RuntimeError if no valid poses are detected.
    """
    log = logger.bind(video_path=video_path)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    log.info("pose_extraction.started", fps=fps, total_frames=total_frames)

    results: list[FrameLandmarks] = []
    frame_index = 0

    base_options = mp_python.BaseOptions(model_asset_path=model_path)
    options = mp_vision.PoseLandmarkerOptions(
        base_options=base_options,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=False,
    )

    try:
        with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_index % FRAME_SAMPLE_RATE != 0:
                    frame_index += 1
                    continue

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                detection = landmarker.detect(mp_image)

                if detection.pose_landmarks:
                    lms = detection.pose_landmarks[0]
                    avg_visibility = sum(lm.visibility for lm in lms) / LANDMARK_COUNT

                    if avg_visibility >= MIN_VISIBILITY:
                        results.append(FrameLandmarks(
                            frame_index=frame_index,
                            timestamp_sec=round(frame_index / fps, 3),
                            landmarks=[
                                Landmark(x=lm.x, y=lm.y, z=lm.z, visibility=lm.visibility)
                                for lm in lms
                            ],
                        ))

                frame_index += 1

    finally:
        cap.release()

    log.info("pose_extraction.complete", valid_frames=len(results), sampled=frame_index // FRAME_SAMPLE_RATE)

    if not results:
        raise RuntimeError("No valid pose frames detected — check video angle and lighting")

    return results
