-- 0031_transition_reads_verdict.sql — publishing reads the verdict (cohesion phase 5a, spec
-- docs/superpowers/specs/2026-09-26-publish-one-path-design.md, Decision 5; seam D9).
-- NOT YET APPLIED — applied only by the controller after the founder approves it (plan Task 7), then probed with
-- probes/0031_probe.sql. Apply it first, then deploy the 5a bridge at once. The master bridge's transitions still
-- resolve (named arguments; p_override has a default), but its unarchive is a direct state PATCH that the trigger
-- below refuses (a 500 until the 5a bridge restores through the function). The 5a bridge without this migration
-- fails only a publish with a lead's reason (PostgREST finds no function taking p_override: a 500).
--
-- Until now cde_transition checked the ISO 19650 state machine and, for a signed-in caller, the lead role — never
-- the verdict (0004:61-93); a contributor could PATCH state directly (cv_update, 0004:154-156) and a registration
-- could POST a version already 'published'. After it:
--   * shared -> published needs the version's latest verdict row on its own project to be verdict:accepted with
--     summary.in_scope > 0 and a non-null ids_ref (an accepted verdict that measured something, judged by an IDS
--     installed on the project or its office — a request-supplied IDS stamps ids_ref null, and a row written before
--     verdicts named their IDS has no ids_ref at all). Anything else — no verdict, recorded, rejected, accepted with
--     nothing in scope, accepted by an IDS the caller sent — needs p_override, a non-blank reason, from a signed-in
--     lead (auth.uid() not null and lead or owner). The service key (Revit, BCF_TOKEN, the assistant) never overrides.
--   * archived -> published (restore) is a move of the machine, so unarchiving goes through the function too.
--   * the state: row's new_value is {state, note, verdict, verdict_audit_id, override}: the verdict row it read
--     (null when none, or on any other move) and the reason, only when the reason is what published it.
--   * a trigger lets state change only inside this function, and every new version starts in wip.
--   * refusals keep the function's own words; an unknown version raises no_data_found (P0002) and a role refusal
--     insufficient_privilege (42501, a 403 through PostgREST), so the bridge can tell them from a refusal (P0001).
begin;

drop function if exists public.cde_transition(uuid, public.container_state, text, text);

create or replace function public.cde_transition(p_version uuid, p_new_state public.container_state,
                                                 p_actor text default null, p_note text default null,
                                                 p_override text default null)
returns public.container_versions
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  cur public.container_versions;
  ok boolean;
  pid uuid;
  v_id bigint;
  v_action text;
  v_scope numeric;
  v_ids_ref text;
  v_names_ids boolean;
  v_latest text;
  judged boolean;
  ovr text := nullif(btrim(p_override, E' \t\r\n'), '');
  used_ovr text;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  pid := public.project_of_container(cur.container_id);

  if auth.uid() is not null and not public.has_min_role(pid, 'lead') then
    raise exception 'insufficient role to transition (needs lead or owner)' using errcode = 'insufficient_privilege';
  end if;

  ok := case
    when cur.state = 'wip'       and p_new_state = 'shared'             then true
    when cur.state = 'shared'    and p_new_state in ('published','wip') then true
    when cur.state = 'published' and p_new_state = 'archived'           then true
    when cur.state = 'archived'  and p_new_state = 'published'          then true  -- restore (unarchive)
    else false
  end;
  if not ok then raise exception 'illegal ISO 19650 transition: % -> %', cur.state, p_new_state; end if;

  if cur.state = 'shared' and p_new_state = 'published' then
    -- The latest verdict row on this version, on this version's own project (a row another project wrote about
    -- this id is not this project's verdict). in_scope that is missing or not a number measured nothing. ids_ref
    -- names the installed IDS that judged (null: the caller's own IDS; key absent: a row from before verdicts
    -- named their IDS — new_value->'ids_ref' is SQL null only when the key is absent, JSON null otherwise).
    select a.id, a.action,
           case when jsonb_typeof(a.new_value->'summary'->'in_scope') = 'number'
                then (a.new_value->'summary'->>'in_scope')::numeric else 0 end,
           a.new_value->>'ids_ref',
           (a.new_value->'ids_ref') is not null
      into v_id, v_action, v_scope, v_ids_ref, v_names_ids
      from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = p_version and a.project_id = pid
       and a.action like 'verdict:%'
     order by a.id desc limit 1;
    judged := coalesce(v_action = 'verdict:accepted' and v_scope > 0 and v_ids_ref is not null, false);
    if not judged then
      v_latest := case
        when v_id is null                  then 'none'
        when v_action <> 'verdict:accepted' then v_action || ', ledger #' || v_id
        when v_scope <= 0                  then 'verdict:accepted with nothing in scope, ledger #' || v_id
        when v_names_ids                   then 'verdict:accepted, judged by an IDS the caller sent, ledger #' || v_id
        else                                    'verdict:accepted, judged by an IDS the row does not name, ledger #' || v_id
      end;
      if ovr is null then
        raise exception 'version % has no accepted verdict that measured something (latest: %) — publishing it needs the lead''s reason',
          p_version, v_latest;
      end if;
      if auth.uid() is null then
        raise exception 'version % has no accepted verdict that measured something (latest: %) — the lead''s reason is taken only from a signed-in lead, and this call has no signed-in user',
          p_version, v_latest;
      end if;
      used_ovr := ovr;
    end if;
  end if;

  perform set_config('sentinel.transition', p_version::text, true);
  update public.container_versions set state = p_new_state where id = p_version;
  perform set_config('sentinel.transition', '', true);

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  select ic.project_id, 'container_version', cur.id,
         'state:' || cur.state::text || '->' || p_new_state::text, coalesce(p_actor, auth.uid()::text),
         jsonb_build_object('state', cur.state::text),
         jsonb_build_object('state', p_new_state::text, 'note', p_note,
                            'verdict', v_action, 'verdict_audit_id', v_id, 'override', used_ovr)
  from public.information_containers ic where ic.id = cur.container_id;

  select * into cur from public.container_versions where id = p_version;
  return cur;
end $$;

revoke execute on function public.cde_transition(uuid, public.container_state, text, text, text) from public, anon;
grant  execute on function public.cde_transition(uuid, public.container_state, text, text, text) to authenticated, service_role;

-- State changes only inside cde_transition (which marks its own update with the transaction-local
-- sentinel.transition setting); every new version starts in wip.
create or replace function public.cde_state_only_via_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.state is distinct from 'wip' then
      raise exception 'a new version starts in wip (got %)', new.state;
    end if;
  elsif new.state is distinct from old.state
        and coalesce(current_setting('sentinel.transition', true), '') <> new.id::text then
    raise exception 'container state changes go through cde_transition';
  end if;
  return new;
end $$;

revoke execute on function public.cde_state_only_via_transition() from public, anon, authenticated;

drop trigger if exists trg_state_via_transition on public.container_versions;
create trigger trg_state_via_transition before insert or update of state on public.container_versions
  for each row execute function public.cde_state_only_via_transition();

commit;

-- Verify after applying (read-only):
--   select oid::regprocedure from pg_proc where proname = 'cde_transition';
--     → exactly one row: cde_transition(uuid,container_state,text,text,text)
--   select grantee from information_schema.routine_privileges where routine_name = 'cde_transition' order by 1;
--     → authenticated, postgres, service_role (no anon)
--   select tgname from pg_trigger where tgrelid = 'public.container_versions'::regclass and not tgisinternal order by 1;
--     → trg_protect_published, trg_state_via_transition
-- Then run probes/0031_probe.sql (it raises its summary, so every probe write rolls back).
