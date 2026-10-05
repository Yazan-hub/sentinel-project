-- probes/0040_probe.sql — the drill for 0040_verdict_binding.sql. Part 0 runs BEFORE the apply (read-only): it counts the
-- versions 0040 changes the answer for — a shared or wip version whose accepted verdict records no sha256 then shares,
-- publishes or restores only with a signed-in lead's reason (founder decision G-a), and so does every archived version —
-- and checks the live bodies, the trigger names and the one cde_transition 0040 was written against. Parts 1 and 2 run AFTER it. Part 1: every row must read
-- true. Part 2: one DO block that builds two projects (one with a review@1 of one lead step), a contributor and two leads,
-- the versions and verdict rows each case needs (with the service role), then tries each case — signed in through the
-- transaction-local request.jwt.claims setting that auth.uid() and auth.jwt() read ('' is the service key), and under
-- `set local role authenticated` where row-level security matters. It ALWAYS raises its summary, so everything it wrote
-- rolls back (the ledger rows' identity values are consumed). "PROBE 0040: 22 of 22 as expected." is the pass.

-- Part 0 (before the apply)
with v as (select cv.id, cv.state, cv.sha256, ic.project_id
             from public.container_versions cv join public.information_containers ic on ic.id = cv.container_id
            where cv.state in ('wip', 'shared', 'archived') and cv.deleted_at is null and ic.deleted_at is null),
l as (select distinct on (a.entity_id) a.entity_id, a.id, a.action, a.new_value
        from public.audit_log a join v on v.id = a.entity_id and a.project_id = v.project_id
       where a.entity_type = 'file_version' and a.action like 'verdict:%'
       order by a.entity_id, a.id desc),
j as (select v.*, l.new_value,
             coalesce(l.action = 'verdict:accepted'
                      and (case when jsonb_typeof(l.new_value->'summary'->'in_scope') = 'number'
                                then (l.new_value->'summary'->>'in_scope')::numeric else 0 end) > 0
                      and l.new_value->>'ids_ref' is not null, false) as judged
        from v left join l on l.entity_id = v.id)
select 'shared versions' as what, (select count(*) from j where state = 'shared')::text as n
union all select 'shared versions a verdict lets publish today', (select count(*) from j where state = 'shared' and judged)::text
union all select 'of those, verdicts that record no sha256 (a lead''s reason after 0040)',
  (select count(*) from j where state = 'shared' and judged and not coalesce(new_value ? 'sha256', false))::text
union all select 'wip versions whose accepted verdict records no sha256 (a lead''s reason to share or publish after 0040)',
  (select count(*) from j where state = 'wip' and judged and not coalesce(new_value ? 'sha256', false))::text
union all select 'archived versions (each restores with a lead''s reason after 0040, unless judged again)', (select count(*) from j where state = 'archived')::text
union all select 'shared or archived versions with no sha256', (select count(*) from j where state in ('shared', 'archived') and sha256 is null)::text
union all select 'open review chains with no reason recorded (the last approval asks a lead to send the version back to wip)',
  (select count(*) from public.container_versions cv
     join public.information_containers ic on ic.id = cv.container_id
     join lateral (select a.new_value from public.audit_log a
                    where a.project_id = ic.project_id and a.entity_type = 'review' and a.entity_id = cv.id and a.action = 'review:start'
                      and a.id > coalesce((select max(w.id) from public.audit_log w where w.project_id = ic.project_id
                                             and w.entity_type = 'container_version' and w.entity_id = cv.id
                                             and w.action = 'state:shared->wip'), 0)
                    order by a.id desc limit 1) s on true
    where cv.state = 'shared' and cv.deleted_at is null and (s.new_value->>'override') is null)::text
union all select 'verdict rows that already record a sha256 (expect 0)',
  (select count(*) from public.audit_log where entity_type = 'file_version' and action like 'verdict:%' and new_value ? 'sha256')::text
union all select 'issued versions that are live',
  (select count(*) from public.container_versions where state in ('published', 'archived') and is_live and deleted_at is null)::text
union all select 'cde_transition overloads (expect 1)',
  (select count(*) from pg_proc where proname = 'cde_transition' and pronamespace = 'public'::regnamespace)::text
union all select 'audit_log triggers (expect trg_audit_chain, trg_audit_no_change, trg_audit_no_truncate)',
  (select string_agg(tgname::text, ', ' order by tgname::text collate "C") from pg_trigger where tgrelid = 'public.audit_log'::regclass and not tgisinternal)
union all select 'cde_transition is 0032''s and cde_protect_published 0038''s (expect true)',
  (exists (select 1 from pg_proc where proname = 'cde_transition' and prosrc like '%sentinel.review%' and prosrc not like '%sha256, ledger #%')
   and exists (select 1 from pg_proc where proname = 'cde_protect_published' and prosrc like '%written once%'
               and prosrc not like '%live pointer of an issued version%'))::text;

-- Part 0 diagnostics — read-only; each names the versions part 0 counted (keys, file names, revisions, ledger ids only):
--   the shared and wip versions whose accepted verdict records no sha256, and every archived version:
--   (part 0's three CTEs) select p.key, ic.iso_name, j.state, cv.revision from j join public.container_versions cv on cv.id = j.id
--     join public.information_containers ic on ic.id = cv.container_id join public.projects p on p.id = j.project_id
--     where (j.state in ('shared', 'wip') and j.judged and not coalesce(j.new_value ? 'sha256', false)) or j.state = 'archived'
--     order by 1, 2;

-- Part 1 (after the apply)
select 'a verdict row is stamped before the chain hashes it' as check,
  (select array_agg(tgname::text order by tgname::text collate "C") from pg_trigger
    where tgrelid = 'public.audit_log'::regclass and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 4) = 4)
  = array['trg_audit_bind_verdict','trg_audit_chain'] as ok
union all select 'the stamp is a definer''s, not executable by a signed-in caller',
  exists (select 1 from pg_proc where proname = 'audit_bind_verdict' and prosecdef)
  and not has_function_privilege('authenticated', 'public.audit_bind_verdict()', 'execute')
union all select 'cde_transition is 0040''s',
  exists (select 1 from pg_proc where proname = 'cde_transition' and prosrc like '%not recorded against this version''''s sha256%'
          and prosrc like '%restoring it needs the lead''''s reason%' and prosrc like '%sentinel.review%')
union all select 'cde_transition keeps its grants',
  has_function_privilege('authenticated', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.cde_transition(uuid, public.container_state, text, text, text)', 'execute')
union all select 'cde_protect_published is 0040''s',
  exists (select 1 from pg_proc where proname = 'cde_protect_published' and prosrc like '%the live pointer of an issued version is moved by the bridge%'
          and prosrc like '%a version''''s geometry is attached by the bridge%' and prosrc like '%a version stays in its file%' and prosrc like '%changes only its state%');

-- Part 2 (after the apply)
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  p uuid; q uuid; c uuid; c2 uuid; cq uuid;
  u_con uuid := gen_random_uuid(); u_lead uuid := gen_random_uuid(); u_lead2 uuid := gen_random_uuid();
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@probe.invalid', 'role', 'authenticated')::text;
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@probe.invalid', 'role', 'authenticated')::text;
  j_lead2 text := json_build_object('sub', u_lead2, 'email', 'lead2@probe.invalid', 'role', 'authenticated')::text;
  vf jsonb := '{"summary":{"in_scope":2},"ids_ref":"ids@1"}';
  steps jsonb := '[{"name":"Lead sign-off","role":"lead","approvals":1}]';
  v_bound uuid; v_late uuid; v_null uuid; v_arc uuid; v_arc2 uuid; v_arc3 uuid; v_pub uuid; v_wip uuid; v_rv uuid;
  v_p5 uuid; v_p6a uuid; v_p6b uuid;
  a_row bigint; a_late bigint; a_rv bigint; a_p5 bigint;
  ask text := 'P0001 version %s has no accepted verdict that measured something (latest: %s) — %s needs the lead''s reason';
  unbound text := 'verdict:accepted, not recorded against this version''s sha256, ledger #';
  live text := 'P0001 the live pointer of an issued version is moved by the bridge';
  geom text := 'P0001 a version''s geometry is attached by the bridge';
  outcome text; rc int; nv jsonb; n int := 0; failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name) values ('probe-0040-p-' || sfx, 'probe 0040 p') returning id into p;
  insert into public.projects(key, name) values ('probe-0040-q-' || sfx, 'probe 0040 q') returning id into q;
  insert into public.memberships(project_id, user_id, role) values
    (p, u_con, 'contributor'), (p, u_lead, 'lead'), (q, u_lead, 'lead'), (q, u_lead2, 'lead');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', q::text, 'review', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', repeat('9', 64))),
    ('artefact', q::text, 'review@1', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', repeat('9', 64), 'body', jsonb_build_object('steps', steps)));
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0040.ifc') returning id into c;
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0040-B.ifc') returning id into c2;
  insert into public.information_containers(project_id, iso_name) values (q, 'PROBE-0040-Q.ifc') returning id into cq;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v1', repeat('a', 64)) returning id into v_bound;
  insert into public.container_versions(container_id, revision) values (c, 'v2') returning id into v_late;
  insert into public.container_versions(container_id, revision) values (c, 'v3') returning id into v_null;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v4', repeat('d', 64)) returning id into v_arc;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v5', repeat('e', 64)) returning id into v_arc2;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v6', repeat('f', 64)) returning id into v_arc3;
  insert into public.container_versions(container_id, revision, sha256, is_live) values (c, 'v7', repeat('7', 64), true) returning id into v_pub;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v8', repeat('5', 64)) returning id into v_p5;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v9', repeat('6', 64)) returning id into v_p6a;
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v10', repeat('6', 64)) returning id into v_p6b;
  insert into public.container_versions(container_id, revision) values (c2, 'v1') returning id into v_wip;
  insert into public.container_versions(container_id, revision) values (cq, 'v1') returning id into v_rv;
  -- the states the cases start from (the state trigger lets a move through only under the transition mark)
  perform set_config('sentinel.transition', v_bound::text, true);  update public.container_versions set state = 'shared' where id = v_bound;
  perform set_config('sentinel.transition', v_late::text, true);   update public.container_versions set state = 'shared' where id = v_late;
  perform set_config('sentinel.transition', v_null::text, true);   update public.container_versions set state = 'shared' where id = v_null;
  perform set_config('sentinel.transition', v_arc::text, true);    update public.container_versions set state = 'published' where id = v_arc;
                                                                   update public.container_versions set state = 'archived' where id = v_arc;
  perform set_config('sentinel.transition', v_arc2::text, true);   update public.container_versions set state = 'published' where id = v_arc2;
                                                                   update public.container_versions set state = 'archived' where id = v_arc2;
  perform set_config('sentinel.transition', v_arc3::text, true);   update public.container_versions set state = 'published' where id = v_arc3;
                                                                   update public.container_versions set state = 'archived' where id = v_arc3;
  perform set_config('sentinel.transition', v_pub::text, true);    update public.container_versions set state = 'published' where id = v_pub;
  perform set_config('sentinel.transition', v_p5::text, true);     update public.container_versions set state = 'shared' where id = v_p5;
  perform set_config('sentinel.transition', v_p6b::text, true);    update public.container_versions set state = 'shared' where id = v_p6b;
  perform set_config('sentinel.transition', '', true);
  -- verdicts as the bridge writes them (the service key): v_late's before its sha256 was written, then the sha256
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v_late, 'verdict:accepted', 'probe', vf) returning id into a_late;
  update public.container_versions set sha256 = repeat('c', 64) where id = v_late;
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value) values
    (p, 'file_version', v_null, 'verdict:accepted', 'probe', vf),
    (p, 'file_version', v_arc2, 'verdict:accepted', 'probe', vf);
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (q, 'file_version', v_rv, 'verdict:accepted', 'probe', vf) returning id into a_rv;
  -- v_p5: a bound accepted verdict, then a newer refusal; v_p6a: a bound verdict on a sibling of v_p6b with the same sha256
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value) values
    (p, 'file_version', v_p5, 'verdict:accepted', 'probe', vf),
    (p, 'file_version', v_p6a, 'verdict:accepted', 'probe', vf);
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v_p5, 'verdict:rejected', 'probe', vf) returning id into a_p5;

  -- V1 a verdict row records the version's sha256 from the database, whatever the writer sent
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'file_version', v_bound, 'verdict:accepted', 'probe', vf || jsonb_build_object('sha256', repeat('b', 64)))
      returning id, new_value into a_row, nv;
    outcome := 'OK ' || coalesce(nv->>'sha256', 'none');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK ' || repeat('a', 64) then failed := failed || ('V1 a verdict row records the version''s sha256: ' || coalesce(outcome, 'null')); end if;

  -- V2 the chain hashes the verdict row as it is stored
  n := n + 1;
  select case when a.hash = encode(extensions.digest(coalesce(a.prev_hash, '') || a.entity_type || coalesce(a.entity_id::text, '') ||
                a.action || coalesce(a.actor, '') || coalesce(a.old_value::text, '') || coalesce(a.new_value::text, '') ||
                coalesce(a.at::text, ''), 'sha256'), 'hex') then 'OK' else 'the stored hash is not the row''s' end
    into outcome from public.audit_log a where a.id = a_row;
  if outcome is distinct from 'OK' then failed := failed || ('V2 the chain hashes the verdict row as stored: ' || coalesce(outcome, 'null')); end if;

  -- V3 a verdict row whose new_value is not an object is refused
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'file_version', v_bound, 'verdict:accepted', 'probe', '["sha256"]');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a verdict row''s new_value is an object' then failed := failed || ('V3 a verdict row that is not an object is refused: ' || coalesce(outcome, 'null')); end if;

  -- V4 the control: another file_version row keeps what its writer sent
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'file_version', v_bound, 'uploaded', 'probe', '{"sha256":"as sent"}') returning new_value into nv;
    outcome := 'OK ' || coalesce(nv->>'sha256', 'none');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK as sent' then failed := failed || ('V4 another file_version row keeps what was sent: ' || coalesce(outcome, 'null')); end if;

  -- G1 a contributor's direct write of a version's geometry is refused, on a shared version a bound verdict judged too
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set platform_item_id = 'probe-item' where id = v_bound;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from geom then failed := failed || ('G1 a contributor''s geometry write: ' || coalesce(outcome, 'null')); end if;

  -- G2 the controls: the bridge (service) attaches the geometry; a contributor's INSERT carries its own
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.container_versions set platform_item_id = 'probe-item' where id = v_bound;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
    perform set_config('request.jwt.claims', j_con, true);
    set local role authenticated;
    insert into public.container_versions(container_id, revision, platform_item_id) values (c2, 'v2', 'probe-item-2');
    get diagnostics rc = row_count; outcome := outcome || ' ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1 1' then failed := failed || ('G2 the service''s attach and a contributor''s insert: ' || coalesce(outcome, 'null')); end if;

  -- P1 a lead publishes a version on its bound verdict
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_bound, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0040');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_bound);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK published' then failed := failed || ('P1 a bound verdict publishes: ' || coalesce(outcome, 'null')); end if;

  -- P2 a verdict written before the version's sha256 asks for the lead's reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_late, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0040');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format(ask, v_late, unbound || a_late, 'publishing it') then failed := failed || ('P2 an unbound verdict asks for the reason: ' || coalesce(outcome, 'null')); end if;

  -- P3 with the lead's reason it publishes, and the state: row records the reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_late, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0040', p_override => 'probe reason');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_late) || ' '
            || (select new_value->>'override' from public.audit_log where entity_id = v_late and action = 'state:shared->published' order by id desc limit 1);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK published probe reason' then failed := failed || ('P3 the reason publishes and is recorded: ' || coalesce(outcome, 'null')); end if;

  -- P4 a version with no sha256 publishes on a verdict that records none (G-d)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_null, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0040');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_null);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK published' then failed := failed || ('P4 no sha256 on either side publishes: ' || coalesce(outcome, 'null')); end if;

  -- P5 only the latest verdict counts: a bound accepted verdict followed by a newer refusal asks for the reason
  --    (a regression control: the schema before 0040 answers it the same way; it keeps the rule latest-only)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_p5, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0040');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format(ask, v_p5, 'verdict:rejected, ledger #' || a_p5, 'publishing it') then failed := failed || ('P5 the latest verdict only: ' || coalesce(outcome, 'null')); end if;

  -- P6 a sibling version with the same sha256 is not judged by the other version's verdict
  --    (a regression control: the schema before 0040 answers it the same way; it keeps the verdict keyed on the version)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_p6b, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0040');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format(ask, v_p6b, 'none', 'publishing it') then failed := failed || ('P6 a sibling''s verdict does not count: ' || coalesce(outcome, 'null')); end if;

  -- R1 a lead's restore of a version with no verdict asks for the reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_arc, p_new_state => 'published', p_actor => 'probe', p_note => 'file restored');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format(ask, v_arc, 'none', 'restoring it') then failed := failed || ('R1 a restore with no verdict asks for the reason: ' || coalesce(outcome, 'null')); end if;

  -- R2 with the lead's reason it is restored, and the state: row records the reason
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_arc, p_new_state => 'published', p_actor => 'probe', p_note => 'file restored', p_override => 'probe restore');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_arc) || ' '
            || (select new_value->>'override' from public.audit_log where entity_id = v_arc and action = 'state:archived->published' order by id desc limit 1);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK published probe restore' then failed := failed || ('R2 a lead''s restore with a reason: ' || coalesce(outcome, 'null')); end if;

  -- R3 the bridge (service) restores a version on its bound verdict
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_arc2, p_new_state => 'published', p_actor => 'probe', p_note => 'file restored');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_arc2);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK published' then failed := failed || ('R3 a restore on a bound verdict: ' || coalesce(outcome, 'null')); end if;

  -- R4 a reason is a signed-in lead's: the service's restore with one is refused
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_arc3, p_new_state => 'published', p_actor => 'probe', p_note => 'file restored', p_override => 'machine reason');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s has no accepted verdict that measured something (latest: none) — the lead''s reason is taken only from a signed-in lead, and this call has no signed-in user', v_arc3)
    then failed := failed || ('R4 the service''s reason is refused: ' || coalesce(outcome, 'null')); end if;

  -- L1 a contributor's direct change of an issued version's live pointer is refused
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set is_live = false where id = v_pub;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from live then failed := failed || ('L1 a contributor''s live pointer change on an issued version: ' || coalesce(outcome, 'null')); end if;

  -- L2 a lead's direct change is refused too: the bridge moves it
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set is_live = false where id = v_pub;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from live then failed := failed || ('L2 a lead''s live pointer change on an issued version: ' || coalesce(outcome, 'null')); end if;

  -- L3 the bridge (service) moves it
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.container_versions set is_live = false where id = v_pub;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('L3 the service moves the live pointer: ' || coalesce(outcome, 'null')); end if;

  -- L4 the control: a contributor's live pointer on a draft is unchanged (cv_update)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set is_live = true where id = v_wip;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('L4 a contributor''s live pointer on a draft: ' || coalesce(outcome, 'null')); end if;

  -- C0 a lead shares a version for review on its bound verdict (no sha256 on either side)
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_rv, p_new_state => 'shared', p_actor => 'probe', p_note => 'for review');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_rv);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK shared' then failed := failed || ('C0 a lead shares for review on a bound verdict: ' || coalesce(outcome, 'null')); end if;

  -- C1 once the version's sha256 is written, the chain's last approval asks for the lead's reason and publishes nothing
  perform set_config('request.jwt.claims', '', true);
  update public.container_versions set sha256 = repeat('8', 64) where id = v_rv;
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    perform public.review_decide(v_rv, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format(ask, v_rv, unbound || a_rv, 'publishing it') then failed := failed || ('C1 the last approval on an unbound verdict: ' || coalesce(outcome, 'null')); end if;

  perform set_config('request.jwt.claims', '', true);
  if (select state from public.container_versions where id = v_rv) is distinct from 'shared'
     or (select state from public.container_versions where id = v_arc3) is distinct from 'archived'
     or (select is_live from public.container_versions where id = v_pub) is distinct from false
     or (select state from public.container_versions where id = v_p5) is distinct from 'shared'
     or (select state from public.container_versions where id = v_p6b) is distinct from 'shared' then
    failed := failed || 'a refused move changed a row'::text;
  end if;

  raise exception 'PROBE 0040: % of % as expected%. Everything above is rolled back (both projects, the memberships, the template, every row built for the cases and the ledger rows they wrote).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
