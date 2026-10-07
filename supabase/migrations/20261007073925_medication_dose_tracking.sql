-- One row per scheduled dose. The unique key makes repeated taps safe.
create table if not exists public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  scheduled_date date not null,
  scheduled_time time not null,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (medication_id, scheduled_date, scheduled_time)
);

alter table public.medication_doses enable row level security;
drop policy if exists "medication_doses child owner access" on public.medication_doses;
create policy "medication_doses child owner access" on public.medication_doses
  for all to authenticated
  using (
    exists (
      select 1 from public.medications m
      join public.children c on c.id = m.child_id
      where m.id = medication_doses.medication_id
        and m.child_id = medication_doses.child_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.medications m
      join public.children c on c.id = m.child_id
      where m.id = medication_doses.medication_id
        and m.child_id = medication_doses.child_id
        and c.user_id = (select auth.uid())
    )
  );
grant select, insert, update, delete on public.medication_doses to authenticated;
revoke all on public.medication_doses from anon;
