-- probes/0041_probe.sql — the drill for 0041_version_record_frozen.sql. Part 0 runs BEFORE the apply (read-only): it counts
-- the rows whose answer 0041 changes — draft versions a verdict judged (their record is frozen to signed-in writes, as every
-- version's is), files whose name freezes, versions without a sha256 (none gets one from a signed-in write after 0041),
-- revisions a file holds twice — and checks the rows 0041's constraint, index and policies need, the live bodies and the
-- trigger names. Parts 1 and 2 run AFTER it.
-- Part 1: every row must read true. Part 2: one DO block that builds one project with a contributor and a lead, the files,
-- versions, verdict rows and a transmittal the cases need (with the service role), then tries each case — signed in through
-- the transaction-local request.jwt.claims setting that auth.uid() reads ('' is the service key), under
-- `set local role authenticated` where row-level security matters. It ALWAYS raises its summary, so everything it wrote
-- rolls back (the ledger rows' identity values are consumed). "PROBE 0041: 24 of 24 as expected." is the pass.

-- Part 0 (before the apply)
with v as (select cv.id, cv.state, cv.sha256, cv.platform_item_id, cv.container_id, ic.project_id
             from public.container_versions cv join public.information_containers ic on ic.id = cv.container_id
            where cv.deleted_at is null and ic.deleted_at is null),
vr as (select distinct a.entity_id from public.audit_log a join v on v.id = a.entity_id and a.project_id = v.project_id
        where a.entity_type = 'file_version' and a.action like 'verdict:%'),
fz as (select v.container_id, bool_or(a.action = 'verdict:accepted') as accepted, bool_or(a.action = 'verdict:recorded') as recorded
         from v join public.audit_log a on a.entity_id = v.id and a.project_id = v.project_id
        where a.entity_type = 'file_version' and a.action like 'verdict:%'
          and not exists (select 1 from public.container_versions x where x.container_id = v.container_id and x.state in ('published', 'archived'))
        group by v.container_id)
select 'wip versions a verdict row names' as what, (select count(*) from v join vr on vr.entity_id = v.id where v.state = 'wip')::text as n
union all select 'shared versions a verdict row names', (select count(*) from v join vr on vr.entity_id = v.id where v.state = 'shared')::text
union all select 'wip or shared versions with no sha256 (none gets one from a signed-in write after 0041)',
  (select count(*) from v where v.state in ('wip', 'shared') and v.sha256 is null)::text
union all select 'files whose name freezes after 0041 (no issued version) — an accepted verdict row',
  (select count(*) from fz where accepted)::text
union all select 'files whose name freezes after 0041 (no issued version) — a recorded verdict row, none accepted',
  (select count(*) from fz where recorded and not accepted)::text
union all select 'files whose name freezes after 0041 (no issued version) — only rejected verdict rows',
  (select count(*) from fz where not accepted and not recorded)::text
union all select '(file, revision) pairs held by more than one version, Deleted items included (expect 0)',
  (select count(*) from (select container_id, upper(btrim(revision)) from public.container_versions where revision is not null
     group by 1, 2 having count(*) > 1) d)::text
union all select 'platform items named by versions on more than one project (expect 0)',
  (select count(*) from (select cv.platform_item_id from public.container_versions cv join public.information_containers ic on ic.id = cv.container_id
     where cv.platform_item_id is not null group by 1 having count(distinct ic.project_id) > 1) d)::text
union all select 'versions whose geometry came on the INSERT (no "geometry linked" row)',
  (select count(*) from v where v.platform_item_id is not null and not exists (select 1 from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = v.id and a.action = 'geometry linked'))::text
union all select 'projects whose key is uuid-shaped (expect 0)',
  (select count(*) from public.projects where key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')::text
union all select 'platform projects linked by more than one live Sentinel project (expect 0 — 0041''s index needs it)',
  (select count(*) from (select p.metadata->'settings'->>'platform_project_id' from public.projects p
     where p.metadata->'settings'->>'platform_project_id' is not null and (p.metadata->'settings'->>'archived') is distinct from 'true'
     group by 1 having count(*) > 1) d)::text
union all select 'transmittals (each stays as issued after 0041)', (select count(*) from public.transmittals)::text
union all select 'transmittals policies (expect transmittals_select, transmittals_write)',
  (select string_agg(policyname::text, ', ' order by policyname::text collate "C") from pg_policies where schemaname = 'public' and tablename = 'transmittals')
union all select 'container_versions triggers (expect trg_deleted_items, trg_protect_published, trg_state_via_transition)',
  (select string_agg(tgname::text, ', ' order by tgname::text collate "C") from pg_trigger where tgrelid = 'public.container_versions'::regclass and not tgisinternal)
union all select 'information_containers triggers (expect trg_container_frozen, trg_deleted_items)',
  (select string_agg(tgname::text, ', ' order by tgname::text collate "C") from pg_trigger where tgrelid = 'public.information_containers'::regclass and not tgisinternal)
union all select 'the live bodies are 0040''s and 0038''s (expect true)',
  (exists (select 1 from pg_proc where proname = 'cde_protect_published' and prosrc like '%live pointer of an issued version%'
           and prosrc not like '%record is written when it is registered%')
   and exists (select 1 from pg_proc where proname = 'cde_container_frozen' and prosrc like '%keeps its name%'
               and prosrc not like '%a verdict judged%'))::text;

-- Part 0 diagnostics — read-only; each names what part 0 counted (keys, file names, revisions only):
--   the files whose name freezes: (part 0's two CTEs) select p.key, ic.iso_name from public.information_containers ic
--     join public.projects p on p.id = ic.project_id where ic.id in (select v.container_id from v join vr on vr.entity_id = v.id)
--     and not exists (select 1 from public.container_versions x where x.container_id = ic.id and x.state in ('published', 'archived'))
--     order by 1, 2;
--   the revisions held twice (a label trimmed and in any case, as 0041 compares them): select p.key, ic.iso_name,
--     upper(btrim(cv.revision)), count(*) from public.container_versions cv
--     join public.information_containers ic on ic.id = cv.container_id join public.projects p on p.id = ic.project_id
--     group by 1, 2, 3 having count(*) > 1 order by 1, 2, 3;

-- Part 1 (after the apply)
select 'cde_protect_published is 0041''s' as check,
  exists (select 1 from pg_proc where proname = 'cde_protect_published' and prosrc like '%record is written when it is registered%'
          and prosrc like '%live pointer of an issued version%' and prosrc like '%a version stays in its file%') as ok
union all select 'a signed-in INSERT carries no geometry and a new revision (trg_version_on_insert, BEFORE INSERT)',
  exists (select 1 from pg_trigger where tgrelid = 'public.container_versions'::regclass and tgname = 'trg_version_on_insert'
          and (tgtype & 2) = 2 and (tgtype & 4) = 4)
  and exists (select 1 from pg_proc where proname = 'cde_version_on_insert' and prosrc like '%registered once per file%')
  and not has_function_privilege('authenticated', 'public.cde_version_on_insert()', 'execute')
union all select 'cde_container_frozen is 0041''s',
  exists (select 1 from pg_proc where proname = 'cde_container_frozen' and prosrc like '%a verdict judged keeps its name%' and prosrc like '%stays in its project%')
union all select 'transmittals: insert-only for a signed-in lead',
  (select string_agg(policyname::text, ', ' order by policyname::text collate "C") from pg_policies where schemaname = 'public' and tablename = 'transmittals')
  = 'transmittals_insert, transmittals_select'
union all select 'projects_key_not_uuid is in force',
  exists (select 1 from pg_constraint where conname = 'projects_key_not_uuid' and conrelid = 'public.projects'::regclass and convalidated)
union all select 'one live project links a platform project (projects_one_live_platform_link)',
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'projects' and indexname = 'projects_one_live_platform_link'
          and indexdef like 'CREATE UNIQUE INDEX%');

-- Part 2 (after the apply)
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  p uuid; c uuid; c2 uuid; c3 uuid; t uuid;
  u_con uuid := gen_random_uuid(); u_lead uuid := gen_random_uuid();
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@example.test', 'role', 'authenticated')::text;
  j_lead text := json_build_object('sub', u_lead, 'email', 'lead@example.test', 'role', 'authenticated')::text;
  v_wip uuid; v_shared uuid; v_nosha uuid; v_draft uuid; v_bin uuid; v_move uuid;
  rec text := 'P0001 a version''s record is written when it is registered — a new upload is a new version';
  geom text := 'P0001 a version''s geometry is attached by the bridge';
  rev text := 'P0001 a revision is registered once per file — a new upload takes a new revision';
  named text := 'P0001 a file whose version a verdict judged keeps its name — a new name is a new file: upload it under the new name';
  outcome text; rc int; n int := 0; failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name) values ('probe-0041-' || sfx, 'probe 0041') returning id into p;
  insert into public.memberships(project_id, user_id, role) values (p, u_con, 'contributor'), (p, u_lead, 'lead');
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0041.ifc') returning id into c;
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0041-B.ifc') returning id into c2;
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0041-C.ifc') returning id into c3;
  insert into public.container_versions(container_id, revision, sha256, file_ref, size_bytes) values (c, 'v1', repeat('a', 64), 'ref-1', 10) returning id into v_wip;
  insert into public.container_versions(container_id, revision, sha256, file_ref, size_bytes) values (c, 'v2', repeat('b', 64), 'ref-2', 20) returning id into v_shared;
  insert into public.container_versions(container_id, revision) values (c, 'v3') returning id into v_nosha;
  insert into public.container_versions(container_id, revision, sha256) values (c2, 'v1', repeat('c', 64)) returning id into v_draft;
  insert into public.container_versions(container_id, revision, sha256) values (c2, 'v2', repeat('d', 64)) returning id into v_bin;
  insert into public.container_versions(container_id, revision, sha256) values (c3, 'v1', repeat('e', 64)) returning id into v_move;
  perform set_config('sentinel.transition', v_shared::text, true); update public.container_versions set state = 'shared' where id = v_shared;
  perform set_config('sentinel.transition', '', true);
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
    values (p, 'file_version', v_wip, 'verdict:accepted', 'probe', '{"summary":{"in_scope":2},"ids_ref":"ids@1"}');
  insert into public.transmittals(project_id, reference, recipients) values (p, 'PROBE-T1', '["x"]') returning id into t;

  -- K1 a contributor's change of a judged draft's file reference is refused
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set file_ref = 'ref-other' where id = v_wip;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rec then failed := failed || ('K1 a judged draft''s file reference: ' || coalesce(outcome, 'null')); end if;

  -- K2 a contributor's change of a shared version's size is refused
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set size_bytes = 21 where id = v_shared;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rec then failed := failed || ('K2 a shared version''s size: ' || coalesce(outcome, 'null')); end if;

  -- K3 a contributor's sha256 on a version that has none is refused (the registration's alone)
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set sha256 = repeat('f', 64) where id = v_nosha;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rec then failed := failed || ('K3 a sha256 given later: ' || coalesce(outcome, 'null')); end if;

  -- K4 a lead's change of a draft's notes, revision or suitability is refused too
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set notes = 'n', revision = 'v9', suitability = 'S2' where id = v_draft;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rec then failed := failed || ('K4 a lead''s change of a draft''s record: ' || coalesce(outcome, 'null')); end if;

  -- K5 the 0038 words still win on a sha256 that is already set
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set sha256 = repeat('0', 64) where id = v_draft;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a version''s sha256 is written once' then failed := failed || ('K5 the sha256-once words: ' || coalesce(outcome, 'null')); end if;

  -- K6 the control: a contributor moves a draft's live pointer (cv_update)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set is_live = true where id = v_draft;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('K6 a contributor''s draft live pointer: ' || coalesce(outcome, 'null')); end if;

  -- K7 the control: a lead moves a draft to Deleted items and back (0035's stamp)
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.container_versions set deleted_at = now(), deleted_by = 'x' where id = v_bin;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
    update public.container_versions set deleted_at = null, deleted_by = null where id = v_bin;
    get diagnostics rc = row_count; outcome := outcome || ' ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1 1' then failed := failed || ('K7 a lead''s bin and restore: ' || coalesce(outcome, 'null')); end if;

  -- K8 the control: a lead shares a draft (cde_transition writes the state alone)
  n := n + 1;
  begin
    perform public.cde_transition(p_version => v_draft, p_new_state => 'shared', p_actor => 'probe', p_note => 'probe 0041');
    outcome := 'OK ' || (select state::text from public.container_versions where id = v_draft);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK shared' then failed := failed || ('K8 a lead''s share: ' || coalesce(outcome, 'null')); end if;

  -- K9 the control: the bridge (service) keeps its writes
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.container_versions set notes = 'by the bridge', platform_item_id = 'probe-item' where id = v_wip;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('K9 the service''s write: ' || coalesce(outcome, 'null')); end if;

  -- I1 a contributor's INSERT that carries geometry is refused (0040's G2 control, inverted)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, platform_item_id) values (c3, 'v2', 'probe-item-2');
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from geom then failed := failed || ('I1 a contributor''s insert with geometry: ' || coalesce(outcome, 'null')); end if;

  -- I2 the controls: a contributor's INSERT without geometry; the bridge (service) inserts with it
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c3, 'v3', repeat('1', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into public.container_versions(container_id, revision, platform_item_id) values (c3, 'v4', 'probe-item-4');
    get diagnostics rc = row_count; outcome := outcome || ' ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1 1' then failed := failed || ('I2 an insert without geometry and the service''s: ' || coalesce(outcome, 'null')); end if;

  -- R1 a contributor's INSERT under a revision its file already holds is refused (K-c)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v1', repeat('2', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rev then failed := failed || ('R1 a revision registered twice: ' || coalesce(outcome, 'null')); end if;

  -- R2 the control: a contributor's INSERT under a revision the file does not hold yet
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v8', repeat('3', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('R2 a fresh revision: ' || coalesce(outcome, 'null')); end if;

  -- R3 a look-alike of a held revision (a trailing space, another case) is refused too
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v1 ', repeat('4', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c, 'V1', repeat('5', 64));
    get diagnostics rc = row_count; outcome := outcome || ' / OK ' || rc; reset role;
  exception when others then outcome := outcome || ' / ' || sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rev || ' / ' || rev then failed := failed || ('R3 a look-alike revision: ' || coalesce(outcome, 'null')); end if;

  -- R4 a revision held only by a version in Deleted items is refused too
  perform set_config('request.jwt.claims', '', true);
  update public.container_versions set deleted_at = now(), deleted_by = 'probe' where id = v_bin;
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c2, 'v2', repeat('6', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rev then failed := failed || ('R4 a revision held in Deleted items: ' || coalesce(outcome, 'null')); end if;

  -- N1 a contributor's rename of a file a verdict judged is refused
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.information_containers set iso_name = 'PROBE-0041-RENAMED.ifc' where id = c;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from named then failed := failed || ('N1 a judged file''s rename: ' || coalesce(outcome, 'null')); end if;

  -- N2 the bridge (service) is refused too: a new name is a new file
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.information_containers set iso_name = 'PROBE-0041-RENAMED.ifc' where id = c;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from named then failed := failed || ('N2 the service''s rename of a judged file: ' || coalesce(outcome, 'null')); end if;

  -- N3 the control: a contributor renames a file no verdict judged, and changes a judged file's title
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    update public.information_containers set iso_name = 'PROBE-0041-C2.ifc' where id = c3;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
    update public.information_containers set title = 'probe title' where id = c;
    get diagnostics rc = row_count; outcome := outcome || ' ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1 1' then failed := failed || ('N3 an unjudged rename and a title: ' || coalesce(outcome, 'null')); end if;

  -- T1 a lead's change of an issued transmittal changes nothing (no signed-in UPDATE policy)
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.transmittals set recipients = '[]' where id = t;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0' then failed := failed || ('T1 a lead''s transmittal update: ' || coalesce(outcome, 'null')); end if;

  -- T2 a lead's delete of an issued transmittal deletes nothing
  n := n + 1;
  begin set local role authenticated;
    delete from public.transmittals where id = t;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 0' then failed := failed || ('T2 a lead''s transmittal delete: ' || coalesce(outcome, 'null')); end if;

  -- T3 the control: a lead issues a transmittal; a contributor cannot
  n := n + 1;
  begin set local role authenticated;
    insert into public.transmittals(project_id, reference) values (p, 'PROBE-T2');
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', j_con, true);
  begin set local role authenticated;
    insert into public.transmittals(project_id, reference) values (p, 'PROBE-T3');
    outcome := outcome || ' contributor OK'; reset role;
  exception when others then outcome := outcome || ' ' || sqlstate; reset role; end;
  if outcome is distinct from 'OK 1 42501' then failed := failed || ('T3 a lead issues, a contributor cannot: ' || coalesce(outcome, 'null')); end if;

  -- U1 a uuid-shaped project key is refused, for every writer
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    insert into public.projects(key, name) values (gen_random_uuid()::text, 'probe 0041 uuid key');
    outcome := 'OK';
  exception when others then outcome := sqlstate; end;
  if outcome is distinct from '23514' then failed := failed || ('U1 a uuid-shaped key: ' || coalesce(outcome, 'null')); end if;

  -- L1 a lead's direct settings write that links a platform project another live project links is refused (23505)
  insert into public.projects(key, name, metadata)
    values ('probe-0041-l-' || sfx, 'probe 0041 link', jsonb_build_object('settings', jsonb_build_object('platform_project_id', 'probe-plat-' || sfx)));
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.projects set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{settings}', jsonb_build_object('platform_project_id', 'probe-plat-' || sfx))
     where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate; end;
  if outcome is distinct from '23505' then failed := failed || ('L1 a second live link of a platform project: ' || coalesce(outcome, 'null')); end if;

  perform set_config('request.jwt.claims', '', true);
  if (select file_ref from public.container_versions where id = v_wip) is distinct from 'ref-1'
     or (select size_bytes from public.container_versions where id = v_shared) is distinct from 20
     or (select sha256 from public.container_versions where id = v_nosha) is not null
     or (select iso_name from public.information_containers where id = c) is distinct from 'PROBE-0041.ifc'
     or (select recipients from public.transmittals where id = t) is distinct from '["x"]'::jsonb
     or (select count(*) from public.container_versions where container_id = c and upper(btrim(revision)) = 'V1') <> 1
     or (select count(*) from public.container_versions where container_id = c2 and revision = 'v2') <> 1
     or (select metadata->'settings'->>'platform_project_id' from public.projects where id = p) is not null then
    failed := failed || 'a refused write changed a row'::text;
  end if;

  -- L2 the control: a lead links a platform project that only an archived project still names
  update public.projects set metadata = jsonb_set(metadata, '{settings,archived}', 'true'::jsonb) where key = 'probe-0041-l-' || sfx;
  perform set_config('request.jwt.claims', j_lead, true);
  n := n + 1;
  begin set local role authenticated;
    update public.projects set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{settings}', jsonb_build_object('platform_project_id', 'probe-plat-' || sfx))
     where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('L2 a link only an archived project names: ' || coalesce(outcome, 'null')); end if;

  raise exception 'PROBE 0041: % of % as expected%. Everything above is rolled back (the project, the memberships, the files, every version and transmittal built for the cases and the ledger rows they wrote).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
