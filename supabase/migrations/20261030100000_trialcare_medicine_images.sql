-- Private reference photos for medicines in therapy and the home cabinet.
alter table public.medications add column if not exists image_path text;
alter table public.medicine_cabinet add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medicine-images', 'medicine-images', false, 3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can read medicine images" on storage.objects;
create policy "Owners can read medicine images" on storage.objects
for select to authenticated using (
  bucket_id = 'medicine-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
  and (storage.foldername(name))[3] in ('medications', 'medicine_cabinet')
);

drop policy if exists "Owners can upload medicine images" on storage.objects;
create policy "Owners can upload medicine images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'medicine-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
  and (storage.foldername(name))[3] in ('medications', 'medicine_cabinet')
);

drop policy if exists "Owners can delete medicine images" on storage.objects;
create policy "Owners can delete medicine images" on storage.objects
for delete to authenticated using (
  bucket_id = 'medicine-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
  and (storage.foldername(name))[3] in ('medications', 'medicine_cabinet')
);
