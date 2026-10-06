-- Avoid child-table RLS interfering with Storage ownership checks.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.current_user_owns_child(p_child_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.children c
    where c.id::text = p_child_id and c.user_id = auth.uid()
  );
$$;
revoke all on function private.current_user_owns_child(text) from public, anon;
grant execute on function private.current_user_owns_child(text) to authenticated;

drop policy if exists "Owners can read their clinical files" on storage.objects;
create policy "Owners can read their clinical files" on storage.objects for select to authenticated using (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
);

drop policy if exists "Owners can upload their clinical files" on storage.objects;
create policy "Owners can upload their clinical files" on storage.objects for insert to authenticated with check (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
);

drop policy if exists "Owners can update their clinical files" on storage.objects;
create policy "Owners can update their clinical files" on storage.objects for update to authenticated using (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
) with check (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
);

drop policy if exists "Owners can delete their clinical files" on storage.objects;
create policy "Owners can delete their clinical files" on storage.objects for delete to authenticated using (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and private.current_user_owns_child((storage.foldername(name))[2])
);
