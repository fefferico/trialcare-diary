-- Inventario di ortesi e ausili collegato ai profili bambino.
create table if not exists public.orthoses (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  category text not null,
  brand text,
  model text,
  size text,
  laterality text,
  purchase_date date,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orthoses_child_start_date_idx
  on public.orthoses(child_id, start_date desc);

drop trigger if exists set_updated_at on public.orthoses;
create trigger set_updated_at before update on public.orthoses
  for each row execute function public.set_updated_at();

alter table public.orthoses enable row level security;
drop policy if exists "orthoses child owner access" on public.orthoses;
create policy "orthoses child owner access" on public.orthoses
  for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())));

grant select, insert, update, delete on public.orthoses to authenticated;
revoke all on public.orthoses from anon;
