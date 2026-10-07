alter table public.medicine_cabinet
  add column if not exists expiry_precision text not null default 'day';

do $$ begin
  alter table public.medicine_cabinet
    add constraint medicine_cabinet_expiry_precision_check
    check (expiry_precision in ('day', 'month'));
exception when duplicate_object then null;
end $$;
