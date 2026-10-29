-- Fuzzy search in document titles and locally extracted OCR text.
create extension if not exists pg_trgm with schema extensions;

create index if not exists documents_title_trgm_idx
  on public.documents using gin (lower(coalesce(title, '')) extensions.gin_trgm_ops);
create index if not exists documents_extracted_text_trgm_idx
  on public.documents using gin (lower(coalesce(extracted_text, '')) extensions.gin_trgm_ops);

create or replace function public.search_clinical_documents(
  p_child_id uuid,
  p_search text,
  p_limit integer default 30
)
returns table (
  id uuid,
  child_id uuid,
  title text,
  category text,
  date date,
  storage_path text
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with query_terms as (
    select distinct term
    from regexp_split_to_table(
      lower(trim(coalesce(p_search, ''))),
      '[^[:alnum:]]+'
    ) as terms(term)
    where term <> ''
  )
  select d.id, d.child_id, d.title, d.category, d.date, d.storage_path
  from public.documents as d
  where d.child_id = p_child_id
    and char_length(trim(coalesce(p_search, ''))) between 2 and 120
    and exists (select 1 from query_terms)
    and not exists (
      select 1
      from query_terms as q
      where not (
        position(q.term in lower(coalesce(d.title, ''))) > 0
        or position(q.term in lower(coalesce(d.extracted_text, ''))) > 0
        or (
          char_length(q.term) >= 4
          and (
            q.term OPERATOR(extensions.<%) lower(coalesce(d.title, ''))
            or q.term OPERATOR(extensions.<%) lower(coalesce(d.extracted_text, ''))
          )
        )
      )
    )
  order by d.date desc nulls last
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$function$;

revoke all on function public.search_clinical_documents(uuid, text, integer) from public;
revoke all on function public.search_clinical_documents(uuid, text, integer) from anon;
grant execute on function public.search_clinical_documents(uuid, text, integer) to authenticated;
