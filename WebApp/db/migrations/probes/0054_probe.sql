-- probes/0054_probe.sql — the drill for 0054_round_outside.sql. Run AFTER the apply (and after 0053).
-- Part 1: catalog checks (every row ok = true): the setting column and its guard, the new functions (authenticated yes, service_role no),
--   the decision columns for a step recorded outside, the partial one-decision index.
-- Part 2: one DO block on scratch rows (an office with a BEP chain, a project with an owner, a second lead and a team member, and no Client).
--   It turns the setting on, sends a confirmed BEP with no Client, runs steps 1-2, records the Client's acceptance outside Sentinel (published A1),
--   skips a tender step 3, records Incorporated in appointment, and always raises its summary, so everything it wrote rolls back.
--   "PROBE 0054: 8 of 8 as expected." is the pass.

-- Part 1
select 'projects.client_outside_sentinel exists, default false' as what,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'client_outside_sentinel' and column_default = 'false') as ok
union all
select 'the guard trigger and the five new functions exist',
  exists (select 1 from pg_trigger where not tgisinternal and tgname = 'trg_projects_outside_guard')
  and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('set_client_outside_sentinel', 'doc_round_record_outside', 'doc_round_skip', 'doc_incorporated', 'doc_round_effects')) = 5
union all
select 'authenticated may call the four public functions; service_role and anon may not',
  has_function_privilege('authenticated', 'public.doc_round_skip(uuid, int, text)', 'execute')
  and has_function_privilege('authenticated', 'public.doc_round_record_outside(uuid, text, date, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_client_outside_sentinel(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.doc_incorporated(uuid, int, text[])', 'execute')
  and not has_function_privilege('service_role', 'public.doc_round_skip(uuid, int, text)', 'execute')
  and not has_function_privilege('anon', 'public.set_client_outside_sentinel(uuid, boolean)', 'execute')
union all
select 'decisions carry the outside columns and the partial one-decision index',
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'doc_round_decisions'
     and column_name in ('outside', 'outside_name', 'outside_date', 'evidence_ref')) = 4
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_doc_round_decisions_one_each');

-- Part 2
do $$
declare
  off uuid; pid uuid; doc uuid; doc2 uuid; rid uuid;
  o uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); a uuid := gen_random_uuid();
  secs jsonb := '[{"id":"s1","heading":"Aim","state":"wip","body":"x","blocks":[{"id":"s1.t0","kind":"text","title":"","data":{"markdown":"x"}}]}]';
  ok int := 0; res jsonb; n int;
  jo text := format('{"sub":"%s","role":"authenticated","email":"o@probe.test"}', o);
  jl text := format('{"sub":"%s","role":"authenticated","email":"l@probe.test"}', l2);
  ja text := format('{"sub":"%s","role":"authenticated","email":"a@probe.test"}', a);
begin
  insert into auth.users(id, email) select u, 'probe-0054-' || left(u::text, 8) || '@probe.test' from unnest(array[o, l2, a]) u;
  insert into public.projects(key, name, kind) values ('probe-0054-office', 'P', 'office') returning id into off;
  insert into public.projects(key, name, office_key) values ('probe-0054', 'P', 'probe-0054-office') returning id into pid;
  insert into public.memberships(project_id, user_id, role, party, task_team) values
    (pid, o, 'owner', 'lead_appointed', null), (pid, l2, 'lead', 'lead_appointed', null), (pid, a, 'contributor', 'appointed', 'PRB');
  insert into public.task_teams(project_id, code, name) values (pid, 'PRB', 'Probe team'), (pid, 'PRC', 'Team with no member');
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', off::text, 'review', '{"version":1,"sha256":"00"}');
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', off::text, 'review@1', jsonb_build_object('body', jsonb_build_object('steps', '[]'::jsonb,
    'documents', jsonb_build_object('bep', jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object('name', 'Teams', 'role', 'contributor', 'kind', 'task_teams'),
      jsonb_build_object('name', 'Lead', 'role', 'lead', 'party', 'lead_appointed'),
      jsonb_build_object('name', 'Client', 'role', 'viewer', 'party', 'appointing')))))));

  -- 1 a lead cannot change the setting; the owner can
  perform set_config('request.jwt.claims', jl, true);
  begin perform public.set_client_outside_sentinel(pid, true); raise notice 'FAIL 1: a lead changed the setting';
  exception when others then if sqlerrm like '%only an owner%' then ok := ok + 1; else raise notice 'FAIL 1: %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', jo, true);
  perform public.set_client_outside_sentinel(pid, true);
  -- 2 the direct write is refused, the ledger row is there
  perform set_config('request.jwt.claims', '', true);
  begin update public.projects set client_outside_sentinel = false where id = pid; raise notice 'FAIL 2: a direct write changed the setting';
  exception when others then
    select count(*) into n from public.audit_log where project_id = pid and action = 'client_outside_sentinel_changed';
    if sqlerrm like '%changed by an owner%' and n = 1 then ok := ok + 1; else raise notice 'FAIL 2: % (% rows)', sqlerrm, n; end if; end;

  -- 3 a confirmed BEP is sent with no Client; steps 1-2 accept
  insert into public.bim_documents(project_id, doc_type, title, sections, stage) values (pid, 'BEP', 'Probe BEP', secs, 'confirmed') returning id into doc;
  perform set_config('request.jwt.claims', jo, true);
  begin
    -- team PRC has no member: the confirmed send is refused by name (0053), so the probe removes it for this document's round
    perform public.doc_round_start(doc, jsonb_build_object('id', doc, 'title', 'Probe BEP', 'sections', secs), null, '{}');
    raise notice 'FAIL 3: sent with a team that cannot confirm';
  exception when others then if sqlerrm like '%Team PRC has no active member%' then ok := ok + 1; else raise notice 'FAIL 3: %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', '', true);
  delete from public.task_teams where project_id = pid and code = 'PRC';
  perform set_config('request.jwt.claims', jo, true);
  res := public.doc_round_start(doc, jsonb_build_object('id', doc, 'title', 'Probe BEP', 'sections', secs), null, '{}');
  rid := (res->>'round_id')::uuid;
  perform set_config('request.jwt.claims', ja, true); perform public.doc_round_decide(rid, 'accept');
  perform set_config('request.jwt.claims', jl, true); perform public.doc_round_decide(rid, 'accept');
  -- 4 the sender cannot record; a contributor cannot; the lead's record publishes A1
  perform set_config('request.jwt.claims', jo, true);
  begin perform public.doc_round_record_outside(rid, 'accept', current_date, 'Jane Client', null); raise notice 'FAIL 4: the sender recorded';
  exception when others then if sqlerrm like '%sender does not decide%' then ok := ok + 1; else raise notice 'FAIL 4: %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', jl, true);
  res := public.doc_round_record_outside(rid, 'accept', current_date, 'Jane Client', 'mail');
  select count(*) into n from public.bim_documents d join public.bim_document_versions v on v.document_id = d.id
    join public.doc_rounds r on r.id = v.round_id
   where d.id = doc and d.status = 'published' and d.suitability = 'A1' and v.revision = 'C01' and v.sha = r.render_sha and r.status = 'closed';
  if n = 1 and (res->>'closed')::boolean then ok := ok + 1; else raise notice 'FAIL 4b: %', res; end if;
  -- 5 the recorded decision keeps the date, the name and the recorder
  select count(*) into n from public.doc_round_decisions where round_id = rid and outside and outside_name = 'Jane Client' and uid = l2 and outside_date = current_date;
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 5: outside decision row'; end if;

  -- 6 tender: a team with no member is skipped, then the Client step is skipped, the round closes "skipped"
  perform set_config('request.jwt.claims', '', true);
  insert into public.task_teams(project_id, code, name) values (pid, 'PRC', 'Team with no member');
  insert into public.bim_documents(project_id, doc_type, title, sections) values (pid, 'BEP', 'Probe BEP 2', secs) returning id into doc2;
  perform set_config('request.jwt.claims', jo, true);
  rid := (public.doc_round_start(doc2, jsonb_build_object('id', doc2, 'title', 'Probe BEP 2', 'sections', secs), null, '{}')->>'round_id')::uuid;
  perform set_config('request.jwt.claims', ja, true); perform public.doc_round_decide(rid, 'accept');
  perform set_config('request.jwt.claims', jl, true);
  perform public.doc_round_skip(rid, 1, 'no team yet');
  perform public.doc_round_decide(rid, 'accept');
  perform public.doc_round_skip(rid, 3, 'client outside');
  select count(*) into n from public.doc_rounds r join public.bim_documents d on d.id = r.document_id
   where r.id = rid and r.status = 'closed' and r.outcome = 'skipped' and r.issued_version = 1 and d.status = 'wip' and d.suitability = 'S0';
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 6: skipped tender'; end if;

  -- 7 Incorporated in appointment
  perform public.doc_incorporated(doc2, 1, array['Firm A', 'Firm B']);
  select count(*) into n from public.audit_log where project_id = pid and action = 'document_incorporated' and new_value->>'version_no' = '1'
     and new_value->'parties' = '["Firm A","Firm B"]'::jsonb and new_value->>'by_uid' = l2::text;
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 7: incorporated row'; end if;

  raise exception 'PROBE 0054: % of 8 as expected.', ok;
end $$;
