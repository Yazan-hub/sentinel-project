-- 0057_team_outside.sql — a task team that is not in Sentinel: a lead records its confirmation of the plan, taken outside Sentinel
--   (Snowdon lifecycle P1, docs/testing/snowdon-lifecycle/P1/README.md "Four of the five teams have no seat"; founder 2026-11-15: "Yes, build it").
--
--   Before: at the confirmed and revision stages a BEP was not sent while a declared task team had no active member (design §7 [F18]), so an office
--   whose consultants are not in Sentinel could never confirm a BEP. The Client already had a way: "The client is not in Sentinel" (0054, 0055).
--
--   part 1: task_teams.outside_sentinel (default false). A lead marks a team in the task teams list (the table's own lead-only policy, 0026).
--   part 2: doc_round_start (0055's body, one block changed): a team with no active member still stops the send, naming the team, unless the team is
--           marked; then somebody other than the sender must be a lead or owner, to record it.
--   part 3: doc_round_record_team_outside (new; a lead or owner who is not the sender): while the round waits on the task teams, for a marked team
--           that is owed, has not decided and has no member who could confirm: accept or reject, the day, who in the team gave it, where it is kept.
--           The effects are those of a team's own decision; ledger review_step_recorded_outside with task_team. Step 1 is still never skipped after
--           the appointment: it is decided, in Sentinel or outside it.
--
-- Dry-run: PGlite with every migration (bridge/migration-0057.test.mjs). Probe: probes/0057_probe.sql.
-- APPLIED 2026-11-16 ~06:44 UTC on the founder's "Yes, apply 0057" (Supabase migration 0057_team_outside). The two live function bodies match this file (md5). Probe: part 1 all true, "PROBE 0057: 8 of 8 as expected."
-- Rollback (never run casually): drop function public.doc_round_record_team_outside(uuid, text, text, date, text, text); re-run 0055's doc_round_start
--   body; alter table public.task_teams drop column outside_sentinel (only when no open round still waits on a marked team).

begin;

-- ───────────────────────────── part 1 · the mark on a task team ─────────────────────────────
alter table public.task_teams add column if not exists outside_sentinel boolean not null default false;

-- ───────────────────────────── part 2 · the send (0055's body, the team block changed) ─────────────────────────────
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
    -- 0055: an EIR's Client step is recorded by a lead when the project says the client is outside Sentinel
    continue when v_type = 'eir' and s->>'party' = 'appointing' and coalesce(v_outside, false);
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
    -- 0057: a team marked "not in Sentinel" is not owed a member (a lead records its confirmation taken outside); every other team still is
    select t.code into v_missing from public.task_teams t
     where t.project_id = d.project_id and not t.outside_sentinel
       and not exists (select 1 from public.memberships m
                        where m.project_id = d.project_id and m.state = 'active' and m.user_id <> v_uid and lower(coalesce(m.task_team, '')) = lower(t.code)
                          and public.role_rank(m.role) >= public.role_rank(coalesce(v_chain->0->>'role', 'contributor')))
     order by lower(t.code) limit 1;
    if v_missing is not null then
      raise exception 'Team % has no active member, so it cannot confirm: invite one, or mark the team as not in Sentinel in the task teams list', v_missing;
    end if;
    -- 0057: a marked team with no member is recorded by a lead or owner, and never by the sender
    if exists (select 1 from public.task_teams t
                where t.project_id = d.project_id and t.outside_sentinel
                  and not exists (select 1 from public.memberships m
                                   where m.project_id = d.project_id and m.state = 'active' and m.user_id <> v_uid and lower(coalesce(m.task_team, '')) = lower(t.code)
                                     and public.role_rank(m.role) >= public.role_rank(coalesce(v_chain->0->>'role', 'contributor'))))
       and not exists (select 1 from public.memberships m
                        where m.project_id = d.project_id and m.state = 'active' and m.user_id <> v_uid and public.role_rank(m.role) >= public.role_rank('lead')) then
      raise exception 'Invite a second lead: the sender does not record a team''s confirmation taken outside Sentinel';
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

-- ───────────────────────────── part 3 · a team's confirmation taken outside Sentinel ─────────────────────────────
create or replace function public.doc_round_record_team_outside(p_round uuid, p_team text, p_outcome text, p_date date, p_name text, p_evidence_ref text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(btrim(p_name, E' \t\r\n'), '');
  v_ref text := nullif(btrim(p_evidence_ref, E' \t\r\n'), '');
  v_ask text := nullif(btrim(p_team, E' \t\r\n'), '');
  r public.doc_rounds;
  s jsonb; n int; k int;
  v_team text; v_role text;
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
  n := jsonb_array_length(r.steps);
  select min(g) into k from generate_series(1, n) g where not public.doc_round_step_done(r, g);
  if k is null then raise exception 'This round has nothing left to decide.'; end if;
  s := r.steps->(k - 1);
  if s->>'kind' is distinct from 'task_teams' then
    raise exception 'A task team''s confirmation is recorded only while the round waits on the task teams.';
  end if;
  select t into v_team from unnest(r.teams_owed) t where lower(t) = lower(v_ask);
  if v_team is null then raise exception 'Team % is not owed a confirmation in this round.', coalesce(v_ask, '(none)'); end if;
  if exists (select 1 from public.doc_round_decisions x where x.round_id = r.id and x.step = k and lower(coalesce(x.task_team, '')) = lower(v_team)) then
    raise exception 'Team % is already confirmed or skipped in this round.', v_team;
  end if;
  if not exists (select 1 from public.task_teams t where t.project_id = r.project_id and lower(t.code) = lower(v_team) and t.outside_sentinel) then
    raise exception 'Team % is not marked as not in Sentinel: a lead marks it in the task teams list first', v_team;
  end if;
  v_role := coalesce(s->>'role', 'contributor');
  -- a member who was on the roster for this team and is still active confirms in the round (the sender never does)
  if exists (select 1 from jsonb_array_elements(r.roster) e
              where lower(coalesce(e->>'task_team', '')) = lower(v_team) and public.role_rank(e->>'role') >= public.role_rank(v_role) and e->>'uid' <> r.sent_by::text
                and exists (select 1 from public.memberships m where m.project_id = r.project_id and m.user_id = (e->>'uid')::uuid and m.state = 'active')) then
    raise exception 'Team % has a member in this round: they confirm in Sentinel.', v_team;
  end if;
  -- a member who joined the team after the send is not on the roster: the round is sent again so that they confirm
  if exists (select 1 from public.memberships m
              where m.project_id = r.project_id and m.state = 'active' and m.user_id <> r.sent_by and lower(coalesce(m.task_team, '')) = lower(v_team)
                and public.role_rank(m.role) >= public.role_rank(v_role)) then
    raise exception 'Team % has a member in Sentinel now, so they confirm in Sentinel: withdraw the round and send it again.', v_team;
  end if;
  if p_outcome is null or p_outcome not in ('accept', 'reject') then
    raise exception 'At this step the choices are: accept, reject';
  end if;
  if v_name is null or length(v_name) > 200 then raise exception 'Say who in the team gave it: a name of at most 200 characters.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Say on which day it was given: today or earlier.'; end if;
  if p_date < r.sent_at::date then raise exception 'It cannot have been given before the round was sent (%): say the day it was given.', r.sent_at::date; end if;
  if v_ref is not null and length(v_ref) > 500 then raise exception 'The evidence reference is at most 500 characters.'; end if;
  if p_outcome = 'reject' and v_ref is null then
    raise exception 'Say why: a rejection carries its reason in the evidence reference.';
  end if;

  perform set_config('sentinel.doc_round', r.id::text, true);
  v_ledger := public.doc_round_ledger(r.project_id, r.id, 'review', 'review_step_recorded_outside', null,
    jsonb_build_object('round_id', r.id, 'step', k, 'of', n, 'name', s->>'name', 'task_team', v_team, 'outcome', p_outcome, 'date', p_date, 'given_by', v_name,
                       'evidence_ref', v_ref, 'recorded_by_uid', v_uid::text));
  insert into public.doc_round_decisions(round_id, step, uid, email, party, task_team, decision, note, ledger_id, outside, outside_name, outside_date, evidence_ref)
  values (r.id, k, v_uid, auth.jwt()->>'email', 'appointed', v_team, p_outcome, case when p_outcome = 'reject' then v_ref end,
          v_ledger, true, v_name, p_date, v_ref);
  v_eff := public.doc_round_effects(r.id, k, p_outcome, v_ref, v_uid);
  perform set_config('sentinel.doc_round', '', true);
  return jsonb_build_object('step', k, 'decision', p_outcome, 'task_team', v_team, 'closed', v_eff->>'status' <> 'open',
                            'issued_version', v_eff->'issued_version', 'published_version', v_eff->'published_version', 'status', v_eff->>'status',
                            'doc_status', (select x.status from public.bim_documents x where x.id = r.document_id), 'ledger_id', v_ledger);
end $$;

revoke execute on function public.doc_round_start(uuid, jsonb, date, jsonb) from public, anon, service_role;
revoke execute on function public.doc_round_record_team_outside(uuid, text, text, date, text, text) from public, anon, service_role;
grant execute on function public.doc_round_start(uuid, jsonb, date, jsonb) to authenticated;
grant execute on function public.doc_round_record_team_outside(uuid, text, text, date, text, text) to authenticated;

commit;
