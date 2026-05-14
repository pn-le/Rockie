-- Storage buckets for Rockie

-- Raw video uploads (private — only accessible via service role)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'climb-videos',
  'climb-videos',
  false,
  524288000,    -- 500MB max per file
  array['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
);

-- Annotated clips (private — served via signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'analysis-clips',
  'analysis-clips',
  false,
  104857600,    -- 100MB max per clip
  array['video/mp4']
);

-- RLS: users can upload to their own folder in climb-videos
create policy "Users can upload their own videos"
  on storage.objects for insert
  with check (
    bucket_id = 'climb-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read their own videos"
  on storage.objects for select
  using (
    bucket_id = 'climb-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own videos"
  on storage.objects for delete
  using (
    bucket_id = 'climb-videos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- analysis-clips: CV worker writes via service role; users read via signed URLs only
-- No direct user RLS needed — access is through signed URLs generated server-side
