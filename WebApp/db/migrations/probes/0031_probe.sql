-- probes/0031_probe.sql — the drill for 0031_transition_reads_verdict.sql, run by the controller AFTER 0031 is applied.
-- One DO block: it builds two throwaway projects, drives cde_transition and the state trigger through every refusal
-- and every allowed move, then ALWAYS raises its summary, so every write it made rolls back (projects, versions,
-- memberships, audit rows). The summary is the error text: "PROBE 0031: 20 of 20 as expected …" is the pass, naming
-- the 17 ledger ids its rolled-back rows took (P3, P5, P9, P10 x2, P11 x3, P12 x3, P13 x2, P19 x2, P20 x2).
-- Side effects that survive the rollback: the audit rows' identity values are consumed (the summary names them, so
-- the drill notes can say why those ledger ids do not exist), and the audit chain's advisory lock is held for the
-- block's few milliseconds. A signed-in user is simulated with the transaction-local request.jwt.claims setting
-- that auth.uid() reads; the two user ids are random and exist only as memberships inside the rolled-back block.
do $probe$
declare
  p uuid; p2 uuid; c uuid;
  u_lead uuid := gen_random_uuid();
  u_contrib uuid := gen_random_uuid();
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v6 uuid; v7 uuid;
  a_zero bigint; a_rej bigint; a_ok bigint; a_client bigint; a_legacy bigint;
  nv jsonb;
  outcome text;
  n int := 0;
  failed text[] := '{}';
  burned bigint[];
begin
  insert into public.projects(key, name) values ('probe-0031-' || substr(md5(random()::text), 1, 10), 'probe 0031') returning id into p;
  insert into public.projects(key, name) values ('probe-0031-' || substr(md5(random()::text), 1, 10), 'probe 0031 other') returning id into p2;
  insert into public.memberships(project_id, user_id, role) values (p, u_lead, 'lead'), (p, u_contrib, 'contributor');
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0031.ifc') returning id into c;

  -- P1 a new version cannot start published or shared
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, state) values (c, 'p1', 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 a new version starts in wip (got shared)' then failed := failed || ('P1 ' || outcome); end if;

  -- P2 a direct state write is refused (the PATCH a contributor could make through cv_update)
  insert into public.container_versions(container_id, revision) values (c, 'v1') returning id into v1;
  n := n + 1;
  begin
    update public.container_versions set state = 'shared' where id = v1;
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 container state changes go through cde_transition' then failed := failed || ('P2 ' || outcome); end if;

  -- P3 the old bridge's call shape (named arguments, no p_override) resolves and moves wip -> shared
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'probe', p_note => 'p3');
    outcome := (select state::text from public.container_versions where id = v1);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'shared' then failed := failed || ('P3 ' || outcome); end if;

  -- P4 shared -> published with no verdict: refused, needs the lead's reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> format('P0001 version %s has no accepted verdict that measured something (latest: none) — publishing it needs the lead''s reason', v1)
    then failed := failed || ('P4 ' || outcome); end if;

  -- P5 accepted with nothing in scope measured nothing: refused, and the message names the row it read
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v1, 'verdict:accepted', 'probe', '{"summary":{"in_scope":0},"ids_ref":"ids@1"}') returning id into a_zero;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> format('P0001 version %s has no accepted verdict that measured something (latest: verdict:accepted with nothing in scope, ledger #%s) — publishing it needs the lead''s reason', v1, a_zero)
    then failed := failed || ('P5 ' || outcome); end if;

  -- P6 a reason on the service path (no signed-in user) is refused
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe', p_override => 'service reason');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like 'P0001 % the lead''s reason is taken only from a signed-in lead, and this call has no signed-in user'
    then failed := failed || ('P6 ' || outcome); end if;

  -- P7 a signed-in contributor is refused by role (insufficient_privilege, a 403 through PostgREST)
  perform set_config('request.jwt.claims', json_build_object('sub', u_contrib, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_override => 'contributor reason');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> '42501 insufficient role to transition (needs lead or owner)' then failed := failed || ('P7 ' || outcome); end if;

  -- P8 a signed-in lead with a blank reason (spaces, a tab, a newline) is refused
  perform set_config('request.jwt.claims', json_build_object('sub', u_lead, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_override => E'  \t\n ');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like 'P0001 % — publishing it needs the lead''s reason' then failed := failed || ('P8 ' || outcome); end if;

  -- P9 a signed-in lead's reason publishes it; the state: row records the verdict it read, its id and the reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_note => 'p9', p_override => '  client signed off by email  ');
    select new_value into nv from public.audit_log where entity_id = v1 and action = 'state:shared->published' order by id desc limit 1;
    nv := nv - 'review_start_id'; -- 0032 adds this key to every state: row; the drill reads 0031's fields either side of it
    outcome := (select state::text from public.container_versions where id = v1) || ' ' || nv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'published ' || jsonb_build_object('state', 'published', 'note', 'p9', 'verdict', 'verdict:accepted',
                                                                  'verdict_audit_id', a_zero, 'override', 'client signed off by email')::text
    then failed := failed || ('P9 ' || coalesce(outcome, 'null')); end if;
  perform set_config('request.jwt.claims', '', true);

  -- P10 an accepted verdict written on ANOTHER project about this version is not this project's verdict
  insert into public.container_versions(container_id, revision) values (c, 'v2') returning id into v2;
  perform public.cde_transition(p_version => v2, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p2, 'file_version', v2, 'verdict:accepted', 'probe', '{"summary":{"in_scope":3},"ids_ref":"ids@1"}');
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v2, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like 'P0001 % (latest: none) — publishing it needs the lead''s reason' then failed := failed || ('P10 ' || outcome); end if;

  -- P11 the LATEST verdict decides: accepted (in scope 5) then rejected is refused, naming the rejected row
  insert into public.container_versions(container_id, revision) values (c, 'v3') returning id into v3;
  perform public.cde_transition(p_version => v3, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v3, 'verdict:accepted', 'probe', '{"summary":{"in_scope":5},"ids_ref":"ids@1"}');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v3, 'verdict:rejected', 'probe', '{"summary":{"in_scope":5},"ids_ref":"ids@1"}') returning id into a_rej;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v3, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like format('P0001 %% (latest: verdict:rejected, ledger #%s) — publishing it needs the lead''s reason', a_rej)
    then failed := failed || ('P11 ' || outcome); end if;

  -- P12 an accepted verdict that measured something under an installed IDS publishes on the service path, and the
  -- row names it
  insert into public.container_versions(container_id, revision) values (c, 'v4') returning id into v4;
  perform public.cde_transition(p_version => v4, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v4, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}') returning id into a_ok;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'published', p_actor => 'probe', p_note => 'p12');
    select new_value into nv from public.audit_log where entity_id = v4 and action = 'state:shared->published' order by id desc limit 1;
    nv := nv - 'review_start_id'; -- as in P9
    outcome := nv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from jsonb_build_object('state', 'published', 'note', 'p12', 'verdict', 'verdict:accepted',
                                                  'verdict_audit_id', a_ok, 'override', null)::text
    then failed := failed || ('P12 ' || coalesce(outcome, 'null')); end if;

  -- P13 published -> archived, then the restore archived -> published, both through the function
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'archived', p_actor => 'probe', p_note => 'file archived');
    perform public.cde_transition(p_version => v4, p_new_state => 'published', p_actor => 'probe', p_note => 'file restored');
    outcome := (select state::text from public.container_versions where id = v4)
            || ' ' || (select count(*) from public.audit_log where entity_id = v4 and action in ('state:published->archived', 'state:archived->published'));
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'published 2' then failed := failed || ('P13 ' || outcome); end if;

  -- P14 the live-pointer PATCH (setLiveVersion) still works: the trigger watches state only
  n := n + 1;
  begin
    update public.container_versions set is_live = true where id = v4;
    outcome := (select is_live::text from public.container_versions where id = v4);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'true' then failed := failed || ('P14 ' || outcome); end if;

  -- P15 an illegal move is still refused
  insert into public.container_versions(container_id, revision) values (c, 'v5') returning id into v5;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v5, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'P0001 illegal ISO 19650 transition: wip -> published' then failed := failed || ('P15 ' || outcome); end if;

  -- P16 an unknown version is no_data_found (P0002 — the bridge's 404)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => gen_random_uuid(), p_new_state => 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate; end;
  if outcome <> 'P0002' then failed := failed || ('P16 ' || outcome); end if;

  -- P17 one overload only, the 5-argument one (the 4-argument one is dropped)
  n := n + 1;
  outcome := (select string_agg(array_to_string(f.proargnames, ','), ' / ') from pg_proc f
               join pg_namespace s on s.oid = f.pronamespace where s.nspname = 'public' and f.proname = 'cde_transition');
  if outcome is distinct from 'p_version,p_new_state,p_actor,p_note,p_override' then failed := failed || ('P17 ' || coalesce(outcome, 'none')); end if;

  -- P18 grants: authenticated and service_role execute it, anon does not
  n := n + 1;
  outcome := has_function_privilege('anon', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')::text || ' '
          || has_function_privilege('service_role', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')::text;
  if outcome <> 'false true true' then failed := failed || ('P18 anon/authenticated/service_role = ' || outcome); end if;

  -- P19 an accepted verdict that measured something, judged by an IDS the caller sent (ids_ref null), never
  -- unlocks publishing: refused without a reason, naming the row
  insert into public.container_versions(container_id, revision) values (c, 'v6') returning id into v6;
  perform public.cde_transition(p_version => v6, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v6, 'verdict:accepted', 'probe', '{"summary":{"in_scope":3},"ids_ref":null}') returning id into a_client;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v6, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> format('P0001 version %s has no accepted verdict that measured something (latest: verdict:accepted, judged by an IDS the caller sent, ledger #%s) — publishing it needs the lead''s reason', v6, a_client)
    then failed := failed || ('P19 ' || outcome); end if;

  -- P20 an accepted verdict from before verdicts named their IDS (no ids_ref key) does not unlock publishing either,
  -- and the refusal does not claim the caller sent the IDS
  insert into public.container_versions(container_id, revision) values (c, 'v7') returning id into v7;
  perform public.cde_transition(p_version => v7, p_new_state => 'shared', p_actor => 'probe');
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v7, 'verdict:accepted', 'probe', '{"summary":{"in_scope":3}}') returning id into a_legacy;
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v7, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> format('P0001 version %s has no accepted verdict that measured something (latest: verdict:accepted, judged by an IDS the row does not name, ledger #%s) — publishing it needs the lead''s reason', v7, a_legacy)
    then failed := failed || ('P20 ' || outcome); end if;

  select array_agg(id order by id) into burned from public.audit_log where project_id in (p, p2);
  raise exception 'PROBE 0031: % of % as expected%. Everything above is rolled back; its audit rows took ledger ids % (identity values are not returned, so those ids will not exist).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end,
    burned;
end $probe$;
