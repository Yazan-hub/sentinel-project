-- 0054_round_outside.sql — BIM documents workspace R2d-2: the client outside Sentinel, the tender skip rule, Incorporated in appointment
--   (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md §7 "A step nobody can decide", "The client is not in Sentinel", "Stage changes";
--    plan docs/superpowers/plans/2026-11-13-bim-documents-workspace-r2d.md Tasks 6 and 7).
--
--   Builds on 0053 (the round tables, the mark `sentinel.doc_round`, the lock, the version guard); every 0053 check in the functions replaced here is kept.
--
--   part 1: projects.client_outside_sentinel, changed only through set_client_outside_sentinel (an owner; refused while an active appointing-party
--           member exists); ledger client_outside_sentinel_changed. A guard trigger refuses any other write of the column (service key included).
--   part 2: doc_round_decisions learns two kinds of row that are not a person's decision: a step recorded outside Sentinel (outside, name, date, evidence)
--           and a skipped step (decision 'skipped'); the one-decision-per-person index no longer counts them.
--   part 3: the effects of a decision move into doc_round_effects (so decide, record_outside and skip share them); doc_round_step_done counts a skipped team;
--           doc_round_decide is replaced (same checks, same words).
--   part 4: doc_round_record_outside (a lead; step 3 of a BEP only; the setting on; the roster has no Client): the same effects as a Client decision;
--           ledger review_step_recorded_outside. doc_round_skip (a lead; tender only; step 1 for owed teams with no member able to confirm, or step 3
--           when the roster has no Client; a reason): ledger review_step_skipped; a skipped step 3 closes the round (outcome 'skipped':
--           "Submitted, evaluation not recorded"). doc_round_start (replaced): with the setting on, a BEP at confirmed or revision may be sent with no Client.
--   part 5: doc_incorporated (a lead): ledger document_incorporated {version_no, sha, parties}.
--
-- Dry-run: PGlite with every migration (bridge/migration-0054.test.mjs). Probe: probes/0054_probe.sql.
-- NOT APPLIED. Applied live only on the founder's OK (after 0053), then probed.
-- Rollback (never run casually): re-run 0053's doc_round_start, doc_round_decide and doc_round_step_done bodies; drop function public.doc_round_effects(uuid, int, text, text, uuid),
--   public.doc_round_record_outside(uuid, text, date, text, text), public.doc_round_skip(uuid, int, text), public.doc_incorporated(uuid, int, text[]),
--   public.set_client_outside_sentinel(uuid, boolean); drop trigger trg_projects_outside_guard on public.projects; drop function public.projects_outside_guard();
--   drop index public.uq_doc_round_decisions_one_each; re-add unique (round_id, uid) (only if no outside or skipped rows exist); alter table public.doc_round_decisions
--   drop column outside, drop column outside_name, drop column outside_date, drop column evidence_ref (and restore the decision check without 'skipped');
--   alter table public.projects drop column client_outside_sentinel.

begin;

-- ───────────────────────────── part 1 · the project setting ─────────────────────────────
alter table public.projects add column if not exists client_outside_sentinel boolean not null default false;

create or replace function public.projects_outside_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not new.client_outside_sentinel then return new; end if;
  if tg_op = 'UPDATE' and new.client_outside_sentinel is not distinct from old.client_outside_sentinel then return new; end if;
  if coalesce(current_setting('sentinel.client_outside', true), '') is distinct from new.id::text then
    raise exception 'The client is not in Sentinel is changed by an owner, from Project Settings, and is written to the ledger' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
revoke execute on function public.projects_outside_guard() from public, anon, authenticated;
drop trigger if exists trg_projects_outside_guard on public.projects;
create trigger trg_projects_outside_guard before insert or update of client_outside_sentinel on public.projects for each row execute function public.projects_outside_guard();

create or replace function public.set_client_outside_sentinel(p_project uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_old boolean;
  v_ledger bigint;
begin
  if v_uid is null then
    raise exception 'changing this setting is a signed-in owner''s act' using errcode = 'insufficient_privilege';
  end if;
  if p_on is null then raise exception 'say whether the client is outside Sentinel: on or off'; end if;
  select client_outside_sentinel into v_old from public.projects where id = p_project for update;
  if not found or not public.has_min_role(p_project, 'viewer') then
    raise exception 'no such project' using errcode = 'no_data_found';
  end if;
  if not public.has_min_role(p_project, 'owner') then
    raise exception 'only an owner changes whether the client is outside Sentinel' using errcode = 'insufficient_privilege';
  end if;
  if p_on and exists (select 1 from public.memberships m where m.project_id = p_project and m.state = 'active' and m.party = 'appointing') then
    raise exception 'The Client is already in Sentinel: they accept in the round. Remove the Client first if they should be outside';
  end if;
  if v_old is not distinct from p_on then
    return jsonb_build_object('client_outside_sentinel', p_on, 'changed', false);
  end if;
  perform set_config('sentinel.client_outside', p_project::text, true);
  update public.projects set client_outside_sentinel = p_on where id = p_project;
  perform set_config('sentinel.client_outside', '', true);
  v_ledger := public.doc_round_ledger(p_project, p_project, 'project', 'client_outside_sentinel_changed',
    jsonb_build_object('client_outside_sentinel', v_old), jsonb_build_object('client_outside_sentinel', p_on, 'by_uid', v_uid::text));
  return jsonb_build_object('client_outside_sentinel', p_on, 'changed', true, 'ledger_id', v_ledger);
end $$;
revoke execute on function public.set_client_outside_sentinel(uuid, boolean) from public, anon, service_role;
grant execute on function public.set_client_outside_sentinel(uuid, boolean) to authenticated;

-- ───────────────────────────── part 2 · decisions that are not a person's own ─────────────────────────────
alter table public.doc_round_decisions add column if not exists outside boolean not null default false;
alter table public.doc_round_decisions add column if not exists outside_name text;
alter table public.doc_round_decisions add column if not exists outside_date date;
alter table public.doc_round_decisions add column if not exists evidence_ref text;
alter table public.doc_round_decisions drop constraint if exists doc_round_decisions_decision_check;
alter table public.doc_round_decisions add constraint doc_round_decisions_decision_check
  check (decision in ('accept', 'accept_with_comments', 'reject', 'received', 'clarification', 'selected', 'not_selected', 'skipped'));
alter table public.doc_round_decisions drop constraint if exists doc_round_decisions_round_id_uid_key;
create unique index if not exists uq_doc_round_decisions_one_each on public.doc_round_decisions(round_id, uid) where not outside and decision <> 'skipped';

-- ───────────────────────────── part 3 · shared effects; a skipped team counts ─────────────────────────────
create or replace function public.doc_round_step_done(r public.doc_rounds, k int) returns boolean
language sql stable security definer set search_path = public as $$
  select case when r.steps->(k - 1)->>'kind' = 'task_teams' then
      not exists (select 1 from unnest(r.teams_owed) t(code)
                   where not exists (select 1 from public.doc_round_decisions d
                                      where d.round_id = r.id and d.step = k and d.decision in ('accept', 'accept_with_comments', 'skipped')
                                        and lower(coalesce(d.task_team, '')) = lower(t.code)))
    else exists (select 1 from public.doc_round_decisions d where d.round_id = r.id and d.step = k and d.decision <> 'reject')
  end;
$$;
revoke execute on function public.doc_round_step_done(public.doc_rounds, int) from public, anon, authenticated;

-- What a recorded decision does to the round and the document (0053's decide, unchanged, moved here). The caller has set sentinel.doc_round, written
-- the decision row and its ledger row. Returns {status, issued_version, published_version}.
create or replace function public.doc_round_effects(p_round uuid, k int, p_decision text, p_note text, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  r public.doc_rounds; d public.bim_documents; n int; v_type text;
  v_status text := 'open'; v_issued int; v_published int; v_cut jsonb;
begin
  select * into r from public.doc_rounds where id = p_round;
  select * into d from public.bim_documents where id = r.document_id for update;
  v_type := lower(r.doc_type);
  n := jsonb_array_length(r.steps);
  if p_decision = 'reject' then
    update public.doc_rounds set status = 'voided', outcome = 'rejected', closed_at = now() where id = r.id;
    update public.bim_documents set status = 'wip', suitability = 'S0', updated_at = now() where id = d.id;
    perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_voided', null,
      jsonb_build_object('round_id', r.id, 'document_id', r.document_id, 'outcome', 'rejected', 'step', k, 'note', p_note, 'by_uid', p_uid::text));
    v_status := 'voided';
  elsif k = n and v_type = 'bep' and r.stage = 'pre_appointment' then
    -- the evaluation: any outcome closes the round (a skipped evaluation too); the document returns to wip, the issued version stays
    update public.doc_rounds set status = 'closed', outcome = p_decision, closed_at = now() where id = r.id;
    update public.bim_documents set status = 'wip', suitability = 'S0', updated_at = now() where id = d.id;
    perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_closed', null,
      jsonb_build_object('round_id', r.id, 'document_id', r.document_id, 'outcome', p_decision, 'note', p_note, 'issued_version', r.issued_version, 'by_uid', p_uid::text));
    v_status := 'closed';
  elsif public.doc_round_step_done(r, k) then
    if k = n then
      update public.bim_documents set status = 'published', suitability = r.codes->>'accept', updated_at = now() where id = d.id;
      v_cut := public.doc_round_cut(r.id, 'C');
      v_published := (v_cut->>'version_no')::int;
      update public.doc_rounds set status = 'closed', outcome = 'accepted', closed_at = now() where id = r.id;
      perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_published', null,
        jsonb_build_object('round_id', r.id, 'document_id', r.document_id, 'version_no', v_published, 'revision', v_cut->>'revision', 'sha', v_cut->>'sha',
                           'suitability', r.codes->>'accept', 'by_uid', p_uid::text));
      v_status := 'closed';
    elsif k = 1 then
      update public.bim_documents set status = 'shared', suitability = r.codes->>'shared', updated_at = now() where id = d.id;
    elsif r.stage = 'pre_appointment' then
      update public.bim_documents set suitability = r.codes->>'issue', updated_at = now() where id = d.id;
      v_cut := public.doc_round_cut(r.id, 'P');
      v_issued := (v_cut->>'version_no')::int;
      update public.doc_rounds set issued_version = v_issued where id = r.id;
      perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_issued', null,
        jsonb_build_object('round_id', r.id, 'document_id', r.document_id, 'version_no', v_issued, 'revision', v_cut->>'revision', 'sha', v_cut->>'sha',
                           'suitability', r.codes->>'issue', 'by_uid', p_uid::text));
    else
      update public.bim_documents set suitability = 'S5', updated_at = now() where id = d.id;
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'issued_version', coalesce(v_issued, r.issued_version), 'published_version', v_published);
end $$;
revoke execute on function public.doc_round_effects(uuid, int, text, text, uuid) from public, anon, authenticated;

create or replace function public.doc_round_decide(p_round uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(btrim(p_note, E' \t\r\n'), '');
  r public.doc_rounds;
  me jsonb;
  s jsonb;
  v_type text;
  n int; k int;
  v_allowed text[];
  v_ledger bigint;
  v_eff jsonb;
begin
  if v_uid is null then
    raise exception 'a review decision is a signed-in person''s' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.doc_rounds where id = p_round for update;
  if not found then raise exception 'round % not found', p_round using errcode = 'no_data_found'; end if;
  if r.status <> 'open' then raise exception 'This review round is no longer open.'; end if;
  select e into me from jsonb_array_elements(r.roster) e where e->>'uid' = v_uid::text;
  if me is null then
    raise exception 'You were not on the roster when this round was sent: only members who were active then decide.' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_member(r.project_id) then
    raise exception 'You are no longer a member of this project, so you cannot decide this round.' using errcode = 'insufficient_privilege';
  end if;
  if v_uid = r.sent_by then raise exception 'The sender does not decide their own round.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.doc_round_decisions x where x.round_id = r.id and x.uid = v_uid and not x.outside and x.decision <> 'skipped') then
    raise exception 'You have already decided in this round.';
  end if;
  v_type := lower(r.doc_type);
  n := jsonb_array_length(r.steps);
  select min(g) into k from generate_series(1, n) g where not public.doc_round_step_done(r, g);
  if k is null then raise exception 'This round has nothing left to decide.'; end if;
  s := r.steps->(k - 1);

  if s->>'kind' = 'task_teams' then
    if lower(coalesce(me->>'task_team', '')) <> all (select lower(t) from unnest(r.teams_owed) t) or coalesce(me->>'task_team', '') = '' then
      raise exception 'Step % (%) is confirmed by each task team — you are not in one of them.', k, s->>'name' using errcode = 'insufficient_privilege';
    end if;
  else
    if coalesce(s->>'party', '') = '' then
      raise exception 'Step % (%) names no party, so nobody can decide it; a lead installs a corrected review chain', k, s->>'name';
    end if;
    if me->>'party' is distinct from s->>'party' then
      raise exception 'Step % (%) is decided by the % — you are %.', k, s->>'name',
        case s->>'party' when 'appointing' then 'Client' when 'lead_appointed' then 'Lead firm' else 'Firm' end,
        case me->>'party' when 'appointing' then 'the Client' when 'lead_appointed' then 'the Lead firm' when 'appointed' then 'a Firm' else 'in no party' end
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  if public.role_rank(me->>'role') < public.role_rank(coalesce(s->>'role', 'viewer')) then
    raise exception 'Step % (%) needs % or above', k, s->>'name', s->>'role' using errcode = 'insufficient_privilege';
  end if;

  v_allowed := case
    when v_type = 'eir' and k = 1 then array['accept', 'accept_with_comments', 'reject']
    when v_type = 'eir' then array['accept', 'reject']
    when k = 3 and r.stage = 'pre_appointment' then array['received', 'clarification', 'selected', 'not_selected']
    when k = 3 then array['accept', 'reject']
    else array['accept', 'accept_with_comments', 'reject'] end;
  if p_decision is null or not (p_decision = any (v_allowed)) then
    raise exception 'At this step the choices are: %', array_to_string(v_allowed, ', ');
  end if;
  if p_decision = 'reject' and v_note is null then raise exception 'a rejection says why'; end if;
  if p_decision = 'clarification' and v_note is null then raise exception 'a clarification request says what is unclear'; end if;

  perform set_config('sentinel.doc_round', r.id::text, true);
  v_ledger := public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_' || p_decision || ' ' || k, null,
    jsonb_build_object('round_id', r.id, 'step', k, 'of', n, 'name', s->>'name', 'party', me->>'party', 'task_team', me->>'task_team',
                       'note', v_note, 'decided_by_uid', v_uid::text));
  insert into public.doc_round_decisions(round_id, step, uid, email, party, task_team, decision, note, ledger_id)
  values (r.id, k, v_uid, me->>'email', me->>'party', me->>'task_team', p_decision, v_note, v_ledger);
  v_eff := public.doc_round_effects(r.id, k, p_decision, v_note, v_uid);
  perform set_config('sentinel.doc_round', '', true);

  return jsonb_build_object('step', k, 'decision', p_decision, 'closed', v_eff->>'status' <> 'open',
                            'issued_version', v_eff->'issued_version', 'published_version', v_eff->'published_version', 'status', v_eff->>'status',
                            'doc_status', (select x.status from public.bim_documents x where x.id = r.document_id), 'ledger_id', v_ledger);
end $$;
revoke execute on function public.doc_round_decide(uuid, text, text) from public, anon, service_role;
grant execute on function public.doc_round_decide(uuid, text, text) to authenticated;

-- ───────────────────────────── part 4 · outside, skipped, and the send without a Client ─────────────────────────────
create or replace function public.doc_round_record_outside(p_round uuid, p_outcome text, p_date date, p_name text, p_evidence_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(p_name, E' \t\r\n'), '');
  v_ref text := nullif(btrim(p_evidence_ref, E' \t\r\n'), '');
  r public.doc_rounds;
  s jsonb; n int; k int;
  v_allowed text[];
  v_ledger bigint; v_eff jsonb;
begin
  if v_uid is null then
    raise exception 'recording a step outside Sentinel is a signed-in person''s act' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.doc_rounds where id = p_round for update;
  if not found or not public.has_min_role(r.project_id, 'viewer') then
    raise exception 'round % not found', p_round using errcode = 'no_data_found';
  end if;
  if not public.has_min_role(r.project_id, 'lead') then
    raise exception 'only a lead or owner records a step taken outside Sentinel' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'open' then raise exception 'This review round is no longer open.'; end if;
  if v_uid = r.sent_by then raise exception 'The sender does not decide their own round.' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.projects p where p.id = r.project_id and p.client_outside_sentinel) then
    raise exception 'The client is not in Sentinel is off on this project: an owner turns it on in Project Settings first';
  end if;
  n := jsonb_array_length(r.steps);
  select min(g) into k from generate_series(1, n) g where not public.doc_round_step_done(r, g);
  if k is null then raise exception 'This round has nothing left to decide.'; end if;
  s := r.steps->(k - 1);
  if lower(r.doc_type) <> 'bep' or k <> n or s->>'party' is distinct from 'appointing' then
    raise exception 'Only the Client''s step is recorded outside Sentinel, and only when it is the one the round waits on.';
  end if;
  if exists (select 1 from jsonb_array_elements(r.roster) e where e->>'party' = 'appointing') then
    raise exception 'The Client was a member when this round was sent: they decide in Sentinel.';
  end if;
  v_allowed := case when r.stage = 'pre_appointment' then array['received', 'clarification', 'selected', 'not_selected'] else array['accept', 'reject'] end;
  if p_outcome is null or not (p_outcome = any (v_allowed)) then
    raise exception 'At this step the choices are: %', array_to_string(v_allowed, ', ');
  end if;
  if v_name is null or length(v_name) > 200 then raise exception 'Say who at the client gave it: a name of at most 200 characters.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Say on which day it was given: today or earlier.'; end if;
  if v_ref is not null and length(v_ref) > 500 then raise exception 'The evidence reference is at most 500 characters.'; end if;
  if p_outcome in ('reject', 'clarification') and v_ref is null then
    raise exception 'Say why: a rejection or a clarification request carries its reason in the evidence reference.';
  end if;

  perform set_config('sentinel.doc_round', r.id::text, true);
  v_ledger := public.doc_round_ledger(r.project_id, r.id, 'review', 'review_step_recorded_outside', null,
    jsonb_build_object('round_id', r.id, 'step', k, 'of', n, 'name', s->>'name', 'outcome', p_outcome, 'date', p_date, 'given_by', v_name,
                       'evidence_ref', v_ref, 'recorded_by_uid', v_uid::text));
  insert into public.doc_round_decisions(round_id, step, uid, email, party, task_team, decision, note, ledger_id, outside, outside_name, outside_date, evidence_ref)
  values (r.id, k, v_uid, auth.jwt()->>'email', 'appointing', null, p_outcome, case when p_outcome in ('reject', 'clarification') then v_ref end,
          v_ledger, true, v_name, p_date, v_ref);
  v_eff := public.doc_round_effects(r.id, k, p_outcome, v_ref, v_uid);
  perform set_config('sentinel.doc_round', '', true);
  return jsonb_build_object('step', k, 'decision', p_outcome, 'closed', v_eff->>'status' <> 'open',
                            'issued_version', v_eff->'issued_version', 'published_version', v_eff->'published_version', 'status', v_eff->>'status',
                            'doc_status', (select x.status from public.bim_documents x where x.id = r.document_id), 'ledger_id', v_ledger);
end $$;

create or replace function public.doc_round_skip(p_round uuid, p_step int, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := nullif(btrim(p_reason, E' \t\r\n'), '');
  r public.doc_rounds;
  s jsonb; n int; k int;
  v_teams text[];
  v_ledger bigint; v_eff jsonb; v_t text;
  v_role text;
begin
  if v_uid is null then
    raise exception 'skipping a step is a signed-in person''s act' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.doc_rounds where id = p_round for update;
  if not found or not public.has_min_role(r.project_id, 'viewer') then
    raise exception 'round % not found', p_round using errcode = 'no_data_found';
  end if;
  if not public.has_min_role(r.project_id, 'lead') then
    raise exception 'only a lead or owner skips a step' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'open' then raise exception 'This review round is no longer open.'; end if;
  if r.stage <> 'pre_appointment' then raise exception 'A step is skipped at the tender stage only: after the appointment every step is decided.'; end if;
  if v_reason is null or length(v_reason) > 2000 then raise exception 'A skipped step carries its reason (at most 2000 characters).'; end if;
  n := jsonb_array_length(r.steps);
  select min(g) into k from generate_series(1, n) g where not public.doc_round_step_done(r, g);
  if k is null then raise exception 'This round has nothing left to decide.'; end if;
  if p_step is distinct from k then raise exception 'The round waits on step %, so that is the only one that can be skipped.', k; end if;
  s := r.steps->(k - 1);

  if s->>'kind' = 'task_teams' then
    v_role := coalesce(s->>'role', 'contributor');
    select coalesce(array_agg(t.code order by lower(t.code)), '{}') into v_teams from unnest(r.teams_owed) t(code)
     where not exists (select 1 from public.doc_round_decisions d where d.round_id = r.id and d.step = k and lower(coalesce(d.task_team, '')) = lower(t.code))
       and not exists (select 1 from jsonb_array_elements(r.roster) e
                        where lower(coalesce(e->>'task_team', '')) = lower(t.code) and public.role_rank(e->>'role') >= public.role_rank(v_role));
    if cardinality(v_teams) = 0 then
      raise exception 'Every team owed has a member who can confirm: only a team with no active member is skipped.';
    end if;
  elsif k = n and lower(r.doc_type) = 'bep' and s->>'party' = 'appointing' then
    if exists (select 1 from jsonb_array_elements(r.roster) e where e->>'party' = 'appointing') then
      raise exception 'The Client is a member of this round: they decide in Sentinel, and the step is not skipped.';
    end if;
  else
    raise exception 'Only a step nobody can decide is skipped: a team with no member, or the Client''s step when there is no Client.';
  end if;

  perform set_config('sentinel.doc_round', r.id::text, true);
  v_ledger := public.doc_round_ledger(r.project_id, r.id, 'review', 'review_step_skipped', null,
    jsonb_build_object('round_id', r.id, 'step', k, 'of', n, 'name', s->>'name', 'teams', to_jsonb(coalesce(v_teams, '{}'::text[])),
                       'reason', v_reason, 'skipped_by_uid', v_uid::text));
  if v_teams is not null then
    foreach v_t in array v_teams loop
      insert into public.doc_round_decisions(round_id, step, uid, email, party, task_team, decision, note, ledger_id)
      values (r.id, k, v_uid, auth.jwt()->>'email', 'appointed', v_t, 'skipped', v_reason, v_ledger);
    end loop;
  else
    insert into public.doc_round_decisions(round_id, step, uid, email, party, task_team, decision, note, ledger_id)
    values (r.id, k, v_uid, auth.jwt()->>'email', 'appointing', null, 'skipped', v_reason, v_ledger);
  end if;
  v_eff := public.doc_round_effects(r.id, k, 'skipped', v_reason, v_uid);
  perform set_config('sentinel.doc_round', '', true);
  return jsonb_build_object('step', k, 'decision', 'skipped', 'closed', v_eff->>'status' <> 'open', 'status', v_eff->>'status',
                            'issued_version', v_eff->'issued_version', 'doc_status', (select x.status from public.bim_documents x where x.id = r.document_id),
                            'ledger_id', v_ledger);
end $$;

-- doc_round_start: 0053's body, with one change: a BEP's Client step needs no Client in the roster when the project says the client is outside Sentinel.
create or replace function public.doc_round_start(p_doc uuid, p_render jsonb, p_deadline date default null, p_codes jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  d public.bim_documents;
  v_type text;
  v_chain jsonb;
  v_codes jsonb := coalesce(p_codes, '{}'::jsonb);
  v_shared text; v_issue text; v_accept text;
  v_teams text[];
  v_missing text;
  v_roster jsonb;
  v_id uuid := gen_random_uuid();
  v_sha text;
  v_render jsonb;
  v_ledger bigint;
  v_outside boolean;
  s jsonb;
  k int;
begin
  if v_uid is null then
    raise exception 'sending a document for review is a signed-in person''s act' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.bim_documents where id = p_doc for update;
  if not found or not public.has_min_role(d.project_id, 'viewer') then
    raise exception 'no such document' using errcode = 'no_data_found';
  end if;
  v_type := lower(d.doc_type);
  v_chain := case when v_type in ('bep', 'eir') then public.doc_review_chain(d.project_id, v_type) end;
  if v_chain is null then
    raise exception 'No review chain is installed for a % on this project: it is published as before', d.doc_type;
  end if;
  if not public.has_min_role(d.project_id, 'lead') and not (
       v_type = 'eir' and exists (select 1 from public.memberships m
                                   where m.project_id = d.project_id and m.user_id = v_uid and m.state = 'active'
                                     and m.party is not distinct from (v_chain->0->>'party')
                                     and public.role_rank(m.role) >= public.role_rank('contributor'))) then
    raise exception 'only a lead or owner sends a document for review' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.doc_rounds r where r.document_id = p_doc and r.status = 'open') then
    raise exception 'This document is already out for review.';
  end if;
  if d.status <> 'wip' then
    raise exception 'Only a draft is sent for review: this document is %.', d.status;
  end if;
  if jsonb_typeof(p_render) is distinct from 'object' or p_render->>'id' is distinct from d.id::text or p_render->'sections' is distinct from d.sections then
    raise exception 'the document changed since the preview — reload and send again';
  end if;
  if p_deadline is not null and p_deadline < current_date then
    raise exception 'The deadline is today or a later date.';
  end if;
  v_shared := coalesce(nullif(v_codes->>'shared', ''), 'S3');
  v_issue := coalesce(nullif(v_codes->>'issue', ''), 'S4');
  v_accept := coalesce(nullif(v_codes->>'accept', ''), 'A1');
  if v_shared not in ('S1', 'S2', 'S3') then raise exception 'The code for Shared is S1, S2 or S3.'; end if;
  if v_issue not in ('S4', 'S5') then raise exception 'The code for a tender issue is S4 or S5.'; end if;
  if v_accept not in ('A1', 'A2', 'A3') then raise exception 'The code for Accepted is A1, A2 or A3.'; end if;
  select client_outside_sentinel into v_outside from public.projects where id = d.project_id;

  -- Someone other than the sender must be able to decide every party step (the sender never decides).
  for k in 1..jsonb_array_length(v_chain) loop
    s := v_chain->(k - 1);
    continue when s->>'kind' = 'task_teams' or coalesce(s->>'party', '') = '';
    -- at tender the Client may be outside Sentinel (a lead skips or records the step); at confirmed and revision only when the project says so
    continue when v_type = 'bep' and k = 3 and (d.stage = 'pre_appointment' or coalesce(v_outside, false));
    if not exists (select 1 from public.memberships m
                    where m.project_id = d.project_id and m.state = 'active' and m.user_id <> v_uid and m.party = s->>'party'
                      and public.role_rank(m.role) >= public.role_rank(coalesce(s->>'role', 'viewer'))) then
      raise exception '%', case s->>'party'
        when 'lead_appointed' then 'Invite a second lead: the sender never decides the Lead firm step'
        when 'appointing' then 'Invite the Client: the Client accepts at this stage'
        else 'Invite a member of the Firm for step ' || k || ' (' || coalesce(s->>'name', '') || '): the sender never decides it' end;
    end if;
  end loop;

  select coalesce(array_agg(t.code order by lower(t.code)), '{}') into v_teams from public.task_teams t where t.project_id = d.project_id;
  if v_type = 'bep' and cardinality(v_teams) = 0 then
    raise exception 'Declare the task teams first: each one confirms the plan at step 1';
  end if;
  if v_type = 'bep' and d.stage <> 'pre_appointment' then
    select t.code into v_missing from unnest(v_teams) t(code)
     where not exists (select 1 from public.memberships m
                        where m.project_id = d.project_id and m.state = 'active' and m.user_id <> v_uid and lower(coalesce(m.task_team, '')) = lower(t.code)
                          and public.role_rank(m.role) >= public.role_rank(coalesce(v_chain->0->>'role', 'contributor')))
     order by lower(t.code) limit 1;
    if v_missing is not null then
      raise exception 'Team % has no active member, so it cannot confirm', v_missing;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('uid', m.user_id, 'email', u.email, 'party', m.party, 'task_team', m.task_team, 'role', m.role)
                            order by m.user_id::text), '[]'::jsonb)
    into v_roster
    from public.memberships m left join auth.users u on u.id = m.user_id
   where m.project_id = d.project_id and m.state = 'active';

  -- the render is the document's own row, built here; only the resolved live data (`frozen`, R1c) comes from the caller
  v_render := to_jsonb(d) || case when p_render ? 'frozen' then jsonb_build_object('frozen', p_render->'frozen') else '{}'::jsonb end;
  v_sha := encode(sha256(convert_to(v_render::text, 'UTF8')), 'hex');
  perform set_config('sentinel.doc_round', v_id::text, true);
  insert into public.doc_rounds(id, project_id, document_id, doc_type, stage, steps, chain_ref, render, render_sha, roster, teams_owed, codes, deadline, sent_by, sent_by_email)
  values (v_id, d.project_id, d.id, d.doc_type, d.stage, v_chain, public.review_template(d.project_id)->>'ref', v_render, v_sha, v_roster,
          case when v_type = 'bep' then v_teams else '{}' end,
          jsonb_build_object('shared', v_shared, 'issue', v_issue, 'accept', v_accept), p_deadline, v_uid, auth.jwt()->>'email');
  v_ledger := public.doc_round_ledger(d.project_id, v_id, 'review', 'review:doc_start', null,
    jsonb_build_object('round_id', v_id, 'document_id', d.id, 'stage', d.stage, 'steps', v_chain,
                       'teams_owed', to_jsonb(case when v_type = 'bep' then v_teams else '{}'::text[] end), 'render_sha', v_sha,
                       'codes', jsonb_build_object('shared', v_shared, 'issue', v_issue, 'accept', v_accept), 'deadline', p_deadline, 'by_uid', v_uid::text));
  perform set_config('sentinel.doc_round', '', true);
  return jsonb_build_object('round_id', v_id, 'render_sha', v_sha, 'ledger_id', v_ledger);
end $$;

revoke execute on function public.doc_round_record_outside(uuid, text, date, text, text) from public, anon, service_role;
revoke execute on function public.doc_round_skip(uuid, int, text) from public, anon, service_role;
revoke execute on function public.doc_round_start(uuid, jsonb, date, jsonb) from public, anon, service_role;
grant execute on function public.doc_round_record_outside(uuid, text, date, text, text) to authenticated;
grant execute on function public.doc_round_skip(uuid, int, text) to authenticated;
grant execute on function public.doc_round_start(uuid, jsonb, date, jsonb) to authenticated;

-- ───────────────────────────── part 5 · Incorporated in appointment ─────────────────────────────
create or replace function public.doc_incorporated(p_doc uuid, p_version int, p_parties text[]) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  d public.bim_documents;
  v_sha text;
  v_parties text[];
  v_ledger bigint;
begin
  if v_uid is null then
    raise exception 'recording an appointment is a signed-in person''s act' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.bim_documents where id = p_doc;
  if not found or not public.has_min_role(d.project_id, 'viewer') then
    raise exception 'no such document' using errcode = 'no_data_found';
  end if;
  if not public.has_min_role(d.project_id, 'lead') then
    raise exception 'only a lead or owner records that a version is incorporated in an appointment' using errcode = 'insufficient_privilege';
  end if;
  select v.sha into v_sha from public.bim_document_versions v where v.document_id = p_doc and v.version_no = p_version;
  if v_sha is null then raise exception 'That version is not a published version of this document.'; end if;
  select array_agg(btrim(x) order by ord) into v_parties from unnest(coalesce(p_parties, '{}'::text[])) with ordinality u(x, ord) where btrim(x) <> '';
  if v_parties is null or cardinality(v_parties) > 20 or exists (select 1 from unnest(v_parties) x where length(x) > 200) then
    raise exception 'Name the parties whose appointments include it: one to twenty names of at most 200 characters.';
  end if;
  v_ledger := public.doc_round_ledger(d.project_id, d.id, 'bim_document', 'document_incorporated', null,
    jsonb_build_object('document_id', d.id, 'version_no', p_version, 'sha', v_sha, 'parties', to_jsonb(v_parties), 'by_uid', v_uid::text));
  return jsonb_build_object('document_id', d.id, 'version_no', p_version, 'sha', v_sha, 'parties', to_jsonb(v_parties), 'ledger_id', v_ledger);
end $$;
revoke execute on function public.doc_incorporated(uuid, int, text[]) from public, anon, service_role;
grant execute on function public.doc_incorporated(uuid, int, text[]) to authenticated;

commit;
