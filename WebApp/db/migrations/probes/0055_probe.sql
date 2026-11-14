-- probes/0055_probe.sql — the drill for 0055_eir_outside.sql. Run AFTER the apply (and after 0053 and 0054).
-- Part 1: catalog checks (every row ok = true): the three replaced functions carry the 0055 change and keep their grants
--   (authenticated yes, service_role and anon no).
-- Part 2: one DO block on scratch rows: two offices, each with one project that has an owner and a second lead and no Client.
--   Project 1's EIR chain gives the Client the issue (step 1); project 2's gives the Client the acceptance (step 2).
--   It proves an EIR is refused with the setting off, is sent with it on, that a lead records the Client's step at either place,
--   that both EIRs reach Published C01 A1, and that the setting is not switched off under an EIR round still waiting on the Client.
--   It always raises its summary, so everything it wrote rolls back. "PROBE 0055: 9 of 9 as expected." is the pass.

-- Part 1
select 'the three functions carry the 0055 change' as what,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('set_client_outside_sentinel', 'doc_round_record_outside', 'doc_round_start') and prosrc like '%0055:%') = 3 as ok
union all
select 'authenticated may call them; service_role and anon may not',
  has_function_privilege('authenticated', 'public.doc_round_record_outside(uuid, text, date, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.doc_round_start(uuid, jsonb, date, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.set_client_outside_sentinel(uuid, boolean)', 'execute')
  and not has_function_privilege('service_role', 'public.doc_round_record_outside(uuid, text, date, text, text)', 'execute')
  and not has_function_privilege('service_role', 'public.doc_round_start(uuid, jsonb, date, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.set_client_outside_sentinel(uuid, boolean)', 'execute');

-- Part 2
do $$
declare
  off1 uuid; off2 uuid; p1 uuid; p2 uuid; d1 uuid; d2 uuid; r1 uuid; r2 uuid;
  o uuid := gen_random_uuid(); l2 uuid := gen_random_uuid();
  secs jsonb := '[{"id":"s1","heading":"Aim","state":"wip","body":"x","blocks":[{"id":"s1.t0","kind":"text","title":"","data":{"markdown":"x"}}]}]';
  ok int := 0; res jsonb; n int;
  jo text := format('{"sub":"%s","role":"authenticated","email":"o@probe.test"}', o);
  jl text := format('{"sub":"%s","role":"authenticated","email":"l@probe.test"}', l2);
  client_step jsonb := jsonb_build_object('role', 'viewer', 'party', 'appointing');
  lead_step jsonb := jsonb_build_object('role', 'lead', 'party', 'lead_appointed');
begin
  insert into auth.users(id, email) select u, 'probe-0055-' || left(u::text, 8) || '@probe.test' from unnest(array[o, l2]) u;
  insert into public.projects(key, name, kind) values ('probe-0055-office-1', 'P', 'office') returning id into off1;
  insert into public.projects(key, name, kind) values ('probe-0055-office-2', 'P', 'office') returning id into off2;
  insert into public.projects(key, name, office_key) values ('probe-0055-1', 'P', 'probe-0055-office-1') returning id into p1;
  insert into public.projects(key, name, office_key) values ('probe-0055-2', 'P', 'probe-0055-office-2') returning id into p2;
  insert into public.memberships(project_id, user_id, role, party, task_team) values
    (p1, o, 'owner', 'lead_appointed', null), (p1, l2, 'lead', 'lead_appointed', null),
    (p2, o, 'owner', 'lead_appointed', null), (p2, l2, 'lead', 'lead_appointed', null);
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', off1::text, 'review', '{"version":1,"sha256":"00"}'), ('artefact', off2::text, 'review', '{"version":1,"sha256":"00"}');
  -- office 1: the Client issues, the Lead firm accepts; office 2: the Lead firm issues, the Client accepts
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', off1::text, 'review@1', jsonb_build_object('body', jsonb_build_object('steps', '[]'::jsonb, 'documents', jsonb_build_object('eir', jsonb_build_object('steps',
      jsonb_build_array(client_step || '{"name":"Issue"}', lead_step || '{"name":"Accept"}')))))),
    ('artefact', off2::text, 'review@1', jsonb_build_object('body', jsonb_build_object('steps', '[]'::jsonb, 'documents', jsonb_build_object('eir', jsonb_build_object('steps',
      jsonb_build_array(lead_step || '{"name":"Issue"}', client_step || '{"name":"Accept"}'))))));
  insert into public.bim_documents(project_id, doc_type, title, sections) values (p1, 'EIR', 'Probe EIR 1', secs) returning id into d1;
  insert into public.bim_documents(project_id, doc_type, title, sections) values (p2, 'EIR', 'Probe EIR 2', secs) returning id into d2;

  -- 1 with the setting off, an EIR with a Client step and no Client is not sent
  perform set_config('request.jwt.claims', jo, true);
  begin perform public.doc_round_start(d1, jsonb_build_object('id', d1, 'title', 'Probe EIR 1', 'sections', secs), null, '{}'); raise notice 'FAIL 1: sent with no Client and the setting off';
  exception when others then if sqlerrm like '%Invite the Client%' then ok := ok + 1; else raise notice 'FAIL 1: %', sqlerrm; end if; end;
  -- 2 with it on, the owner sends it
  perform public.set_client_outside_sentinel(p1, true);
  perform public.set_client_outside_sentinel(p2, true);
  res := public.doc_round_start(d1, jsonb_build_object('id', d1, 'title', 'Probe EIR 1', 'sections', secs), null, '{}');
  r1 := (res->>'round_id')::uuid;
  if res->>'render_sha' ~ '^[0-9a-f]{64}$' then ok := ok + 1; else raise notice 'FAIL 2: no sha'; end if;
  -- 3 the sender does not record the Client's step
  begin perform public.doc_round_record_outside(r1, 'accept', current_date, 'Jane Client', null); raise notice 'FAIL 3: the sender recorded';
  exception when others then if sqlerrm like '%sender does not decide%' then ok := ok + 1; else raise notice 'FAIL 3: %', sqlerrm; end if; end;
  -- 4 the tender evaluation words are a BEP's
  perform set_config('request.jwt.claims', jl, true);
  begin perform public.doc_round_record_outside(r1, 'selected', current_date, 'Jane Client', null); raise notice 'FAIL 4: an EIR took a tender word';
  exception when others then if sqlerrm like '%choices are: accept, reject%' then ok := ok + 1; else raise notice 'FAIL 4: %', sqlerrm; end if; end;
  -- 5 a lead records the Client's issue (step 1): Shared S3, the row keeps the name and the day
  perform public.doc_round_record_outside(r1, 'accept', current_date, 'Jane Client', 'letter');
  select count(*) into n from public.bim_documents d join public.doc_round_decisions x on x.round_id = r1
   where d.id = d1 and d.status = 'shared' and d.suitability = 'S3' and x.step = 1 and x.outside and x.party = 'appointing' and x.outside_name = 'Jane Client' and x.uid = l2;
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 5: step 1 recorded outside'; end if;
  -- 6 the same lead then accepts for the Lead firm: Published C01 A1, the frozen copy
  res := public.doc_round_decide(r1, 'accept');
  select count(*) into n from public.bim_documents d join public.bim_document_versions v on v.document_id = d.id join public.doc_rounds r on r.id = v.round_id
   where d.id = d1 and d.status = 'published' and d.suitability = 'A1' and v.revision = 'C01' and v.sha = r.render_sha and r.status = 'closed';
  if n = 1 and (res->>'closed')::boolean then ok := ok + 1; else raise notice 'FAIL 6: %', res; end if;

  -- 7 project 2: the Lead firm issues; the setting is not switched off while the Client's acceptance is still to come
  perform set_config('request.jwt.claims', jo, true);
  r2 := (public.doc_round_start(d2, jsonb_build_object('id', d2, 'title', 'Probe EIR 2', 'sections', secs), null, '{}')->>'round_id')::uuid;
  perform set_config('request.jwt.claims', jl, true); perform public.doc_round_decide(r2, 'accept');
  perform set_config('request.jwt.claims', jo, true);
  begin perform public.set_client_outside_sentinel(p2, false); raise notice 'FAIL 7: switched off under an EIR round waiting on the Client';
  exception when others then if sqlerrm like '%round sent without a Client is open%' then ok := ok + 1; else raise notice 'FAIL 7: %', sqlerrm; end if; end;
  -- 8 a lead records the Client's acceptance (step 2): Published C01 A1
  perform set_config('request.jwt.claims', jl, true);
  res := public.doc_round_record_outside(r2, 'accept', current_date, 'Jane Client', null);
  select count(*) into n from public.bim_documents d join public.bim_document_versions v on v.document_id = d.id join public.doc_rounds r on r.id = v.round_id
   where d.id = d2 and d.status = 'published' and d.suitability = 'A1' and v.revision = 'C01' and v.sha = r.render_sha and r.status = 'closed';
  if n = 1 and (res->>'closed')::boolean then ok := ok + 1; else raise notice 'FAIL 8: %', res; end if;
  -- 9 both records are on the ledger, and with nothing left open the owner switches the setting off
  perform set_config('request.jwt.claims', jo, true);
  perform public.set_client_outside_sentinel(p2, false);
  select count(*) into n from public.audit_log where project_id in (p1, p2) and action = 'review_step_recorded_outside' and new_value->>'given_by' = 'Jane Client'
     and new_value->>'recorded_by_uid' = l2::text;
  if n = 2 then ok := ok + 1; else raise notice 'FAIL 9: % ledger rows', n; end if;

  raise exception 'PROBE 0055: % of 9 as expected.', ok;
end $$;
