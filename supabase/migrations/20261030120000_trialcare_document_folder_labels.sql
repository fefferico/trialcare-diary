-- Adds a child-scoped folder label to document metadata. File objects remain in private Storage.
alter table public.documents
  add column if not exists folder_name text;

create index if not exists documents_child_folder_date_idx
  on public.documents(child_id, folder_name, date desc);
