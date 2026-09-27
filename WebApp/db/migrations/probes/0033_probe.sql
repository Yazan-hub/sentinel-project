-- probes/0033_probe.sql — the drill for 0033_trust_boundaries.sql, run by the controller AFTER 0033 is applied.
-- One DO block: it builds three offices, a project with a viewer, a contributor and a lead, a project per caller, a
-- platform admin row, a few bridge_docs rows, a BCF topic and a BIM document, drives projects_office_guard, the
-- bridge_docs, bcf_topics and bim_document_versions policies and the 'default' seed through every refusal and every
-- allowed write for six callers (a stranger, a viewer, a contributor, a lead of the office, a platform admin and the
-- service key), then ALWAYS raises its summary, so every write it made rolls back (projects, memberships, bridge_docs,
-- bcf_topics, bim_documents and bim_document_versions rows, the platform_admins row, the one grant P19 gives).
-- "PROBE 0033: 41 of 41 as expected." is the pass. It writes no audit row. A signed-in caller is simulated with the transaction-local
-- request.jwt.claims setting that auth.uid() reads ('' is the service key); the bridge_docs and platform_admins cases
-- also run under `set local role authenticated` (or service_role), so row-level security applies as it does to a
-- PostgREST call — the role is reset at the end of each case, and a case that raised has its role undone with its
-- sub-transaction. The six user ids are random and exist only inside the rolled-back block.
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  o_key text := 'probe-0033-office-' || sfx;
  o2_key text := 'probe-0033-office2-' || sfx;
  o3_key text := 'probe-0033-office3-' || sfx;
  p_key text := 'probe-0033-p-' || sfx;
  o uuid; o2 uuid; o3 uuid; p uuid; s uuid; k uuid; pv uuid; pc uuid; pl uuid; pa uuid; z uuid; bd uuid;
  t_guid text := 'probe-0033-t-' || sfx;
  u_str uuid := gen_random_uuid();
  u_view uuid := gen_random_uuid();
  u_con uuid := gen_random_uuid();
  u_lead uuid := gen_random_uuid();
  u_adm uuid := gen_random_uuid();
  j_str text := json_build_object('sub', u_str, 'email', 'stranger@probe.invalid', 'role', 'authenticated')::text;
  j_view text := json_build_object('sub', u_view, 'email', 'viewer@probe.invalid', 'role', 'authenticated')::text;
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@probe.invalid', 'role', 'authenticated')::text;
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@probe.invalid', 'role', 'authenticated')::text;
  j_adm text := json_build_object('sub', u_adm, 'email', 'admin@probe.invalid', 'role', 'authenticated')::text;
  w_attach text := '42501 attaching a project to an office needs the lead role on that office — nothing was saved';
  w_office text := '42501 an office is created by a platform admin — nothing was saved';
  w_kind text := '42501 a project''s kind is changed by its owner — nothing was saved';
  w_rls text := '42501 new row violates row-level security policy for table "bridge_docs"';
  w_pa text := '42501 permission denied for table platform_admins';
  w_rls_t text := '42501 new row violates row-level security policy for table "bcf_topics"';
  w_rls_v text := '42501 new row violates row-level security policy for table "bim_document_versions"';
  doc jsonb := '{"probe":true}';
  outcome text;
  rc int; rc2 int;
  n int := 0;
  failed text[] := '{}';
begin
  -- The service key builds the offices, the governed project p and its members; each caller makes their own project
  -- signed in, so the owner bootstrap (0004) makes them its owner.
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name, kind) values (o_key, 'probe 0033 office', 'office') returning id into o;
  insert into public.projects(key, name, kind) values (o2_key, 'probe 0033 office 2', 'office') returning id into o2;
  insert into public.projects(key, name, kind) values (o3_key, 'probe 0033 office 3', 'office') returning id into o3;
  insert into public.projects(key, name) values (p_key, 'probe 0033 p') returning id into p;
  insert into public.memberships(project_id, user_id, role) values
    (o, u_view, 'viewer'), (o, u_con, 'contributor'), (o, u_lead, 'lead'),
    (p, u_view, 'viewer'), (p, u_con, 'contributor'), (p, u_lead, 'lead'),
    (o3, u_lead, 'lead'), (o3, u_con, 'owner');
  insert into public.platform_admins(user_id, note) values (u_adm, 'probe 0033');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('clash', p_key, 'probe-sig', doc), ('rfi', p_key, 'probe-rfi', doc),
    ('office_snapshot', p::text, 'latest', doc), ('artefact', p::text, 'probe-art', doc), ('pack', '', 'probe-pack-' || sfx, doc);
  insert into public.bcf_topics(guid, project_id, topic_status, data) values (t_guid, p_key, 'Open', doc);
  insert into public.bim_documents(project_id, doc_type, title) values (p, 'BEP', 'probe 0033 BEP') returning id into bd;
  perform set_config('request.jwt.claims', j_str, true);
  insert into public.projects(key, name) values ('probe-0033-s-' || sfx, 'stranger own') returning id into s;
  insert into public.projects(key, name) values ('probe-0033-k-' || sfx, 'stranger in office') returning id into k;
  perform set_config('request.jwt.claims', j_view, true);
  insert into public.projects(key, name) values ('probe-0033-pv-' || sfx, 'viewer own') returning id into pv;
  perform set_config('request.jwt.claims', j_con, true);
  insert into public.projects(key, name) values ('probe-0033-pc-' || sfx, 'contributor own') returning id into pc;
  perform set_config('request.jwt.claims', j_lead, true);
  insert into public.projects(key, name) values ('probe-0033-pl-' || sfx, 'lead own') returning id into pl;
  perform set_config('request.jwt.claims', j_adm, true);
  insert into public.projects(key, name) values ('probe-0033-pa-' || sfx, 'admin own') returning id into pa;
  perform set_config('request.jwt.claims', '', true);
  update public.projects set office_key = o_key where id = k; -- a link made before 0033, by the service key

  -- P1 a stranger cannot create a project inside another company's office
  perform set_config('request.jwt.claims', j_str, true);
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x1-' || sfx, 'x', o_key); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P1 ' || coalesce(outcome, 'null')); end if;

  -- P2 an office that does not exist gets the same words (no office-key oracle; 0029 alone named the difference)
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x2-' || sfx, 'x', 'probe-0033-none-' || sfx); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P2 ' || coalesce(outcome, 'null')); end if;

  -- P3 a stranger cannot attach the project they own to it either
  n := n + 1;
  begin update public.projects set office_key = o_key where id = s; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P3 ' || coalesce(outcome, 'null')); end if;

  -- P4 a viewer of the office cannot attach their own project
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = pv; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P4 ' || coalesce(outcome, 'null')); end if;

  -- P5 a contributor of the office cannot either
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = pc; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_attach then failed := failed || ('P5 ' || coalesce(outcome, 'null')); end if;

  -- P6 a lead of the office attaches their own project
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = pl;
    outcome := (select 'OK ' || office_key from public.projects where id = pl);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK ' || o_key then failed := failed || ('P6 ' || coalesce(outcome, 'null')); end if;

  -- P7 and creates a project straight inside it
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x7-' || sfx, 'x', o_key); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P7 ' || coalesce(outcome, 'null')); end if;

  -- P8 a platform admin who is a member of nothing there attaches their project to an office
  perform set_config('request.jwt.claims', j_adm, true);
  n := n + 1;
  begin update public.projects set office_key = o2_key where id = pa; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P8 ' || coalesce(outcome, 'null')); end if;

  -- P9 the service key creates a project inside an office and moves another between offices (0029's behaviour)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin insert into public.projects(key, name, office_key) values ('probe-0033-x9-' || sfx, 'x', o_key);
    update public.projects set office_key = o2_key where id = pv;
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P9 ' || coalesce(outcome, 'null')); end if;

  -- P10 a link the service key made stays saveable: its owner re-sends the same office_key (not an attach), then
  -- detaches (a write for the project's own lead)
  perform set_config('request.jwt.claims', j_str, true);
  n := n + 1;
  begin update public.projects set office_key = o_key where id = k;
    outcome := 'OK';
    update public.projects set office_key = null where id = k;
    outcome := outcome || ' OK ' || coalesce((select office_key from public.projects where id = k), 'null');
  exception when others then outcome := coalesce(outcome, '') || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK OK null' then failed := failed || ('P10 ' || coalesce(outcome, 'null')); end if;

  -- P11 a stranger cannot create an office
  n := n + 1;
  begin insert into public.projects(key, name, kind) values ('probe-0033-x11-' || sfx, 'x', 'office'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_office then failed := failed || ('P11 ' || coalesce(outcome, 'null')); end if;

  -- P12 an owner cannot turn their project into an office
  n := n + 1;
  begin update public.projects set kind = 'office' where id = s; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_office then failed := failed || ('P12 ' || coalesce(outcome, 'null')); end if;

  -- P13 a platform admin creates an office
  perform set_config('request.jwt.claims', j_adm, true);
  n := n + 1;
  begin insert into public.projects(key, name, kind) values ('probe-0033-x13-' || sfx, 'x', 'office'); outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P13 ' || coalesce(outcome, 'null')); end if;

  -- P14 a lead who is not the owner cannot change an office's kind
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin update public.projects set kind = 'project' where id = o3; outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_kind then failed := failed || ('P14 ' || coalesce(outcome, 'null')); end if;

  -- P15 its owner can (it has no projects)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin update public.projects set kind = 'project' where id = o3;
    outcome := (select 'OK ' || kind from public.projects where id = o3);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK project' then failed := failed || ('P15 ' || coalesce(outcome, 'null')); end if;

  -- P16 the service key still turns a project into an office and back
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin update public.projects set kind = 'office' where id = s;
    update public.projects set kind = 'project' where id = s;
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P16 ' || coalesce(outcome, 'null')); end if;

  -- P17 is_platform_admin answers a signed-in caller (the bridge calls it with the caller's JWT) for themselves: the
  -- admin, a stranger, no user
  n := n + 1;
  begin set local role authenticated;
    perform set_config('request.jwt.claims', j_adm, true);
    outcome := public.is_platform_admin()::text;
    perform set_config('request.jwt.claims', j_str, true);
    outcome := outcome || ' ' || public.is_platform_admin()::text;
    perform set_config('request.jwt.claims', '', true);
    outcome := outcome || ' ' || public.is_platform_admin()::text;
    reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'true false false' then failed := failed || ('P17 ' || coalesce(outcome, 'null')); end if;

  -- P18 a signed-in caller — the admin included — can neither read nor write platform_admins
  perform set_config('request.jwt.claims', j_adm, true);
  n := n + 1;
  begin set local role authenticated; select count(*) into rc from public.platform_admins; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated; insert into public.platform_admins(user_id) values (u_str); outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_pa || ' | ' || w_pa then failed := failed || ('P18 ' || coalesce(outcome, 'null')); end if;

  -- P19 and with a read grant given (rolled back with the probe) the table still shows no row: RLS has no policy
  n := n + 1;
  grant select on public.platform_admins to authenticated;
  begin set local role authenticated; select count(*) into rc from public.platform_admins; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  revoke select on public.platform_admins from authenticated;
  if outcome is distinct from 'OK 0' then failed := failed || ('P19 ' || coalesce(outcome, 'null')); end if;

  -- P20 a viewer cannot write their project's office snapshot through PostgREST (0030 let every member)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'probe-v', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P20 ' || coalesce(outcome, 'null')); end if;

  -- P21 a contributor can
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'probe-c', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P21 ' || coalesce(outcome, 'null')); end if;

  -- P22 the upsert the bridge's docUpsert sends (insert … on conflict do update) on an existing row: a viewer is
  -- refused, a contributor lands it
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'latest', '{"by":"viewer"}')
      on conflict (store, project_id, doc_id) do update set data = excluded.data;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'latest', '{"by":"contributor"}')
      on conflict (store, project_id, doc_id) do update set data = excluded.data;
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  outcome := outcome || ' ' || (select data->>'by' from public.bridge_docs where store = 'office_snapshot' and project_id = p::text and doc_id = 'latest');
  if outcome is distinct from w_rls || ' | OK contributor' then failed := failed || ('P22 ' || coalesce(outcome, 'null')); end if;

  -- P23 a viewer comments on a document (doc_comments stays a viewer's write, 0028)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('doc_comments', p::text, 'probe-doc', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P23 ' || coalesce(outcome, 'null')); end if;

  -- P24 the keystore is the bridge's alone (it checks the lead role and the body, then writes with the service key): a
  -- contributor and a lead are both refused straight through PostgREST (keyed by the project key)
  n := n + 1;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('keystore', p_key, 'keystore', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead, true);
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('keystore', p_key, 'keystore', doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls || ' | ' || w_rls then failed := failed || ('P24 ' || coalesce(outcome, 'null')); end if;

  -- P25 a viewer's update of a clash record changes nothing; a contributor's changes it
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    update public.bridge_docs set data = '{"status":"viewer"}' where store = 'clash' and project_id = p_key and doc_id = 'probe-sig';
    get diagnostics rc = row_count; reset role;
    perform set_config('request.jwt.claims', j_con, true);
    set local role authenticated;
    update public.bridge_docs set data = '{"status":"contributor"}' where store = 'clash' and project_id = p_key and doc_id = 'probe-sig';
    get diagnostics rc2 = row_count; reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '0 1' then failed := failed || ('P25 ' || coalesce(outcome, 'null')); end if;

  -- P26 members read their project's documents under either spelling of project_id; a stranger reads none
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    select count(*) into rc from public.bridge_docs
     where (store = 'rfi' and project_id = p_key and doc_id = 'probe-rfi') or (store = 'office_snapshot' and project_id = p::text and doc_id = 'latest');
    reset role;
    perform set_config('request.jwt.claims', j_str, true);
    set local role authenticated;
    select count(*) into rc2 from public.bridge_docs where project_id in (p_key, p::text);
    reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '2 0' then failed := failed || ('P26 ' || coalesce(outcome, 'null')); end if;

  -- P27 deleting is a lead's (the clash reset): a contributor deletes nothing, the lead deletes the row
  n := n + 1;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    delete from public.bridge_docs where store = 'clash' and project_id = p_key;
    get diagnostics rc = row_count; reset role;
    perform set_config('request.jwt.claims', j_lead, true);
    set local role authenticated;
    delete from public.bridge_docs where store = 'clash' and project_id = p_key;
    get diagnostics rc2 = row_count; reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '0 1' then failed := failed || ('P27 ' || coalesce(outcome, 'null')); end if;

  -- P28 artefacts and a store the migration does not name stay closed to a lead: no insert, and no delete either
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', p::text, 'probe-ids', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('probe_unknown', p::text, 'x', doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    delete from public.bridge_docs where store = 'artefact' and project_id = p::text;
    get diagnostics rc = row_count; reset role;
    outcome := outcome || ' | deleted ' || rc;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls || ' | ' || w_rls || ' | deleted 0' then failed := failed || ('P28 ' || coalesce(outcome, 'null')); end if;

  -- P29 the global namespace stays read-only: a lead reads the pack and cannot write one
  n := n + 1;
  begin set local role authenticated;
    select count(*) into rc from public.bridge_docs where store = 'pack' and project_id = '' and doc_id = 'probe-pack-' || sfx;
    outcome := 'read ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('pack', '', 'probe-pack2-' || sfx, doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'read 1 | ' || w_rls then failed := failed || ('P29 ' || coalesce(outcome, 'null')); end if;

  -- P30 a stranger who owns a project whose KEY is p's id neither reads p's documents nor writes one (0028 resolved
  -- that id to the stranger's own project)
  perform set_config('request.jwt.claims', j_str, true);
  insert into public.projects(key, name) values (p::text, 'shadow of p') returning id into z;
  n := n + 1;
  begin set local role authenticated;
    select count(*) into rc from public.bridge_docs where project_id = p::text;
    outcome := 'read ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_snapshot', p::text, 'forged', doc);
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'read 0 | ' || w_rls then failed := failed || ('P30 ' || coalesce(outcome, 'null')); end if;

  -- P31 a stranger's project keyed '' does not open the global namespace to them
  n := n + 1;
  begin
    insert into public.projects(key, name) values ('', 'blank key');
    set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('clash', '', 'probe-blank-' || sfx, doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P31 ' || coalesce(outcome, 'null')); end if;

  -- P32 bridge_docs_role refuses a role word it does not know (null included) to a member of the project
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin
    outcome := concat_ws(' ', public.bridge_docs_role(p::text, null)::text, public.bridge_docs_role(p::text, 'boss')::text,
                         public.bridge_docs_role(p::text, 'lead')::text, public.bridge_docs_role(null, 'viewer')::text);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'false false true false' then failed := failed || ('P32 ' || coalesce(outcome, 'null')); end if;

  -- P33 the service key keeps writing every store — artefact, the bridge-only tender, manifest, federation and keystore,
  -- and an unnamed one included (it bypasses RLS)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin set local role service_role;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', p::text, 'probe-ids', doc), ('probe_unknown', p::text, 'x', doc),
      ('tender', p_key, 'probe-svc-t', doc), ('manifest', p::text, 'probe-svc-m', doc), ('federation', p::text, 'probe-svc-f', doc),
      ('keystore', p_key, 'keystore', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK' then failed := failed || ('P33 ' || coalesce(outcome, 'null')); end if;

  -- P34 a tender is the bridge's alone (one document carries a lead's issue and award and a contributor's bids): a lead's
  -- insert straight through PostgREST is refused (tenders-1)
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('tender', p_key, 'probe-t', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P34 ' || coalesce(outcome, 'null')); end if;

  -- P35 so is a manifest, the Federation Gate's evidence (cde-rem-7): a lead's insert is refused
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('manifest', p::text, 'probe-m', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P35 ' || coalesce(outcome, 'null')); end if;

  -- P36 and a federation run (cde-rem-7): a lead's insert is refused
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('federation', p::text, 'probe-f', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls then failed := failed || ('P36 ' || coalesce(outcome, 'null')); end if;

  -- P37 a viewer cannot create a BCF topic, and their edit of one changes nothing (topics-1; 0016 let every member)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bcf_topics(guid, project_id, topic_status, data) values ('probe-0033-tv-' || sfx, p_key, 'Open', doc);
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    update public.bcf_topics set topic_status = 'Closed' where guid = t_guid;
    get diagnostics rc = row_count; reset role;
    outcome := outcome || ' | ' || rc;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls_t || ' | 0' then failed := failed || ('P37 ' || coalesce(outcome, 'null')); end if;

  -- P38 a contributor creates a topic and edits one
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.bcf_topics(guid, project_id, topic_status, data) values ('probe-0033-tc-' || sfx, p_key, 'Open', doc);
    update public.bcf_topics set topic_status = 'In Progress' where guid = t_guid;
    get diagnostics rc = row_count; reset role;
    outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('P38 ' || coalesce(outcome, 'null')); end if;

  -- P39 deleting a topic is a lead's (cde-3): a contributor deletes nothing, the lead deletes it
  n := n + 1;
  begin set local role authenticated;
    delete from public.bcf_topics where guid = t_guid;
    get diagnostics rc = row_count; reset role;
    perform set_config('request.jwt.claims', j_lead, true);
    set local role authenticated;
    delete from public.bcf_topics where guid = t_guid;
    get diagnostics rc2 = row_count; reset role;
    outcome := rc || ' ' || rc2;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '0 1' then failed := failed || ('P39 ' || coalesce(outcome, 'null')); end if;

  -- P40 a BEP/EIR version is issued by a lead (bimdocs-3; 0027 let every member): a viewer's and a contributor's insert
  -- are refused, the lead's lands
  n := n + 1;
  perform set_config('request.jwt.claims', j_view, true);
  begin set local role authenticated;
    insert into public.bim_document_versions(document_id, version_no, snapshot, published_by) values (bd, 1, doc, 'viewer');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.bim_document_versions(document_id, version_no, snapshot, published_by) values (bd, 1, doc, 'contributor');
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_lead, true);
  begin set local role authenticated;
    insert into public.bim_document_versions(document_id, version_no, snapshot, published_by) values (bd, 1, doc, 'lead');
    outcome := outcome || ' | OK'; reset role;
  exception when others then outcome := outcome || ' | ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from w_rls_v || ' | ' || w_rls_v || ' | OK' then failed := failed || ('P40 ' || coalesce(outcome, 'null')); end if;

  -- P41 'default' is seeded, so a signed-in caller cannot create it and become the fallback project's owner
  -- (slice-default-1): the unique key refuses the insert
  perform set_config('request.jwt.claims', j_str, true);
  n := n + 1;
  begin insert into public.projects(key, name) values ('default', 'mine now'); outcome := 'OK';
  exception when others then outcome := sqlstate; end;
  if outcome is distinct from '23505' then failed := failed || ('P41 ' || coalesce(outcome, 'null')); end if;

  raise exception 'PROBE 0033: % of % as expected%. Everything above is rolled back (projects, memberships, bridge_docs, bcf_topics, bim_documents and bim_document_versions rows, the platform_admins row, the P19 grant); no audit row was written.',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
