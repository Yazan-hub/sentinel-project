-- probes/0050_probe.sql — the drill for 0050_party_invitations.sql. Part 0 runs BEFORE the apply (read-only). Parts 1 and 2 run AFTER.
-- Part 0: counts: memberships by role, and how many owners/leads have no party yet (all of them, before the apply).
-- Part 1: every row must read true: the three columns exist, every owner and lead is the Lead firm, the guard is on, invitations is
--   bridge-only, no API role may execute the guard, review_decide still belongs to authenticated only.
-- Part 2: one DO block with seven refusals (claims set with set_config, no role switch, so the trigger's rules are probed, not RLS).
--   It picks a project that has an owner, a lead and a third member, ALWAYS raises its summary, so everything it wrote rolls back.
--   "PROBE 0050: 7 of 7 as expected." is the pass.

-- Part 0 (before the apply)
select 'memberships: ' || role as what, count(*)::text as n from public.memberships group by role
union all select 'owners and leads (the backfill makes each the Lead firm)', count(*)::text from public.memberships where role in ('owner', 'lead')
union all select 'projects with at least one owner', count(distinct project_id)::text from public.memberships where role = 'owner';

-- Part 1 (after the apply)
select 'memberships has party, task_team, state' as what,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'memberships' and column_name in ('party', 'task_team', 'state')) = 3 as ok
union all select 'every owner and lead is the Lead firm', not exists (select 1 from public.memberships where role in ('owner', 'lead') and party is distinct from 'lead_appointed')
union all select 'every membership is active (nobody invited yet)', not exists (select 1 from public.memberships where state <> 'active')
union all select 'trg_memberships_party_guard is on memberships for insert, update and delete', exists (select 1 from pg_trigger t where t.tgrelid = 'public.memberships'::regclass and t.tgname = 'trg_memberships_party_guard' and not t.tgisinternal and t.tgtype & 28 = 28)
union all select 'invitations exists with row level security on and no policy', exists (select 1 from pg_class c where c.relname = 'invitations' and c.relrowsecurity) and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invitations')
union all select 'no API role may read invitations', not exists (select 1 from unnest(array['anon', 'authenticated']) r(rolname) where has_table_privilege(r.rolname, 'public.invitations', 'select'))
union all select 'no API role may execute the guard', not exists (select 1 from unnest(array['anon', 'authenticated']) r(rolname) where has_function_privilege(r.rolname, 'public.memberships_party_guard()', 'execute'))
union all select 'review_decide: authenticated yes, anon and service_role no', has_function_privilege('authenticated', 'public.review_decide(uuid, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.review_decide(uuid, text, text)', 'execute') and not has_function_privilege('service_role', 'public.review_decide(uuid, text, text)', 'execute')
union all select 'review_decide knows parties', position('decider_party' in pg_get_functiondef('public.review_decide(uuid, text, text)'::regprocedure)) > 0
union all select 'is_member counts active rows only', position('state = ''active''' in pg_get_functiondef('public.is_member(uuid)'::regprocedure)) > 0;

-- Part 2 (after the apply): five refusals, rolled back.
do $$
declare pid uuid; owner_uid uuid; lead_uid uuid; third_uid uuid; ok int := 0; total int := 7;
  claim constant text := '{"sub":"%s","role":"authenticated","email":"probe@0050.test"}';
begin
  select m.project_id into pid from public.memberships m
   where exists (select 1 from public.memberships o where o.project_id = m.project_id and o.role = 'owner')
     and exists (select 1 from public.memberships l where l.project_id = m.project_id and l.role = 'lead')
   group by m.project_id having count(*) >= 3 order by count(*) desc limit 1;
  if pid is null then raise exception 'PROBE 0050: cannot run — no project with an owner, a lead and a third member'; end if;
  select user_id into owner_uid from public.memberships where project_id = pid and role = 'owner' order by created_at limit 1;
  select user_id into lead_uid from public.memberships where project_id = pid and role = 'lead' order by created_at limit 1;
  select user_id into third_uid from public.memberships where project_id = pid and user_id not in (owner_uid, lead_uid) order by created_at limit 1;

  -- 1 · a lead cannot change a party
  begin
    perform set_config('request.jwt.claims', format(claim, lead_uid), true);
    update public.memberships set party = 'lead_appointed' where project_id = pid and user_id = third_uid;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('only by an owner' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 1: %', sqlerrm; end if;
  end;

  -- 2 · an owner cannot change their own row
  begin
    perform set_config('request.jwt.claims', format(claim, owner_uid), true);
    update public.memberships set party = 'appointing' where project_id = pid and user_id = owner_uid;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('never on your own row' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 2: %', sqlerrm; end if;
  end;

  -- 3 · a lead cannot insert the Client
  begin
    perform set_config('request.jwt.claims', format(claim, lead_uid), true);
    insert into public.memberships(project_id, user_id, role, party, state) values (pid, gen_random_uuid(), 'viewer', 'appointing', 'invited');
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('only an owner adds the Client' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 3: %', sqlerrm; end if;
  end;

  -- 4 · the service credential cannot change a party
  begin
    perform set_config('request.jwt.claims', '', true);
    update public.memberships set party = 'appointing' where project_id = pid and user_id = third_uid;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('service credential changes only invited' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 4: %', sqlerrm; end if;
  end;

  -- 5 · a Firm member needs a task team
  begin
    perform set_config('request.jwt.claims', format(claim, owner_uid), true);
    update public.memberships set party = 'appointed', task_team = null where project_id = pid and user_id = third_uid;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('belongs to a task team' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 5: %', sqlerrm; end if;
  end;

  -- 6 · a membership cannot be moved to another account (a lead handing a party to a burner)
  begin
    perform set_config('request.jwt.claims', format(claim, lead_uid), true);
    update public.memberships set user_id = gen_random_uuid() where project_id = pid and user_id = third_uid;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if position('stays on its person and project' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 6: %', sqlerrm; end if;
  end;

  -- 7 · a lead cannot remove the Client (the owner's row is made the Client by the service first, inside the probe's transaction)
  begin
    perform set_config('request.jwt.claims', '', true);
    update public.memberships set party = 'appointing' where project_id = pid and user_id = third_uid; -- refused by rule 4 above; so insert one instead
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    begin
      perform set_config('request.jwt.claims', format(claim, owner_uid), true);
      insert into public.memberships(project_id, user_id, role, party, state) values (pid, gen_random_uuid(), 'viewer', 'appointing', 'invited');
      perform set_config('request.jwt.claims', format(claim, lead_uid), true);
      delete from public.memberships where project_id = pid and party = 'appointing' and state = 'invited';
      raise exception 'PROBE_ACCEPTED';
    exception when others then
      if position('only an owner removes the Client' in sqlerrm) > 0 then ok := ok + 1; else raise notice 'FAIL 7: %', sqlerrm; end if;
    end;
  end;

  raise exception 'PROBE 0050: % of % as expected.', ok, total;
end $$;
