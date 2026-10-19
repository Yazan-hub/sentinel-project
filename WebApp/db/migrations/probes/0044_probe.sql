-- probes/0044_probe.sql — the drill for 0044_feed_keys.sql. Part 0 runs BEFORE the apply (read-only). Parts 1 and 2 run AFTER.
-- Part 1: every row must read true. Part 2: one DO block that makes a user, a project, a revision with one element and a
-- feed key (service role), then asks the feed functions as anon would. It ALWAYS raises its summary, so everything it wrote
-- rolls back. "PROBE 0044: 7 of 7 as expected." is the pass.

-- Part 0 (before the apply)
select 'a table or function named as 0044''s already (expect 0)' as what,
  ((select count(*) from pg_tables where schemaname = 'public' and tablename = 'feed_keys')
   + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('feed_rows', 'feed_revisions', 'feed_key_owner')))::text as n;

-- Part 1 (after the apply)
select 'feed_keys has row level security on' as what, relrowsecurity as ok from pg_class where oid = 'public.feed_keys'::regclass
union all select 'anon holds no privilege on feed_keys', not (has_table_privilege('anon', 'public.feed_keys', 'select') or has_table_privilege('anon', 'public.feed_keys', 'insert'))
union all select 'a signed-in user cannot delete a key row', not has_table_privilege('authenticated', 'public.feed_keys', 'delete')
union all select 'a signed-in user cannot re-point a key (user_id is not updatable)', not has_column_privilege('authenticated', 'public.feed_keys', 'user_id', 'update')
union all select 'anon may call feed_rows and feed_revisions', has_function_privilege('anon', 'public.feed_rows(text, text, text)', 'execute') and has_function_privilege('anon', 'public.feed_revisions(text, text)', 'execute')
union all select 'nobody but the owner calls feed_key_owner', not has_function_privilege('anon', 'public.feed_key_owner(text)', 'execute') and not has_function_privilege('authenticated', 'public.feed_key_owner(text)', 'execute');

-- Part 2 (after the apply): the behaviour, rolled back.
do $$
declare u uuid := gen_random_uuid(); p uuid; o uuid; r uuid; ok int := 0; n int;
  k text := 'sfk_probe_0044_key';
begin
  insert into auth.users(id, email, aud, role) values (u, 'probe-0044@sentinel.test', 'authenticated', 'authenticated');
  insert into public.projects(key, name) values ('probe-0044-a', 'Probe 0044 A') returning id into p;
  insert into public.projects(key, name) values ('probe-0044-b', 'Probe 0044 B') returning id into o;
  insert into public.memberships(project_id, user_id, role) values (p, u, 'viewer');
  insert into public.model_revisions(project_id, rev_code) values (p, 'P01') returning id into r;
  insert into public.element_snapshots(revision_id, project_id, guid, category, count) values (r, p, 'probe-guid', 'IFCWALL', 1);
  insert into public.feed_keys(user_id, key_hash, label) values (u, encode(sha256(convert_to(k, 'UTF8')), 'hex'), 'probe');
  set local role anon;
  n := json_array_length(public.feed_rows(k, 'probe-0044-a', 'latest')); if n = 1 then ok := ok + 1; end if;           -- 1 the key reads its project
  n := json_array_length(public.feed_revisions(k, 'probe-0044-a')); if n = 1 then ok := ok + 1; end if;                -- 2 and its revisions
  begin perform public.feed_rows(k, 'probe-0044-b', 'latest'); exception when others then if sqlerrm like 'not a member%' then ok := ok + 1; end if; end; -- 3 not another project
  begin perform public.feed_rows('sfk_wrong', 'probe-0044-a', 'latest'); exception when others then if sqlerrm like 'feed key not valid%' then ok := ok + 1; end if; end; -- 4 not a wrong key
  begin perform count(*) from public.feed_keys; exception when others then if sqlerrm like 'permission denied%' then ok := ok + 1; end if; end; -- 5 anon reads no keys
  reset role;
  update public.feed_keys set revoked_at = now() where user_id = u;
  set local role anon;
  begin perform public.feed_rows(k, 'probe-0044-a', 'latest'); exception when others then if sqlerrm like 'feed key not valid%' then ok := ok + 1; end if; end; -- 6 not a revoked key
  reset role;
  update public.feed_keys set revoked_at = null where user_id = u;
  delete from public.memberships where user_id = u;
  set local role anon;
  begin perform public.feed_rows(k, 'probe-0044-a', 'latest'); exception when others then if sqlerrm like 'not a member%' then ok := ok + 1; end if; end; -- 7 not after removal
  reset role;
  raise exception 'PROBE 0044: % of 7 as expected.', ok;
end $$;
