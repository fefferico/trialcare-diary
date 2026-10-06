-- Useful contacts associated with a child's diary profile.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  role text not null,
  category text not null,
  phone text,
  email text,
  facility text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_child_category_idx on public.contacts(child_id, category, name);
drop trigger if exists set_updated_at on public.contacts;
create trigger set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
drop policy if exists "contacts child owner access" on public.contacts;
create policy "contacts child owner access" on public.contacts
  for all to authenticated
  using (exists (select 1 from public.children c where c.id=child_id and c.user_id=(select auth.uid())))
  with check (exists (select 1 from public.children c where c.id=child_id and c.user_id=(select auth.uid())));

grant select,insert,update,delete on public.contacts to authenticated;
revoke all on public.contacts from anon;
