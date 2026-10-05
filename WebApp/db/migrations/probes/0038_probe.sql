-- probes/0038_probe.sql — the drill for 0038_bridge_role_rules.sql. Part 0 runs BEFORE the apply (read-only: the composite
-- key 0038 adds must hold for the rows already there, and container_versions must have exactly the columns and triggers 0038
-- was written against; any false = do not apply, say so). Parts 1 and 2 run AFTER it. Part 1: every row must read true.
-- Part 2: one DO block that builds two projects with a viewer, a contributor and a lead, the rows each case needs (with the
-- service role), then, signed in as each member under `set local role authenticated` (row-level security applies as it does
-- to a PostgREST call), tries each write. A case that expects "patches 0 rows" first counts the target row under the same
-- role: it passes only as "OK 0 seen 1" (a row the caller cannot see is "seen 0", never a pass). The block ALWAYS raises its
-- summary, so everything it wrote rolls back — the two ledger rows B23 and B24 write through cde_transition included (their
-- identity values are consumed). "PROBE 0038: 28 of 28 as expected." is the pass.

-- Part 0 (before the apply)
select 'every snapshot row''s project is its revision''s project' as check,
  not exists (select 1 from public.element_snapshots s join public.model_revisions r on r.id = s.revision_id where r.project_id <> s.project_id) as ok
union all select 'container_versions has exactly the columns 0038 freezes and exempts',
  array(select column_name::text from information_schema.columns where table_schema = 'public' and table_name = 'container_versions'
        order by column_name::text collate "C")
  = array['author', 'container_id', 'created_at', 'deleted_at', 'deleted_by', 'file_ref', 'id', 'is_live', 'notes', 'platform_item_id',
          'revision', 'sha256', 'size_bytes', 'state', 'suitability', 'superseded']
union all select 'container_versions has exactly the triggers 0038 was written against',
  array(select tgname::text from pg_trigger where tgrelid = 'public.container_versions'::regclass and not tgisinternal order by tgname::text collate "C")
  = array['trg_deleted_items', 'trg_protect_published', 'trg_state_via_transition'];

-- Part 1 (after the apply)
select 'every bridge_docs store is the bridge''s alone' as check,
  (select bool_and(public.bridge_docs_floor(s) is null) from unnest(array['doc_comments', 'rfi', 'office_snapshot', 'office_scan', 'changeset', 'clash', 'tender', 'keystore']) s) as ok
union all select 'bim_documents has no signed-in update',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bim_documents' and cmd in ('UPDATE', 'ALL'))
union all select 'a document is inserted in wip',
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bim_documents' and policyname = 'bim_documents_insert'
          and cmd = 'INSERT' and with_check like '%''contributor''%' and with_check like '%''wip''%')
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bim_documents' and cmd in ('INSERT', 'ALL')
                  and policyname <> 'bim_documents_insert')
union all select 'deliverables are updated by a lead',
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deliverables' and policyname = 'deliverables_update'
          and qual like '%''lead''%' and with_check like '%''lead''%')
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deliverables' and cmd in ('UPDATE', 'ALL')
                  and policyname <> 'deliverables_update')
union all select 'bcf_topics has no signed-in insert or update',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bcf_topics' and cmd in ('INSERT', 'UPDATE', 'ALL'))
union all select 'element_snapshots has no signed-in insert or delete',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'element_snapshots' and cmd in ('INSERT', 'DELETE', 'ALL'))
union all select 'model_revisions has no signed-in insert or update',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'model_revisions' and cmd in ('INSERT', 'UPDATE', 'ALL'))
union all select 'a snapshot row is bound to its revision''s project',
  exists (select 1 from pg_constraint where conname = 'elem_snap_rev_project' and contype = 'f')
union all select 'cde_protect_published is 0038''s',
  exists (select 1 from pg_proc where proname = 'cde_protect_published' and prosrc like '%a version stays in its file%'
          and prosrc like '%attached by the bridge%' and prosrc like '%changes only its state%')
union all select 'trg_container_frozen is in place, its function a definer''s',
  exists (select 1 from pg_trigger where tgname = 'trg_container_frozen' and not tgisinternal)
  and exists (select 1 from pg_proc where proname = 'cde_container_frozen' and prosecdef);

-- Part 2 (after the apply)
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  p uuid; p2 uuid; k text;
  u_view uuid := gen_random_uuid(); u_con uuid := gen_random_uuid(); u_lead uuid := gen_random_uuid();
  j_view text := json_build_object('sub', u_view, 'email', 'viewer@probe.invalid', 'role', 'authenticated')::text;
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@probe.invalid', 'role', 'authenticated')::text;
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@probe.invalid', 'role', 'authenticated')::text;
  d uuid; dl uuid; c uuid; c2 uuid; v_pub uuid; v_arc uuid; v_wip uuid; v_sh uuid; r uuid; r2 uuid;
  frozen text := 'P0001 a version that is %s changes only its state, its live pointer and its geometry link';
  in_file text := 'P0001 a version stays in its file';
  outcome text; rc int; seen int; st text; n int := 0; failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  k := 'probe-0038-p-' || sfx;
  insert into public.projects(key, name) values (k, 'probe 0038 p') returning id into p;
  insert into public.projects(key, name) values ('probe-0038-q-' || sfx, 'probe 0038 q') returning id into p2;
  insert into public.memberships(project_id, user_id, role) values (p, u_view, 'viewer'), (p, u_con, 'contributor'), (p, u_lead, 'lead');
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('doc_comments', p::text, 'probe-doc', '{"comments":[],"rev":1}'), ('rfi', k, 'probe-rfi', '{"probe":true}'),
    ('office_snapshot', p::text, 'latest', '{"probe":true}'), ('office_scan', p::text, 'latest', '{"probe":true}');
  insert into public.bim_documents(project_id, doc_type, title) values (p, 'BEP', 'probe 0038') returning id into d;
  insert into public.deliverables(project_id, container_name) values (p, 'PROBE-0038') returning id into dl;
  insert into public.bcf_topics(guid, project_id, topic_status, model, data) values (gen_random_uuid()::text, k, 'Open', '', '{"title":"probe"}');
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0038.ifc') returning id into c;
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0038-B.ifc') returning id into c2;
  insert into public.container_versions(container_id, revision) values (c, 'v1') returning id into v_pub;
  insert into public.container_versions(container_id, revision) values (c, 'v2') returning id into v_arc;
  insert into public.container_versions(container_id, revision, sha256) values (c2, 'v1', 'aa') returning id into v_wip;
  insert into public.container_versions(container_id, revision) values (c2, 'v2') returning id into v_sh;
  perform set_config('sentinel.transition', v_pub::text, true);
  update public.container_versions set state = 'published' where id = v_pub;
  perform set_config('sentinel.transition', v_arc::text, true);
  update public.container_versions set state = 'published' where id = v_arc;
  update public.container_versions set state = 'archived' where id = v_arc;
  perform set_config('sentinel.transition', v_sh::text, true);
  update public.container_versions set state = 'shared' where id = v_sh;
  perform set_config('sentinel.transition', '', true);
  insert into public.model_revisions(project_id, rev_code) values (p, 'P01') returning id into r;
  insert into public.model_revisions(project_id, rev_code) values (p2, 'Q01') returning id into r2;
  insert into public.element_snapshots(revision_id, project_id, guid, area) values (r, p, 'g1', 1);

  -- B1 a viewer's direct update of a document's comments patches 0 rows (the viewer sees the row)
  perform set_config('request.jwt.claims', j_view, true);
  n := n + 1;
  begin set local role authenticated;
    select count(*) into seen from public.bridge_docs where store = 'doc_comments' and project_id = p::text;
    update public.bridge_docs set data = '{"comments":[{"author":"someone"}],"rev":2}' where store = 'doc_comments' and project_id = p::text;
    get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B1 a viewer''s direct update of a document''s comments patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- B2 a viewer's direct insert of a comments document is refused by row-level security
  n := n + 1;
  begin set local role authenticated;
    insert into public.bridge_docs(store, project_id, doc_id, data) values ('doc_comments', p::text, 'probe-doc-2', '{"comments":[]}');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 new row violates row-level security policy for table "bridge_docs"' then
    failed := failed || ('B2 a viewer''s direct insert of a comments document is refused: ' || coalesce(outcome, 'null')); end if;

  -- B3 a contributor's direct update of an rfi, an office snapshot and an office scan patches 0 rows each (each seen)
  perform set_config('request.jwt.claims', j_con, true);
  foreach st in array array['rfi', 'office_snapshot', 'office_scan'] loop
    n := n + 1;
    begin set local role authenticated;
      select count(*) into seen from public.bridge_docs where store = st and project_id in (p::text, k);
      update public.bridge_docs set data = '{"probe":"changed"}' where store = st and project_id in (p::text, k);
      get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
    exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
    if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B3 a contributor''s direct update of ' || st || ' patches 0 rows: ' || coalesce(outcome, 'null')); end if;
  end loop;

  -- B4 a contributor's direct update of a document patches 0 rows (seen)
  n := n + 1;
  begin set local role authenticated;
    select count(*) into seen from public.bim_documents where id = d;
    update public.bim_documents set status = 'published' where id = d;
    get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B4 a contributor''s direct update of a document patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- B5 a contributor's direct update of a deliverable patches 0 rows (seen)
  n := n + 1;
  begin set local role authenticated;
    select count(*) into seen from public.deliverables where id = dl;
    update public.deliverables set due_date = '2030-01-01' where id = dl;
    get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B5 a contributor''s direct update of a deliverable patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- B6 a contributor's direct update of a topic patches 0 rows (seen)
  n := n + 1;
  begin set local role authenticated;
    select count(*) into seen from public.bcf_topics where project_id = k;
    update public.bcf_topics set topic_status = 'Closed' where project_id = k;
    get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B6 a contributor''s direct update of a topic patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- B7 a contributor's direct insert of a topic is refused by row-level security
  n := n + 1;
  begin set local role authenticated;
    insert into public.bcf_topics(guid, project_id, topic_status, model, data) values (gen_random_uuid()::text, k, 'Open', '', '{}');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 new row violates row-level security policy for table "bcf_topics"' then
    failed := failed || ('B7 a contributor''s direct insert of a topic is refused: ' || coalesce(outcome, 'null')); end if;

  -- B8 a published version moved to another file is refused
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set container_id = c2 where id = v_pub;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from in_file then failed := failed || ('B8 a published version moved to another file is refused: ' || coalesce(outcome, 'null')); end if;

  -- B9 an archived version's notes changed is refused
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set notes = 'changed' where id = v_arc;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from format(frozen, 'archived') then failed := failed || ('B9 an archived version''s notes changed is refused: ' || coalesce(outcome, 'null')); end if;

  -- B10 a contributor's direct geometry attach on a published version is refused
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set platform_item_id = 'probe-item-1' where id = v_pub and platform_item_id is null;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 geometry on an issued version is attached by the bridge' then
    failed := failed || ('B10 a contributor''s direct geometry attach on a published version is refused: ' || coalesce(outcome, 'null')); end if;

  -- B10s the bridge (service role) attaches geometry once
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.container_versions set platform_item_id = 'probe-item-1' where id = v_pub and platform_item_id is null;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('B10s the bridge (service role) attaches geometry once: ' || coalesce(outcome, 'null')); end if;

  -- B11 that geometry replaced is refused
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set platform_item_id = 'probe-item-2' where id = v_pub;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a version''s geometry is attached once — its platform item is already set' then
    failed := failed || ('B11 that geometry replaced is refused: ' || coalesce(outcome, 'null')); end if;

  -- B12 a work-in-progress version's sha256 replaced is refused
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set sha256 = 'bb' where id = v_wip;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a version''s sha256 is written once' then failed := failed || ('B12 a wip version''s sha256 replaced is refused: ' || coalesce(outcome, 'null')); end if;

  -- B13 the bridge sets the live pointer (service role)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.container_versions set is_live = true where id = v_pub;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('B13 the bridge sets the live pointer: ' || coalesce(outcome, 'null')); end if;

  -- B14 a file that holds a published version renamed is refused (F1)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.information_containers set iso_name = 'PROBE-0038-RENAMED.ifc' where id = c;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a file that holds a published or archived version keeps its name' then
    failed := failed || ('B14 a file that holds a published version renamed is refused: ' || coalesce(outcome, 'null')); end if;

  -- B15 a file moved to another project is refused
  n := n + 1;
  begin set local role authenticated;
    update public.information_containers set project_id = p2 where id = c2;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a file stays in its project' then failed := failed || ('B15 a file moved to another project is refused: ' || coalesce(outcome, 'null')); end if;

  -- B16 a contributor's direct delete of element snapshots removes 0 rows (seen)
  n := n + 1;
  begin set local role authenticated;
    select count(*) into seen from public.element_snapshots where revision_id = r;
    delete from public.element_snapshots where revision_id = r;
    get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B16 a contributor''s direct delete of element snapshots removes 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- B17 a contributor's direct insert of an element snapshot is refused by row-level security
  n := n + 1;
  begin set local role authenticated;
    insert into public.element_snapshots(revision_id, project_id, guid) values (r, p, 'g2');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 new row violates row-level security policy for table "element_snapshots"' then
    failed := failed || ('B17 a contributor''s direct insert of an element snapshot is refused: ' || coalesce(outcome, 'null')); end if;

  -- B18 a contributor's direct update of a revision header patches 0 rows (seen)
  n := n + 1;
  begin set local role authenticated;
    select count(*) into seen from public.model_revisions where id = r;
    update public.model_revisions set rev_code = 'C01' where id = r;
    get diagnostics rc = row_count; outcome := 'OK ' || rc || ' seen ' || seen; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0 seen 1' then failed := failed || ('B18 a contributor''s direct update of a revision header patches 0 rows: ' || coalesce(outcome, 'null')); end if;

  -- B21 a contributor's direct insert of a published document is refused
  n := n + 1;
  begin set local role authenticated;
    insert into public.bim_documents(project_id, doc_type, title, status) values (p, 'BEP', 'probe 0038 issued', 'published');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 new row violates row-level security policy for table "bim_documents"' then
    failed := failed || ('B21 a contributor''s direct insert of a published document is refused: ' || coalesce(outcome, 'null')); end if;

  -- B22 a shared version moved to another file is refused
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set container_id = c where id = v_sh;
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from in_file then failed := failed || ('B22 a shared version moved to another file is refused: ' || coalesce(outcome, 'null')); end if;

  -- B25 a contributor's direct insert of a revision header is refused by row-level security
  n := n + 1;
  begin set local role authenticated;
    insert into public.model_revisions(project_id, rev_code) values (p, 'C02');
    outcome := 'OK'; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 new row violates row-level security policy for table "model_revisions"' then
    failed := failed || ('B25 a contributor''s direct insert of a revision header is refused: ' || coalesce(outcome, 'null')); end if;

  -- B19 the control: a lead's direct update of a deliverable patches 1 row
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.deliverables set due_date = '2030-01-01' where id = dl;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('B19 the control: a lead''s direct update of a deliverable patches 1 row: ' || coalesce(outcome, 'null')); end if;

  -- B23 a lead archives a published version through cde_transition (the frozen-column check lets the real move through)
  n := n + 1;
  begin set local role authenticated;
    perform public.cde_transition(p_version => v_pub, p_new_state => 'archived', p_actor => 'probe', p_note => 'probe 0038');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_pub); reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK archived' then failed := failed || ('B23 a lead archives a published version through cde_transition: ' || coalesce(outcome, 'null')); end if;

  -- B24 a lead restores it to published
  n := n + 1;
  begin set local role authenticated;
    perform public.cde_transition(p_version => v_pub, p_new_state => 'published', p_actor => 'probe', p_note => 'probe 0038');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_pub); reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK published' then failed := failed || ('B24 a lead restores it to published: ' || coalesce(outcome, 'null')); end if;

  -- B20 a snapshot row whose project is not its revision's is refused, even for the service role (the composite key)
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    insert into public.element_snapshots(revision_id, project_id, guid) values (r2, p, 'g3');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '23503 insert or update on table "element_snapshots" violates foreign key constraint "elem_snap_rev_project"' then
    failed := failed || ('B20 a snapshot row whose project is not its revision''s is refused: ' || coalesce(outcome, 'null')); end if;

  if (select data->>'rev' from public.bridge_docs where store = 'doc_comments' and project_id = p::text and doc_id = 'probe-doc') is distinct from '1'
     or (select status from public.bim_documents where id = d) is distinct from 'wip'
     or (select count(*) from public.element_snapshots where revision_id = r) <> 1
     or (select container_id from public.container_versions where id = v_pub) is distinct from c
     or (select container_id from public.container_versions where id = v_sh) is distinct from c2 then
    failed := failed || 'a refused write changed a row'::text;
  end if;

  raise exception 'PROBE 0038: % of % as expected%. Everything above is rolled back (both projects, the memberships, every row built for the cases and the two ledger rows B23 and B24 wrote).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
