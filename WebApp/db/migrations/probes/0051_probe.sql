-- probes/0051_probe.sql — the drill for 0051_office_register_read.sql. Run AFTER the apply.
-- Part 1: the read policy exists and its text names office_register (one row, ok = true).
-- Part 2: one DO block, claims of a viewer of some project (set_config, then SET LOCAL ROLE authenticated) counting office_register rows: must be 0.
--   It always raises its summary, so everything it wrote rolls back. "PROBE 0051: 1 of 1 as expected." is the pass.

-- Part 1
select 'bridge_docs_read mentions office_register' as what,
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bridge_docs' and policyname = 'bridge_docs_read' and position('office_register' in qual) > 0) as ok;

-- Part 2
do $$
declare pid uuid; viewer_uid uuid; n int; ok int := 0;
begin
  select m.project_id, m.user_id into pid, viewer_uid from public.memberships m
   where m.role = 'viewer' and m.state = 'active'
   limit 1;
  if pid is null then raise exception 'PROBE 0051: cannot run — no viewer membership'; end if;
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('office_register', pid::text, 'probe-0051', '{}');
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', viewer_uid), true);
  set local role authenticated;
  select count(*) into n from public.bridge_docs where store = 'office_register' and project_id = pid::text;
  reset role;
  if n = 0 then ok := ok + 1; else raise notice 'FAIL 1: viewer read % register rows', n; end if;
  raise exception 'PROBE 0051: % of 1 as expected.', ok;
end $$;
