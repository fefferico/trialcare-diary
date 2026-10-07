-- Associa documenti clinici a eventi, farmaci e tutori mantenendo i riferimenti privati per bambino.
create table if not exists public.calendar_event_documents (
  target_id uuid not null references public.calendar_events(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_id, document_id)
);

create table if not exists public.medication_documents (
  target_id uuid not null references public.medications(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_id, document_id)
);

create table if not exists public.orthosis_documents (
  target_id uuid not null references public.orthoses(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_id, document_id)
);

create index if not exists calendar_event_documents_child_idx on public.calendar_event_documents(child_id);
create index if not exists documents_child_title_idx on public.documents(child_id, title);
create index if not exists calendar_event_documents_document_idx on public.calendar_event_documents(document_id);
create index if not exists medication_documents_child_idx on public.medication_documents(child_id);
create index if not exists medication_documents_document_idx on public.medication_documents(document_id);
create index if not exists orthosis_documents_child_idx on public.orthosis_documents(child_id);
create index if not exists orthosis_documents_document_idx on public.orthosis_documents(document_id);

create or replace function public.validate_document_association()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  document_child_id uuid;
  target_child_id uuid;
begin
  select child_id into document_child_id from public.documents where id = new.document_id;
  if document_child_id is distinct from new.child_id then
    raise exception 'Il documento non appartiene al profilo selezionato';
  end if;

  if tg_table_name = 'calendar_event_documents' then
    select child_id into target_child_id from public.calendar_events where id = new.target_id;
  elsif tg_table_name = 'medication_documents' then
    select child_id into target_child_id from public.medications where id = new.target_id;
  else
    select child_id into target_child_id from public.orthoses where id = new.target_id;
  end if;
  if target_child_id is distinct from new.child_id then
    raise exception 'La voce e il documento devono appartenere allo stesso profilo';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_document_association() from public, anon, authenticated;

drop trigger if exists validate_document_association on public.calendar_event_documents;
create trigger validate_document_association before insert or update on public.calendar_event_documents
  for each row execute function public.validate_document_association();
drop trigger if exists validate_document_association on public.medication_documents;
create trigger validate_document_association before insert or update on public.medication_documents
  for each row execute function public.validate_document_association();
drop trigger if exists validate_document_association on public.orthosis_documents;
create trigger validate_document_association before insert or update on public.orthosis_documents
  for each row execute function public.validate_document_association();

alter table public.calendar_event_documents enable row level security;
alter table public.medication_documents enable row level security;
alter table public.orthosis_documents enable row level security;

drop policy if exists "calendar event documents child owner access" on public.calendar_event_documents;
create policy "calendar event documents child owner access" on public.calendar_event_documents
  for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())));
drop policy if exists "medication documents child owner access" on public.medication_documents;
create policy "medication documents child owner access" on public.medication_documents
  for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())));
drop policy if exists "orthosis documents child owner access" on public.orthosis_documents;
create policy "orthosis documents child owner access" on public.orthosis_documents
  for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())));

grant select, insert, delete on public.calendar_event_documents, public.medication_documents, public.orthosis_documents to authenticated;
revoke all on public.calendar_event_documents, public.medication_documents, public.orthosis_documents from anon;
