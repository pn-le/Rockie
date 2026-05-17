import os
import time
import datetime
import structlog
import httpx
from fastapi import APIRouter, BackgroundTasks
from ..models.analysis import AnalyzeRequest, AnalyzeResponse
from ..config import get_settings
from ..db import get_db
from ..services.pose_extractor import extract_pose
from ..services.efficiency_scorer import score_efficiency
from ..services.moment_detector import detect_moments
from ..services.clip_annotator import annotate_clips
from ..services.storage import upload_clips
from ..services.feedback_generator import generate_feedback
from ..services.fatigue_detector import detect_fatigue

logger = structlog.get_logger()
router = APIRouter()


async def run_analysis(job_id: str, video_url: str, user_id: str, session_id: str | None):
    db = get_db()
    log = logger.bind(job_id=job_id, user_id=user_id)
    settings = get_settings()

    video_path = os.path.join(settings.tmp_dir, f"{job_id}.mp4")
    clip_paths: dict[str, str] = {}

    try:
        db.table("analysis_jobs").update({"status": "processing"}).eq("id", job_id).execute()
        log.info("analysis.started")
        start = time.monotonic()

        # 1. Download video from Supabase Storage signed URL
        os.makedirs(settings.tmp_dir, exist_ok=True)
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(video_url)
            resp.raise_for_status()
        with open(video_path, "wb") as f:
            f.write(resp.content)
        log.info("analysis.downloaded", size_bytes=len(resp.content))

        # 2. CV pipeline
        landmarks = extract_pose(video_path)
        score, timeline, events = score_efficiency(landmarks)
        moments = detect_moments(frames=landmarks, timeline=timeline)
        clip_paths = annotate_clips(
            video_path=video_path,
            landmarks=landmarks,
            moments=moments,
            job_id=job_id,
            tmp_dir=settings.tmp_dir,
            timeline=timeline,
        )
        clip_urls = upload_clips(clip_paths, job_id)
        feedback = generate_feedback(score, events)
        fatigue = detect_fatigue(db, user_id, score)

        duration_ms = int((time.monotonic() - start) * 1000)
        log.info("analysis.complete", score=score, duration_ms=duration_ms)

        result = {
            "efficiency_score": score,
            "feedback_text": feedback,
            "clips": clip_urls,
            "events": events,
            "processed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "fatigue": fatigue,
        }

        db.table("analysis_jobs").update({
            "status": "complete",
            "result": result,
        }).eq("id", job_id).execute()

        if session_id:
            db.table("sessions").update(
                {"efficiency_score": score}
            ).eq("id", session_id).execute()

    except Exception as exc:
        log.error("analysis.failed", error=str(exc), exc_info=True)
        db.table("analysis_jobs").update({
            "status": "failed",
            "error": str(exc),
        }).eq("id", job_id).execute()

    finally:
        # Clean up all temp files (input video + exported clips)
        for path in [video_path, *clip_paths.values()]:
            try:
                os.remove(path)
            except OSError:
                pass


@router.post("/analyze", response_model=AnalyzeResponse, status_code=202)
async def analyze(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    logger.info("analyze.received", job_id=request.job_id, user_id=request.user_id)
    background_tasks.add_task(
        run_analysis,
        request.job_id,
        request.video_url,
        request.user_id,
        request.session_id,
    )
    return AnalyzeResponse(job_id=request.job_id, status="queued")
