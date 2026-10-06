-- Store short voice memos with diary entries; audio objects stay in the private bucket.
alter table public.children add column if not exists voice_note_path text;
alter table public.medications add column if not exists voice_note_path text;
alter table public.health_events add column if not exists voice_note_path text;
alter table public.therapies add column if not exists voice_note_path text;
alter table public.documents add column if not exists voice_note_path text;
alter table public.expenses add column if not exists voice_note_path text;
alter table public.children add column if not exists voice_note_data text;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf','image/jpeg','image/png','image/webp','image/heic',
  'audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg'
]
where id = 'clinical-documents';
