-- Private documents and receipts bucket. Object keys are user_id/child_id/file.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('clinical-documents','clinical-documents',false,20971520,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Owners can read their clinical files" on storage.objects;
create policy "Owners can read their clinical files" on storage.objects for select to authenticated using (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (select 1 from public.children c where c.id::text=(storage.foldername(name))[2] and c.user_id=(select auth.uid()))
);
drop policy if exists "Owners can upload their clinical files" on storage.objects;
create policy "Owners can upload their clinical files" on storage.objects for insert to authenticated with check (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (select 1 from public.children c where c.id::text=(storage.foldername(name))[2] and c.user_id=(select auth.uid()))
);
drop policy if exists "Owners can update their clinical files" on storage.objects;
create policy "Owners can update their clinical files" on storage.objects for update to authenticated using (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (select 1 from public.children c where c.id::text=(storage.foldername(name))[2] and c.user_id=(select auth.uid()))
) with check (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (select 1 from public.children c where c.id::text=(storage.foldername(name))[2] and c.user_id=(select auth.uid()))
);
drop policy if exists "Owners can delete their clinical files" on storage.objects;
create policy "Owners can delete their clinical files" on storage.objects for delete to authenticated using (
  bucket_id='clinical-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (select 1 from public.children c where c.id::text=(storage.foldername(name))[2] and c.user_id=(select auth.uid()))
);
