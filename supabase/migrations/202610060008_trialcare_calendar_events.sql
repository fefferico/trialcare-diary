-- Calendar scheduling fields for health events. Review locally before applying in Supabase Cloud.
alter table public.health_events
  add column if not exists status text not null default 'Confermato',
  add column if not exists skipped_reason text,
  add column if not exists recurrence_group_id uuid;

alter table public.health_events drop constraint if exists health_events_status_check;
alter table public.health_events add constraint health_events_status_check
  check (status in ('Da confermare', 'Confermato', 'Saltato'));

create index if not exists health_events_recurrence_group_idx
  on public.health_events(child_id, recurrence_group_id, date);
