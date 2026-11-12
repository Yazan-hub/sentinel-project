-- 0050_party_invitations.sql — BIM documents workspace R2a, the people side (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md
--   §6 Invitations, §7 Decisions, §10 Memberships / Invitations / Review chain; plan docs/superpowers/plans/2026-11-12-bim-documents-workspace-r2a.md).
--
--   A membership says which party the person is in (appointing = the Client, lead_appointed = the Lead firm, appointed = a Firm with
--   its task team) and whether they have signed in yet (state invited / active). Only an owner changes those, never on their own row,
--   never while a review round is open, and the database writes the ledger row itself so a PostgREST edit is recorded too.
--   An invited person counts as nobody until their first sign-in. A review step may name the party that decides it, and then a
--   viewer of that party (the Client) may decide it.
--
--   part 1: memberships.party, task_team, state; the creator's party (cde_bootstrap_owner); backfill owners and leads as Lead firm.
--   part 2: is_member / member_role count active rows only (has_min_role follows member_role).
--   part 3: memberships_party_guard — the owner-only, ledgering trigger; the service credential may only flip invited -> active.
--   part 4: invitations — bridge-only (RLS on, no policy).
--   part 5: review_decide — a step's party; role viewer only on a step that names a party.
--
-- Dry-run: on PGlite with every migration (bridge/migration-0050.test.mjs). Probe: probes/0050_probe.sql (part 0 before, parts 1-2 after).
-- Apply: the founder's. Restart the 4100 bridge on the R2a branch right after (the new Members screen reads the new columns).
-- Rollback (never run casually): drop trigger trg_memberships_party_guard on public.memberships; drop function public.memberships_party_guard();
--   drop table public.invitations; alter table public.memberships drop column party, drop column task_team, drop column state;
--   re-run 0004's is_member / member_role / cde_bootstrap_owner and 0043's review_decide.

-- ───────────────────────────── part 1 · columns, the creator's party, backfill ─────────────────────────────
alter table public.memberships add column if not exists party text null
  check (party in ('appointing', 'lead_appointed', 'appointed'));
alter table public.memberships add column if not exists task_team text null;
alter table public.memberships add column if not exists state text not null default 'active'
  check (state in ('invited', 'active'));

-- The creator is owner and Lead firm (call 24): the one place the service path sets a party at insert.
create or replace function public.cde_bootstrap_owner() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null then
    insert into public.memberships(project_id, user_id, role, party)
    values (new.id, auth.uid(), 'owner', 'lead_appointed')
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end $$;

-- Call 17: existing owners and leads are the Lead firm; the Members screen corrects the rest.
-- (Runs before part 3's trigger exists, so no ledger rows: the backfill is one migration, not a person's act.)
update public.memberships set party = 'lead_appointed' where role in ('owner', 'lead') and party is null;

-- ───────────────────────────── part 2 · an invited member counts as nobody ─────────────────────────────
create or replace function public.is_member(p uuid) returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.memberships m where m.project_id = p and m.user_id = auth.uid() and m.state = 'active');
$$;

create or replace function public.member_role(p uuid) returns text
  language sql stable security definer set search_path = public, auth as $$
  select m.role from public.memberships m
  where m.project_id = p and m.user_id = auth.uid() and m.state = 'active'
  order by public.role_rank(m.role) desc limit 1;
$$;

-- ───────────────────────────── part 3 · the guard ─────────────────────────────
create or replace function public.memberships_party_guard() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_actor text := coalesce(auth.jwt()->>'email', auth.uid()::text, 'service');
  v_action text;
  v_old jsonb;
begin
  if new.party = 'appointed' and new.task_team is null then
    raise exception 'a Firm member belongs to a task team — pick one' using errcode = 'check_violation';
  end if;
  if new.party is distinct from 'appointed' then new.task_team := null; end if;

  if tg_op = 'INSERT' then
    if v_uid is not null and new.party = 'appointing' and not public.has_min_role(new.project_id, 'owner') then
      raise exception 'only an owner adds the Client (appointing party)' using errcode = 'insufficient_privilege';
    end if;
    if new.party is null and new.state = 'active' then return new; end if; -- a plain 0004 insert: nothing to record here
    v_action := 'membership_party_changed';
  else
    if new.party is not distinct from old.party and new.task_team is not distinct from old.task_team and new.state is not distinct from old.state then
      return new;
    end if;
    if v_uid is null then
      -- The service credential's one write (call 24): the flip on first sign-in, nothing else on the row.
      if old.state = 'invited' and new.state = 'active' and new.party is not distinct from old.party and new.task_team is not distinct from old.task_team then
        v_action := 'member_joined';
      else
        raise exception 'the service credential changes only invited -> active; party and team are an owner''s, through the Members screen' using errcode = 'insufficient_privilege';
      end if;
    else
      if not public.has_min_role(new.project_id, 'owner') or new.user_id = v_uid
         or exists (select 1 from public.container_versions v join public.information_containers ic on ic.id = v.container_id
                     where ic.project_id = new.project_id and v.state = 'shared'
                       and jsonb_array_length(coalesce(public.review_template(new.project_id)->'steps', '[]'::jsonb)) > 0) then
        raise exception 'party, team and state change only by an owner, never on your own row, and never while a review round is open'
          using errcode = 'insufficient_privilege';
      end if;
      v_action := 'membership_party_changed';
    end if;
    v_old := jsonb_build_object('party', old.party, 'task_team', old.task_team, 'state', old.state);
  end if;

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  values (new.project_id, 'membership', new.user_id, v_action, v_actor, v_old,
          jsonb_build_object('party', new.party, 'task_team', new.task_team, 'state', new.state, 'by_uid', v_uid::text));
  return new;
end $$;

revoke execute on function public.memberships_party_guard() from public, anon, authenticated;

drop trigger if exists trg_memberships_party_guard on public.memberships;
create trigger trg_memberships_party_guard before insert or update of party, task_team, state on public.memberships
  for each row execute function public.memberships_party_guard();

-- ───────────────────────────── part 4 · invitations (bridge-only) ─────────────────────────────
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  user_id uuid not null,
  role text not null,
  party text null,
  task_team text null,
  inviter_uid uuid not null,
  inviter_email text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resent_at timestamptz null,
  revoked_at timestamptz null,
  accepted_at timestamptz null
);
create index if not exists idx_invitations_project on public.invitations(project_id);
alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;

-- ───────────────────────────── part 5 · review_decide, party-aware ─────────────────────────────
-- 0043's body plus: a step may carry 'party'; a viewer step must; a step with a party is decided by an active member of that party.
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
  v_party text;
  v_my_party text;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if v_uid is null then
    raise exception 'a review decision is a signed-in person''s' using errcode = 'insufficient_privilege';
  end if;
  pid := public.project_of_container(cur.container_id);
  if pid is null then
    raise exception 'version % not found', p_version using errcode = 'no_data_found';
  end if;
  if coalesce(p_decision, '') not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject';
  end if;

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

  -- R2a: the step's party. A viewer step without one is never decidable (call 16); a step with one is its party's.
  v_party := nullif(v_step->>'party', '');
  if v_step->>'role' = 'viewer' and v_party is null then
    raise exception 'step % (%) has role viewer and names no party — a viewer step must name a party; a lead installs a corrected review@n', v_k, v_step->>'name';
  end if;
  if coalesce(v_step->>'role', '') not in ('viewer', 'contributor', 'lead', 'owner') or not public.has_min_role(pid, v_step->>'role') then
    raise exception 'step % (%) needs % or above', v_k, v_step->>'name', v_step->>'role' using errcode = 'insufficient_privilege';
  end if;
  if v_party is not null then
    select m.party into v_my_party from public.memberships m where m.project_id = pid and m.user_id = auth.uid() and m.state = 'active';
    if v_my_party is distinct from v_party then
      raise exception 'step % (%) is decided by the % — you are %', v_k, v_step->>'name',
        case v_party when 'appointing' then 'Client' when 'lead_appointed' then 'Lead firm' else 'Firm' end,
        case v_my_party when 'appointing' then 'the Client' when 'lead_appointed' then 'the Lead firm' when 'appointed' then 'a Firm' else 'in no party' end
        using errcode = 'insufficient_privilege';
    end if;
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
                             'approver_uid', v_uid, 'chain_start_id', v_start, 'party', v_party, 'decider_party', v_my_party))
  returning id, hash into v_row_id, v_row_hash;

  v_done := p_decision = 'approve' and v_k = v_n and v_have + 1 >= coalesce((v_step->>'approvals')::int, 1);
  if v_done or p_decision = 'reject' then
    perform set_config('sentinel.review', p_version::text, true);
    if v_done then
      perform public.cde_transition(p_version, 'published', v_actor, 'review complete', v_chain->>'override');
    else
      perform public.cde_transition(p_version, 'wip', v_actor, 'review: rejected at step ' || v_k || ' - ' || v_note);
    end if;
    perform set_config('sentinel.review', '', true);
  end if;

  return jsonb_build_object('id', v_row_id, 'hash', v_row_hash, 'decision', p_decision, 'step', v_k, 'of', v_n,
                            'name', v_step->>'name', 'role', v_step->>'role', 'party', v_party, 'published', v_done,
                            'state', (select state::text from public.container_versions where id = p_version));
end $$;
