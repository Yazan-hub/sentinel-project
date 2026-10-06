-- probes/0042_probe.sql — the drill for 0042_one_revision_per_file.sql. Part 0 runs BEFORE the apply (read-only): the two
-- counts each index needs to be 0, how many versions with geometry carry a hash Open 3D checks on their "geometry linked"
-- row (the .frag's, or a raw-IFC link's item since SEC-5; the rest it loads as "not hash-checked", founder decision A-a),
-- whether the indexes exist already, and how many versions hold more than one "geometry linked" row (the web reads the
-- newest). Parts 1 and 2 run AFTER it.
-- Part 1: every row must read true. Part 2: one DO block that builds one project with a contributor, two files and their
-- versions (with the service role: request.jwt.claims '' is the service key), then tries each case. It ALWAYS raises its
-- summary, so everything it wrote rolls back. "PROBE 0042: 8 of 8 as expected." is the pass.

-- Part 0 (before the apply)
select '(file, revision) pairs held by more than one version, Deleted items included (expect 0 — rule 1 needs it)' as what,
  (select count(*) from (select container_id, upper(btrim(revision)) from public.container_versions group by 1, 2 having count(*) > 1) d)::text as n
union all select 'platform items named by more than one version (expect 0 — rule 2 needs it)',
  (select count(*) from (select platform_item_id from public.container_versions where platform_item_id is not null group by 1 having count(*) > 1) d)::text
union all select 'versions with geometry whose "geometry linked" row records a checked hash (Open 3D checks them)',
  (select count(*) from public.container_versions v where v.platform_item_id is not null and exists (select 1 from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = v.id and a.action = 'geometry linked' and (a.new_value ? 'frag_sha256' or a.new_value ? 'ifc_item_id')))::text
union all select 'versions with geometry and no checked hash on a "geometry linked" row (Open 3D: "not hash-checked")',
  (select count(*) from public.container_versions v where v.platform_item_id is not null and not exists (select 1 from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = v.id and a.action = 'geometry linked' and (a.new_value ? 'frag_sha256' or a.new_value ? 'ifc_item_id')))::text
union all select 'indexes named as 0042''s already (expect 0)',
  (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('container_versions_one_revision', 'container_versions_one_item'))::text
union all select 'versions with more than one "geometry linked" row (expect 0 — the web reads the newest)',
  (select count(*) from (select entity_id from public.audit_log where entity_type = 'file_version' and action = 'geometry linked'
     group by 1 having count(*) > 1) d)::text;

-- Part 0 diagnostics — read-only; each names what part 0 counted (keys, file names, revisions and item ids only):
--   the pairs held twice: select p.key, ic.iso_name, upper(btrim(cv.revision)), count(*) from public.container_versions cv
--     join public.information_containers ic on ic.id = cv.container_id join public.projects p on p.id = ic.project_id
--     group by 1, 2, 3 having count(*) > 1 order by 1, 2, 3;
--   the items named twice: select cv.platform_item_id, p.key, ic.iso_name, cv.revision from public.container_versions cv
--     join public.information_containers ic on ic.id = cv.container_id join public.projects p on p.id = ic.project_id
--     where cv.platform_item_id in (select platform_item_id from public.container_versions where platform_item_id is not null
--     group by 1 having count(*) > 1) order by 1, 2, 3;
--   the versions with more than one link row: select p.key, ic.iso_name, cv.revision, a.id, a.actor, a.at,
--     a.new_value->>'platform_item_id' from public.audit_log a join public.container_versions cv on cv.id = a.entity_id
--     join public.information_containers ic on ic.id = cv.container_id join public.projects p on p.id = ic.project_id
--     where a.entity_type = 'file_version' and a.action = 'geometry linked' and a.entity_id in (select entity_id from
--     public.audit_log where entity_type = 'file_version' and action = 'geometry linked' group by 1 having count(*) > 1)
--     order by 1, 2, 3, 4;

-- Part 1 (after the apply)
select 'container_versions_one_revision: unique on (container_id, upper(btrim(revision))), every row' as check,
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'container_versions' and indexname = 'container_versions_one_revision'
          and indexdef like 'CREATE UNIQUE INDEX%(container_id, upper(btrim(revision)))' and indexdef not like '%WHERE%') as ok
union all select 'container_versions_one_item: unique on platform_item_id where it is set',
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'container_versions' and indexname = 'container_versions_one_item'
          and indexdef like 'CREATE UNIQUE INDEX%(platform_item_id) WHERE (platform_item_id IS NOT NULL)');

-- Part 2 (after the apply)
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  p uuid; c uuid; c2 uuid;
  u_con uuid := gen_random_uuid();
  j_con text := json_build_object('sub', u_con, 'email', 'contributor@example.test', 'role', 'authenticated')::text;
  v_bin uuid; v_free uuid;
  rev text := 'P0001 a revision is registered once per file — a new upload takes a new revision';
  outcome text; rc int; n int := 0; failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name) values ('probe-0042-' || sfx, 'probe 0042') returning id into p;
  insert into public.memberships(project_id, user_id, role) values (p, u_con, 'contributor');
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0042.ifc') returning id into c;
  insert into public.information_containers(project_id, iso_name) values (p, 'PROBE-0042-B.ifc') returning id into c2;
  insert into public.container_versions(container_id, revision, sha256, platform_item_id) values (c, 'v1', repeat('a', 64), 'probe-item-' || sfx);
  insert into public.container_versions(container_id, revision, sha256) values (c, 'v2', repeat('b', 64)) returning id into v_bin;
  insert into public.container_versions(container_id, revision, sha256) values (c2, 'v1', repeat('c', 64)) returning id into v_free;

  -- U1 the service registers a revision the file holds: refused by the index
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v1', repeat('1', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like '23505 %container_versions_one_revision%' then failed := failed || ('U1 a held revision on the service path: ' || coalesce(outcome, 'null')); end if;

  -- U2 a look-alike (spaces, another case) is the same revision
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, sha256) values (c, ' V1 ', repeat('2', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like '23505 %container_versions_one_revision%' then failed := failed || ('U2 a look-alike revision: ' || coalesce(outcome, 'null')); end if;

  -- U3 a revision held only in Deleted items is held
  update public.container_versions set deleted_at = now(), deleted_by = 'probe' where id = v_bin;
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v2', repeat('3', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like '23505 %container_versions_one_revision%' then failed := failed || ('U3 a revision held in Deleted items: ' || coalesce(outcome, 'null')); end if;

  -- U4 the control: a new revision lands
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v3', repeat('4', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('U4 a new revision: ' || coalesce(outcome, 'null')); end if;

  -- S1 a signed-in INSERT of a held revision still gets 0041's words (its trigger runs before the index)
  perform set_config('request.jwt.claims', j_con, true);
  n := n + 1;
  begin set local role authenticated;
    insert into public.container_versions(container_id, revision, sha256) values (c, 'v1', repeat('5', 64));
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from rev then failed := failed || ('S1 the signed-in words: ' || coalesce(outcome, 'null')); end if;
  perform set_config('request.jwt.claims', '', true);

  -- I1 a second version naming a platform item another version names: refused
  n := n + 1;
  begin
    insert into public.container_versions(container_id, revision, sha256, platform_item_id) values (c2, 'v2', repeat('6', 64), 'probe-item-' || sfx);
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like '23505 %container_versions_one_item%' then failed := failed || ('I1 an item on a second version (insert): ' || coalesce(outcome, 'null')); end if;

  -- I2 linking that item to a version without geometry: refused
  n := n + 1;
  begin
    update public.container_versions set platform_item_id = 'probe-item-' || sfx where id = v_free;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome not like '23505 %container_versions_one_item%' then failed := failed || ('I2 an item on a second version (link): ' || coalesce(outcome, 'null')); end if;

  -- I3 the control: another item links
  n := n + 1;
  begin
    update public.container_versions set platform_item_id = 'probe-item-b-' || sfx where id = v_free;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('I3 a new item: ' || coalesce(outcome, 'null')); end if;

  if (select count(*) from public.container_versions where container_id = c) <> 3
     or (select count(*) from public.container_versions where container_id = c2) <> 1
     or (select count(*) from public.container_versions where platform_item_id = 'probe-item-' || sfx) <> 1 then
    failed := failed || 'a refused write changed a row'::text;
  end if;

  raise exception 'PROBE 0042: % of % as expected%. Everything above is rolled back (the project, the membership, the files and every version built for the cases).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
