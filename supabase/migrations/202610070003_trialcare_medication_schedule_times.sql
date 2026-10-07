-- Add the medication schedule field to databases created before the current
-- base schema. Safe to rerun and does not alter existing medication records.
alter table public.medications
  add column if not exists schedule_times text;

notify pgrst, 'reload schema';
