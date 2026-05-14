-- Sessions: one row per climbing attempt
create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  grade         text,                        -- e.g. "V4", "5.11b"
  wall_angle    text check (wall_angle in ('slab', 'vertical', 'overhang', 'roof')),
  gym           text,
  efficiency_score numeric(4,1),             -- 0.0–100.0, populated after analysis
  climbed_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS
alter table public.sessions enable row level security;

create policy "Users can read their own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sessions"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete their own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

-- Indexes
create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_climbed_at_idx on public.sessions (user_id, climbed_at desc);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.handle_updated_at();
