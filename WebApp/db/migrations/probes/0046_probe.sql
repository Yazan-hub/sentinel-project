-- probes/0046_probe.sql — the drill for 0046_office_leave_guard.sql. Part 0 runs BEFORE the apply (read-only). Part 1 runs
-- AFTER: one DO block that makes two offices, a project and three users (service role), then tries each case signed in through
-- the transaction-local request.jwt.claims that auth.uid() reads, under `set local role authenticated`. It ALWAYS raises its
-- summary, so everything it wrote rolls back. "PROBE 0046: 5 of 5 as expected." is the pass.

-- Part 0 (before the apply): 0033's guard is in place and has no leave check yet (expect true, false)
select 'projects_office_guard has the attach check' as what,
  exists (select 1 from pg_proc where proname = 'projects_office_guard' and prosrc like '%attaching a project to an office needs the lead role%') as ok
union all select 'it already has the leave check (expect false before, true after)',
  exists (select 1 from pg_proc where proname = 'projects_office_guard' and prosrc like '%leaves its office only through a lead%');

-- Part 1 (after the apply): the behaviour, rolled back.
do $probe$
declare
  sfx text := substr(md5(random()::text), 1, 8);
  o1 uuid; o2 uuid; p uuid; o1k text := 'probe-0046-o1-' || sfx; o2k text := 'probe-0046-o2-' || sfx; pk text := 'probe-0046-p-' || sfx;
  u_p uuid := gen_random_uuid(); u_both uuid := gen_random_uuid(); u_move uuid := gen_random_uuid();
  outcome text; rc int; n int := 0; failed text[] := '{}';
  leave text := '42501 a project leaves its office only through a lead of that office — nothing was saved';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into auth.users(id, email, aud, role) values
    (u_p, 'probe-0046-p@sentinel.test', 'authenticated', 'authenticated'),
    (u_both, 'probe-0046-both@sentinel.test', 'authenticated', 'authenticated'),
    (u_move, 'probe-0046-move@sentinel.test', 'authenticated', 'authenticated');
  insert into public.projects(key, name, kind) values (o1k, 'probe 0046 office 1', 'office') returning id into o1;
  insert into public.projects(key, name, kind) values (o2k, 'probe 0046 office 2', 'office') returning id into o2;
  insert into public.projects(key, name, office_key) values (pk, 'probe 0046 project', o1k) returning id into p;
  insert into public.memberships(project_id, user_id, role) values
    (p, u_p, 'lead'), (p, u_both, 'lead'), (o1, u_both, 'lead'), (p, u_move, 'lead'), (o2, u_move, 'lead');

  -- L1 the project's lead, not the office's, detaches it
  perform set_config('request.jwt.claims', json_build_object('sub', u_p, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin set local role authenticated;
    update public.projects set office_key = null where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from leave then failed := failed || ('L1 a project lead detached it: ' || coalesce(outcome, 'null')); end if;

  -- L2 a lead of the project and of another office moves it there
  perform set_config('request.jwt.claims', json_build_object('sub', u_move, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin set local role authenticated;
    update public.projects set office_key = o2k where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from leave then failed := failed || ('L2 moved out by a lead of another office: ' || coalesce(outcome, 'null')); end if;

  -- L3 a lead of the office (and the project) detaches it: allowed
  perform set_config('request.jwt.claims', json_build_object('sub', u_both, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin set local role authenticated;
    update public.projects set office_key = null where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('L3 the office''s lead: ' || coalesce(outcome, 'null')); end if;

  -- L4 0033's attach rule still holds: the project's lead (not the office's) attaches it back
  perform set_config('request.jwt.claims', json_build_object('sub', u_p, 'role', 'authenticated')::text, true);
  n := n + 1;
  begin set local role authenticated;
    update public.projects set office_key = o1k where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc; reset role;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from '42501 attaching a project to an office needs the lead role on that office — nothing was saved' then failed := failed || ('L4 attach: ' || coalesce(outcome, 'null')); end if;

  -- L5 the service key (the bridge) still moves it
  perform set_config('request.jwt.claims', '', true);
  n := n + 1;
  begin
    update public.projects set office_key = o2k where id = p;
    get diagnostics rc = row_count; outcome := 'OK ' || rc;
  exception when others then outcome := sqlstate || ' ' || sqlerrm; end;
  if outcome is distinct from 'OK 1' then failed := failed || ('L5 the service key: ' || coalesce(outcome, 'null')); end if;

  raise exception 'PROBE 0046: % of % as expected%. Everything above is rolled back (the two offices, the project, the three users and their memberships).',
    n - coalesce(array_length(failed, 1), 0), n,
    case when coalesce(array_length(failed, 1), 0) > 0 then ' — FAILED: ' || array_to_string(failed, ' | ') else '' end;
end $probe$;
