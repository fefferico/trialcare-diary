-- Store searchable text extracted from text-based PDF documents.
alter table public.documents add column if not exists extracted_text text;
