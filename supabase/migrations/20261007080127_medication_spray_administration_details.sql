alter table public.medications
  add column if not exists spray_count integer
    check (spray_count is null or spray_count > 0),
  add column if not exists administration_duration_seconds integer
    check (administration_duration_seconds is null or administration_duration_seconds > 0);
