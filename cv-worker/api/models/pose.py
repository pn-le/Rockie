from pydantic import BaseModel
from typing import Optional


class Landmark(BaseModel):
    x: float  # normalized 0-1
    y: float  # normalized 0-1
    z: float  # depth relative to hips
    visibility: float  # 0-1 confidence


class FrameLandmarks(BaseModel):
    frame_index: int
    timestamp_sec: float
    landmarks: list[Landmark]  # 33 MediaPipe Pose keypoints


# MediaPipe Pose keypoint indices (subset used for climbing analysis)
class PoseIndex:
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32
