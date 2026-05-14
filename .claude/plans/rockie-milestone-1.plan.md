# Plan: Rockie — Milestone 1: CV Pipeline + Analysis API

**Source PRD**: `.claude/prds/rockie.prd.md`
**Selected Milestone**: M1 — CV pipeline + analysis API (video in → score + annotated clip out, <3 min)
**Complexity**: Large

---

## Summary

Build the end-to-end computer vision pipeline: a Python FastAPI service that accepts a climbing video, runs MediaPipe Pose to extract skeletal data, computes an efficiency score, extracts key moments (crux, fall, best sequence), and returns an annotated clip + JSON analysis. This is the core product. Everything else is a wrapper around it.

---

## Patterns to Mirror

No existing code in repo. These conventions are established here and must be followed throughout the project.

| Category | Source | Pattern |
|---|---|---|
| Naming | — | Python: `snake_case` files/functions. FastAPI routers in `api/routes/`. Services in `api/services/`. Models in `api/models/`. |
| Error handling | — | FastAPI `HTTPException` for client errors. Unhandled exceptions caught at middleware level and logged. Never return raw tracebacks to client. |
| Logging | — | Python `structlog` with JSON output. Always log `session_id`, `user_id`, `duration_ms` on every analysis request. |
| Data access | — | All Supabase interactions via a single `db` client instance (`api/db.py`). Never instantiate client inline in route handlers. |
| Tests | — | `pytest` + `pytest-asyncio`. Test files mirror source structure under `tests/`. Each service has a unit test file. Fixtures in `tests/conftest.py`. |

---

## Architecture Decision

The CV worker is a **separate Python FastAPI service** (`/cv-worker`), not part of the Next.js app. Next.js calls it via internal API. This is the correct call — CV workloads need Python's ecosystem and should be independently scalable.

```
User uploads video
  → Next.js API route (/api/analyze)
    → Inserts job record to Supabase (status: queued)
    → POST to CV worker /analyze (async, non-blocking)
  → CV worker picks up job
    → MediaPipe Pose extraction
    → Efficiency scoring
    → Key moment detection
    → Clip annotation (OpenCV)
    → Upload annotated clip to Supabase Storage
    → PATCH job record (status: complete, results: {...})
  → Next.js polls job status via Supabase realtime
  → Client receives results
```

---

## Files to Create

| File | Action | Why |
|---|---|---|
| `cv-worker/` | CREATE dir | Root of Python CV service |
| `cv-worker/main.py` | CREATE | FastAPI app entrypoint |
| `cv-worker/api/routes/analyze.py` | CREATE | POST /analyze route |
| `cv-worker/api/routes/health.py` | CREATE | GET /health for uptime checks |
| `cv-worker/api/services/pose_extractor.py` | CREATE | MediaPipe Pose wrapper — extracts landmarks per frame |
| `cv-worker/api/services/efficiency_scorer.py` | CREATE | Computes efficiency score from landmark data |
| `cv-worker/api/services/moment_detector.py` | CREATE | Detects crux, fall, best sequence from score timeline |
| `cv-worker/api/services/clip_annotator.py` | CREATE | OpenCV — draws skeleton overlay, exports annotated clips |
| `cv-worker/api/services/storage.py` | CREATE | Supabase Storage upload/download |
| `cv-worker/api/models/analysis.py` | CREATE | Pydantic models: AnalysisRequest, AnalysisResult, MomentClip |
| `cv-worker/api/db.py` | CREATE | Supabase client singleton |
| `cv-worker/requirements.txt` | CREATE | fastapi, uvicorn, mediapipe, opencv-python, supabase, structlog, pydantic |
| `cv-worker/Dockerfile` | CREATE | Python 3.11 slim; GPU-ready base for Modal/Fly.io |
| `cv-worker/tests/conftest.py` | CREATE | Pytest fixtures: sample video path, mock Supabase client |
| `cv-worker/tests/test_pose_extractor.py` | CREATE | Unit tests for landmark extraction |
| `cv-worker/tests/test_efficiency_scorer.py` | CREATE | Unit tests for scoring logic |
| `cv-worker/tests/test_moment_detector.py` | CREATE | Unit tests for moment detection |
| `cv-worker/tests/test_analyze_route.py` | CREATE | Integration test: POST /analyze end-to-end |
| `supabase/migrations/001_analysis_jobs.sql` | CREATE | `analysis_jobs` table schema |
| `supabase/migrations/002_sessions.sql` | CREATE | `sessions` table schema |

---

## Tasks

### Task 1: Database schema
- **Action**: Write Supabase migrations for `analysis_jobs` and `sessions` tables
- **Mirror**: SQL snake_case, UUID primary keys, `created_at`/`updated_at` timestamps on every table, RLS enabled from the start
- **Schema**:
  ```sql
  -- analysis_jobs
  id uuid primary key default gen_random_uuid()
  user_id uuid references auth.users not null
  session_id uuid references sessions(id)
  status text not null default 'queued' -- queued | processing | complete | failed
  video_url text not null
  result jsonb -- null until complete
  error text -- null unless failed
  created_at timestamptz default now()
  updated_at timestamptz default now()

  -- sessions
  id uuid primary key default gen_random_uuid()
  user_id uuid references auth.users not null
  grade text
  wall_angle text -- slab | vertical | overhang | roof
  gym text
  efficiency_score numeric(4,1)
  climbed_at timestamptz default now()
  created_at timestamptz default now()
  ```
- **Validate**: `supabase db push` succeeds, tables visible in Supabase dashboard

### Task 2: FastAPI app skeleton
- **Action**: Create `cv-worker/main.py` with FastAPI app, mount routes, add structlog middleware, CORS for Next.js origin
- **Mirror**: Naming conventions established above
- **Validate**: `uvicorn main:app --reload` starts, `GET /health` returns `{"status": "ok"}`

### Task 3: MediaPipe Pose extractor
- **Action**: Implement `pose_extractor.py` — accepts video file path, returns list of `FrameLandmarks` (33 keypoints × N frames)
- **Key logic**:
  - Use `mp.solutions.pose.Pose(model_complexity=1)` — balance accuracy vs speed
  - Sample every 3rd frame (30fps → 10fps effective) to hit <3 min target
  - Return `None` for frames where pose confidence < 0.6
- **Validate**: Unit test with a 30-second sample climbing video; landmark list non-empty; <30s processing time for 30s video

### Task 4: Efficiency scorer
- **Action**: Implement `efficiency_scorer.py` — takes `List[FrameLandmarks]`, returns `EfficiencyScore` (0–100) + `ScoreTimeline`
- **Scoring model (v1 heuristics — replace with ML in v2)**:
  ```
  base_score = 100
  deductions:
    - hip_drop_events × 3pts     (hip y-coord drops >10% of body height between frames)
    - barn_door_events × 5pts    (shoulder/hip misalignment >30° from wall plane)
    - foot_swap_events × 2pts    (unnecessary foot repositioning)
    - shake_events × 2pts        (high-frequency landmark jitter = pumped arms)
  floor = 0
  ```
- **Validate**: Score of 100 for stationary pose (no movement), reasonable deductions on known-bad sample clips

### Task 5: Moment detector
- **Action**: Implement `moment_detector.py` — takes `ScoreTimeline`, returns timestamps for: `crux` (lowest score window), `fall` (if pose disappears/drops), `best_sequence` (highest sustained score window)
- **Validate**: Unit tests with synthetic score timelines covering edge cases (no fall, all-high, flat)

### Task 6: Clip annotator
- **Action**: Implement `clip_annotator.py` — takes original video + `List[FrameLandmarks]`, draws MediaPipe skeleton overlay, exports:
  - Full annotated video (720p max)
  - 3 moment clips (crux, fall, best) — 8 seconds each, centered on moment timestamp
- **Libraries**: `cv2.VideoWriter`, `mp.solutions.drawing_utils.draw_landmarks`
- **Validate**: Output clips play in browser, skeleton visible and aligned, file sizes <10MB per clip

### Task 7: Supabase Storage service
- **Action**: Implement `storage.py` — upload annotated clips to `analysis-clips` bucket, return signed URLs (7-day expiry)
- **Validate**: Upload test file, URL accessible in browser, RLS prevents cross-user access

### Task 8: POST /analyze route
- **Action**: Wire all services together in `analyze.py` route
  ```
  POST /analyze
  Body: { job_id: str, video_url: str, user_id: str }

  1. Download video from Supabase Storage to /tmp/{job_id}.mp4
  2. Update job status → processing
  3. pose_extractor.extract(video_path)
  4. efficiency_scorer.score(landmarks)
  5. moment_detector.detect(timeline)
  6. clip_annotator.annotate(video_path, landmarks, moments)
  7. storage.upload(clips) → signed URLs
  8. Update job record: status=complete, result={score, clips, feedback_text}
  9. Clean up /tmp files
  10. Return 200 { job_id, status: "complete" }
  ```
- **Error handling**: Any exception → update job status=failed, log error with job_id, return 500
- **Validate**: Integration test with real 60s climbing video; job completes in <3 min; annotated clip downloadable

### Task 9: Feedback text generator
- **Action**: Add `feedback_generator.py` — takes `EfficiencyScore` + detected events, returns 3–5 plain-English sentences
- **v1 approach**: Template-based (not LLM) — deterministic, no latency, no cost
  ```python
  templates = {
    "hip_drop": "Your hips dropped on move {move} — try flagging your {foot} foot earlier to keep your center of gravity closer to the wall.",
    "barn_door": "You barn-doored on move {move} — engage your core and keep your hips square to the wall before reaching.",
    ...
  }
  ```
- **Validate**: Non-empty feedback for every event combination; no template placeholders left unfilled

### Task 10: Docker + deployment config
- **Action**: Write `Dockerfile` (Python 3.11-slim base, non-root user, mediapipe dependencies) and `fly.toml` / `modal_deploy.py`
- **Validate**: `docker build` succeeds, container starts, `/health` responds

### Task 11: Tests
- **Action**: Write all test files per Files to Create above. Min coverage: pose_extractor 80%, scorer 90%, moment_detector 90%, route 70%
- **Validate**: `pytest cv-worker/tests/ -v` passes; `pytest --cov=api --cov-report=term-missing` shows ≥80% overall

---

## Validation

```bash
# 1. Schema
supabase db push

# 2. Unit tests
cd cv-worker && pytest tests/ -v

# 3. Coverage
pytest tests/ --cov=api --cov-report=term-missing

# 4. Service starts
uvicorn main:app --reload

# 5. Health check
curl http://localhost:8000/health

# 6. End-to-end integration (requires test video + Supabase creds)
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"job_id": "test-001", "video_url": "<supabase-url>", "user_id": "test-user"}'

# 7. Confirm job completes in <3 min and annotated clip is accessible
```

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| MediaPipe Pose accuracy poor for overhead/inverted climbing positions | High | Prototype with 5 real climbing clips in Task 3 before building scorer; have Roboflow custom model as fallback |
| Processing time >3 min for longer videos | Medium | Enforce 3-min video cap at upload; frame sampling (every 3rd frame); profile and optimize before launch |
| OpenCV clip export produces large files | Medium | Transcode output to H.264 720p; target <10MB per clip |
| Modal/Fly.io cold start adds latency | Low-Medium | Keep worker warm with health-check pings; acceptable for async job pattern |

---

## Acceptance

- [ ] All 11 tasks complete
- [ ] `pytest` passes with ≥80% coverage
- [ ] End-to-end: 60s climbing video in → efficiency score + 3 annotated clips out in <3 min
- [ ] Feedback text non-empty and readable
- [ ] Annotated clips accessible via Supabase Storage signed URLs
- [ ] No raw tracebacks returned to client
- [ ] PRD Milestone 1 updated: `pending` → `in-progress`

---

*Plan created: 2026-05-14*
*Next: Confirm to begin Task 1 (DB schema). Run `tdd-workflow` skill during implementation.*
