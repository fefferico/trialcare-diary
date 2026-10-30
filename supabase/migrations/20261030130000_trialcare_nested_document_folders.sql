-- Replaces flat document folder labels with child-scoped folders and a parent-child hierarchy.
create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  parent_folder_id uuid,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_folders_id_child_id_key unique (id, child_id),
  constraint document_folders_parent_child_fkey foreign key (parent_folder_id, child_id)
    references public.document_folders(id, child_id) on delete cascade
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'document_folders_id_child_id_key'
      and conrelid = 'public.document_folders'::regclass
  ) then
    alter table public.document_folders
      add constraint document_folders_id_child_id_key unique (id, child_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'document_folders_parent_child_fkey'
      and conrelid = 'public.document_folders'::regclass
  ) then
    alter table public.document_folders
      add constraint document_folders_parent_child_fkey
      foreign key (parent_folder_id, child_id)
      references public.document_folders(id, child_id) on delete cascade;
  end if;
end $$;

alter table public.documents
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_folder_id_fkey'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_folder_id_fkey
      foreign key (folder_id) references public.document_folders(id) on delete set null;
  end if;
end $$;

create index if not exists document_folders_child_idx
  on public.document_folders(child_id);
create index if not exists document_folders_parent_child_idx
  on public.document_folders(parent_folder_id, child_id);
create unique index if not exists document_folders_root_name_uidx
  on public.document_folders(child_id, lower(btrim(name)))
  where parent_folder_id is null;
create unique index if not exists document_folders_child_name_uidx
  on public.document_folders(child_id, parent_folder_id, lower(btrim(name)))
  where parent_folder_id is not null;

-- Preserve flat folder assignments from the preceding migration as root-level folders.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'folder_name'
  ) then
    execute $migration$
      insert into public.document_folders (child_id, name)
      select distinct child_id, btrim(folder_name)
      from public.documents
      where folder_name is not null and btrim(folder_name) <> ''
      on conflict do nothing
    $migration$;
    execute $migration$
      update public.documents d
      set folder_id = f.id
      from public.document_folders f
      where d.folder_id is null
        and d.folder_name is not null
        and d.child_id = f.child_id
        and f.parent_folder_id is null
        and lower(btrim(d.folder_name)) = lower(btrim(f.name))
    $migration$;
  end if;
end $$;

drop index if exists public.documents_child_folder_date_idx;
create index if not exists documents_child_folder_date_idx
  on public.documents(child_id, folder_id, date desc);

alter table public.documents
  drop column if exists folder_name;

create or replace function public.validate_document_folder_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  creates_cycle boolean;
begin
  if new.parent_folder_id is null then
    return new;
  end if;
  if new.parent_folder_id = new.id then
    raise exception 'Una cartella non può contenere se stessa';
  end if;

  with recursive descendants(folder_id) as (
    select id
    from public.document_folders
    where parent_folder_id = new.id and child_id = new.child_id
    union
    select folder.id
    from public.document_folders folder
    join descendants on folder.parent_folder_id = descendants.folder_id
    where folder.child_id = new.child_id
  )
  select exists (
    select 1 from descendants where folder_id = new.parent_folder_id
  ) into creates_cycle;

  if creates_cycle then
    raise exception 'La cartella genitore creerebbe un ciclo';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_document_folder_parent() from public, anon, authenticated;

drop trigger if exists validate_document_folder_parent on public.document_folders;
create trigger validate_document_folder_parent
  before insert or update of parent_folder_id, child_id on public.document_folders
  for each row execute function public.validate_document_folder_parent();

create or replace function public.validate_document_folder_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  folder_child_id uuid;
begin
  if new.folder_id is null then
    return new;
  end if;

  select child_id into folder_child_id
  from public.document_folders
  where id = new.folder_id;
  if folder_child_id is distinct from new.child_id then
    raise exception 'La cartella e il documento devono appartenere allo stesso profilo';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_document_folder_assignment() from public, anon, authenticated;

drop trigger if exists validate_document_folder_assignment on public.documents;
create trigger validate_document_folder_assignment
  before insert or update of folder_id, child_id on public.documents
  for each row execute function public.validate_document_folder_assignment();

do $$
begin
  execute 'drop trigger if exists set_updated_at on public.document_folders';
  execute 'create trigger set_updated_at before update on public.document_folders for each row execute function public.set_updated_at()';
end $$;

alter table public.document_folders enable row level security;
drop policy if exists "document_folders child owner access" on public.document_folders;
create policy "document_folders child owner access" on public.document_folders
  for all to authenticated
  using (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.document_folders to authenticated;
revoke all on public.document_folders from anon;
