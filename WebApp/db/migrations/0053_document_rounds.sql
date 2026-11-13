-- 0053_document_rounds.sql — BIM documents workspace R2d-1: a BEP or EIR reaches Issued or Published only through a review round
--   (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md §7, §10; plan docs/superpowers/plans/2026-11-13-bim-documents-workspace-r2d.md Task 1).
--
--   A round freezes the document's render (its sha is computed here), copies who may decide (the roster: every active member, with party,
--   task team and role at that moment) and the task teams owed, then runs the steps the review@n in force names for that document type:
--   BEP = each task team, the Lead firm, the Client; EIR = the issuer party, the acceptor party. Every send, decision, withdrawal and stage
--   change is a ledger row written by a function in this file, with the verified uid. The machine credential (no JWT) never decides.
--
--   part 1: doc_rounds and doc_round_decisions (RLS, read-only to members; the frozen render is never granted to authenticated).
--   part 2: doc_review_chain(project, type) - the steps list review@n holds for a document type (review_template's source), null when none.
--   part 3: the round functions: doc_round_start, doc_round_decide, doc_round_withdraw, doc_appointment_indicated (+ internal helpers).
--   part 4: the lock: while a round is open, sections / status / stage / suitability change only inside a round function (service key included).
--   part 5: the version guard: a signed-in insert only inside a round function and only as the round's frozen render; a service insert of a
--           BEP or EIR is refused where a chain applies; a TIDP is never published. Every 0049 check stays.
--   part 6: the round tables are written by the round functions only (guard trigger).
--
-- Dry-run: on PGlite with every migration (bridge/migration-0053.test.mjs). Probe: probes/0053_probe.sql (part 1 catalog, part 2 one DO block).
-- NOT APPLIED. Applied live only on the founder's OK, then probed. Restart the 4100 bridge on this branch right after (Task 3's routes call these functions).
-- Rollback (never run casually): drop trigger trg_bim_documents_round_lock on public.bim_documents; drop function public.bim_documents_round_lock();
--   re-run 0049 part 6's bim_document_versions_insert_guard body; drop function public.doc_round_start(uuid, jsonb, date, jsonb),
--   public.doc_round_decide(uuid, text, text), public.doc_round_withdraw(uuid, text), public.doc_appointment_indicated(uuid, text),
--   public.doc_round_cut(uuid, text), public.doc_round_step_done(public.doc_rounds, int), public.doc_round_ledger(uuid, uuid, text, text, jsonb, jsonb),
--   public.doc_review_chain(uuid, text); drop table public.doc_round_decisions; drop table public.doc_rounds;
--   drop function public.doc_rounds_write_guard(); drop function public.doc_round_decisions_write_guard().

begin;

-- ───────────────────────────── part 1 · tables ─────────────────────────────
create table if not exists public.doc_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.bim_documents(id) on delete cascade,
  doc_type text not null,
  stage text not null check (stage in ('pre_appointment', 'confirmed', 'revision')),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 2 and 3),
  chain_ref text,
  render jsonb not null,
  render_sha text not null,
  roster jsonb not null check (jsonb_typeof(roster) = 'array'),
  teams_owed text[] not null default '{}',
  codes jsonb not null,
  deadline date,
  sent_by uuid not null,
  sent_by_email text,
  sent_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed', 'voided')),
  issued_version int,
  outcome text,
  closed_at timestamptz
);
create unique index if not exists uq_doc_rounds_one_open on public.doc_rounds(document_id) where status = 'open';
create index if not exists idx_doc_rounds_project on public.doc_rounds(project_id, sent_at desc);

create table if not exists public.doc_round_decisions (
  id bigserial primary key,
  round_id uuid not null references public.doc_rounds(id) on delete cascade,
  step int not null check (step >= 1),
  uid uuid not null,
  email text,
  party text,
  task_team text,
  decision text not null check (decision in ('accept', 'accept_with_comments', 'reject', 'received', 'clarification', 'selected', 'not_selected')),
  note text,
  at timestamptz not null default now(),
  ledger_id bigint,
  unique (round_id, uid)
);

alter table public.doc_rounds enable row level security;
alter table public.doc_round_decisions enable row level security;
drop policy if exists doc_rounds_select on public.doc_rounds;
create policy doc_rounds_select on public.doc_rounds for select to authenticated using (public.has_min_role(project_id, 'viewer'));
drop policy if exists doc_round_decisions_select on public.doc_round_decisions;
create policy doc_round_decisions_select on public.doc_round_decisions for select to authenticated
  using (exists (select 1 from public.doc_rounds r where r.id = round_id and public.is_member(r.project_id)));
-- No insert / update / delete policy and no such grant. The frozen render is not granted either: a viewer (the Client) reads a round
-- without it, and reads the render only through the bridge, which applies the render mask (design §4, §10 Versions).
revoke all on public.doc_rounds, public.doc_round_decisions from public, anon, authenticated;
revoke all on sequence public.doc_round_decisions_id_seq from public, anon, authenticated;
grant select (id, project_id, document_id, doc_type, stage, steps, chain_ref, render_sha, roster, teams_owed, codes, deadline, sent_by, sent_by_email,
              sent_at, status, issued_version, outcome, closed_at) on public.doc_rounds to authenticated;
grant select on public.doc_round_decisions to authenticated;

-- ───────────────────────────── part 2 · the chain for a document type ─────────────────────────────
-- The steps list of review@n documents.<type> (project's own pointer first, else the office's, as review_template reads it); null when none.
create or replace function public.doc_review_chain(p_project uuid, p_doc_type text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(x.s) = 'array' and jsonb_array_length(x.s) > 0 then x.s end
    from (select body.data->'body'->'documents'->lower(p_doc_type)->'steps' as s
            from (select p_project::text as pid, 1 as ord
                  union all
                  select o.id::text, 2
                    from public.projects pr join public.projects o on o.key = pr.office_key
                   where pr.id = p_project and pr.kind = 'project') t
            join public.bridge_docs ptr on ptr.store = 'artefact' and ptr.project_id = t.pid and ptr.doc_id = 'review'
            join public.bridge_docs body on body.store = 'artefact' and body.project_id = t.pid
                                        and body.doc_id = 'review@' || (ptr.data->>'version')
           order by t.ord limit 1) x;
$$;
revoke execute on function public.doc_review_chain(uuid, text) from public, anon, authenticated;

-- ───────────────────────────── part 3 · helpers and the round functions ─────────────────────────────
create or replace function public.doc_round_ledger(p_project uuid, p_entity uuid, p_type text, p_action text, p_old jsonb, p_new jsonb)
returns bigint language plpgsql security definer set search_path = public, auth as $$
declare v_id bigint;
begin
  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  values (p_project, p_type, p_entity, p_action, coalesce(auth.jwt()->>'email', auth.uid()::text, 'service'), p_old, p_new)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.doc_round_ledger(uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Step k is complete: step 1 of a BEP (kind task_teams) when every team owed has an accept from that team; any other step on its first non-reject.
create or replace function public.doc_round_step_done(r public.doc_rounds, k int) returns boolean
language sql stable security definer set search_path = public as $$
  select case when r.steps->(k - 1)->>'kind' = 'task_teams' then
      not exists (select 1 from unnest(r.teams_owed) t(code)
                   where not exists (select 1 from public.doc_round_decisions d
                                      where d.round_id = r.id and d.step = k and d.decision in ('accept', 'accept_with_comments')
                                        and lower(coalesce(d.task_team, '')) = lower(t.code)))
    else exists (select 1 from public.doc_round_decisions d where d.round_id = r.id and d.step = k and d.decision <> 'reject')
  end;
$$;
revoke execute on function public.doc_round_step_done(public.doc_rounds, int) from public, anon, authenticated;

-- Cut the round's version: the frozen render as the snapshot, letter P (tender issue) or C (confirmed / revision), n counted per letter.
-- The caller has already set sentinel.doc_round and moved the document to the status and suitability the version carries.
create or replace function public.doc_round_cut(p_round uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare r public.doc_rounds; v_rev text; v_no int; v_sha text;
begin
  select * into r from public.doc_rounds where id = p_round;
  select p_letter || lpad((count(*) + 1)::text, 2, '0') into v_rev from public.bim_document_versions where document_id = r.document_id and revision like p_letter || '%';
  select coalesce(max(version_no), 0) + 1 into v_no from public.bim_document_versions where document_id = r.document_id;
  insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by, round_id, revision)
  values (r.document_id, v_no, r.render, case p_letter when 'P' then 'Tender issue ' else 'Confirmed ' end || v_rev,
          coalesce(auth.jwt()->>'email', auth.uid()::text), r.id, v_rev)
  returning sha into v_sha;
  return jsonb_build_object('version_no', v_no, 'revision', v_rev, 'sha', v_sha);
end $$;
revoke execute on function public.doc_round_cut(uuid, text) from public, anon, authenticated;

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

  -- Someone other than the sender must be able to decide every party step (the sender never decides).
  for k in 1..jsonb_array_length(v_chain) loop
    s := v_chain->(k - 1);
    continue when s->>'kind' = 'task_teams' or coalesce(s->>'party', '') = '';
    continue when v_type = 'bep' and k = 3 and d.stage = 'pre_appointment'; -- at tender the Client may be outside Sentinel (R2d-2)
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

create or replace function public.doc_round_decide(p_round uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_note text := nullif(btrim(p_note, E' \t\r\n'), '');
  r public.doc_rounds;
  d public.bim_documents;
  me jsonb;
  s jsonb;
  v_type text;
  n int; k int;
  v_allowed text[];
  v_ledger bigint;
  v_status text := 'open';
  v_issued int; v_published int;
  v_cut jsonb;
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
  if exists (select 1 from public.doc_round_decisions x where x.round_id = r.id and x.uid = v_uid) then
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

  select * into d from public.bim_documents where id = r.document_id for update;
  perform set_config('sentinel.doc_round', r.id::text, true);
  v_ledger := public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_' || p_decision || ' ' || k, null,
    jsonb_build_object('round_id', r.id, 'step', k, 'of', n, 'name', s->>'name', 'party', me->>'party', 'task_team', me->>'task_team',
                       'note', v_note, 'decided_by_uid', v_uid::text));
  insert into public.doc_round_decisions(round_id, step, uid, email, party, task_team, decision, note, ledger_id)
  values (r.id, k, v_uid, me->>'email', me->>'party', me->>'task_team', p_decision, v_note, v_ledger);

  if p_decision = 'reject' then
    update public.doc_rounds set status = 'voided', outcome = 'rejected', closed_at = now() where id = r.id;
    update public.bim_documents set status = 'wip', suitability = 'S0', updated_at = now() where id = d.id;
    perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_voided', null,
      jsonb_build_object('round_id', r.id, 'outcome', 'rejected', 'step', k, 'note', v_note, 'by_uid', v_uid::text));
    v_status := 'voided';
  elsif k = n and v_type = 'bep' and r.stage = 'pre_appointment' then
    -- the evaluation: any outcome closes the round; the document returns to wip, the issued version stays
    update public.doc_rounds set status = 'closed', outcome = p_decision, closed_at = now() where id = r.id;
    update public.bim_documents set status = 'wip', suitability = 'S0', updated_at = now() where id = d.id;
    perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_closed', null,
      jsonb_build_object('round_id', r.id, 'outcome', p_decision, 'note', v_note, 'issued_version', r.issued_version, 'by_uid', v_uid::text));
    v_status := 'closed';
  elsif public.doc_round_step_done(r, k) then
    if k = n then
      update public.bim_documents set status = 'published', suitability = r.codes->>'accept', updated_at = now() where id = d.id;
      v_cut := public.doc_round_cut(r.id, 'C');
      v_published := (v_cut->>'version_no')::int;
      update public.doc_rounds set status = 'closed', outcome = 'accepted', closed_at = now() where id = r.id;
      perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_published', null,
        jsonb_build_object('round_id', r.id, 'version_no', v_published, 'revision', v_cut->>'revision', 'sha', v_cut->>'sha',
                           'suitability', r.codes->>'accept', 'by_uid', v_uid::text));
      v_status := 'closed';
    elsif k = 1 then
      update public.bim_documents set status = 'shared', suitability = r.codes->>'shared', updated_at = now() where id = d.id;
    elsif r.stage = 'pre_appointment' then
      update public.bim_documents set suitability = r.codes->>'issue', updated_at = now() where id = d.id;
      v_cut := public.doc_round_cut(r.id, 'P');
      v_issued := (v_cut->>'version_no')::int;
      update public.doc_rounds set issued_version = v_issued where id = r.id;
      perform public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_issued', null,
        jsonb_build_object('round_id', r.id, 'version_no', v_issued, 'revision', v_cut->>'revision', 'sha', v_cut->>'sha',
                           'suitability', r.codes->>'issue', 'by_uid', v_uid::text));
    else
      update public.bim_documents set suitability = 'S5', updated_at = now() where id = d.id;
    end if;
  end if;
  perform set_config('sentinel.doc_round', '', true);

  return jsonb_build_object('step', k, 'decision', p_decision, 'closed', v_status <> 'open',
                            'issued_version', coalesce(v_issued, r.issued_version), 'published_version', v_published, 'status', v_status,
                            'doc_status', (select x.status from public.bim_documents x where x.id = d.id), 'ledger_id', v_ledger);
end $$;

create or replace function public.doc_round_withdraw(p_round uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  r public.doc_rounds;
  v_note text := nullif(btrim(p_note, E' \t\r\n'), '');
  v_ledger bigint;
begin
  if v_uid is null then
    raise exception 'withdrawing a document from review is a signed-in person''s act' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.doc_rounds where id = p_round for update;
  if not found or not public.has_min_role(r.project_id, 'viewer') then
    raise exception 'round % not found', p_round using errcode = 'no_data_found';
  end if;
  if not public.has_min_role(r.project_id, 'lead') then
    raise exception 'only a lead or owner withdraws a document from review' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'open' then raise exception 'This review round is no longer open.'; end if;
  perform set_config('sentinel.doc_round', r.id::text, true);
  update public.doc_rounds set status = 'voided', outcome = 'withdrawn', closed_at = now() where id = r.id;
  update public.bim_documents set status = 'wip', suitability = 'S0', updated_at = now() where id = r.document_id;
  v_ledger := public.doc_round_ledger(r.project_id, r.id, 'review', 'review:doc_withdrawn', null,
    jsonb_build_object('round_id', r.id, 'note', v_note, 'issued_version', r.issued_version, 'by_uid', v_uid::text));
  perform set_config('sentinel.doc_round', '', true);
  return jsonb_build_object('round_id', r.id, 'status', 'voided', 'issued_version', r.issued_version, 'ledger_id', v_ledger);
end $$;

create or replace function public.doc_appointment_indicated(p_doc uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  d public.bim_documents;
  v_note text := nullif(btrim(p_note, E' \t\r\n'), '');
  t public.doc_rounds;
  v_ledger bigint;
begin
  if v_uid is null then
    raise exception 'recording an appointment is a signed-in person''s act' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.bim_documents where id = p_doc for update;
  if not found or not public.has_min_role(d.project_id, 'viewer') then
    raise exception 'no such document' using errcode = 'no_data_found';
  end if;
  if not public.has_min_role(d.project_id, 'lead') then
    raise exception 'only a lead or owner records that the appointment is indicated' using errcode = 'insufficient_privilege';
  end if;
  if lower(d.doc_type) <> 'bep' then raise exception 'Appointment indicated applies to a BEP.'; end if;
  if d.stage <> 'pre_appointment' then raise exception 'This document is already past the tender stage.'; end if;
  if d.status <> 'wip' then raise exception 'Appointment is indicated on a draft: this document is %.', d.status; end if;
  if exists (select 1 from public.doc_rounds r where r.document_id = p_doc and r.status = 'open') then
    raise exception 'This document is out for review: it changes only through the round. Withdraw it first.';
  end if;
  select * into t from public.doc_rounds r where r.document_id = p_doc and r.stage = 'pre_appointment' and r.status = 'closed' order by r.closed_at desc limit 1;
  if v_note is null and (t.id is null or t.outcome is distinct from 'selected') then
    raise exception 'The evaluation does not say selected: add a note saying how the appointment was indicated.';
  end if;
  update public.bim_documents set stage = 'confirmed', updated_at = now() where id = p_doc;
  v_ledger := public.doc_round_ledger(d.project_id, d.id, 'bim_document', 'document_stage_changed',
    jsonb_build_object('stage', d.stage),
    jsonb_build_object('from', d.stage, 'to', 'confirmed', 'note', v_note, 'round_id', t.id, 'by_uid', v_uid::text));
  return jsonb_build_object('document_id', d.id, 'stage', 'confirmed', 'ledger_id', v_ledger);
end $$;

-- Only a signed-in person's JWT reaches the four public functions; the machine credential is refused twice (here and in the body).
revoke execute on function public.doc_round_start(uuid, jsonb, date, jsonb) from public, anon, service_role;
revoke execute on function public.doc_round_decide(uuid, text, text) from public, anon, service_role;
revoke execute on function public.doc_round_withdraw(uuid, text) from public, anon, service_role;
revoke execute on function public.doc_appointment_indicated(uuid, text) from public, anon, service_role;
grant execute on function public.doc_round_start(uuid, jsonb, date, jsonb) to authenticated;
grant execute on function public.doc_round_decide(uuid, text, text) to authenticated;
grant execute on function public.doc_round_withdraw(uuid, text) to authenticated;
grant execute on function public.doc_appointment_indicated(uuid, text) to authenticated;

-- ───────────────────────────── part 4 · the lock ─────────────────────────────
create or replace function public.bim_documents_round_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  if new.sections is not distinct from old.sections and new.status is not distinct from old.status
     and new.stage is not distinct from old.stage and new.suitability is not distinct from old.suitability then
    return new;
  end if;
  select r.id into v_round from public.doc_rounds r where r.document_id = old.id and r.status = 'open';
  if v_round is not null and coalesce(current_setting('sentinel.doc_round', true), '') <> v_round::text then
    raise exception 'This document is out for review: it changes only through the round. Withdraw it first.' using errcode = 'insufficient_privilege';
  end if;
  -- a chained type is published only under its round's mark (a service write included)
  if new.status = 'published' and old.status is distinct from 'published' and lower(new.doc_type) in ('bep', 'eir')
     and public.doc_review_chain(new.project_id, lower(new.doc_type)) is not null
     and (v_round is null or coalesce(current_setting('sentinel.doc_round', true), '') <> v_round::text) then
    raise exception 'This document type is published through a review round on this project.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
revoke execute on function public.bim_documents_round_lock() from public, anon, authenticated;
drop trigger if exists trg_bim_documents_round_lock on public.bim_documents;
create trigger trg_bim_documents_round_lock before update on public.bim_documents for each row execute function public.bim_documents_round_lock();

-- ───────────────────────────── part 5 · the version guard ─────────────────────────────
create or replace function public.bim_document_versions_insert_guard() returns trigger
  language plpgsql security definer set search_path = public, extensions as $$
declare d public.bim_documents; rnd public.doc_rounds; v_type text;
begin
  select * into d from public.bim_documents where id = new.document_id;
  if not found then raise exception 'no such document'; end if;
  v_type := lower(d.doc_type);
  if v_type = 'tidp' then raise exception 'A TIDP is never published; its rows live in Deliverables.'; end if;
  if auth.uid() is not null then
    if new.round_id is null or coalesce(current_setting('sentinel.doc_round', true), '') <> new.round_id::text then
      raise exception 'a document version is recorded by Sentinel only: publish from the document';
    end if;
    select * into rnd from public.doc_rounds r where r.id = new.round_id and r.document_id = new.document_id and r.status = 'open';
    if not found then raise exception 'a version is cut only inside an open review round of its own document'; end if;
    if new.snapshot is distinct from rnd.render then raise exception 'the version is not the frozen render of its round'; end if;
  elsif v_type in ('bep', 'eir') and public.doc_review_chain(d.project_id, v_type) is not null then
    raise exception 'This document type is published through a review round on this project.';
  end if;
  if new.snapshot->>'id' is distinct from new.document_id::text then raise exception 'the snapshot is of another document'; end if;
  if new.snapshot->'sections' is distinct from d.sections then raise exception 'the snapshot''s sections are not the document''s current sections'; end if;
  new.sha := encode(sha256(convert_to(new.snapshot::text, 'UTF8')), 'hex');
  new.stage := d.stage;
  new.suitability := d.suitability;
  return new;
end $$;
revoke execute on function public.bim_document_versions_insert_guard() from public, anon, authenticated;

-- ───────────────────────────── part 6 · the round tables are the functions' ─────────────────────────────
create or replace function public.doc_rounds_write_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mark text := coalesce(current_setting('sentinel.doc_round', true), '');
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.projects p where p.id = old.project_id) or not exists (select 1 from public.bim_documents d where d.id = old.document_id) then
      return old; -- the document or project is going: its rounds go with it (as 0020's versions)
    end if;
    raise exception 'a review round is part of the record and is never deleted';
  elsif tg_op = 'INSERT' then
    if v_mark is distinct from new.id::text then raise exception 'a review round is started by the send-for-review function only'; end if;
    return new;
  end if;
  if v_mark is distinct from old.id::text then raise exception 'a review round changes only through the round functions'; end if;
  if old.status <> 'open' then raise exception 'a closed round does not change'; end if;
  if (new.id, new.project_id, new.document_id, new.doc_type, new.stage, new.steps, new.chain_ref, new.render, new.render_sha, new.roster, new.teams_owed,
      new.codes, new.deadline, new.sent_by, new.sent_by_email, new.sent_at)
     is distinct from
     (old.id, old.project_id, old.document_id, old.doc_type, old.stage, old.steps, old.chain_ref, old.render, old.render_sha, old.roster, old.teams_owed,
      old.codes, old.deadline, old.sent_by, old.sent_by_email, old.sent_at) then
    raise exception 'what a round froze at the send (render, roster, steps, codes) never changes';
  end if;
  return new;
end $$;
create or replace function public.doc_round_decisions_write_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('sentinel.doc_round', true), '') is distinct from new.round_id::text then
      raise exception 'a review decision is recorded by the decide function only';
    end if;
    return new;
  elsif tg_op = 'DELETE' and not exists (select 1 from public.doc_rounds r where r.id = old.round_id) then
    return old;
  end if;
  raise exception 'a review decision is part of the record and never changes';
end $$;
revoke execute on function public.doc_rounds_write_guard(), public.doc_round_decisions_write_guard() from public, anon, authenticated;
drop trigger if exists trg_doc_rounds_write_guard on public.doc_rounds;
create trigger trg_doc_rounds_write_guard before insert or update or delete on public.doc_rounds for each row execute function public.doc_rounds_write_guard();
drop trigger if exists trg_doc_round_decisions_write_guard on public.doc_round_decisions;
create trigger trg_doc_round_decisions_write_guard before insert or update or delete on public.doc_round_decisions for each row execute function public.doc_round_decisions_write_guard();

commit;
