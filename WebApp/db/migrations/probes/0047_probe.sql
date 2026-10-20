-- probes/0047_probe.sql — the drill for 0047_chain_tip.sql. Part 0 runs BEFORE the apply (read-only). Parts 1 and 2 run AFTER.
-- Part 1: every row must read true. Part 2: one DO block that writes three ledger rows in the racing order (ids drawn out of lock
-- order, given explicitly) and checks they form one line. It ALWAYS raises its summary, so everything it wrote rolls back.
-- "PROBE 0047: 5 of 5 as expected." is the pass.

-- Part 0 (before the apply)
select 'a table named audit_chain_tip already (expect 0)' as what, count(*)::text as n from pg_tables where schemaname = 'public' and tablename = 'audit_chain_tip'
union all select 'chain ends — rows no row names as prev_hash (expect 1)', count(*)::text from public.audit_log a where not exists (select 1 from public.audit_log b where b.prev_hash = a.hash)
union all select 'forks — prev_hash named by two rows or more (expect 0)', count(*)::text from (select prev_hash from public.audit_log where prev_hash is not null group by prev_hash having count(*) > 1) f;

-- Part 1 (after the apply)
select 'the tip holds one row' as what, (select count(*) from public.audit_chain_tip) = 1 as ok
union all select 'the tip is the chain''s one end', (select t.hash from public.audit_chain_tip t) = (select a.hash from public.audit_log a where not exists (select 1 from public.audit_log b where b.prev_hash = a.hash))
union all select 'no fork', not exists (select 1 from public.audit_log where prev_hash is not null group by prev_hash having count(*) > 1)
union all select 'every hash still recomputes (the formula unchanged)', not exists (select 1 from public.audit_log a where a.hash is distinct from encode(extensions.digest(coalesce(a.prev_hash,'') || a.entity_type || coalesce(a.entity_id::text,'') || a.action || coalesce(a.actor,'') || coalesce(a.old_value::text,'') || coalesce(a.new_value::text,'') || coalesce(a.at::text,''), 'sha256'), 'hex'))
union all select 'the trigger function is security definer with an empty search_path', (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.cde_audit_chain()'::regprocedure)
union all select 'no API role may write the tip; only service_role reads it', not (has_table_privilege('service_role', 'public.audit_chain_tip', 'insert') or has_table_privilege('service_role', 'public.audit_chain_tip', 'update')
  or has_table_privilege('service_role', 'public.audit_chain_tip', 'delete') or has_table_privilege('authenticated', 'public.audit_chain_tip', 'select') or has_table_privilege('anon', 'public.audit_chain_tip', 'select'))
  and has_table_privilege('service_role', 'public.audit_chain_tip', 'select');

-- Part 2 (after the apply): the race, rolled back.
do $$
declare m bigint; tip0 text; a public.audit_log; b public.audit_log; c public.audit_log; ok int := 0; total int := 5; msg text;
begin
  select max(id) into m from public.audit_log;
  select hash into tip0 from public.audit_chain_tip;
  -- B takes the lock first with the higher id, then A with the lower id, then C: the order that forked before 0047.
  insert into public.audit_log(id, entity_type, action, actor) overriding system value values (m + 1001, 'event', 'probe 0047 B', 'probe') returning * into b;
  insert into public.audit_log(id, entity_type, action, actor) overriding system value values (m + 1000, 'event', 'probe 0047 A', 'probe') returning * into a;
  insert into public.audit_log(id, entity_type, action, actor) overriding system value values (m + 1002, 'event', 'probe 0047 C', 'probe') returning * into c;
  if b.prev_hash = tip0 then ok := ok + 1; else raise notice 'FAIL 1: B did not chain onto the tip'; end if;
  if a.prev_hash = b.hash then ok := ok + 1; else raise notice 'FAIL 2: A did not chain onto B'; end if;
  if c.prev_hash = a.hash then ok := ok + 1; else raise notice 'FAIL 3: C did not chain onto A (the fork)'; end if;
  if (select audit_id from public.audit_chain_tip) = c.id then ok := ok + 1; else raise notice 'FAIL 4: the tip is not C'; end if;
  if not exists (select 1 from public.audit_log where prev_hash is not null group by prev_hash having count(*) > 1) then ok := ok + 1; else raise notice 'FAIL 5: a fork'; end if;
  msg := format('PROBE 0047: %s of %s as expected.', ok, total);
  raise exception '%', msg;
end $$;
