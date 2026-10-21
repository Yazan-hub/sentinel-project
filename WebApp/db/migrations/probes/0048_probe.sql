-- probes/0048_probe.sql — the drill for 0048_project_version.sql. Part 0 runs BEFORE the apply (read-only). Parts 1 and 2 run AFTER.
-- Part 1: every row must read true. Part 2: one DO block that updates one project three ways and checks the version, the stamp and a
-- stale write. It ALWAYS raises its summary, so everything it wrote rolls back. "PROBE 0048: 7 of 7 as expected." is the pass.

-- Part 0 (before the apply)
select 'projects.version exists already (expect 0)' as what, count(*)::text as n from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name in ('version', 'updated_at', 'updated_by')
union all select 'projects (the rows 0048 stamps version 1)', count(*)::text from public.projects
union all select 'BEFORE UPDATE row triggers on projects now', string_agg(t.tgname, ', ' order by t.tgname) from pg_trigger t where t.tgrelid = 'public.projects'::regclass and not t.tgisinternal and (t.tgtype & 2) <> 0 and (t.tgtype & 16) <> 0;

-- Part 1 (after the apply)
select 'every project has version 1 or more' as what, not exists (select 1 from public.projects where version is null or version < 1) as ok
union all select 'the three columns are there', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name in ('version', 'updated_at', 'updated_by')) = 3
union all select 'trg_projects_version is a BEFORE UPDATE row trigger on projects', exists (select 1 from pg_trigger t where t.tgrelid = 'public.projects'::regclass and t.tgname = 'trg_projects_version' and (t.tgtype & 2) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 1) <> 0)
union all select 'no API role may call the function', not (has_function_privilege('anon', 'public.projects_version()', 'execute') or has_function_privilege('authenticated', 'public.projects_version()', 'execute'));

-- Part 2 (after the apply): one project updated as the service key, as a signed-in person, and stale — rolled back.
do $$
declare p public.projects; v0 bigint; r public.projects; n int; ok int := 0; total int := 7; msg text;
begin
  select * into p from public.projects order by created_at limit 1;
  if p.id is null then raise exception 'PROBE 0048: no project to probe'; end if;
  v0 := p.version;
  perform set_config('request.jwt.claims', '', true);
  update public.projects set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('snapshot', jsonb_build_object('health', 48), 'updated_at', now()::text) where id = p.id returning * into r;
  if r.version = v0 then ok := ok + 1; else raise notice 'FAIL 0: a snapshot-only save moved the version'; end if;
  update public.projects set name = name || ' (probe)' where id = p.id returning * into r;
  if r.version = v0 + 1 then ok := ok + 1; else raise notice 'FAIL 1: the version did not move by one (% → %)', v0, r.version; end if;
  if r.updated_by = 'the Sentinel bridge (machine credential)' then ok := ok + 1; else raise notice 'FAIL 2: a service write is stamped %', r.updated_by; end if;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000048","role":"authenticated","email":"probe@0048.test"}', true);
  update public.projects set name = name || ' again', updated_by = 'someone else', version = 1 where id = p.id returning * into r;
  if r.updated_by = 'probe@0048.test' then ok := ok + 1; else raise notice 'FAIL 3: a signed-in write is stamped %', r.updated_by; end if;
  if r.version = v0 + 2 then ok := ok + 1; else raise notice 'FAIL 4: a client set the version (%)', r.version; end if;
  perform set_config('request.jwt.claims', '', true);
  update public.projects set name = name || ' stale' where id = p.id and version = v0;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else raise notice 'FAIL 5: a write on the stale version % changed % row(s)', v0, n; end if;
  if r.updated_at >= p.updated_at then ok := ok + 1; else raise notice 'FAIL 6: updated_at went back'; end if;
  msg := format('PROBE 0048: %s of %s as expected.', ok, total);
  raise exception '%', msg;
end $$;
