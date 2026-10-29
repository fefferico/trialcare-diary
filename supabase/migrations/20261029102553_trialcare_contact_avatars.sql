-- Private photos for a user's contacts, kept in the same child ownership boundary.
alter table public.contacts add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-avatars', 'contact-avatars', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can read contact avatars" on storage.objects;
create policy "Owners can read contact avatars" on storage.objects
for select to authenticated using (
  bucket_id = 'contact-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
  and (storage.foldername(name))[3] = 'contacts'
);

drop policy if exists "Owners can upload contact avatars" on storage.objects;
create policy "Owners can upload contact avatars" on storage.objects
for insert to authenticated with check (
  bucket_id = 'contact-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
  and (storage.foldername(name))[3] = 'contacts'
);

drop policy if exists "Owners can delete contact avatars" on storage.objects;
create policy "Owners can delete contact avatars" on storage.objects
for delete to authenticated using (
  bucket_id = 'contact-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
  and (storage.foldername(name))[3] = 'contacts'
);
