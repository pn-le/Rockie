import structlog
from fastapi import APIRouter, BackgroundTasks
from ..models.analysis import AnalyzeRequest, AnalyzeResponse
from ..db import get_db

logger = structlog.get_logger()
router = APIRouter()


async def run_analysis(job_id: str, video_url: str, user_id: str, session_id: str | None):
    db = get_db()
    log = logger.bind(job_id=job_id, user_id=user_id)

    try:
        # Import here to avoid circular deps and allow mocking in tests
        from ..services.pose_extractor import extract_pose
        from ..services.efficiency_scorer import score_efficiency
        from ..services.moment_detector import detect_moments
        from ..services.clip_annotator import annotate_clips
        from ..services.storage import upload_clips
        from ..services.feedback_generator import generate_feedback
        import os, time, httpx

        db.table("analysis_jobs").update({"status": "processing"}).eq("id", job_id).execute()
        log.info("analysis.started")
        start = time.monotonic()

        # Download video
        from ..config import get_settings
        settings = get_settings()
        os.makedirs(settings.tmp_dir, exist_ok=True)
        video_path = f"{settings.tmp_dir}/{job_id}.mp4"

        async with httpx.AsyncClient() as client:
            resp = await client.get(video_url)
            resp.raise_for_status()
            with open(video_path, "wb") as f:
                f.write(resp.content)

        # CV pipeline
        landmarks = extract_pose(video_path)
        score, timeline, events = score_efficiency(landmarks)
        moments = detect_moments(timeline)
        clip_paths = annotate_clips(video_path, landmarks, moments, job_id, settings.tmp_dir)
        clip_urls = upload_clips(clip_paths, job_id)
        feedback = generate_feedback(score, events)

        duration_ms = int((time.monotonic() - start) * 1000)
        log.info("analysis.complete", score=score, duration_ms=duration_ms)

        result = {
            "efficiency_score": score,
            "feedback_text": feedback,
            "clips": clip_urls,
            "events": events,
            "processed_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        }

        db.table("analysis_jobs").update({
            "status": "complete",
            "result": result,
        }).eq("id", job_id).execute()

        if session_id:
            db.table("sessions").update({"efficiency_score": score}).eq("id", session_id).execute()

    except Exception as exc:
        log.error("analysis.failed", error=str(exc))
        db.table("analysis_jobs").update({
            "status": "failed",
            "error": str(exc),
        }).eq("id", job_id).execute()

    finally:
        # Clean up temp files
        for path in [video_path]:
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
