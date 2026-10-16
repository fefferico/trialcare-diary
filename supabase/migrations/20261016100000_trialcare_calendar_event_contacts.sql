-- Store the contacts present for each specific calendar event occurrence.
alter table public.calendar_events
  add column if not exists contact_ids uuid[] not null default '{}';
