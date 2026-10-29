-- Distinguish occasional administrations from planned schedule slots.
alter table public.medication_doses
  add column if not exists is_spot boolean not null default false,
  add column if not exists administered_dosage text;

-- A spot dose can share a date and time with a planned slot without replacing it.
alter table public.medication_doses
  drop constraint if exists medication_doses_medication_id_scheduled_date_scheduled_time_key;

alter table public.medication_doses
  drop constraint if exists medication_doses_medication_date_time_spot_key;
alter table public.medication_doses
  add constraint medication_doses_medication_date_time_spot_key
  unique (medication_id, scheduled_date, scheduled_time, is_spot);
