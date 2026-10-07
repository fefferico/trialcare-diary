-- Move the explicitly identified appointment out of health_events.
begin;

insert into public.calendar_events (
  id,
  child_id,
  title,
  category,
  date,
  time,
  location,
  specialist,
  notes,
  status,
  skipped_reason,
  recurrence_group_id,
  created_at,
  updated_at
)
select
  id,
  child_id,
  title,
  category,
  date,
  time,
  location,
  specialist,
  notes,
  status,
  skipped_reason,
  recurrence_group_id,
  created_at,
  updated_at
from public.health_events
where id = '1ab9838e-bf81-4d12-8c67-ec7709209b6c'
on conflict (id) do update set
  child_id = excluded.child_id,
  title = excluded.title,
  category = excluded.category,
  date = excluded.date,
  time = excluded.time,
  location = excluded.location,
  specialist = excluded.specialist,
  notes = excluded.notes,
  status = excluded.status,
  skipped_reason = excluded.skipped_reason,
  recurrence_group_id = excluded.recurrence_group_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

delete from public.health_events
where id = '1ab9838e-bf81-4d12-8c67-ec7709209b6c'
  and exists (
    select 1
    from public.calendar_events
    where id = '1ab9838e-bf81-4d12-8c67-ec7709209b6c'
  );

commit;
