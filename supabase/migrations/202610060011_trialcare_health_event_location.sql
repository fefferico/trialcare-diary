alter table public.health_events
  add column if not exists location text;
