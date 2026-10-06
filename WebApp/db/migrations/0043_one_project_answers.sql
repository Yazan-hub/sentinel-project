-- 0043_one_project_answers.sql — a signed-in caller is answered only about its own projects, rows that point at each other
-- stay in one project, and a deleted project takes its key's side rows with it (SEC-6):
--
--   1 · project_of_container: a file's project, for the service key (auth.uid() null) and for a member of that project;
--       null for any other signed-in caller (has_min_role(null, …) and is_member(null) are false, as for a non-member).
--       Its callers — the container_versions policies (0004) and the two definer functions below — are unchanged for
--       every member and for the service key.
--   2 · cde_transition (0040's body, the same signature and grants): a signed-in caller who is not a member of the
--       version's project gets the words of a version that does not exist (founder decision S25-a).
--   3 · review_decide (0032's body, the same signature and grants): the same, read before any other check.
--   4 · cde_same_project (BEFORE INSERT OR UPDATE OF the link columns): a folder's parent folder, a file's folder, a linked
--       model's host file and a model revision's version are in the row's own project, for every writer, checked when the
--       link is written; a folder stays in its project.
--   5 · cde_project_side_rows (AFTER DELETE on projects): a deleted project's BCF topics and every bridge document filed
--       under its key (all stores) are deleted with it, for every writer (founder decision N-a) — a key can be taken again,
--       an id never is. Documents filed under its id (the standards history, changesets, comments) are kept as evidence. A
--       key is a slug (0039), so the global '' namespace is never a project's.
--
-- NOT YET APPLIED. Before the apply: probes/0043_probe.sql
-- part 0 is read (read-only): its first four rows must read 0 (rule 4 checks a link when it is written; a row that already
-- points into another project is named by the diagnostics and the founder decides), rows 5 and 6 count side rows that
-- earlier deletes left behind (rule 5 does not touch them — founder decision N-b), and row 7 must read true (the live
-- bodies are 0004's, 0040's and 0032's). After it: the probe's parts 1 and 2.
--
-- ROLLBACK (if needed): 0004's project_of_container; 0040's cde_transition; 0032's review_decide; drop trigger
-- trg_same_project on public.folders, public.information_containers and public.model_revisions; drop trigger
-- trg_project_side_rows on public.projects; drop function public.cde_same_project(), public.cde_project_side_rows().

begin;

-- 1 · a file's project, for the service key and for a member of that project only.
create or replace function public.project_of_container(c uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select ic.project_id from public.information_containers ic
   where ic.id = c and (auth.uid() is null or public.is_member(ic.project_id));
$$;

-- 2 · cde_transition: 0040's body; a non-member is answered as for a missing version.
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
  -- 0043: a signed-in caller who is not a member of the version's project is answered as for a version that does not exist.
  if pid is null then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;

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

-- 3 · review_decide: 0032's body; the project is read first, and a non-member is answered as for a missing version.
create or replace function public.review_decide(p_version uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  cur public.container_versions;
  pid uuid;
  v_uid text := auth.uid()::text;
  v_actor text := coalesce(auth.jwt()->>'email', auth.uid()::text);
  v_note text := nullif(btrim(p_note, E' \t\r\n'), '');
  v_start bigint;
  v_chain jsonb;
  v_n int;
  v_k int;
  v_step jsonb;
  v_have bigint;
  v_prior text;
  v_row_id bigint;
  v_row_hash text;
  v_done boolean;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if v_uid is null then
    raise exception 'a review decision is a signed-in person''s' using errcode = 'insufficient_privilege';
  end if;
  -- 0043: the project first — a caller who is not a member of it is answered as for a version that does not exist, before
  -- any other check.
  pid := public.project_of_container(cur.container_id);
  if pid is null then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;

  -- The open chain, read as cde_transition reads it.
  select a.id, a.new_value into v_start, v_chain
    from public.audit_log a
   where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version and a.action = 'review:start'
     and a.id > coalesce((select max(w.id) from public.audit_log w
                           where w.project_id = pid and w.entity_type = 'container_version'
                             and w.entity_id = p_version and w.action = 'state:shared->wip'), 0)
   order by a.id desc limit 1;
  if cur.state <> 'shared' or v_start is null then
    raise exception 'version % is not under review', p_version;
  end if;
  v_n := jsonb_array_length(v_chain->'steps');

  -- The current step: the first whose approvals recorded on this chain are fewer than it needs (the snapshot's
  -- steps were validated at install; a step missing its count needs one).
  select s.ord, s.step, s.have into v_k, v_step, v_have
    from (select e.ord, e.step,
                 (select count(*) from public.audit_log a
                   where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version
                     and a.action = 'review:approve ' || e.ord
                     and a.new_value->>'chain_start_id' = v_start::text) as have
            from jsonb_array_elements(v_chain->'steps') with ordinality e(step, ord)) s
   where s.have < coalesce((s.step->>'approvals')::int, 1)
   order by s.ord limit 1;
  if v_k is null then
    raise exception 'version % is not under review', p_version;
  end if;

  -- role_rank of an unknown role is 0, which every caller reaches: only the three step roles are honoured.
  if coalesce(v_step->>'role', '') not in ('contributor', 'lead', 'owner') or not public.has_min_role(pid, v_step->>'role') then
    raise exception 'step % (%) needs % or above', v_k, v_step->>'name', v_step->>'role' using errcode = 'insufficient_privilege';
  end if;
  if v_uid = v_chain->>'submitter_uid' then
    raise exception 'the submitter does not review their own share';
  end if;
  select a.new_value->>'step' into v_prior
    from public.audit_log a
   where a.project_id = pid and a.entity_type = 'review' and a.entity_id = p_version and a.action like 'review:approve %'
     and a.new_value->>'chain_start_id' = v_start::text and a.new_value->>'approver_uid' = v_uid
   order by a.id limit 1;
  if v_prior is not null then
    raise exception 'you already approved step % of this chain', v_prior;
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'a rejection says why';
  end if;

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  values (pid, 'review', p_version, 'review:' || p_decision || ' ' || v_k, v_actor, null,
          jsonb_build_object('step', v_k, 'of', v_n, 'name', v_step->>'name', 'role', v_step->>'role', 'note', v_note,
                             'approver_uid', v_uid, 'chain_start_id', v_start))
  returning id, hash into v_row_id, v_row_hash;

  v_done := p_decision = 'approve' and v_k = v_n and v_have + 1 >= coalesce((v_step->>'approvals')::int, 1);
  if v_done or p_decision = 'reject' then
    perform set_config('sentinel.review', p_version::text, true);
    if v_done then
      perform public.cde_transition(p_version, 'published', v_actor, 'review complete', v_chain->>'override');
    else
      perform public.cde_transition(p_version, 'wip', v_actor, 'review: rejected at step ' || v_k || ' — ' || v_note);
    end if;
    perform set_config('sentinel.review', '', true);
  end if;

  return jsonb_build_object('id', v_row_id, 'hash', v_row_hash, 'decision', p_decision, 'step', v_k, 'of', v_n,
                            'name', v_step->>'name', 'role', v_step->>'role', 'published', v_done,
                            'state', (select state::text from public.container_versions where id = p_version));
end $$;

-- 4 · rows that point at each other stay in one project, for every writer.
create or replace function public.cde_same_project() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'folders' then
    if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
      raise exception 'a folder stays in its project';
    end if;
    if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id)
       and not exists (select 1 from public.folders f where f.id = new.parent_id and f.project_id = new.project_id) then
      raise exception 'a folder and its parent folder are in one project';
    end if;
  elsif tg_table_name = 'information_containers' then
    if new.folder_id is not null and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
       and not exists (select 1 from public.folders f where f.id = new.folder_id and f.project_id = new.project_id) then
      raise exception 'a file and its folder are in one project';
    end if;
    if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id)
       and not exists (select 1 from public.information_containers h where h.id = new.parent_id and h.project_id = new.project_id) then
      raise exception 'a linked model and its host file are in one project';
    end if;
  elsif new.container_version_id is not null
        and (tg_op = 'INSERT' or new.container_version_id is distinct from old.container_version_id or new.project_id is distinct from old.project_id)
        and not exists (select 1 from public.container_versions v join public.information_containers c on c.id = v.container_id
                         where v.id = new.container_version_id and c.project_id = new.project_id) then
    raise exception 'a model revision and its version are in one project';
  end if;
  return new;
end $$;

-- 5 · a deleted project's side rows filed under its key go with it, for every writer; those filed under its id stay.
create or replace function public.cde_project_side_rows() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  delete from public.bcf_topics where project_id = old.key;
  delete from public.bridge_docs where project_id = old.key;
  return old;
end $$;

-- A trigger function is not checked for EXECUTE when it fires (0031, 0035, 0038).
revoke execute on function public.cde_same_project() from public, anon, authenticated;
revoke execute on function public.cde_project_side_rows() from public, anon, authenticated;

drop trigger if exists trg_same_project on public.folders;
create trigger trg_same_project before insert or update of project_id, parent_id on public.folders
  for each row execute function public.cde_same_project();
drop trigger if exists trg_same_project on public.information_containers;
create trigger trg_same_project before insert or update of folder_id, parent_id on public.information_containers
  for each row execute function public.cde_same_project();
drop trigger if exists trg_same_project on public.model_revisions;
create trigger trg_same_project before insert or update of project_id, container_version_id on public.model_revisions
  for each row execute function public.cde_same_project();
drop trigger if exists trg_project_side_rows on public.projects;
create trigger trg_project_side_rows after delete on public.projects
  for each row execute function public.cde_project_side_rows();

commit;
