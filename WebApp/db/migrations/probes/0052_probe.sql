-- probes/0052_probe.sql — the drill for 0052_comment_audiences.sql. Run AFTER the apply.
-- Part 1: the read policy names doc_comments_team, the function exists, doc_reads has RLS on and no grant to authenticated (3 rows, ok = true).
-- Part 2: one DO block. For a Client member (party appointing) of some project and for a delivery-party member of the same project it counts
--   doc_comments_team rows under SET LOCAL ROLE authenticated: the Client must read 0, the delivery member must read the 1 row inserted here.
--   It always raises its summary, so everything it wrote rolls back. "PROBE 0052: 2 of 2 as expected." is the pass.

-- Part 1
select 'bridge_docs_read mentions doc_comments_team' as what,
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bridge_docs' and policyname = 'bridge_docs_read' and position('doc_comments_team' in qual) > 0) as ok
union all
select 'bridge_docs_delivery exists', exists (select 1 from pg_proc where proname = 'bridge_docs_delivery' and pronamespace = 'public'::regnamespace)
union all
select 'doc_reads: RLS on, no grant to authenticated',
  coalesce((select relrowsecurity from pg_class where oid = 'public.doc_reads'::regclass), false)
  and not has_table_privilege('authenticated', 'public.doc_reads', 'select');

-- Part 2
do $$
declare pid uuid; client_uid uuid; team_uid uuid; n int; ok int := 0;
begin
  select m.project_id, m.user_id into pid, client_uid from public.memberships m
   where m.party = 'appointing' and m.state = 'active' limit 1;
  if pid is null then raise exception 'PROBE 0052: cannot run — no Client (appointing) membership'; end if;
  select m.user_id into team_uid from public.memberships m
   where m.project_id = pid and m.party in ('lead_appointed', 'appointed') and m.state = 'active' limit 1;
  if team_uid is null then raise exception 'PROBE 0052: cannot run — no delivery-party member on that project'; end if;
  insert into public.bridge_docs(store, project_id, doc_id, data) values ('doc_comments_team', pid::text, 'probe-0052', '{}');

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', client_uid), true);
  set local role authenticated;
  select count(*) into n from public.bridge_docs where store = 'doc_comments_team' and project_id = pid::text;
  reset role;
  if n = 0 then ok := ok + 1; else raise notice 'FAIL 1: the Client read % team rows', n; end if;

  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', team_uid), true);
  set local role authenticated;
  select count(*) into n from public.bridge_docs where store = 'doc_comments_team' and project_id = pid::text and doc_id = 'probe-0052';
  reset role;
  if n = 1 then ok := ok + 1; else raise notice 'FAIL 2: a delivery-party member read % of the 1 probe row', n; end if;

  raise exception 'PROBE 0052: % of 2 as expected.', ok;
end $$;
