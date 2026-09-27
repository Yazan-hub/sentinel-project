-- probes/0032_probe.sql — the drill for 0032_review_chain.sql, run by the controller AFTER 0032 is applied.
-- One DO block: it builds an office and four throwaway projects (one with its own review@1 of two steps, one inheriting
-- the office's review@2, one whose own review@1 has steps [], one with none), drives cde_transition and review_decide
-- through every refusal and every allowed move of the review chain, then ALWAYS raises its summary, so every write it
-- made rolls back (projects, memberships, templates, versions, audit rows). The summary is the error text:
-- "PROBE 0032: 24 of 24 as expected …" is the pass, naming the 37 ledger ids its rolled-back rows took (6 verdict
-- rows, 7 review:start, 8 review:approve, 1 review:reject, 15 state:).
-- Side effects that survive the rollback: the audit rows' identity values are consumed (the summary names them, so
-- the drill notes can say why those ledger ids do not exist), and the audit chain's advisory lock is held for the
-- block's few milliseconds. A signed-in user is simulated with the transaction-local request.jwt.claims setting that
-- auth.uid() and auth.jwt() read ('' is the service key: no signed-in user); the six user ids are random and exist
-- only as memberships inside the rolled-back block.
do $probe$
declare
  o uuid; p uuid; p_inh uuid; p_off uuid; p_none uuid;
  o_key text := 'probe-0032-office-' || substr(md5(random()::text), 1, 8);
  c uuid; c_inh uuid; c_off uuid; c_none uuid;
  u_lead uuid := gen_random_uuid();
  u_lead2 uuid := gen_random_uuid();
  u_c1 uuid := gen_random_uuid();
  u_c2 uuid := gen_random_uuid();
  u_c3 uuid := gen_random_uuid();
  u_view uuid := gen_random_uuid();
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@probe.invalid', 'role', 'authenticated')::text;
  j_lead2 text := json_build_object('sub', u_lead2, 'email', 'lead2@probe.invalid', 'role', 'authenticated')::text;
  j_c1 text := json_build_object('sub', u_c1, 'email', 'c1@probe.invalid', 'role', 'authenticated')::text;
  j_c2 text := json_build_object('sub', u_c2, 'email', 'c2@probe.invalid', 'role', 'authenticated')::text;
  j_c3 text := json_build_object('sub', u_c3, 'email', 'c3@probe.invalid', 'role', 'authenticated')::text;
  j_view text := json_build_object('sub', u_view, 'email', 'viewer@probe.invalid', 'role', 'authenticated')::text;
  steps_p jsonb := '[{"name":"Model check","role":"contributor","approvals":2},{"name":"Lead sign-off","role":"lead","approvals":1}]';
  steps_o jsonb := '[{"name":"Office check","role":"contributor","approvals":1}]';
  sha_p text := repeat('a', 64);
  sha_o text := repeat('b', 64);
  sha_off text := repeat('c', 64);
  sha_p2 text := repeat('d', 64);
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid; v_inh uuid; v_off uuid; v_none uuid;
  a_v1 bigint;
  s1 bigint; s2 bigint; s3 bigint; s4 bigint;
  x_id bigint; x_hash text;
  r jsonb; nv jsonb; sv jsonb; act text; act2 text;
  outcome text;
  n int := 0;
  failed text[] := '{}';
  burned bigint[];
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name, kind) values (o_key, 'probe 0032 office', 'office') returning id into o;
  insert into public.projects(key, name, office_key) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032', o_key) returning id into p;
  insert into public.projects(key, name, office_key) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032 inherits', o_key) returning id into p_inh;
  insert into public.projects(key, name, office_key) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032 steps []', o_key) returning id into p_off;
  insert into public.projects(key, name) values ('probe-0032-' || substr(md5(random()::text), 1, 10), 'probe 0032 none') returning id into p_none;
  insert into public.memberships(project_id, user_id, role) values
    (p, u_lead, 'lead'), (p, u_lead2, 'lead'), (p, u_c1, 'contributor'), (p, u_c2, 'contributor'), (p, u_c3, 'contributor'),
    (p, u_view, 'viewer'), (p_inh, u_lead, 'lead'), (p_inh, u_c1, 'contributor');
  -- The templates as putArtefact stores them (the fields review_template reads): pointer 'review', body 'review@<n>'.
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', p::text, 'review', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_p)),
    ('artefact', p::text, 'review@1', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_p, 'body', jsonb_build_object('steps', steps_p))),
    ('artefact', o::text, 'review', jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_o)),
    ('artefact', o::text, 'review@2', jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_o, 'body', jsonb_build_object('steps', steps_o))),
    ('artefact', p_off::text, 'review', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_off)),
    ('artefact', p_off::text, 'review@1', jsonb_build_object('kind', 'review', 'version', 1, 'sha256', sha_off, 'body', jsonb_build_object('steps', '[]'::jsonb)));
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0032.ifc') returning id into c;
  insert into public.information_containers(project_id, iso_name) values (p_inh, 'PROBE-0032-INH.ifc') returning id into c_inh;
  insert into public.information_containers(project_id, iso_name) values (p_off, 'PROBE-0032-OFF.ifc') returning id into c_off;
  insert into public.information_containers(project_id, iso_name) values (p_none, 'PROBE-0032-NONE.ifc') returning id into c_none;
  insert into public.container_versions(container_id, revision) values (c, 'v1') returning id into v1;
  insert into public.container_versions(container_id, revision) values (c, 'v2') returning id into v2;
  insert into public.container_versions(container_id, revision) values (c, 'v3') returning id into v3;
  insert into public.container_versions(container_id, revision) values (c, 'v4') returning id into v4;
  insert into public.container_versions(container_id, revision) values (c, 'v5') returning id into v5;
  insert into public.container_versions(container_id, revision) values (c_inh, 'v1') returning id into v_inh;
  insert into public.container_versions(container_id, revision) values (c_off, 'v1') returning id into v_off;
  insert into public.container_versions(container_id, revision) values (c_none, 'v1') returning id into v_none;
  -- Accepted verdicts that measured something under an installed IDS (v2 and v_none have none).
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v1, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}') returning id into a_v1;
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value) values
    (p, 'file_version', v3, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p, 'file_version', v4, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p, 'file_version', v5, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p_inh, 'file_version', v_inh, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}'),
    (p_off, 'file_version', v_off, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}');

  -- P1 review_template: the project's own review@n, else its office's, else null; a project's own steps [] wins
  n := n + 1;
  begin
    outcome := concat_ws(' | ', public.review_template(p)::text, public.review_template(p_inh)::text,
                         public.review_template(p_off)::text, coalesce(public.review_template(p_none)::text, 'null'));
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from concat_ws(' | ',
       jsonb_build_object('ref', 'review@1', 'source', 'project', 'sha256', sha_p, 'steps', steps_p)::text,
       jsonb_build_object('ref', 'review@2', 'source', 'office', 'sha256', sha_o, 'steps', steps_o)::text,
       jsonb_build_object('ref', 'review@1', 'source', 'project', 'sha256', sha_off, 'steps', '[]'::jsonb)::text,
       'null')
    then failed := failed || ('P1 ' || coalesce(outcome, 'null')); end if;

  -- P2 the service key cannot share a version on a project that requires review, even with an accepted verdict
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 this project requires review (review@1) — a version is shared by a signed-in lead, not by this call'
    then failed := failed || ('P2 ' || coalesce(outcome, 'null')); end if;

  -- P3 a signed-in lead cannot share a version with no verdict without a reason
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v2, p_new_state => 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s has no accepted verdict that measured something (latest: none) — sharing it for review needs the lead''s reason', v2)
    then failed := failed || ('P3 ' || coalesce(outcome, 'null')); end if;

  -- P4 a lead's reason shares it; the review:start row keeps the reason, and the state: row names the chain
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v2, p_new_state => 'shared', p_override => '  client asked for an early look  ');
    select id, new_value into s2, nv from public.audit_log where entity_type = 'review' and entity_id = v2 and action = 'review:start' order by id desc limit 1;
    select new_value into sv from public.audit_log where entity_id = v2 and action = 'state:wip->shared' order by id desc limit 1;
    outcome := (select state::text from public.container_versions where id = v2) || ' ' || nv::text || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'shared '
       || jsonb_build_object('submitter_uid', u_lead::text, 'ref', 'review@1', 'source', 'project', 'sha256', sha_p, 'steps', steps_p,
                             'override', 'client asked for an early look', 'verdict', null, 'verdict_audit_id', null)::text || ' '
       || jsonb_build_object('state', 'shared', 'note', null, 'verdict', null, 'verdict_audit_id', null,
                             'override', 'client asked for an early look', 'review_start_id', s2)::text
    then failed := failed || ('P4 ' || coalesce(outcome, 'null')); end if;

  -- P5 a verdict-shared chain: the review:start snapshot (submitter_uid, ref, sha256, steps, the verdict it read) and
  -- both rows stamped with the signed-in lead's e-mail, never the caller's p_actor
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'shared', p_actor => 'someone else', p_note => 'for review');
    select id, actor, new_value into s1, act, nv from public.audit_log where entity_type = 'review' and entity_id = v1 and action = 'review:start' order by id desc limit 1;
    select actor, new_value into act2, sv from public.audit_log where entity_id = v1 and action = 'state:wip->shared' order by id desc limit 1;
    outcome := act || ' ' || nv::text || ' ' || act2 || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'lead@probe.invalid '
       || jsonb_build_object('submitter_uid', u_lead::text, 'ref', 'review@1', 'source', 'project', 'sha256', sha_p, 'steps', steps_p,
                             'override', null, 'verdict', 'verdict:accepted', 'verdict_audit_id', a_v1)::text || ' lead@probe.invalid '
       || jsonb_build_object('state', 'shared', 'note', 'for review', 'verdict', 'verdict:accepted', 'verdict_audit_id', a_v1,
                             'override', null, 'review_start_id', s1)::text
    then failed := failed || ('P5 ' || coalesce(outcome, 'null')); end if;

  -- P6 the service key cannot decide (insufficient_privilege, a 403 through PostgREST)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 a review decision is a signed-in person''s' then failed := failed || ('P6 ' || coalesce(outcome, 'null')); end if;

  -- P7 a viewer's rank does not reach the step's role
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 step 1 (Model check) needs contributor or above' then failed := failed || ('P7 ' || coalesce(outcome, 'null')); end if;

  -- P8 the submitter does not review their own share
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 the submitter does not review their own share' then failed := failed || ('P8 ' || coalesce(outcome, 'null')); end if;

  -- P9 a contributor's approval: the review:approve 1 row (stamped with their e-mail, the trimmed note, approver_uid,
  -- chain_start_id) and the reply naming its id and 64-hex hash
  perform set_config('request.jwt.claims', j_c1, true);
  n := n + 1;
  begin
    r := public.review_decide(v1, 'approve', '  looks fine  ');
    select id, hash, actor, new_value into x_id, x_hash, act, nv from public.audit_log where entity_type = 'review' and entity_id = v1 and action = 'review:approve 1' order by id desc limit 1;
    outcome := r::text || ' ' || act || ' ' || nv::text || ' ' || (x_hash ~ '^[0-9a-f]{64}$')::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from jsonb_build_object('id', x_id, 'hash', x_hash, 'decision', 'approve', 'step', 1, 'of', 2, 'name', 'Model check',
                                                  'role', 'contributor', 'published', false, 'state', 'shared')::text || ' c1@probe.invalid '
       || jsonb_build_object('step', 1, 'of', 2, 'name', 'Model check', 'role', 'contributor', 'note', 'looks fine',
                             'approver_uid', u_c1::text, 'chain_start_id', s1)::text || ' true'
    then failed := failed || ('P9 ' || coalesce(outcome, 'null')); end if;

  -- P10 one person approves once per chain
  n := n + 1;
  begin
    perform public.review_decide(v1, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 you already approved step 1 of this chain' then failed := failed || ('P10 ' || coalesce(outcome, 'null')); end if;

  -- P11 the service key cannot publish a version under review, though its verdict would publish it under 0031
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s is under review (chain ledger #%s) — it is published by its last approval, not by this call', v1, s1)
    then failed := failed || ('P11 ' || coalesce(outcome, 'null')); end if;

  -- P12 nor can a signed-in lead, a reason included (a reason never skips a human step)
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'published', p_override => 'the client wants it today');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s is under review (chain ledger #%s) — it is published by its last approval, not by this call', v1, s1)
    then failed := failed || ('P12 ' || coalesce(outcome, 'null')); end if;

  -- P13 the service key cannot send a version under review back to wip (no machine closes a chain)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v1, p_new_state => 'wip', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format('P0001 version %s is under review — only a signed-in lead can send it back to wip', v1)
    then failed := failed || ('P13 ' || coalesce(outcome, 'null')); end if;

  -- P14 a second contributor completes step 1 (two distinct approvals); a contributor cannot take the lead's step 2
  perform set_config('request.jwt.claims', j_c2, true);
  n := n + 1;
  begin
    r := public.review_decide(v1, 'approve');
    outcome := (r->>'step') || ' ' || (r->>'published') || ' ' || (r->>'state');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c3, true);
  begin
    perform public.review_decide(v1, 'approve');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '1 false shared | 42501 step 2 (Lead sign-off) needs lead or above' then failed := failed || ('P14 ' || coalesce(outcome, 'null')); end if;

  -- P15 the last approval publishes it in the same call, the approver stamped as the state: row's actor
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    r := public.review_decide(v1, 'approve');
    select actor, new_value into act, sv from public.audit_log where entity_id = v1 and action = 'state:shared->published' order by id desc limit 1;
    outcome := (r->>'step') || ' ' || (r->>'of') || ' ' || (r->>'published') || ' ' || (r->>'state') || ' ' || act || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '2 2 true published lead2@probe.invalid '
       || jsonb_build_object('state', 'published', 'note', 'review complete', 'verdict', 'verdict:accepted', 'verdict_audit_id', a_v1,
                             'override', null, 'review_start_id', s1)::text
    then failed := failed || ('P15 ' || coalesce(outcome, 'null')); end if;

  -- P16 a chain shared on a lead's reason completes and publishes under that recorded reason
  n := n + 1;
  begin
    perform set_config('request.jwt.claims', j_c1, true);
    perform public.review_decide(v2, 'approve');
    perform set_config('request.jwt.claims', j_c2, true);
    perform public.review_decide(v2, 'approve');
    perform set_config('request.jwt.claims', j_lead2, true);
    r := public.review_decide(v2, 'approve');
    select actor, new_value into act, sv from public.audit_log where entity_id = v2 and action = 'state:shared->published' order by id desc limit 1;
    outcome := (r->>'published') || ' ' || act || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'true lead2@probe.invalid '
       || jsonb_build_object('state', 'published', 'note', 'review complete', 'verdict', null, 'verdict_audit_id', null,
                             'override', 'client asked for an early look', 'review_start_id', s2)::text
    then failed := failed || ('P16 ' || coalesce(outcome, 'null')); end if;

  -- P17 a rejection says why (a blank note is none)
  perform set_config('request.jwt.claims', j_lead, true);
  perform public.cde_transition(p_version => v3, p_new_state => 'shared');
  select id into s3 from public.audit_log where entity_type = 'review' and entity_id = v3 and action = 'review:start' order by id desc limit 1;
  perform set_config('request.jwt.claims', j_c1, true);
  n := n + 1;
  begin
    perform public.review_decide(v3, 'reject', E'  \t\n ');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a rejection says why' then failed := failed || ('P17 ' || coalesce(outcome, 'null')); end if;

  -- P18 a contributor's rejection returns the version to wip with the reason, closing the chain: a later decision
  -- finds nothing under review
  n := n + 1;
  begin
    r := public.review_decide(v3, 'reject', 'clash at level 2');
    select actor, new_value into act, sv from public.audit_log where entity_id = v3 and action = 'state:shared->wip' order by id desc limit 1;
    outcome := (r->>'decision') || ' ' || (r->>'step') || ' ' || (r->>'published') || ' ' || (r->>'state') || ' '
            || (select count(*) from public.audit_log where entity_type = 'review' and entity_id = v3 and action = 'review:reject 1')
            || ' ' || act || ' ' || sv::text;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c2, true);
  begin
    perform public.review_decide(v3, 'approve');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'reject 1 false wip 1 c1@probe.invalid '
       || jsonb_build_object('state', 'wip', 'note', 'review: rejected at step 1 — clash at level 2', 'verdict', null, 'verdict_audit_id', null,
                             'override', null, 'review_start_id', s3)::text
       || ' | ' || format('P0001 version %s is not under review', v3)
    then failed := failed || ('P18 ' || coalesce(outcome, 'null')); end if;

  -- P19 a lead's shared -> wip closes the chain; sharing it again starts a new chain with that lead as the submitter
  perform set_config('request.jwt.claims', j_lead, true);
  perform public.cde_transition(p_version => v4, p_new_state => 'shared');
  select id into s4 from public.audit_log where entity_type = 'review' and entity_id = v4 and action = 'review:start' order by id desc limit 1;
  perform set_config('request.jwt.claims', j_lead2, true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'wip', p_note => 'withdrawn for rework');
    select new_value into sv from public.audit_log where entity_id = v4 and action = 'state:shared->wip' order by id desc limit 1;
    outcome := (select state::text from public.container_versions where id = v4) || ' ' || (sv->>'review_start_id');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c1, true);
  begin
    perform public.review_decide(v4, 'approve');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead2, true);
  begin
    perform public.cde_transition(p_version => v4, p_new_state => 'shared');
    select id, new_value into x_id, nv from public.audit_log where entity_type = 'review' and entity_id = v4 and action = 'review:start' order by id desc limit 1;
    outcome := outcome || ' | ' || (x_id > s4)::text || ' ' || (nv->>'submitter_uid' = u_lead2::text)::text;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'wip ' || s4 || ' | ' || format('P0001 version %s is not under review', v4) || ' | true true'
    then failed := failed || ('P19 ' || coalesce(outcome, 'null')); end if;

  -- P20 a project's own review@n with steps [] turns its office's off: the service key shares and publishes as
  -- under 0031, and no review row is written
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_off, p_new_state => 'shared', p_actor => 'probe');
    perform public.cde_transition(p_version => v_off, p_new_state => 'published', p_actor => 'probe');
    outcome := (select state::text from public.container_versions where id = v_off)
            || ' ' || (select count(*) from public.audit_log where entity_type = 'review' and entity_id = v_off);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'published 0' then failed := failed || ('P20 ' || coalesce(outcome, 'null')); end if;

  -- P21 with no review@n installed 0031 is unchanged: the service key shares, and a publish with no verdict needs
  -- the lead's reason in 0031's words
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_none, p_new_state => 'shared', p_actor => 'probe');
    outcome := (select state::text from public.container_versions where id = v_none)
            || ' ' || (select count(*) from public.audit_log where entity_type = 'review' and entity_id = v_none);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin
    perform public.cde_transition(p_version => v_none, p_new_state => 'published', p_actor => 'probe');
    outcome := outcome || ' | OK';
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'shared 0 | ' || format('P0001 version %s has no accepted verdict that measured something (latest: none) — publishing it needs the lead''s reason', v_none)
    then failed := failed || ('P21 ' || coalesce(outcome, 'null')); end if;

  -- P22 an office's review@n is inherited (the service key is refused by its ref; the chain names the office's
  -- template), and a contributor's approval completes its one step and publishes it
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_inh, p_new_state => 'shared', p_actor => 'probe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead, true);
  begin
    perform public.cde_transition(p_version => v_inh, p_new_state => 'shared');
    select new_value into nv from public.audit_log where entity_type = 'review' and entity_id = v_inh and action = 'review:start' order by id desc limit 1;
    outcome := outcome || ' | ' || (nv->>'ref') || ' ' || (nv->>'source') || ' ' || (nv->>'sha256' = sha_o)::text;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_c1, true);
  begin
    r := public.review_decide(v_inh, 'approve');
    select actor into act from public.audit_log where entity_id = v_inh and action = 'state:shared->published' order by id desc limit 1;
    outcome := outcome || ' | ' || (r->>'step') || ' ' || (r->>'of') || ' ' || (r->>'published') || ' ' || (r->>'state') || ' ' || act;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 this project requires review (review@2) — a version is shared by a signed-in lead, not by this call'
       || ' | review@2 office true | 1 1 true published c1@probe.invalid'
    then failed := failed || ('P22 ' || coalesce(outcome, 'null')); end if;

  -- P23 a template changed mid-review does not change the running chain: review@2 (one contributor step) is
  -- installed on the project after v5 was shared under review@1, and v5's first approval still leaves step 1 of 2 open
  perform set_config('request.jwt.claims', j_lead, true);
  perform public.cde_transition(p_version => v5, p_new_state => 'shared');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('artefact', p::text, 'review@2', jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_p2,
       'body', jsonb_build_object('steps', '[{"name":"Quick look","role":"contributor","approvals":1}]'::jsonb)));
  update public.bridge_docs set data = jsonb_build_object('kind', 'review', 'version', 2, 'sha256', sha_p2)
   where store = 'artefact' and project_id = p::text and doc_id = 'review';
  perform set_config('request.jwt.claims', j_c1, true);
  n := n + 1;
  begin
    r := public.review_decide(v5, 'approve');
    outcome := (public.review_template(p)->>'ref') || ' ' || (r->>'step') || ' ' || (r->>'of') || ' ' || (r->>'name')
            || ' ' || (r->>'published') || ' ' || (r->>'state');
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'review@2 1 2 Model check false shared' then failed := failed || ('P23 ' || coalesce(outcome, 'null')); end if;

  -- P24 grants: only signed-in users execute review_decide (anon and the service key do not), no API role executes
  -- review_template, and cde_transition is still the one 5-argument overload
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  outcome := has_function_privilege('anon', 'public.review_decide(uuid, text, text)', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.review_decide(uuid, text, text)', 'execute')::text || ' '
          || has_function_privilege('service_role', 'public.review_decide(uuid, text, text)', 'execute')::text || ' | '
          || has_function_privilege('anon', 'public.review_template(uuid)', 'execute')::text || ' '
          || has_function_privilege('authenticated', 'public.review_template(uuid)', 'execute')::text || ' | '
          || (select string_agg(array_to_string(f.proargnames, ','), ' / ') from pg_proc f
               join pg_namespace s on s.oid = f.pronamespace where s.nspname = 'public' and f.proname = 'cde_transition');
  if outcome is distinct from 'false true false | false false | p_version,p_new_state,p_actor,p_note,p_override'
    then failed := failed || ('P24 ' || coalesce(outcome, 'null')); end if;

  select array_agg(id order by id) into burned from public.audit_log where project_id in (o, p, p_inh, p_off, p_none);
  raise exception 'PROBE 0032: % of % as expected%. Everything above is rolled back; its audit rows took ledger ids % (identity values are not returned, so those ids will not exist).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end,
    burned;
end $probe$;
