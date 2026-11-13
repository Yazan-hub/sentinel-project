-- probes/0053_probe.sql — the drill for 0053_document_rounds.sql. Run AFTER the apply.
-- Part 1: catalog checks (every row ok = true): both tables with RLS on, the five functions, the lock and guard triggers, the render column not
--   granted to authenticated, the four round functions executable by authenticated and not by service_role.
-- Part 2: one DO block on scratch rows (an office with a review chain, a project with an owner, a second lead, a team member and a Client, one BEP).
--   It sends the BEP, proves the sender, the Client on step 1 and the lock refuse, runs tender steps 1-3, and always raises its summary, so
--   everything it wrote rolls back. "PROBE 0053: 9 of 9 as expected." is the pass.

-- Part 1
select 'doc_rounds and doc_round_decisions have RLS on' as what,
  (select relrowsecurity from pg_class where oid = 'public.doc_rounds'::regclass) and (select relrowsecurity from pg_class where oid = 'public.doc_round_decisions'::regclass) as ok
union all
select 'the five functions exist', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('doc_review_chain', 'doc_round_start', 'doc_round_decide', 'doc_round_withdraw', 'doc_appointment_indicated')) = 5
union all
select 'lock, write guards and the version guard are attached', (select count(*) from pg_trigger where not tgisinternal
  and tgname in ('trg_bim_documents_round_lock', 'trg_doc_rounds_write_guard', 'trg_doc_round_decisions_write_guard', 'trg_bimdoc_versions_insert_guard')) = 4
union all
select 'authenticated reads no frozen render, but reads the round', not has_column_privilege('authenticated', 'public.doc_rounds', 'render', 'select')
  and has_column_privilege('authenticated', 'public.doc_rounds', 'render_sha', 'select')
union all
select 'round functions: authenticated yes, service_role and anon no',
  has_function_privilege('authenticated', 'public.doc_round_decide(uuid, text, text)', 'execute')
  and not has_function_privilege('service_role', 'public.doc_round_decide(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.doc_round_start(uuid, jsonb, date, jsonb)', 'execute');

-- Part 2
do $$
declare
  off uuid; pid uuid; doc uuid; rid uuid;
  o uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  secs jsonb := '[{"id":"s1","heading":"Aim","state":"wip","body":"x","blocks":[{"id":"s1.t0","kind":"text","title":"","data":{"markdown":"x"}}]}]';
  ok int := 0; res jsonb; n int;
begin
  insert into auth.users(id, email) select u, 'probe-0053-' || left(u::text, 8) || '@probe.test' from unnest(array[o, l2, a, c]) u;
  insert into public.projects(key, name, kind) values ('probe-0053-office', 'P', 'office') returning id into off;
  insert into public.projects(key, name, office_key) values ('probe-0053', 'P', 'probe-0053-office') returning id into pid;
  insert into public.memberships(project_id, user_id, role, party, task_team) values
    (pid, o, 'owner', 'lead_appointed', null), (pid, l2, 'lead', 'lead_appointed', null), (pid, a, 'contributor', 'appointed', 'PRB'), (pid, c, 'viewer', 'appointing', null);
  insert into public.task_teams(project_id, code, name) values (pid, 'PRB', 'Probe team');
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', off::text, 'review', '{"version":1,"sha256":"00"}');
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', off::text, 'review@1', jsonb_build_object('body', jsonb_build_object('steps', '[]'::jsonb,
    'documents', jsonb_build_object('bep', jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object('name', 'Teams', 'role', 'contributor', 'kind', 'task_teams'),
      jsonb_build_object('name', 'Lead', 'role', 'lead', 'party', 'lead_appointed'),
      jsonb_build_object('name', 'Client', 'role', 'viewer', 'party', 'appointing')))))));
  insert into public.bim_documents(project_id, doc_type, title, sections) values (pid, 'BEP', 'Probe BEP', secs) returning id into doc;

  -- 1 the owner sends it
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","email":"o@probe.test"}', o), true);
  res := public.doc_round_start(doc, jsonb_build_object('id', doc, 'title', 'Probe BEP', 'sections', secs), null, '{}');
  rid := (res->>'round_id')::uuid;
  if res->>'render_sha' ~ '^[0-9a-f]{64}$' then ok := ok + 1; else raise notice 'FAIL 1: no sha'; end if;
  -- 2 the sender never decides
  begin perform public.doc_round_decide(rid, 'accept'); raise notice 'FAIL 2: the sender decided';
  exception when others then if sqlerrm like '%sender does not decide%' then ok := ok + 1; else raise notice 'FAIL 2: %', sqlerrm; end if; end;
  -- 3 the Client cannot decide step 1
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c), true);
  begin perform public.doc_round_decide(rid, 'accept'); raise notice 'FAIL 3: the Client decided step 1';
  exception when others then if sqlerrm like '%confirmed by each task team%' then ok := ok + 1; else raise notice 'FAIL 3: %', sqlerrm; end if; end;
  -- 4 the lock holds against the service key (no claims)
  perform set_config('request.jwt.claims', '', true);
  begin update public.bim_documents set status = 'published' where id = doc; raise notice 'FAIL 4: the lock let a status write through';
  exception when others then if sqlerrm like '%out for review%' then ok := ok + 1; else raise notice 'FAIL 4: %', sqlerrm; end if; end;
  -- 5 step 1 by the team: Shared S3
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","email":"a@probe.test"}', a), true);
  perform public.doc_round_decide(rid, 'accept');
  select count(*) into n from public.bim_documents where id = doc and status = 'shared' and suitability = 'S3';
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 5: not Shared S3'; end if;
  -- 6 step 2 by the second lead: tender version P01 S4, round open
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","email":"l@probe.test"}', l2), true);
  res := public.doc_round_decide(rid, 'accept');
  select count(*) into n from public.bim_document_versions v join public.doc_rounds r on r.id = v.round_id
   where v.document_id = doc and v.revision = 'P01' and v.suitability = 'S4' and v.sha = r.render_sha and v.snapshot = r.render and r.status = 'open';
  if n = 1 and (res->>'issued_version')::int = 1 then ok := ok + 1; else raise notice 'FAIL 6: %', res; end if;
  -- 7 a signed-in insert outside the round is refused
  begin insert into public.bim_document_versions(document_id, version_no, snapshot) values (doc, 9, jsonb_build_object('id', doc, 'sections', secs)); raise notice 'FAIL 7: a version insert outside a round';
  exception when others then if sqlerrm like '%Sentinel only%' then ok := ok + 1; else raise notice 'FAIL 7: %', sqlerrm; end if; end;
  -- 8 step 3: the Client selects; round closed, document wip S0
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c), true);
  res := public.doc_round_decide(rid, 'selected');
  select count(*) into n from public.bim_documents where id = doc and status = 'wip' and suitability = 'S0';
  if n = 1 and (res->>'closed')::boolean then ok := ok + 1; else raise notice 'FAIL 8: %', res; end if;
  -- 9 the ledger holds the rows with the decider's uid
  select count(*) into n from public.audit_log where project_id = pid and action like 'review:doc_%' and entity_type = 'review';
  if n = 6 then ok := ok + 1; else raise notice 'FAIL 9: % ledger rows', n; end if;

  raise exception 'PROBE 0053: % of 9 as expected.', ok;
end $$;
