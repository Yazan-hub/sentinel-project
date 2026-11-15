-- probes/0057_probe.sql — the drill for 0057_team_outside.sql. Run AFTER the apply (and after 0053 to 0056).
-- Part 1: catalog checks (every row ok = true): the mark on task_teams, the changed send, the new function and its grants
--   (authenticated yes, service_role and anon no).
-- Part 2: one DO block on scratch rows: one office, one project with an owner, a second lead, a member of team ARC, and team STR with no member.
--   It proves a confirmed BEP is refused while STR is not marked, is sent once it is, that only a lead who is not the sender records STR's
--   confirmation, once, that the step completes when ARC confirms in Sentinel, and that the BEP reaches Published C01 A1.
--   It always raises its summary, so everything it wrote rolls back. "PROBE 0057: 8 of 8 as expected." is the pass.

-- Part 1
select 'task_teams carries the mark, false by default' as what,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'task_teams' and column_name = 'outside_sentinel'
            and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false') as ok
union all
select 'the send carries the 0057 change and the new function exists',
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'doc_round_start' and prosrc like '%0057:%') = 1
  and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'doc_round_record_team_outside') = 1
union all
select 'authenticated may call them; service_role and anon may not',
  has_function_privilege('authenticated', 'public.doc_round_record_team_outside(uuid, text, text, date, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.doc_round_start(uuid, jsonb, date, jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.doc_round_record_team_outside(uuid, text, text, date, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.doc_round_record_team_outside(uuid, text, text, date, text, text)', 'execute')
  and not has_function_privilege('service_role', 'public.doc_round_start(uuid, jsonb, date, jsonb)', 'execute');

-- Part 2
do $$
declare
  off1 uuid; p1 uuid; d1 uuid; r1 uuid;
  o uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); a uuid := gen_random_uuid();
  secs jsonb := '[{"id":"s1","heading":"Aim","state":"wip","body":"x","blocks":[{"id":"s1.t0","kind":"text","title":"","data":{"markdown":"x"}}]}]';
  ok int := 0; res jsonb; n int;
  jo text := format('{"sub":"%s","role":"authenticated","email":"o@probe.test"}', o);
  jl text := format('{"sub":"%s","role":"authenticated","email":"l@probe.test"}', l2);
  ja text := format('{"sub":"%s","role":"authenticated","email":"a@probe.test"}', a);
begin
  insert into auth.users(id, email) select u, 'probe-0057-' || left(u::text, 8) || '@probe.test' from unnest(array[o, l2, a]) u;
  insert into public.projects(key, name, kind) values ('probe-0057-office', 'P', 'office') returning id into off1;
  insert into public.projects(key, name, office_key) values ('probe-0057-1', 'P', 'probe-0057-office') returning id into p1;
  insert into public.memberships(project_id, user_id, role, party, task_team) values
    (p1, o, 'owner', 'lead_appointed', null), (p1, l2, 'lead', 'lead_appointed', null), (p1, a, 'contributor', 'appointed', 'ARC');
  insert into public.task_teams(project_id, code, name) values (p1, 'ARC', 'Architecture'), (p1, 'STR', 'Structure');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', off1::text, 'review', '{"version":1,"sha256":"00"}'),
    ('artefact', off1::text, 'review@1', jsonb_build_object('body', jsonb_build_object('steps', '[]'::jsonb, 'documents', jsonb_build_object('bep', jsonb_build_object('steps',
      jsonb_build_array('{"name":"Task teams confirm","role":"contributor","kind":"task_teams"}'::jsonb, '{"name":"Lead sign-off","role":"lead","party":"lead_appointed"}'::jsonb,
                        '{"name":"Client","role":"viewer","party":"appointing"}'::jsonb))))));
  insert into public.bim_documents(project_id, doc_type, title, sections, stage) values (p1, 'BEP', 'Probe BEP', secs, 'confirmed') returning id into d1;

  -- 1 the client is outside Sentinel; team STR has no member and is not marked: the send is refused, naming it
  perform set_config('request.jwt.claims', jo, true);
  perform public.set_client_outside_sentinel(p1, true);
  begin perform public.doc_round_start(d1, jsonb_build_object('id', d1, 'title', 'Probe BEP', 'sections', secs), null, '{}'); raise notice 'FAIL 1: sent with an unmarked team that has no member';
  exception when others then if sqlerrm like '%Team STR has no active member%mark the team as not in Sentinel%' then ok := ok + 1; else raise notice 'FAIL 1: %', sqlerrm; end if; end;
  -- 2 marked, the owner sends it
  update public.task_teams set outside_sentinel = true where project_id = p1 and code = 'STR';
  res := public.doc_round_start(d1, jsonb_build_object('id', d1, 'title', 'Probe BEP', 'sections', secs), null, '{}');
  r1 := (res->>'round_id')::uuid;
  select count(*) into n from public.doc_rounds where id = r1 and teams_owed = array['ARC', 'STR'];
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 2: %', res; end if;
  -- 3 the sender does not record a team
  begin perform public.doc_round_record_team_outside(r1, 'STR', 'accept', current_date, 'Sam Structure', null); raise notice 'FAIL 3: the sender recorded';
  exception when others then if sqlerrm like '%sender does not decide%' then ok := ok + 1; else raise notice 'FAIL 3: %', sqlerrm; end if; end;
  -- 4 a second lead records team STR: the row keeps the team, the name and the day; step 1 still waits on ARC
  perform set_config('request.jwt.claims', jl, true);
  res := public.doc_round_record_team_outside(r1, 'str', 'accept', current_date, 'Sam Structure', 'e-mail');
  select count(*) into n from public.bim_documents d join public.doc_round_decisions x on x.round_id = r1
   where d.id = d1 and d.status = 'wip' and x.step = 1 and x.outside and x.party = 'appointed' and x.task_team = 'STR' and x.outside_name = 'Sam Structure' and x.uid = l2;
  if n = 1 and res->>'task_team' = 'STR' then ok := ok + 1; else raise notice 'FAIL 4: %', res; end if;
  -- 5 a team is recorded once
  begin perform public.doc_round_record_team_outside(r1, 'STR', 'accept', current_date, 'Sam Structure', null); raise notice 'FAIL 5: recorded twice';
  exception when others then if sqlerrm like '%already confirmed or skipped%' then ok := ok + 1; else raise notice 'FAIL 5: %', sqlerrm; end if; end;
  -- 6 team ARC confirms in Sentinel: step 1 is complete, Shared S3
  perform set_config('request.jwt.claims', ja, true);
  perform public.doc_round_decide(r1, 'accept');
  select count(*) into n from public.bim_documents where id = d1 and status = 'shared' and suitability = 'S3';
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 6: step 1 not complete'; end if;
  -- 7 the same lead signs off and records the Client's acceptance: Published C01 A1
  perform set_config('request.jwt.claims', jl, true);
  perform public.doc_round_decide(r1, 'accept');
  res := public.doc_round_record_outside(r1, 'accept', current_date, 'Jane Client', null);
  select count(*) into n from public.bim_documents d join public.bim_document_versions v on v.document_id = d.id join public.doc_rounds r on r.id = v.round_id
   where d.id = d1 and d.status = 'published' and d.suitability = 'A1' and v.revision = 'C01' and r.status = 'closed';
  if n = 1 and (res->>'closed')::boolean then ok := ok + 1; else raise notice 'FAIL 7: %', res; end if;
  -- 8 the team's record is on the ledger
  select count(*) into n from public.audit_log where project_id = p1 and action = 'review_step_recorded_outside' and new_value->>'task_team' = 'STR'
     and new_value->>'given_by' = 'Sam Structure' and new_value->>'recorded_by_uid' = l2::text;
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 8: % ledger rows', n; end if;

  raise exception 'PROBE 0057: % of 8 as expected.', ok;
end $$;
