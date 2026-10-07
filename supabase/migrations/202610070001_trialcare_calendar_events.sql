-- Keep scheduled appointments separate from recorded health events.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  category text,
  date date not null default current_date,
  time time,
  location text,
  specialist text,
  notes text,
  status text not null default 'Confermato'
    check (status in ('Da confermare', 'Confermato', 'Saltato')),
  skipped_reason text,
  recurrence_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_child_date_idx
  on public.calendar_events(child_id, date desc);
create index if not exists calendar_events_recurrence_group_idx
  on public.calendar_events(child_id, recurrence_group_id, date);

alter table public.calendar_events enable row level security;
drop policy if exists "calendar_events child owner access" on public.calendar_events;
create policy "calendar_events child owner access" on public.calendar_events
  for all to authenticated
  using (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.children c
    where c.id = child_id and c.user_id = (select auth.uid())
  ));

drop trigger if exists set_updated_at on public.calendar_events;
create trigger set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.calendar_events to authenticated;
revoke all on public.calendar_events from anon;

-- Copy legacy appointments with unambiguous scheduling metadata. Keep the originals intact.
insert into public.calendar_events (
  id, child_id, title, category, date, time, location, specialist, notes,
  status, skipped_reason, recurrence_group_id, created_at, updated_at
)
select
  id, child_id, title, category, date, time, location, null, notes,
  status, skipped_reason, recurrence_group_id, created_at, updated_at
from public.health_events
where category = 'Appuntamento'
   or status in ('Da confermare', 'Saltato')
   or skipped_reason is not null
   or recurrence_group_id is not null
on conflict (id) do nothing;

-- Preserve specialist values if an earlier local migration added them to health_events.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'health_events'
      and column_name = 'specialist'
  ) then
    execute $sql$
      update public.calendar_events c
      set specialist = h.specialist
      from public.health_events h
      where c.id = h.id and c.specialist is null and h.specialist is not null
    $sql$;
  end if;
end $$;
