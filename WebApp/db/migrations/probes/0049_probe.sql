-- probes/0049_probe.sql — the drill for 0049_bim_document_blocks.sql. Part 0 runs BEFORE the apply (read-only). Parts 1 and 2 run AFTER.
-- Part 0: counts (the two body rows must read 0), and one ready-to-paste line per Snowdon document holding the md5 of its section bodies.
-- Part 1: paste those lines into the `before` list of the first row, then every row must read true: the backfill left every
--   body as it was (0049 keeps `body` and only adds `blocks`), every section has blocks, and the new triggers, policies and grants are there.
-- Part 2: one DO block with seven refusals (claims set with set_config, no role switch, so only the trigger and check rules are probed).
--   It makes its own documents, ALWAYS raises its summary, so everything it wrote rolls back. "PROBE 0049: 7 of 7 as expected." is the pass.
--   The viewer's narrowed direct read is not probed (no role switch): it is a catalog row of part 1 and is proven live by drill row 8.
-- Do not re-run probes/0033_probe.sql after 0049: its P40 expects a lead's version insert to succeed, which 0049 now refuses.

-- Part 0 (before the apply)
select 'documents' as what, count(*)::text as n from public.bim_documents
union all select 'sections without blocks (0049 gives each one a text block)', count(*)::text from public.bim_documents d, jsonb_array_elements(d.sections) x(s) where not x.s ? 'blocks'
union all select 'document versions', count(*)::text from public.bim_document_versions
union all select 'sections whose body is longer than 100,000 characters (must be 0)', count(*)::text from public.bim_documents d, jsonb_array_elements(d.sections) x(s) where jsonb_typeof(x.s->'body') = 'string' and length(x.s->>'body') > 100000
union all select 'sections whose body is not text (must be 0)', count(*)::text from public.bim_documents d, jsonb_array_elements(d.sections) x(s) where x.s ? 'body' and jsonb_typeof(x.s->'body') <> 'string'
union all select 'paste into part 1 (' || d.title || ')', format('(%L, %L),', d.id, md5(coalesce((select string_agg(e.s->>'body', '|' order by e.o) from jsonb_array_elements(d.sections) with ordinality e(s, o)), '')))
  from public.bim_documents d join public.projects p on p.id = d.project_id where p.key = 'snowdon-lifecycle';

-- Part 1 (after the apply): paste the lines part 0 printed on the blank line below (each ends with a comma; the null row after it stays)
with before(id, md5) as (values

  (null::uuid, null::text))
select 'every Snowdon document has the same section-body md5 as before the apply' as what,
  not exists (select 1 from public.bim_documents d join public.projects p on p.id = d.project_id left join before b on b.id = d.id
    where p.key = 'snowdon-lifecycle'
      and b.md5 is distinct from md5(coalesce((select string_agg(e.s->>'body', '|' order by e.o) from jsonb_array_elements(d.sections) with ordinality e(s, o)), ''))) as ok
union all select 'no section is without blocks', not exists (select 1 from public.bim_documents d, jsonb_array_elements(d.sections) x(s) where not x.s ? 'blocks')
union all select 'trg_bim_documents_insert_guard is on bim_documents', exists (select 1 from pg_trigger t where t.tgrelid = 'public.bim_documents'::regclass and t.tgname = 'trg_bim_documents_insert_guard' and not t.tgisinternal)
union all select 'trg_bim_documents_same_project is on bim_documents', exists (select 1 from pg_trigger t where t.tgrelid = 'public.bim_documents'::regclass and t.tgname = 'trg_bim_documents_same_project' and not t.tgisinternal)
union all select 'trg_bim_documents_delete_guard is on bim_documents', exists (select 1 from pg_trigger t where t.tgrelid = 'public.bim_documents'::regclass and t.tgname = 'trg_bim_documents_delete_guard' and not t.tgisinternal)
union all select 'trg_bimdoc_versions_insert_guard is on bim_document_versions', exists (select 1 from pg_trigger t where t.tgrelid = 'public.bim_document_versions'::regclass and t.tgname = 'trg_bimdoc_versions_insert_guard' and not t.tgisinternal)
union all select 'bim_document_versions_ins is gone', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bim_document_versions' and policyname = 'bim_document_versions_ins')
union all select 'bim_document_versions_sel reads for contributor and above', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bim_document_versions' and policyname = 'bim_document_versions_sel' and qual like '%contributor%')
union all select 'bim_documents_delete is the owner''s', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bim_documents' and policyname = 'bim_documents_delete' and qual like '%owner%')
union all select 'no API role may execute the four functions', not exists (select 1 from unnest(array['public.bim_documents_insert_guard()', 'public.bim_documents_same_project()', 'public.bim_document_versions_insert_guard()', 'public.bim_documents_delete_guard()']) f(sig), unnest(array['anon', 'authenticated']) r(rolname)
  where has_function_privilege(r.rolname, f.sig, 'execute'));

-- Part 2 (after the apply): seven refusals, rolled back.
do $$
declare lead_uid uuid; lead_pid uuid; low_uid uuid; low_pid uuid; other_pid uuid; d public.bim_documents; ok int := 0; total int := 7; msg text;
  claim constant text := '{"sub":"%s","role":"authenticated","email":"probe@0049.test"}';
begin
  select user_id, project_id into lead_uid, lead_pid from public.memberships where role = 'lead' and user_id is not null order by created_at limit 1;
  select user_id, project_id into low_uid, low_pid from public.memberships where role in ('contributor', 'viewer') and user_id is not null order by created_at limit 1;
  select id into other_pid from public.projects where id <> lead_pid order by created_at limit 1;
  if lead_uid is null or low_uid is null or other_pid is null then
    raise exception 'PROBE 0049: cannot run, missing: %', concat_ws(', ', case when lead_uid is null then 'a lead' end, case when low_uid is null then 'a contributor or viewer' end, case when other_pid is null then 'a second project' end);
  end if;

  -- 1 · a signed-in lead cannot record a version
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.bim_documents(project_id, doc_type, title) values (lead_pid, 'BEP', 'probe 1') returning * into d;
    perform set_config('request.jwt.claims', format(claim, lead_uid), true);
    insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by) values (d.id, 1, to_jsonb(d), 'v', 'probe');
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('recorded by Sentinel only' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 1: %', sqlerrm; end if;
  end;

  -- 2 · a signed-in lead cannot start a document at a later stage
  begin
    perform set_config('request.jwt.claims', format(claim, lead_uid), true);
    insert into public.bim_documents(project_id, doc_type, title, stage) values (lead_pid, 'BEP', 'probe 2', 'confirmed');
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('pre-appointment stage' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 2: %', sqlerrm; end if;
  end;

  -- 3 · a member below lead cannot set the access list
  begin
    perform set_config('request.jwt.claims', format(claim, low_uid), true);
    insert into public.bim_documents(project_id, doc_type, title, access) values (low_pid, 'BEP', 'probe 3', '{"probe@0049.test":"edit"}'::jsonb);
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('only a lead sets' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 3: %', sqlerrm; end if;
  end;

  -- 4 · a document cannot answer a document of another project
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.bim_documents(project_id, doc_type, title) values (other_pid, 'BEP', 'probe 4 other') returning * into d;
    insert into public.bim_documents(project_id, doc_type, title, responds_to) values (lead_pid, 'BEP', 'probe 4', d.id);
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('its own project only' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 4: %', sqlerrm; end if;
  end;

  -- 5 · a block of an unknown kind is refused by the sections check
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.bim_documents(project_id, doc_type, title, sections)
      values (lead_pid, 'BEP', 'probe 5', '[{"id":"s1","state":"wip","heading":"H","body":"","blocks":[{"id":"b1","kind":"script","data":{}}]}]'::jsonb);
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('bim_documents_sections_ok' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 5: %', sqlerrm; end if;
  end;

  -- 6 · a version whose snapshot holds other sections than the document
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.bim_documents(project_id, doc_type, title, sections)
      values (lead_pid, 'BEP', 'probe 6', '[{"id":"s1","state":"wip","heading":"H","body":"a","blocks":[]}]'::jsonb) returning * into d;
    insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by)
      values (d.id, 1, jsonb_set(to_jsonb(d), '{sections,0,body}', '"edited"'), 'v', 'probe');
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('current sections' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 6: %', sqlerrm; end if;
  end;

  -- 7 · a document with a version cannot be deleted
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.bim_documents(project_id, doc_type, title) values (lead_pid, 'BEP', 'probe 7') returning * into d;
    insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by) values (d.id, 1, to_jsonb(d), 'v', 'probe');
    delete from public.bim_documents where id = d.id;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('archive it instead' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 7: %', sqlerrm; end if;
  end;

  msg := format('PROBE 0049: %s of %s as expected.', ok, total);
  raise exception '%', msg;
end $$;
