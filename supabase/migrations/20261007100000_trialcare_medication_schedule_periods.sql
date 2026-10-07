-- Keep one medication record and store each dated dosage regimen inside it.
alter table public.medications
  add column if not exists schedule_periods jsonb not null default '[]'::jsonb;

alter table public.medications
  drop constraint if exists medications_schedule_periods_array_check;
alter table public.medications
  add constraint medications_schedule_periods_array_check
  check (jsonb_typeof(schedule_periods) = 'array');

-- Preserve each existing medication's current single regimen as its first period.
update public.medications
set schedule_periods = jsonb_build_array(jsonb_build_object(
  'start_date', start_date,
  'end_date', end_date,
  'dosage', dosage,
  'formulation', formulation,
  'spray_count', spray_count,
  'administration_duration_seconds', administration_duration_seconds,
  'schedule_times', schedule_times,
  'planned_pause', planned_pause
))
where schedule_periods = '[]'::jsonb;
