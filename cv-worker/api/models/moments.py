from pydantic import BaseModel
from typing import Optional


class Moments(BaseModel):
    crux_timestamp_sec: float         # lowest scoring sustained window
    best_timestamp_sec: float         # highest scoring sustained window
    fall_timestamp_sec: Optional[float] = None  # where pose disappeared (if detected)
