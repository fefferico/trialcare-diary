-- Private profile photos, stored as one replaceable object per authenticated user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars', 'profile-avatars', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their profile avatar" on storage.objects;
create policy "Users can read their profile avatar" on storage.objects
for select to authenticated using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar'
);

drop policy if exists "Users can upload their profile avatar" on storage.objects;
create policy "Users can upload their profile avatar" on storage.objects
for insert to authenticated with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar'
);

drop policy if exists "Users can update their profile avatar" on storage.objects;
create policy "Users can update their profile avatar" on storage.objects
for update to authenticated using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar'
) with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar'
);

drop policy if exists "Users can delete their profile avatar" on storage.objects;
create policy "Users can delete their profile avatar" on storage.objects
for delete to authenticated using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name = (select auth.uid())::text || '/avatar'
);
