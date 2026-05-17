import structlog
from datetime import datetime, timezone, timedelta
from supabase import Client

logger = structlog.get_logger()

SESSION_WINDOW_HOURS = 4
MIN_CLIMBS_FOR_DETECTION = 4
FATIGUE_DROP_THRESHOLD = 0.85  # rolling avg must be < 85% of session peak
ROLLING_WINDOW = 3


def detect_fatigue(db: Client, user_id: str, current_score: float) -> dict | None:
    """
    Detect fatigue by comparing rolling average efficiency to session peak.

    Queries the user's completed jobs in the last SESSION_WINDOW_HOURS,
    appends the current score, and checks if the rolling average has
    dropped below FATIGUE_DROP_THRESHOLD × session_peak.

    Returns a fatigue info dict if detected, None otherwise.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=SESSION_WINDOW_HOURS)).isoformat()

    result = (
        db.table("analysis_jobs")
        .select("result")
        .eq("user_id", user_id)
        .eq("status", "complete")
        .gte("created_at", cutoff)
        .order("created_at", desc=False)
        .limit(20)
        .execute()
    )

    scores: list[float] = []
    for job in result.data or []:
        r = job.get("result") or {}
        if r.get("efficiency_score") is not None:
            scores.append(float(r["efficiency_score"]))

    scores.append(current_score)

    if len(scores) < MIN_CLIMBS_FOR_DETECTION:
        return None

    session_peak = max(scores)
    rolling_avg = sum(scores[-ROLLING_WINDOW:]) / ROLLING_WINDOW
    fatigue_threshold = session_peak * FATIGUE_DROP_THRESHOLD

    if rolling_avg < fatigue_threshold:
        drop_pct = round((session_peak - rolling_avg) / session_peak * 100)
        fatigue_info = {
            "detected": True,
            "session_peak": round(session_peak, 1),
            "rolling_avg": round(rolling_avg, 1),
            "drop_pct": drop_pct,
            "climb_count": len(scores),
        }
        logger.info("fatigue.detected", user_id=user_id, **fatigue_info)
        return fatigue_info

    return None
