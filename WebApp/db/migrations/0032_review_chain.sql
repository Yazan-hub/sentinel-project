-- 0032_review_chain.sql — the review chain with the referee as reviewer zero (phase 6b, spec
-- docs/superpowers/specs/2026-09-27-holding-and-review-chain-design.md, Decisions 10-15).
-- NOT YET APPLIED — applied only by the controller after the founder approves it (plan Task 5), then probed with
-- probes/0032_probe.sql, then the bridge is restarted. Apply it first. The running bridge is safe on either side of
-- it: cde_transition keeps 0031's signature and grants, and no project can hold a review@n until the 6b bridge is
-- running (the master bridge's artefact kinds do not include it), so review_template answers null everywhere and
-- every move is judged as under 0031 — two things change on every project (the last two bullets below: the stamped
-- actor and review_start_id), and neither changes what the bridge writes. The 6b bridge without this migration
-- enforces no chain and its decide route fails (PostgREST finds no review_decide: a 500).
--
-- After it, on a project whose review@n in force (its own, else its office's) has at least one step:
--   * wip -> shared needs a signed-in caller (the service key, Revit, the keyless route and the AI tool are refused;
--     0031 already requires lead or owner of a signed-in one) and 0031's verdict predicate — the latest verdict:% row
--     on the version, on its own project, is verdict:accepted with summary.in_scope > 0 and a non-null ids_ref — or
--     the lead's reason (p_override). It writes one review:start row (entity_type review, entity_id the version) just
--     before its state: row: the submitter's uid, the template's ref, stored sha256 and steps, the reason that let it
--     in and the verdict it read — so a template changed mid-review does not change a running chain.
--   * while that chain is open (a review:start newer than the version's newest state:shared->wip), shared ->
--     published is refused to every caller — the service key and a lead with a reason included — and shared -> wip
--     to any caller not signed in. review_decide publishes it with its last approval, or sends it back to wip on a
--     rejection, through cde_transition under the transaction-local sentinel.review mark, which skips the lead check
--     for that one move (review_decide checked the step's role); 0031's verdict read still applies.
--   * review_decide(p_version, 'approve' | 'reject', p_note) is a signed-in person's decision on the current step:
--     at least the step's role, not the submitter, not an approver already on this chain; a rejection says why. It
--     writes review:approve <k> or review:reject <k> and returns that row's id and hash. Only authenticated may
--     execute it: the machine never decides.
-- On every project, whatever is installed:
--   * a signed-in caller's state: row is stamped coalesce(jwt email, uid), never a caller-sent p_actor (the bridge
--     already stamps a signed-in user so); the service path keeps p_actor ('service' when none was sent).
--   * every state: row's new_value gains review_start_id: the chain it opened or closed, null when none.
-- With no review@n in force, or one whose steps are [], nothing else changes. A version shared while no chain was
-- required carries none and publishes as under 0031, even after one is installed.
begin;

-- The review@n in force for a project: its own pointer and body (bridge_docs store 'artefact', written only by the
-- bridge with the service key since 0030), else its office's (projects.office_key); null when none is installed. A
-- project's own review@n with steps [] wins over its office's. sha256 is the pointer's stored install-time hash.
create or replace function public.review_template(p_project uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ref', 'review@' || (ptr.data->>'version'), 'source', t.source,
                            'sha256', ptr.data->>'sha256', 'steps', body.data->'body'->'steps')
    from (select p_project::text as pid, 'project' as source, 1 as ord
          union all
          select o.id::text, 'office', 2
            from public.projects pr join public.projects o on o.key = pr.office_key
           where pr.id = p_project and pr.kind = 'project') t
    join public.bridge_docs ptr on ptr.store = 'artefact' and ptr.project_id = t.pid and ptr.doc_id = 'review'
    join public.bridge_docs body on body.store = 'artefact' and body.project_id = t.pid
                                and body.doc_id = 'review@' || (ptr.data->>'version')
   order by t.ord limit 1;
$$;

revoke execute on function public.review_template(uuid) from public, anon, authenticated;

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
  -- 0032: review_decide marks the one move it makes; the actor a signed-in caller cannot choose; the chain.
  in_review boolean := coalesce(current_setting('sentinel.review', true), '') = p_version::text;
  v_actor text := case when auth.uid() is not null then coalesce(auth.jwt()->>'email', auth.uid()::text)
                       else coalesce(p_actor, 'service') end;
  v_start bigint;
  v_tpl jsonb;
  review_share boolean := false;
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
    if v_tpl is not null and jsonb_array_length(v_tpl->'steps') > 0 then
      if auth.uid() is null then
        raise exception 'this project requires review (%) — a version is shared by a signed-in lead, not by this call',
          v_tpl->>'ref';
      end if;
      review_share := true;
    end if;
  end if;

  if (cur.state = 'shared' and p_new_state = 'published') or review_share then
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
        if review_share then
          raise exception 'version % has no accepted verdict that measured something (latest: %) — sharing it for review needs the lead''s reason',
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

-- A signed-in person's decision on the current step of a version's open chain. The version row is locked first, so
-- two decisions on one version are taken one after the other. A refusal from cde_transition (0031's verdict read at
-- completion) rolls the whole call back, the review row with it.
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
  if coalesce(p_decision, '') not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;
  pid := public.project_of_container(cur.container_id);

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

revoke execute on function public.review_decide(uuid, text, text) from public, anon, service_role;
grant  execute on function public.review_decide(uuid, text, text) to authenticated;

commit;

-- Verify after applying (read-only):
--   select oid::regprocedure::text as f from pg_proc where proname in ('cde_transition', 'review_decide', 'review_template') order by 1;
--     → cde_transition(uuid,container_state,text,text,text), review_decide(uuid,text,text), review_template(uuid)
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_name in ('cde_transition', 'review_decide', 'review_template') order by 1, 2;
--     → cde_transition: authenticated, postgres, service_role · review_decide: authenticated, postgres ·
--       review_template: postgres, service_role
--   select position('sentinel.review' in prosrc) > 0 from pg_proc where proname = 'cde_transition';  → true
-- Then run probes/0032_probe.sql (it raises its summary, so every probe write rolls back), then restart the bridge.
