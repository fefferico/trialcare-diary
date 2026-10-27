alter table public.medicine_cabinet
  add column if not exists opened_expiry_days integer;

do $$ begin
  alter table public.medicine_cabinet
    add constraint medicine_cabinet_opened_expiry_days_check
    check (opened_expiry_days is null or opened_expiry_days > 0);
exception when duplicate_object then null;
end $$;
