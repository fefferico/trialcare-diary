-- Track scheduled medication doses that were intentionally not administered.
alter table public.medication_doses
  add column if not exists status text not null default 'Somministrata',
  add column if not exists skipped_reason text;

alter table public.medication_doses
  alter column taken_at drop not null;

alter table public.medication_doses
  drop constraint if exists medication_doses_status_check;
alter table public.medication_doses
  add constraint medication_doses_status_check
  check (status in ('Somministrata', 'Saltata'));

alter table public.medication_doses
  drop constraint if exists medication_doses_skipped_reason_check;
alter table public.medication_doses
  add constraint medication_doses_skipped_reason_check
  check (
    status <> 'Saltata'
    or nullif(btrim(skipped_reason), '') is not null
  );
