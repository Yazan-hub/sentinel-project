-- 0040_verdict_binding.sql — a verdict is bound to the content it judged, a restore reads it, and the live pointer of an
-- issued version is the bridge's (SEC-3):
--
--   1 · a verdict row (audit_log: entity_type file_version, action verdict:%) records the sha256 of the version it names,
--       read from container_versions as the row is written, whatever the writer sent (trg_audit_bind_verdict, BEFORE
--       INSERT; its name sorts before trg_audit_chain, so the chain hashes the row as it is stored). A version's sha256 is
--       written once (0038).
--   2 · cde_transition (0032's body, the same signature and grants): a verdict counts only when it records this version's
--       sha256 (a version with none: a row that records none — founder decision G-d); archived -> published (a restore)
--       reads the verdict as a publish does, else it takes a signed-in lead's reason (G-b). A verdict row written before
--       this migration records no sha256: its version is shared, published or restored with a signed-in lead's reason
--       (G-a).
--   3 · cde_protect_published (0038's body): a version's geometry link, in every state, and the live pointer of a published
--       or archived version are written by the bridge (the service key, after the bridge's role check), never by a
--       signed-in write; a signed-in INSERT still carries its own geometry.
--
-- APPLIED 2026-10-06 ~01:30 local on the founder's "apply" (migration 0040_verdict_binding), AFTER the 4100 bridge was
-- restarted on the branch 9ec46be; probes/0040_probe.sql part 0 read before it (3 shared versions, 1 of them on a verdict
-- that records no sha256, 9 wip on such a verdict, 2 archived; all in scratch or office projects), part 1 5 of 5 true,
-- part 2 "PROBE 0040: 22 of 22 as expected." Before it: the 4100 bridge runs the branch (its setLiveVersion writes with the service key; a
-- bridge from before it would be refused by rule 3 whenever a file's live version is issued), and probes/0040_probe.sql
-- part 0 is read (read-only) and its counts are the founder's (G-a). After it: the probe's parts 1 and 2.
--
-- ROLLBACK (if needed): drop trigger trg_audit_bind_verdict on public.audit_log; drop function public.audit_bind_verdict();
-- 0032's cde_transition; 0038's cde_protect_published.

begin;

-- 1 · a verdict row records the sha256 of the version it names.
create or replace function public.audit_bind_verdict() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(new.new_value) is distinct from 'object' then
    raise exception 'a verdict row''s new_value is an object';
  end if;
  new.new_value := new.new_value || jsonb_build_object('sha256',
    (select v.sha256 from public.container_versions v where v.id = new.entity_id));
  return new;
end $$;

-- A trigger function is not checked for EXECUTE when it fires (0031, 0035, 0038).
revoke execute on function public.audit_bind_verdict() from public, anon, authenticated;

drop trigger if exists trg_audit_bind_verdict on public.audit_log;
create trigger trg_audit_bind_verdict before insert on public.audit_log
  for each row when (new.entity_type = 'file_version' and new.action like 'verdict:%')
  execute function public.audit_bind_verdict();

-- 2 · cde_transition: 0032's body; the verdict bound to the content; a restore reads it.
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
  v_bound boolean;
  v_latest text;
  judged boolean;
  ovr text := nullif(btrim(p_override, E' \t\r\n'), '');
  used_ovr text;
  -- 0032: review_decide marks the one move it makes; the actor a signed-in caller cannot choose; the chain.
  in_review boolean := coalesce(current_setting('sentinel.review', true), '') = p_version::text;
  v_actor text := case when auth.uid() is not null then coalesce(auth.jwt()->>'email', auth.uid()::text)
                       else coalesce(p_actor, 'service') end;
  v_start bigint;
  v_tpl jsonb;
  review_share boolean := false;
  restoring boolean := false;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  pid := public.project_of_container(cur.container_id);

  if auth.uid() is not null and not in_review and not public.has_min_role(pid, 'lead') then
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
  restoring := cur.state = 'archived' and p_new_state = 'published';

  -- 0032: the open chain — the newest review:start on this version, on its own project, newer than its newest
  -- state:shared->wip (none: any review:start counts). Only review_decide publishes it; only a signed-in lead (the
  -- role check above) sends it back to wip.
  if cur.state = 'shared' then
    select a.id into v_start
      from public.audit_log a
     where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version and a.action = 'review:start'
       and a.id > coalesce((select max(w.id) from public.audit_log w
                             where w.project_id = pid and w.entity_type = 'container_version'
                               and w.entity_id = p_version and w.action = 'state:shared->wip'), 0)
     order by a.id desc limit 1;
    if v_start is not null and not in_review then
      if p_new_state = 'published' then
        raise exception 'version % is under review (chain ledger #%) — it is published by its last approval, not by this call',
          p_version, v_start;
      end if;
      if auth.uid() is null then
        raise exception 'version % is under review — only a signed-in lead can send it back to wip', p_version;
      end if;
    end if;
  end if;

  -- 0032: sharing into a review chain — a signed-in lead, and the verdict predicate below (or the lead's reason).
  if cur.state = 'wip' and p_new_state = 'shared' then
    v_tpl := public.review_template(pid);
    -- A template whose steps are not a list (only a write around the bridge's validator can store one) refuses the
    -- share in words a lead can act on, for every caller: a broken template never switches the chain off unseen.
    if v_tpl is not null and jsonb_typeof(v_tpl->'steps') is distinct from 'array' then
      raise exception 'the review template in force (%) is malformed — its steps are a JSON %, not a list; a lead installs a corrected review@n',
        v_tpl->>'ref', coalesce(jsonb_typeof(v_tpl->'steps'), 'nothing');
    end if;
    if v_tpl is not null and jsonb_array_length(v_tpl->'steps') > 0 then
      if auth.uid() is null then
        raise exception 'this project requires review (%) — a version is shared by a signed-in lead, not by this call',
          v_tpl->>'ref';
      end if;
      review_share := true;
    end if;
  end if;

  if (cur.state = 'shared' and p_new_state = 'published') or review_share or restoring then
    -- The latest verdict row on this version, on this version's own project (a row another project wrote about
    -- this id is not this project's verdict). in_scope that is missing or not a number measured nothing. ids_ref
    -- names the installed IDS that judged (null: the caller's own IDS; key absent: a row from before verdicts
    -- named their IDS — new_value->'ids_ref' is SQL null only when the key is absent, JSON null otherwise).
    -- 0040: the row counts only when it records this version's sha256 (rule 1 above stamps it as the row is written).
    select a.id, a.action,
           case when jsonb_typeof(a.new_value->'summary'->'in_scope') = 'number'
                then (a.new_value->'summary'->>'in_scope')::numeric else 0 end,
           a.new_value->>'ids_ref',
           (a.new_value->'ids_ref') is not null,
           (a.new_value ? 'sha256') and (a.new_value->>'sha256') is not distinct from cur.sha256
      into v_id, v_action, v_scope, v_ids_ref, v_names_ids, v_bound
      from public.audit_log a
     where a.entity_type = 'file_version' and a.entity_id = p_version and a.project_id = pid
       and a.action like 'verdict:%'
     order by a.id desc limit 1;
    judged := coalesce(v_action = 'verdict:accepted' and v_scope > 0 and v_ids_ref is not null and v_bound, false);
    if not judged then
      v_latest := case
        when v_id is null                  then 'none'
        when v_action <> 'verdict:accepted' then v_action || ', ledger #' || v_id
        when v_scope <= 0                  then 'verdict:accepted with nothing in scope, ledger #' || v_id
        when v_ids_ref is null and v_names_ids then 'verdict:accepted, judged by an IDS the caller sent, ledger #' || v_id
        when v_ids_ref is null             then 'verdict:accepted, judged by an IDS the row does not name, ledger #' || v_id
        else                                    'verdict:accepted, not recorded against this version''s sha256, ledger #' || v_id
      end;
      if ovr is null then
        if review_share then
          raise exception 'version % has no accepted verdict that measured something (latest: %) — sharing it for review needs the lead''s reason',
            p_version, v_latest;
        end if;
        if restoring then
          raise exception 'version % has no accepted verdict that measured something (latest: %) — restoring it needs the lead''s reason',
            p_version, v_latest;
        end if;
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

  -- 0032: the chain's first row, written before the state: row so that row can name it (the ledger is append-only).
  if review_share then
    insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
    values (pid, 'review', p_version, 'review:start', v_actor, null,
            jsonb_build_object('submitter_uid', auth.uid()::text, 'ref', v_tpl->>'ref', 'source', v_tpl->>'source',
                               'sha256', v_tpl->>'sha256', 'steps', v_tpl->'steps', 'override', used_ovr,
                               'verdict', v_action, 'verdict_audit_id', v_id))
    returning id into v_start;
  end if;

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  select ic.project_id, 'container_version', cur.id,
         'state:' || cur.state::text || '->' || p_new_state::text, v_actor,
         jsonb_build_object('state', cur.state::text),
         jsonb_build_object('state', p_new_state::text, 'note', p_note,
                            'verdict', v_action, 'verdict_audit_id', v_id, 'override', used_ovr,
                            'review_start_id', v_start)
  from public.information_containers ic where ic.id = cur.container_id;

  select * into cur from public.container_versions where id = p_version;
  return cur;
end $$;

-- 3 · cde_protect_published: 0038's body; a version's geometry link and an issued version's live pointer are the bridge's.
create or replace function public.cde_protect_published() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'published' then raise exception 'published versions are immutable (cannot delete)'; end if;
    return old;
  end if;
  if new.container_id is distinct from old.container_id then
    raise exception 'a version stays in its file';
  end if;
  if old.platform_item_id is not null and new.platform_item_id is distinct from old.platform_item_id then
    raise exception 'a version''s geometry is attached once — its platform item is already set';
  end if;
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
    raise exception 'a version''s sha256 is written once';
  end if;
  if new.platform_item_id is distinct from old.platform_item_id and auth.uid() is not null then
    raise exception 'a version''s geometry is attached by the bridge';
  end if;
  if old.state in ('published', 'archived') and new.is_live is distinct from old.is_live and auth.uid() is not null then
    raise exception 'the live pointer of an issued version is moved by the bridge';
  end if;
  if old.state = 'published' and new.state not in ('published', 'archived') then
    raise exception 'a published version can only move to archived';
  end if;
  if old.state in ('published', 'archived')
     and (to_jsonb(new) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[])
         is distinct from (to_jsonb(old) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[]) then
    raise exception 'a version that is % changes only its state, its live pointer and its geometry link', old.state;
  end if;
  return new;
end $$;

commit;
