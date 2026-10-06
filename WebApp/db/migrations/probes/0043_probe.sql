-- probes/0043_probe.sql — the drill for 0043_one_project_answers.sql. Part 0 runs BEFORE the apply (read-only): the rows that
-- already point into another project (rule 4 checks a link only when it is written), the side rows earlier deletes left
-- behind (rule 5 removes the side rows filed under a project's key from now on; these stay — founder decision N-b),
-- whether the live bodies are the ones 0043 was written against, and whether 0043's triggers exist already. Parts 1 and 2
-- run AFTER it.
-- Part 1: every row must read true. Part 2: one DO block that builds three projects (a lead of A who is not a member of B,
-- an owner of D), their folders, files, versions and side rows with the service role (request.jwt.claims '' is the service
-- key), then tries each case — signed in through the transaction-local request.jwt.claims setting that auth.uid() reads,
-- under `set local role authenticated` where row-level security matters. It ALWAYS raises its summary, so everything it
-- wrote rolls back. "PROBE 0043: 18 of 18 as expected." is the pass.

-- Part 0 (before the apply)
select 'folders whose parent folder is in another project (expect 0)' as what,
  (select count(*) from public.folders f join public.folders p on p.id = f.parent_id where p.project_id <> f.project_id)::text as n
union all select 'files filed in another project''s folder (expect 0)',
  (select count(*) from public.information_containers c join public.folders f on f.id = c.folder_id where f.project_id <> c.project_id)::text
union all select 'linked models whose host file is in another project (expect 0)',
  (select count(*) from public.information_containers c join public.information_containers h on h.id = c.parent_id where h.project_id <> c.project_id)::text
union all select 'model revisions naming another project''s version (expect 0)',
  (select count(*) from public.model_revisions r join public.container_versions v on v.id = r.container_version_id
     join public.information_containers c on c.id = v.container_id where c.project_id <> r.project_id)::text
union all select 'BCF topics whose key no project holds (left by earlier deletes; rule 5 does not touch them — N-b)',
  (select count(*) from public.bcf_topics t where not exists (select 1 from public.projects p where p.key = t.project_id))::text
union all select 'bridge documents, by store, whose key or id no project holds (the global '''' namespace excluded; N-b)',
  coalesce((select string_agg(s.store || ' ' || s.n, ', ' order by s.store) from (select d.store, count(*) as n from public.bridge_docs d
     where d.project_id <> '' and not exists (select 1 from public.projects p where p.key = d.project_id or p.id::text = d.project_id)
     group by d.store) s), 'none')
union all select 'the live bodies are the ones 0043 replaces — 0004''s project_of_container, 0040''s cde_transition, 0032''s review_decide (expect true)',
  (exists (select 1 from pg_proc where proname = 'project_of_container' and prosrc like '%where id = c%' and prosrc not like '%is_member%')
   and exists (select 1 from pg_proc where proname = 'cde_transition' and prosrc like '%not recorded against this version''''s sha256%'
               and prosrc like '%sentinel.review%' and prosrc not like '%0043%')
   and exists (select 1 from pg_proc where proname = 'review_decide' and prosrc like '%the submitter does not review their own share%'
               and prosrc not like '%0043%'))::text
union all select 'triggers named as 0043''s already (expect 0)',
  (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_same_project', 'trg_project_side_rows'))::text;

-- Part 0 diagnostics — read-only; each names what part 0 counted (keys, names and ids only):
--   the folders: select pf.key, f.name, f.id, pp.key as parent_key from public.folders f join public.folders p on p.id = f.parent_id
--     join public.projects pf on pf.id = f.project_id join public.projects pp on pp.id = p.project_id where p.project_id <> f.project_id;
--   the files: select pc.key, c.iso_name, c.id, pf.key as folder_key from public.information_containers c join public.folders f
--     on f.id = c.folder_id join public.projects pc on pc.id = c.project_id join public.projects pf on pf.id = f.project_id
--     where f.project_id <> c.project_id;
--   the linked models: select pc.key, c.iso_name, ph.key as host_key, h.iso_name as host from public.information_containers c
--     join public.information_containers h on h.id = c.parent_id join public.projects pc on pc.id = c.project_id
--     join public.projects ph on ph.id = h.project_id where h.project_id <> c.project_id;
--   the model revisions: select pr.key, r.id, r.rev_code, pc.key as version_key from public.model_revisions r join public.container_versions v
--     on v.id = r.container_version_id join public.information_containers c on c.id = v.container_id join public.projects pr
--     on pr.id = r.project_id join public.projects pc on pc.id = c.project_id where c.project_id <> r.project_id;
--   the side rows left behind: select 'bcf_topics' as store, t.project_id, count(*) from public.bcf_topics t where not exists
--     (select 1 from public.projects p where p.key = t.project_id) group by 1, 2 union all select d.store, d.project_id, count(*)
--     from public.bridge_docs d where d.project_id <> '' and not exists (select 1 from public.projects p where p.key = d.project_id
--     or p.id::text = d.project_id) group by 1, 2 order by 1, 2;

-- Part 1 (after the apply)
select 'project_of_container answers the service key and a member only' as check,
  exists (select 1 from pg_proc where proname = 'project_of_container' and prosrc like '%auth.uid() is null or public.is_member(ic.project_id)%') as ok
union all select 'cde_transition and review_decide answer a non-member as a missing version (0043), their bodies otherwise 0040''s and 0032''s',
  exists (select 1 from pg_proc where proname = 'cde_transition' and prosrc like '%0043: a signed-in caller who is not a member%'
          and prosrc like '%not recorded against this version''''s sha256%' and prosrc like '%sentinel.review%')
  and exists (select 1 from pg_proc where proname = 'review_decide' and prosrc like '%0043: the project first%'
              and prosrc like '%the submitter does not review their own share%')
union all select 'trg_same_project on folders, information_containers and model_revisions; trg_project_side_rows on projects',
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgname = 'trg_same_project'
     and c.relname in ('folders', 'information_containers', 'model_revisions')) = 3
  and exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'trg_project_side_rows' and c.relname = 'projects')
union all select 'the two trigger functions are not callable by a signed-in caller',
  not has_function_privilege('authenticated', 'public.cde_same_project()', 'execute')
  and not has_function_privilege('authenticated', 'public.cde_project_side_rows()', 'execute');

-- Part 2 (after the apply)
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  pa uuid; pb uuid; pd uuid; fa uuid; fb uuid; ca uuid; cb uuid; va uuid; vb uuid; r uuid := gen_random_uuid();
  u_a uuid := gen_random_uuid(); u_d uuid := gen_random_uuid();
  j_a text := json_build_object('sub', u_a, 'email', 'lead@example.test', 'role', 'authenticated')::text;
  j_d text := json_build_object('sub', u_d, 'email', 'owner@example.test', 'role', 'authenticated')::text;
  t_d text := gen_random_uuid()::text; t_x text := gen_random_uuid()::text;
  outcome text; rc int; got uuid; n int := 0; failed text[] := '{}';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.projects(key, name) values ('probe-0043-a-' || sfx, 'probe 0043 a') returning id into pa;
  insert into public.projects(key, name) values ('probe-0043-b-' || sfx, 'probe 0043 b') returning id into pb;
  insert into public.projects(key, name) values ('probe-0043-d-' || sfx, 'probe 0043 d') returning id into pd;
  insert into public.memberships(project_id, user_id, role) values (pa, u_a, 'lead'), (pd, u_d, 'owner');
  insert into public.folders(project_id, name, kind) values (pa, 'Project Files', 'root') returning id into fa;
  insert into public.folders(project_id, name, kind) values (pb, 'Project Files', 'root') returning id into fb;
  insert into public.information_containers(project_id, iso_name, folder_id) values (pa, 'PROBE-0043-A.ifc', fa) returning id into ca;
  insert into public.information_containers(project_id, iso_name, folder_id) values (pb, 'PROBE-0043-B.ifc', fb) returning id into cb;
  insert into public.container_versions(container_id, revision, sha256) values (ca, 'v1', repeat('a', 64)) returning id into va;
  insert into public.container_versions(container_id, revision, sha256) values (cb, 'v1', repeat('b', 64)) returning id into vb;
  insert into public.bcf_topics(guid, project_id, data) values (t_d, 'probe-0043-d-' || sfx, jsonb_build_object('guid', t_d)),
                                                               (t_x, 'probe-0043-a-' || sfx, jsonb_build_object('guid', t_x));
  insert into public.bridge_docs(store, project_id, doc_id, data) values
    ('rfi', 'probe-0043-d-' || sfx, 'probe-' || sfx, '{}'), ('changeset', pd::text, 'probe-' || sfx, '{}'),
    ('rfi', 'probe-0043-a-' || sfx, 'probe-' || sfx, '{}'), ('pack', '', 'probe-0043-' || sfx, '{}');

  -- O1 a signed-in caller who is not a member of B: B's file has no project for it
  perform set_config('request.jwt.claims', j_a, true);
  n := n + 1;
  got := public.project_of_container(cb);
  if got is not null then failed := failed || ('O1 a non-member read a file''s project: ' || got::text); end if;
  -- O2 a member reads its own file's project
  n := n + 1;
  got := public.project_of_container(ca);
  if got is distinct from pa then failed := failed || ('O2 a member''s own file: ' || coalesce(got::text, 'null')); end if;
  -- O3 the service key reads any file's project
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  got := public.project_of_container(cb);
  if got is distinct from pb then failed := failed || ('O3 the service key: ' || coalesce(got::text, 'null')); end if;

  -- T1 a lead of A transitions B's version: the words of a version that does not exist
  perform set_config('request.jwt.claims', j_a, true);
  n := n + 1;
  begin
    perform public.cde_transition(vb, 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0002 version ' || vb || ' not found' then failed := failed || ('T1 another project''s version: ' || coalesce(outcome, 'null')); end if;
  -- T2 a version that does not exist: the same words
  n := n + 1;
  begin
    perform public.cde_transition(r, 'shared');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0002 version ' || r || ' not found' then failed := failed || ('T2 a missing version: ' || coalesce(outcome, 'null')); end if;
  -- T3 the control: the lead shares A's own version (no review template: no verdict needed)
  n := n + 1;
  begin
    perform public.cde_transition(va, 'shared');
    outcome := (select state::text from public.container_versions where id = va);
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'shared' then failed := failed || ('T3 a member lead''s own version: ' || coalesce(outcome, 'null')); end if;

  -- R1 a review decision on B's version: the words of a version that does not exist
  n := n + 1;
  begin
    perform public.review_decide(vb, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0002 version ' || vb || ' not found' then failed := failed || ('R1 another project''s version: ' || coalesce(outcome, 'null')); end if;
  -- R2 a version that does not exist: the same words
  n := n + 1;
  begin
    perform public.review_decide(r, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0002 version ' || r || ' not found' then failed := failed || ('R2 a missing version: ' || coalesce(outcome, 'null')); end if;
  -- R3 a malformed decision on B's version: still the missing version's words (the project is read first)
  n := n + 1;
  begin
    perform public.review_decide(vb, 'maybe');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0002 version ' || vb || ' not found' then failed := failed || ('R3 a malformed decision elsewhere: ' || coalesce(outcome, 'null')); end if;
  -- R4 the control: A's own shared version, not under review
  n := n + 1;
  begin
    perform public.review_decide(va, 'approve');
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 version ' || va || ' is not under review' then failed := failed || ('R4 a member''s own version: ' || coalesce(outcome, 'null')); end if;

  -- F1 a folder in A under B's folder (signed in, under row-level security)
  n := n + 1;
  begin set local role authenticated;
    insert into public.folders(project_id, parent_id, name) values (pa, fb, 'probe f1');
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a folder and its parent folder are in one project' then failed := failed || ('F1 a parent in another project: ' || coalesce(outcome, 'null')); end if;
  -- F2 under a folder that does not exist: the same words
  n := n + 1;
  begin set local role authenticated;
    insert into public.folders(project_id, parent_id, name) values (pa, r, 'probe f2');
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a folder and its parent folder are in one project' then failed := failed || ('F2 a missing parent: ' || coalesce(outcome, 'null')); end if;
  -- K1 the control: a folder in A under A's folder
  n := n + 1;
  begin set local role authenticated;
    insert into public.folders(project_id, parent_id, name) values (pa, fa, 'probe k1');
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('K1 a folder under its own project''s folder: ' || coalesce(outcome, 'null')); end if;
  -- C1 a file in A filed in B's folder
  n := n + 1;
  begin set local role authenticated;
    insert into public.information_containers(project_id, iso_name, folder_id) values (pa, 'PROBE-0043-C1.ifc', fb);
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a file and its folder are in one project' then failed := failed || ('C1 a folder in another project: ' || coalesce(outcome, 'null')); end if;

  perform set_config('request.jwt.claims', '', true);
  -- F3 the service key moves A's folder to B: refused
  n := n + 1;
  begin
    update public.folders set project_id = pb where id = fa;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a folder stays in its project' then failed := failed || ('F3 a folder moved to another project: ' || coalesce(outcome, 'null')); end if;
  -- C2 the service key makes A's file a linked model of B's file: refused
  n := n + 1;
  begin
    update public.information_containers set parent_id = cb where id = ca;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a linked model and its host file are in one project' then failed := failed || ('C2 a host in another project: ' || coalesce(outcome, 'null')); end if;
  -- M1 the service key records a model revision of A naming B's version: refused
  n := n + 1;
  begin
    insert into public.model_revisions(project_id, container_version_id, rev_code) values (pa, vb, 'probe');
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'P0001 a model revision and its version are in one project' then failed := failed || ('M1 a version of another project: ' || coalesce(outcome, 'null')); end if;

  -- D1 D's owner deletes D (signed in, under row-level security): its BCF topic and its bridge document filed under its key
  -- go with it; its document filed under its id (evidence), A's and the global namespace's stay
  perform set_config('request.jwt.claims', j_d, true);
  n := n + 1;
  begin set local role authenticated;
    delete from public.projects where id = pd;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  perform set_config('request.jwt.claims', '', true);
  if outcome is distinct from 'OK 1'
     or exists (select 1 from public.bcf_topics where guid = t_d)
     or exists (select 1 from public.bridge_docs where doc_id = 'probe-' || sfx and project_id = 'probe-0043-d-' || sfx)
     or not exists (select 1 from public.bridge_docs where store = 'changeset' and doc_id = 'probe-' || sfx and project_id = pd::text)
     or not exists (select 1 from public.bcf_topics where guid = t_x)
     or not exists (select 1 from public.bridge_docs where doc_id = 'probe-' || sfx and project_id = 'probe-0043-a-' || sfx)
     or not exists (select 1 from public.bridge_docs where store = 'pack' and project_id = '' and doc_id = 'probe-0043-' || sfx) then
    failed := failed || ('D1 the owner''s delete and its side rows: ' || coalesce(outcome, 'null'));
  end if;

  if exists (select 1 from public.folders where name in ('probe f1', 'probe f2')) or (select project_id from public.folders where id = fa) <> pa
     or (select parent_id from public.information_containers where id = ca) is not null
     or exists (select 1 from public.model_revisions where rev_code = 'probe') or (select state::text from public.container_versions where id = vb) <> 'wip' then
    failed := failed || 'a refused write changed a row'::text;
  end if;

  raise exception 'PROBE 0043: % of % as expected%. Everything above is rolled back (the projects, the memberships, the folders, the files, the versions and the side rows built for the cases).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
