-- Allow historical document records and metadata-only document duplicates.
alter table public.documents alter column storage_path drop not null;
