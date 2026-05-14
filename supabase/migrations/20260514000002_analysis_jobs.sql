-- Analysis jobs: tracks CV processing status per session
create table public.analysis_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  session_id  uuid references public.sessions(id) on delete cascade,
  status      text not null default 'queued'
                check (status in ('queued', 'processing', 'complete', 'failed')),
  video_url   text not null,               -- Supabase Storage path of original upload
  result      jsonb,                       -- null until complete; see ResultSchema below
  error       text,                        -- null unless failed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ResultSchema (stored in result jsonb):
-- {
--   "efficiency_score": 73.5,
--   "feedback_text": "Your hips dropped on move 4...",
--   "clips": {
--     "full":          "signed-url",
--     "crux":          "signed-url",
--     "fall":          "signed-url",     -- null if no fall detected
--     "best_sequence": "signed-url"
--   },
--   "events": {
--     "hip_drops": 2,
--     "barn_doors": 1,
--     "foot_swaps": 3,
--     "shake_events": 1
--   },
--   "processed_at": "2026-05-14T00:00:00Z"
-- }

-- RLS
alter table public.analysis_jobs enable row level security;

create policy "Users can read their own jobs"
  on public.analysis_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert their own jobs"
  on public.analysis_jobs for insert
  with check (auth.uid() = user_id);

-- CV worker updates via service role key (bypasses RLS) — no update policy needed for users

-- Indexes
create index analysis_jobs_user_id_idx    on public.analysis_jobs (user_id);
create index analysis_jobs_session_id_idx on public.analysis_jobs (session_id);
create index analysis_jobs_status_idx     on public.analysis_jobs (status) where status in ('queued', 'processing');

-- Auto-update updated_at
create trigger analysis_jobs_updated_at
  before update on public.analysis_jobs
  for each row execute function public.handle_updated_at();
