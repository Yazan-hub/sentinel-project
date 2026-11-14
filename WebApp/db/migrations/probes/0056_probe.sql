-- probes/0056_probe.sql — the drill for 0056_eir_version_label.sql. Run AFTER the apply (and after 0053 to 0055).
-- Part 1: catalog checks (every row ok = true): doc_round_cut carries the 0056 change and is still not callable by a signed-in person or by anon.
-- Part 2: one DO block on scratch rows (an office with a BEP and an EIR chain; a project with an owner, a second lead, a team member and a Client).
--   An EIR accepted through its round is labelled "Accepted C01"; a BEP's tender issue stays "Tender issue P01" and its confirmed version "Confirmed C01".
--   It always raises its summary, so everything it wrote rolls back. "PROBE 0056: 3 of 3 as expected." is the pass.

-- Part 1
select 'doc_round_cut carries the 0056 change' as what,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'doc_round_cut' and prosrc like '%0056:%') = 1 as ok
union all
select 'doc_round_cut is not callable by a signed-in person or by anon',
  not has_function_privilege('authenticated', 'public.doc_round_cut(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.doc_round_cut(uuid, text)', 'execute');

-- Part 2
do $$
declare
  off uuid; pid uuid; eir uuid; bep uuid; bep2 uuid; rid uuid;
  o uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); a uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  secs jsonb := '[{"id":"s1","heading":"Aim","state":"wip","body":"x","blocks":[{"id":"s1.t0","kind":"text","title":"","data":{"markdown":"x"}}]}]';
  ok int := 0; n int;
  jo text := format('{"sub":"%s","role":"authenticated","email":"o@probe.test"}', o);
  jl text := format('{"sub":"%s","role":"authenticated","email":"l@probe.test"}', l2);
  ja text := format('{"sub":"%s","role":"authenticated","email":"a@probe.test"}', a);
  jc text := format('{"sub":"%s","role":"authenticated","email":"c@probe.test"}', c);
begin
  insert into auth.users(id, email) select u, 'probe-0056-' || left(u::text, 8) || '@probe.test' from unnest(array[o, l2, a, c]) u;
  insert into public.projects(key, name, kind) values ('probe-0056-office', 'P', 'office') returning id into off;
  insert into public.projects(key, name, office_key) values ('probe-0056', 'P', 'probe-0056-office') returning id into pid;
  insert into public.memberships(project_id, user_id, role, party, task_team) values
    (pid, o, 'owner', 'lead_appointed', null), (pid, l2, 'lead', 'lead_appointed', null), (pid, a, 'contributor', 'appointed', 'PRB'), (pid, c, 'viewer', 'appointing', null);
  insert into public.task_teams(project_id, code, name) values (pid, 'PRB', 'Probe team');
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', off::text, 'review', '{"version":1,"sha256":"00"}');
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', off::text, 'review@1', jsonb_build_object('body', jsonb_build_object('steps', '[]'::jsonb,
    'documents', jsonb_build_object(
      'bep', jsonb_build_object('steps', jsonb_build_array(
        jsonb_build_object('name', 'Teams', 'role', 'contributor', 'kind', 'task_teams'),
        jsonb_build_object('name', 'Lead', 'role', 'lead', 'party', 'lead_appointed'),
        jsonb_build_object('name', 'Client', 'role', 'viewer', 'party', 'appointing'))),
      'eir', jsonb_build_object('steps', jsonb_build_array(
        jsonb_build_object('name', 'Issue', 'role', 'lead', 'party', 'lead_appointed'),
        jsonb_build_object('name', 'Accept', 'role', 'viewer', 'party', 'appointing')))))));
  insert into public.bim_documents(project_id, doc_type, title, sections) values (pid, 'EIR', 'Probe EIR', secs) returning id into eir;
  insert into public.bim_documents(project_id, doc_type, title, sections) values (pid, 'BEP', 'Probe BEP', secs) returning id into bep;
  insert into public.bim_documents(project_id, doc_type, title, sections, stage) values (pid, 'BEP', 'Probe BEP 2', secs, 'confirmed') returning id into bep2;

  -- 1 an EIR accepted through its round: "Accepted C01"
  perform set_config('request.jwt.claims', jo, true);
  rid := (public.doc_round_start(eir, jsonb_build_object('id', eir, 'title', 'Probe EIR', 'sections', secs), null, '{}')->>'round_id')::uuid;
  perform set_config('request.jwt.claims', jl, true); perform public.doc_round_decide(rid, 'accept');
  perform set_config('request.jwt.claims', jc, true); perform public.doc_round_decide(rid, 'accept');
  select count(*) into n from public.bim_document_versions v join public.doc_rounds r on r.id = v.round_id
   where v.document_id = eir and v.label = 'Accepted C01' and v.revision = 'C01' and v.suitability = 'A1' and v.sha = r.render_sha;
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 1: % (%)', (select string_agg(label, ', ') from public.bim_document_versions where document_id = eir), n; end if;

  -- 2 a BEP's tender issue keeps its label
  perform set_config('request.jwt.claims', jo, true);
  rid := (public.doc_round_start(bep, jsonb_build_object('id', bep, 'title', 'Probe BEP', 'sections', secs), null, '{}')->>'round_id')::uuid;
  perform set_config('request.jwt.claims', ja, true); perform public.doc_round_decide(rid, 'accept');
  perform set_config('request.jwt.claims', jl, true); perform public.doc_round_decide(rid, 'accept');
  select count(*) into n from public.bim_document_versions where document_id = bep and label = 'Tender issue P01' and revision = 'P01';
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 2: %', (select string_agg(label, ', ') from public.bim_document_versions where document_id = bep); end if;

  -- 3 a BEP's confirmed version keeps its label
  perform set_config('request.jwt.claims', jo, true);
  rid := (public.doc_round_start(bep2, jsonb_build_object('id', bep2, 'title', 'Probe BEP 2', 'sections', secs), null, '{}')->>'round_id')::uuid;
  perform set_config('request.jwt.claims', ja, true); perform public.doc_round_decide(rid, 'accept');
  perform set_config('request.jwt.claims', jl, true); perform public.doc_round_decide(rid, 'accept');
  perform set_config('request.jwt.claims', jc, true); perform public.doc_round_decide(rid, 'accept');
  select count(*) into n from public.bim_document_versions where document_id = bep2 and label = 'Confirmed C01' and revision = 'C01';
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 3: %', (select string_agg(label, ', ') from public.bim_document_versions where document_id = bep2); end if;

  raise exception 'PROBE 0056: % of 3 as expected.', ok;
end $$;
