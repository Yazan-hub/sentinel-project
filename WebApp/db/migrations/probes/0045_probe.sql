-- probes/0045_probe.sql — the drill for 0045_project_chain.sql. Part 0 runs BEFORE the apply (read-only). Parts 1 and 2 run AFTER.
-- Part 1: every row must read true. Part 2: one DO block that writes ledger rows into a probe project the way the bridge does, then
-- checks the chain the trigger made. It ALWAYS raises its summary, so everything it wrote rolls back. "PROBE 0045: 8 of 8 as
-- expected." is the pass.

-- Part 0 (before the apply)
select 'a table, view or function named as 0045''s already (expect 0)' as what,
  ((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('audit_project_chain', 'audit_project_chain_v'))
   + (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
       and p.proname in ('cde_chain_at', 'cde_chain_field', 'cde_project_chain_preimage', 'cde_project_chain_append', 'cde_project_chain_after', 'cde_project_chain_no_change')))::text as n
union all select 'ledger rows that name a project (the chain must hold exactly this many after)', count(*)::text from public.audit_log where project_id is not null;

-- Part 1 (after the apply)
select 'the chain holds every ledger row that names a project, once' as what,
  (select count(*) from public.audit_log where project_id is not null) = (select count(*) from public.audit_project_chain) as ok
union all select 'each project''s seq runs 1..n with no gap', not exists (select 1 from public.audit_project_chain group by project_id having max(project_seq) <> count(*) or min(project_seq) <> 1)
union all select 'each chain row is its ledger row''s project', not exists (select 1 from public.audit_project_chain c join public.audit_log a on a.id = c.audit_id where a.project_id is distinct from c.project_id)
union all select 'every project_hash recomputes from its row and the one before',
  (select bool_and(c.project_hash = encode(extensions.digest(public.cde_project_chain_preimage(a, c.project_seq, p.project_hash), 'sha256'), 'hex'))
     from public.audit_project_chain c join public.audit_log a on a.id = c.audit_id
     left join public.audit_project_chain p on p.project_id = c.project_id and p.project_seq = c.project_seq - 1)
union all select 'the trigger is on the ledger, after insert', exists (select 1 from pg_trigger where tgname = 'trg_audit_project_chain' and tgrelid = 'public.audit_log'::regclass)
union all select 'row level security is on the chain', relrowsecurity from pg_class where oid = 'public.audit_project_chain'::regclass
union all select 'the view reads as its caller (security_invoker)', coalesce('security_invoker=true' = any(reloptions), false) from pg_class where oid = 'public.audit_project_chain_v'::regclass
union all select 'no API role may insert, update or delete a chain row', not (has_table_privilege('service_role', 'public.audit_project_chain', 'insert')
  or has_table_privilege('service_role', 'public.audit_project_chain', 'update') or has_table_privilege('service_role', 'public.audit_project_chain', 'delete')
  or has_table_privilege('authenticated', 'public.audit_project_chain', 'insert') or has_table_privilege('anon', 'public.audit_project_chain', 'select'))
union all select 'no API role may call the append function', not (has_function_privilege('service_role', 'public.cde_project_chain_append(public.audit_log)', 'execute')
  or has_function_privilege('authenticated', 'public.cde_project_chain_append(public.audit_log)', 'execute'));

-- Part 2 (after the apply): the behaviour, rolled back.
do $$
declare p uuid; ok int := 0; total int := 8; s1 public.audit_project_chain; s2 public.audit_project_chain; n int; msg text;
begin
  insert into public.projects(key, name) values ('probe-0045', 'Probe 0045') returning id into p;
  insert into public.audit_log(project_id, entity_type, action, actor, new_value) values (p, 'event', 'probe one', 'probe', '{"b": 1, "a": "ü"}');
  insert into public.audit_log(project_id, entity_type, action, actor, new_value) values (p, 'event', 'probe two', null, null);
  select * into s1 from public.audit_project_chain where project_id = p and project_seq = 1;
  select * into s2 from public.audit_project_chain where project_id = p and project_seq = 2;
  if s1.audit_id is not null then ok := ok + 1; else raise notice 'FAIL 1: the first row was not chained'; end if;
  if s2.audit_id > s1.audit_id then ok := ok + 1; else raise notice 'FAIL 2: the second row is not seq 2 after the first'; end if;
  if s2.project_hash = encode(extensions.digest(public.cde_project_chain_preimage((select a from public.audit_log a where a.id = s2.audit_id), 2, s1.project_hash), 'sha256'), 'hex')
    then ok := ok + 1; else raise notice 'FAIL 3: seq 2 does not chain to seq 1'; end if;
  if (select at_utc from public.audit_project_chain_v where audit_id = s1.audit_id) ~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$' then ok := ok + 1; else raise notice 'FAIL 4: at_utc is not UTC with microseconds'; end if;
  begin update public.audit_project_chain set project_seq = 9 where audit_id = s1.audit_id; raise notice 'FAIL 5: a chain row was updated';
  exception when others then if sqlerrm like '%append-only%' then ok := ok + 1; else raise notice 'FAIL 5: %', sqlerrm; end if; end;
  begin delete from public.audit_project_chain where audit_id = s1.audit_id; raise notice 'FAIL 6: a chain row was deleted';
  exception when others then if sqlerrm like '%append-only%' then ok := ok + 1; else raise notice 'FAIL 6: %', sqlerrm; end if; end;
  -- a row with no project stays in the global chain only
  select count(*) into n from public.audit_project_chain;
  insert into public.audit_log(entity_type, action, actor) values ('ledger_anchor', 'anchor:timestamped', 'probe');
  if (select count(*) from public.audit_project_chain) = n then ok := ok + 1; else raise notice 'FAIL 7: a row with no project was chained'; end if;
  -- the backfill's own check would still hold
  if (select count(*) from public.audit_log where project_id is not null) = (select count(*) from public.audit_project_chain) then ok := ok + 1; else raise notice 'FAIL 8: the chain does not cover the ledger'; end if;
  msg := format('PROBE 0045: %s of %s as expected.', ok, total);
  raise exception '%', msg;
end $$;
