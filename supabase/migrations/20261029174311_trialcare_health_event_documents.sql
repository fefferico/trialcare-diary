-- Collega i documenti clinici agli eventi e sintomi del diario, vincolandoli allo stesso profilo.
create table if not exists public.health_event_documents (
  target_id uuid not null references public.health_events(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_id, document_id)
);

create index if not exists health_event_documents_child_idx
  on public.health_event_documents(child_id);
create index if not exists health_event_documents_document_idx
  on public.health_event_documents(document_id);

create or replace function public.validate_document_association()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  document_child_id uuid;
  target_child_id uuid;
begin
  select child_id into document_child_id
  from public.documents
  where id = new.document_id;
  if document_child_id is distinct from new.child_id then
    raise exception 'Il documento non appartiene al profilo selezionato';
  end if;

  if tg_table_name = 'calendar_event_documents' then
    select child_id into target_child_id from public.calendar_events where id = new.target_id;
  elsif tg_table_name = 'health_event_documents' then
    select child_id into target_child_id from public.health_events where id = new.target_id;
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

drop trigger if exists validate_document_association on public.health_event_documents;
create trigger validate_document_association before insert or update on public.health_event_documents
  for each row execute function public.validate_document_association();

alter table public.health_event_documents enable row level security;
drop policy if exists "health event documents child owner access" on public.health_event_documents;
create policy "health event documents child owner access" on public.health_event_documents
  for all to authenticated
  using (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ));

grant select, insert, delete on public.health_event_documents to authenticated;
revoke all on public.health_event_documents from anon;
