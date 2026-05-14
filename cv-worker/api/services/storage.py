import os
import structlog
from api.db import get_db

logger = structlog.get_logger()

BUCKET = "analysis-clips"
SIGNED_URL_EXPIRY_SEC = 60 * 60 * 24 * 7  # 7 days


def _object_path(job_id: str, clip_name: str) -> str:
    return f"{job_id}/{clip_name}.mp4"


def upload_clips(clip_paths: dict[str, str], job_id: str) -> dict[str, str]:
    """
    Upload annotated clip files to Supabase Storage.

    Args:
        clip_paths: dict of clip_name → local file path (from annotate_clips)
        job_id:     used as the storage folder prefix

    Returns:
        dict of clip_name → signed URL (7-day expiry)
    """
    db = get_db()
    log = logger.bind(job_id=job_id)
    signed_urls: dict[str, str] = {}

    for clip_name, local_path in clip_paths.items():
        if not os.path.exists(local_path):
            log.warning("storage.skip_missing", clip=clip_name, path=local_path)
            continue

        object_path = _object_path(job_id, clip_name)
        file_size = os.path.getsize(local_path)

        with open(local_path, "rb") as f:
            db.storage.from_(BUCKET).upload(
                path=object_path,
                file=f,
                file_options={
                    "content-type": "video/mp4",
                    "upsert": "true",
                },
            )

        log.info("storage.uploaded", clip=clip_name, object_path=object_path, size_bytes=file_size)

        response = db.storage.from_(BUCKET).create_signed_url(
            path=object_path,
            expires_in=SIGNED_URL_EXPIRY_SEC,
        )
        signed_urls[clip_name] = response["signedURL"]
        log.info("storage.signed", clip=clip_name)

    return signed_urls


def delete_clips(job_id: str) -> None:
    """Remove all clips for a job from storage (used on re-analysis or cleanup)."""
    db = get_db()
    files = db.storage.from_(BUCKET).list(path=job_id)
    if files:
        paths = [f"{job_id}/{f['name']}" for f in files]
        db.storage.from_(BUCKET).remove(paths)
        logger.info("storage.deleted", job_id=job_id, count=len(paths))
