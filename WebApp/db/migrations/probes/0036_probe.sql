-- probes/0036_probe.sql — the drill for 0036_platform_gate_run.sql, run by the controller AFTER 0036 is applied. Two parts.
--
-- Part 1 (read-only): every row must read true.
select 'one row per run: a unique index on the execution id among platform_gate rows' as check,
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'audit_log' and indexname = 'audit_platform_gate_run'
    and indexdef ilike 'create unique index%'
    and indexdef ilike '%(new_value ->> ''execution_id''::text)%'
    and indexdef ilike '%where (entity_type = ''platform_gate''::text)%') as ok
union all select 'the index is valid (built, used by inserts)',
  coalesce((select i.indisvalid from pg_index i where i.indexrelid = to_regclass('public.audit_platform_gate_run')), false)
union all select 'no platform_gate row without an execution id', not exists (select 1 from public.audit_log
   where entity_type = 'platform_gate' and coalesce(new_value->>'execution_id', '') = '');

-- Part 2: one DO block writes platform_gate rows on a throwaway project — the first row of a run, the same run again,
-- another run, and the same execution id under another entity type — then ALWAYS raises its summary, so every write it
-- made rolls back. "PROBE 0036: 4 of 4 as expected …" is the pass. The rows consume audit identity values; the summary
-- names them.
do $probe$
declare
  p uuid;
  eid text := 'probe-0036-' || substr(md5(random()::text), 1, 12);
  eid2 text := 'probe-0036-' || substr(md5(random()::text), 1, 12);
  tip_before text; tip_after text;
  outcome text;
  n int := 0;
  failed text[] := '{}';
  burned bigint[];
begin
  insert into public.projects(key, name) values ('probe-0036-' || substr(md5(random()::text), 1, 10), 'probe 0036') returning id into p;

  -- G1 the first row of a run is written
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'platform_gate', null, 'platform gate PASS: probe.ifc v1', 'platform gate', jsonb_build_object('execution_id', eid, 'result', 'pass'));
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'OK' then failed := failed || ('G1 ' || outcome); end if;

  -- G2 the same run again is refused with 23505, and the chain tip does not move (the chain trigger rolled back with it)
  select hash into tip_before from public.audit_log order by id desc limit 1;
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'platform_gate', null, 'platform gate FAIL: probe.ifc v1', 'platform gate', jsonb_build_object('execution_id', eid, 'result', 'fail'));
    outcome := 'OK';
  exception when others then outcome := sqlstate; end;
  select hash into tip_after from public.audit_log order by id desc limit 1;
  outcome := outcome || ' | ' || case when tip_after is not distinct from tip_before then 'tip unchanged' else 'tip moved' end
          || ' | ' || (select count(*) from public.audit_log where entity_type = 'platform_gate' and new_value->>'execution_id' = eid)::text;
  if outcome <> '23505 | tip unchanged | 1' then failed := failed || ('G2 ' || outcome); end if;

  -- G3 another run on the same project is written (the key is the run, not the project)
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'platform_gate', null, 'platform gate NOT CHECKED: probe.ifc v2', 'platform gate', jsonb_build_object('execution_id', eid2, 'result', 'not_checked'));
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'OK' then failed := failed || ('G3 ' || outcome); end if;

  -- G4 the index is partial: another entity type may carry the same execution id
  n := n + 1;
  begin
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, new_value)
      values (p, 'note', null, 'probe note', 'probe', jsonb_build_object('execution_id', eid));
    outcome := 'OK';
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome <> 'OK' then failed := failed || ('G4 ' || outcome); end if;

  select array_agg(id order by id) into burned from public.audit_log where project_id = p;
  raise exception 'PROBE 0036: % of % as expected%. Everything above is rolled back; its audit rows took ledger ids % (identity values are not returned, so those ids will not exist).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end,
    burned;
end $probe$;
