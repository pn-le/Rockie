from pydantic import BaseModel
from typing import Optional


class AnalyzeRequest(BaseModel):
    job_id: str
    video_url: str
    user_id: str
    session_id: Optional[str] = None


class MomentClips(BaseModel):
    full: str
    crux: str
    best_sequence: str
    fall: Optional[str] = None


class EventCounts(BaseModel):
    hip_drops: int = 0
    barn_doors: int = 0
    foot_swaps: int = 0
    shake_events: int = 0


class AnalysisResult(BaseModel):
    efficiency_score: float
    feedback_text: str
    clips: MomentClips
    events: EventCounts


class AnalyzeResponse(BaseModel):
    job_id: str
    status: str
