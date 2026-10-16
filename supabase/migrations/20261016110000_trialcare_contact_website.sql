-- Add an optional public website URL to each child's contact.
alter table public.contacts
  add column if not exists website text;
