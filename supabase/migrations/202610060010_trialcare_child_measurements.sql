-- Review locally before applying manually in Supabase Cloud.
alter table public.children
  add column if not exists blood_group text,
  add column if not exists allergies text,
  add column if not exists medical_conditions text,
  add column if not exists medical_alerts text;

create table if not exists public.child_measurements (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  date date not null default current_date,
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 0 and 300),
  height_cm numeric(6,2) check (height_cm is null or height_cm between 0 and 250),
  head_circumference_cm numeric(5,2) check (head_circumference_cm is null or head_circumference_cm between 0 and 100),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or height_cm is not null or head_circumference_cm is not null)
);

create index if not exists child_measurements_child_date_idx
  on public.child_measurements(child_id, date);

alter table public.child_measurements enable row level security;
drop policy if exists "child_measurements child owner access" on public.child_measurements;
create policy "child_measurements child owner access" on public.child_measurements
  for all to authenticated
  using (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ));

grant select, insert, update, delete on public.child_measurements to authenticated;
revoke all on public.child_measurements from anon;
