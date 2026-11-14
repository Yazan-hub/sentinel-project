-- 0055_eir_outside.sql — BIM documents workspace R2d follow-up: the Client's step of an EIR is recorded outside Sentinel, as a BEP's is
--   (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md §7 "The client is not in Sentinel": "the appointing party's step
--    is recorded by a lead"; founder 2026-11-14: "Yes, same as BEP").
--
--   Before: on a project with "The client is not in Sentinel" on, an EIR could not be sent (doc_round_start asked for a Client member) and its
--   Client step could not be recorded (doc_round_record_outside took step 3 of a BEP only), so such an EIR could never be published.
--
--   Three functions of 0054 are replaced; every other line of them is 0054's, unchanged:
--   - doc_round_start: with the setting on, an EIR is sent with no Client member (the step whose party is the Client is the lead's to record).
--   - doc_round_record_outside: also the Client's step of an EIR, at whichever place the chain gives the Client (issue or acceptance), when it is
--     the step the round waits on; the outcome is accept or reject (the tender evaluation words stay a BEP's). The other 0054 rules hold: a lead
--     who is not the sender, the setting on, no Client on the roster or among the members now, a name, a day within the round, a reason for a reject.
--   - set_client_outside_sentinel: the setting is not switched off under an open EIR round sent without a Client while its Client step is still to come.
--
-- Dry-run: PGlite with every migration (bridge/migration-0055.test.mjs). Probe: probes/0055_probe.sql.
-- APPLIED 2026-11-14 ~12:05 UTC on the founder's "Yes, apply 0055" (Supabase migration 0055_eir_outside). The three live function bodies match this file (md5). Probe: part 1 all true, "PROBE 0055: 9 of 9 as expected."
-- Rollback (never run casually): re-run 0054's set_client_outside_sentinel, doc_round_record_outside and doc_round_start bodies.

begin;

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
  -- switching off under a round sent without a Client would leave its Client step with nobody to take it
  if not p_on and exists (select 1 from public.doc_rounds r
                           where r.project_id = p_project and r.status = 'open'
                             and ((lower(r.doc_type) = 'bep' and r.stage <> 'pre_appointment')
                                  -- 0055: an EIR round whose Client step is still to come (an EIR step is never skipped)
                                  or (lower(r.doc_type) = 'eir' and exists (select 1 from generate_series(1, jsonb_array_length(r.steps)) g
                                                                             where r.steps->(g - 1)->>'party' = 'appointing' and not public.doc_round_step_done(r, g))))
                             and not exists (select 1 from jsonb_array_elements(r.roster) e where e->>'party' = 'appointing')) then
    raise exception 'A round sent without a Client is open — record its Client step or withdraw it first.';
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
  -- 0055: the Client's step of an EIR too (its issue or its acceptance, whichever the chain gives the Client); a BEP's is its last step
  if lower(r.doc_type) not in ('bep', 'eir') or s->>'party' is distinct from 'appointing' or (lower(r.doc_type) = 'bep' and k <> n) then
    raise exception 'Only the Client''s step is recorded outside Sentinel, and only when it is the one the round waits on.';
  end if;
  if exists (select 1 from jsonb_array_elements(r.roster) e where e->>'party' = 'appointing') then
    raise exception 'The Client was a member when this round was sent: they decide in Sentinel.';
  end if;
  if exists (select 1 from public.memberships m where m.project_id = r.project_id and m.state = 'active' and m.party = 'appointing') then
    raise exception 'The Client is a member of Sentinel now, so the Client decides this step in Sentinel: withdraw the round and send it again.';
  end if;
  -- 0055: the tender evaluation words are a BEP's; an EIR's Client step is accepted or rejected
  v_allowed := case when lower(r.doc_type) = 'bep' and r.stage = 'pre_appointment' then array['received', 'clarification', 'selected', 'not_selected'] else array['accept', 'reject'] end;
  if p_outcome is null or not (p_outcome = any (v_allowed)) then
    raise exception 'At this step the choices are: %', array_to_string(v_allowed, ', ');
  end if;
  if v_name is null or length(v_name) > 200 then raise exception 'Say who at the client gave it: a name of at most 200 characters.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Say on which day it was given: today or earlier.'; end if;
  if p_date < r.sent_at::date then raise exception 'It cannot have been given before the round was sent (%): say the day it was given.', r.sent_at::date; end if;
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
revoke execute on function public.doc_round_start(uuid, jsonb, date, jsonb) from public, anon, service_role;
grant execute on function public.doc_round_record_outside(uuid, text, date, text, text) to authenticated;
grant execute on function public.doc_round_start(uuid, jsonb, date, jsonb) to authenticated;

commit;
