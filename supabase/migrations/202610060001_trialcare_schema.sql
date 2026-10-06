-- TrialCare Diary schema. Review this migration before applying it in Supabase Cloud.
-- Child-owned rows inherit ownership through children.user_id.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  birth_date date not null,
  trial_id text, blood_group text, allergies text, medical_conditions text, medical_alerts text,
  voice_note_path text, voice_note_data text,
  emergency_contact text,
  clinical_team text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  name text not null, dosage text not null, formulation text, start_date date, end_date date, schedule_times text,
  planned_pause text, notes text, voice_note_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table if not exists public.health_events (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  title text not null, category text, date date not null default current_date, time time, location text,
  severity text check (severity is null or severity in ('Lieve','Moderata','Intensa')), notes text,
  voice_note_path text,
  status text not null default 'Confermato'
    check (status in ('Da confermare', 'Confermato', 'Saltato')),
  skipped_reason text, recurrence_group_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.therapies (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  name text not null, therapist text, facility text, frequency text, start_date date, notes text,
  voice_note_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  title text not null, category text, date date, storage_path text not null unique,
  extracted_text text, notes text, voice_note_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  title text not null, category text, date date not null default current_date,
  amount numeric(10,2) not null default 0 check (amount >= 0),
  distance_km numeric(9,2) not null default 0 check (distance_km >= 0),
  rate_per_km numeric(8,4) not null default 0 check (rate_per_km >= 0),
  receipt_path text, notes text, voice_note_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  name text not null, role text not null, category text not null, phone text, email text, facility text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.medicine_cabinet (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200), quantity text, planned_dosage text,
  price numeric(10,2) check (price is null or price >= 0), purchase_date date, opened_date date, expiry_date date,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.child_measurements (
  id uuid primary key default gen_random_uuid(), child_id uuid not null references public.children(id) on delete cascade,
  date date not null default current_date,
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 0 and 300),
  height_cm numeric(6,2) check (height_cm is null or height_cm between 0 and 250),
  head_circumference_cm numeric(5,2) check (head_circumference_cm is null or head_circumference_cm between 0 and 100),
  created_at timestamptz not null default now(),
  check (weight_kg is not null or height_cm is not null or head_circumference_cm is not null)
);

create index if not exists children_user_id_idx on public.children(user_id);
create index if not exists medications_child_start_idx on public.medications(child_id,start_date desc);
create index if not exists health_events_child_date_idx on public.health_events(child_id,date desc);
create index if not exists therapies_child_start_idx on public.therapies(child_id,start_date desc);
create index if not exists documents_child_date_idx on public.documents(child_id,date desc);
create index if not exists expenses_child_date_idx on public.expenses(child_id,date desc);
create index if not exists contacts_child_category_idx on public.contacts(child_id, category, name);
create index if not exists medicine_cabinet_child_expiry_idx on public.medicine_cabinet(child_id, expiry_date);
create index if not exists child_measurements_child_date_idx on public.child_measurements(child_id, date);
create index if not exists health_events_recurrence_group_idx on public.health_events(child_id, recurrence_group_id, date);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
do $$ declare t text;
begin
  foreach t in array array['children','medications','health_events','therapies','documents','expenses','contacts','medicine_cabinet'] loop
    execute format('drop trigger if exists set_updated_at on public.%I',t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
end $$;

alter table public.children enable row level security;
alter table public.medications enable row level security;
alter table public.health_events enable row level security;
alter table public.therapies enable row level security;
alter table public.documents enable row level security;
alter table public.expenses enable row level security;
alter table public.contacts enable row level security;
alter table public.medicine_cabinet enable row level security;
alter table public.child_measurements enable row level security;
drop policy if exists "Children are private to their owner" on public.children;
create policy "Children are private to their owner" on public.children
  for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
do $$ declare t text;
begin
  foreach t in array array['medications','health_events','therapies','documents','expenses','contacts','medicine_cabinet','child_measurements'] loop
    execute format('drop policy if exists %I on public.%I',t||' child owner access',t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.children c where c.id=child_id and c.user_id=(select auth.uid()))) with check (exists (select 1 from public.children c where c.id=child_id and c.user_id=(select auth.uid())))',
      t||' child owner access',t
    );
  end loop;
end $$;
grant select,insert,update,delete on public.children,public.medications,public.health_events,public.therapies,public.documents,public.expenses,public.contacts,public.medicine_cabinet,public.child_measurements to authenticated;
revoke all on public.children,public.medications,public.health_events,public.therapies,public.documents,public.expenses,public.contacts,public.medicine_cabinet,public.child_measurements from anon;
