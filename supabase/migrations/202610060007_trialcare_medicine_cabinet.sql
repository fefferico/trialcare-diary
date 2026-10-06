-- Inventario domestico dei farmaci, separato dalle terapie in corso.
-- Le righe sono collegate a un bambino e seguono le policy di proprieta gia usate dal diario.
create table if not exists public.medicine_cabinet (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  quantity text,
  planned_dosage text,
  price numeric(10,2) check (price is null or price >= 0),
  purchase_date date,
  opened_date date,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medicine_cabinet_child_expiry_idx
  on public.medicine_cabinet(child_id, expiry_date);

drop trigger if exists set_updated_at on public.medicine_cabinet;
create trigger set_updated_at before update on public.medicine_cabinet
  for each row execute function public.set_updated_at();

alter table public.medicine_cabinet enable row level security;
drop policy if exists "medicine_cabinet child owner access" on public.medicine_cabinet;
create policy "medicine_cabinet child owner access" on public.medicine_cabinet
  for all to authenticated
  using (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.children c where c.id = child_id and c.user_id = (select auth.uid())));

grant select, insert, update, delete on public.medicine_cabinet to authenticated;
revoke all on public.medicine_cabinet from anon;
