-- Return a short OCR excerpt for search results, without returning the full OCR text.
drop function if exists public.search_clinical_documents(uuid, text, integer);

create function public.search_clinical_documents(
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
  storage_path text,
  ocr_snippet text
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
  select
    d.id,
    d.child_id,
    d.title,
    d.category,
    d.date,
    d.storage_path,
    ocr_match.snippet as ocr_snippet
  from public.documents as d
  left join lateral (
    select
      (case when hit.char_offset > 70 then '…' else '' end) ||
      substring(d.extracted_text from greatest(hit.char_offset - 70, 1) for 160) ||
      (case when hit.char_offset + 90 < char_length(d.extracted_text) then '…' else '' end) as snippet
    from query_terms as q
    cross join lateral regexp_matches(
      coalesce(d.extracted_text, ''),
      '[[:alnum:]]+',
      'gi'
    ) as tokens(captures)
    cross join lateral (
      select
        lower((tokens.captures)[1]) as matched_word,
        strpos(lower(coalesce(d.extracted_text, '')), lower((tokens.captures)[1])) as char_offset
    ) as hit
    where position(q.term in hit.matched_word) > 0
      or (
        char_length(q.term) >= 4
        and q.term OPERATOR(extensions.<%) hit.matched_word
      )
    order by (position(q.term in hit.matched_word) > 0) desc, hit.char_offset
    limit 1
  ) as ocr_match on true
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
