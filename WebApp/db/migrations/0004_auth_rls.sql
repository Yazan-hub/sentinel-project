-- 0004 — Supabase Auth + Row-Level Security (the "C4").  *** DRAFT — NOT YET APPLIED ***
-- Design: docs/auth-rls-design.md. Review before running against project autqqtwhxqrfjaztablm.
--
-- SAFE TO APPLY EARLY: the bridge authenticates with the service_role key, which BYPASSES RLS, so adding
-- these policies changes nothing for the running app. Policies only bind the `authenticated`/`anon` roles,
-- which the browser does not use until Stage C. Every write-guard is enforced ONLY when auth.uid() is not
-- null, so service-key/backend calls (null uid) keep working during the migration.

begin;

-- ── Role hierarchy + membership helpers (SECURITY DEFINER → read memberships without recursive RLS) ──
create or replace function public.role_rank(r text) returns int language sql immutable as $$
  select case r when 'owner' then 4 when 'lead' then 3 when 'contributor' then 2 when 'viewer' then 1 else 0 end;
$$;

create or replace function public.is_member(p uuid) returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.memberships m where m.project_id = p and m.user_id = auth.uid());
$$;

create or replace function public.member_role(p uuid) returns text
  language sql stable security definer set search_path = public, auth as $$
  select m.role from public.memberships m
  where m.project_id = p and m.user_id = auth.uid()
  order by public.role_rank(m.role) desc limit 1;
$$;

create or replace function public.has_min_role(p uuid, min text) returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select public.role_rank(coalesce(public.member_role(p), '')) >= public.role_rank(min);
$$;

create or replace function public.project_of_container(c uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select project_id from public.information_containers where id = c;
$$;

-- One membership per (project, user); needed for the owner-bootstrap upsert below.
create unique index if not exists memberships_unique_user on public.memberships(project_id, user_id);

-- New project created by a signed-in user → they become its owner. Skipped for service-key/backend
-- inserts (auth.uid() null) so the bridge's ensureProject() is unaffected.
create or replace function public.cde_bootstrap_owner() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null then
    insert into public.memberships(project_id, user_id, role)
    values (new.id, auth.uid(), 'owner')
    on conflict (project_id, user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_project_owner on public.projects;
create trigger trg_project_owner after insert on public.projects
  for each row execute function public.cde_bootstrap_owner();

-- ── Harden the transition RPC: SECURITY DEFINER + pinned search_path (review #8), and gate authed callers
--    by role. auth.uid() null (service-key/bridge) skips the role check, so the app keeps working. ──
create or replace function public.cde_transition(p_version uuid, p_new_state container_state,
                                                 p_actor text default null, p_note text default null)
returns public.container_versions
language plpgsql security definer set search_path = public, extensions, auth as $$
declare cur public.container_versions; ok boolean;
begin
  select * into cur from public.container_versions where id = p_version for update;
  if not found then raise exception 'version % not found', p_version; end if;

  if auth.uid() is not null and not public.has_min_role(public.project_of_container(cur.container_id), 'lead') then
    raise exception 'insufficient role to transition (needs lead or owner)';
  end if;

  ok := case
    when cur.state = 'wip'       and p_new_state = 'shared'             then true
    when cur.state = 'shared'    and p_new_state in ('published','wip') then true
    when cur.state = 'published' and p_new_state = 'archived'           then true
    else false
  end;
  if not ok then raise exception 'illegal ISO 19650 transition: % -> %', cur.state, p_new_state; end if;

  update public.container_versions set state = p_new_state where id = p_version;

  insert into public.audit_log(project_id, entity_type, entity_id, action, actor, old_value, new_value)
  select ic.project_id, 'container_version', cur.id,
         'state:' || cur.state::text || '->' || p_new_state::text, coalesce(p_actor, auth.uid()::text),
         jsonb_build_object('state', cur.state::text),
         jsonb_build_object('state', p_new_state::text, 'note', p_note)
  from public.information_containers ic where ic.id = cur.container_id;

  select * into cur from public.container_versions where id = p_version;
  return cur;
end $$;

-- ── Policies (targeting the `authenticated` role; service_role bypasses RLS entirely). ──
-- Pattern per table: member reads; role-gated writes. Drop-if-exists first so this migration is re-runnable.

-- projects
drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_select on public.projects for select to authenticated using (public.is_member(id));
create policy projects_insert on public.projects for insert to authenticated with check (auth.uid() is not null);
create policy projects_update on public.projects for update to authenticated using (public.has_min_role(id,'lead')) with check (public.has_min_role(id,'lead'));
create policy projects_delete on public.projects for delete to authenticated using (public.has_min_role(id,'owner'));

-- memberships
drop policy if exists memberships_select on public.memberships;
drop policy if exists memberships_insert on public.memberships;
drop policy if exists memberships_update on public.memberships;
drop policy if exists memberships_delete on public.memberships;
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(project_id));
create policy memberships_insert on public.memberships for insert to authenticated with check (public.has_min_role(project_id,'lead'));
create policy memberships_update on public.memberships for update to authenticated using (public.has_min_role(project_id,'lead')) with check (public.has_min_role(project_id,'lead'));
create policy memberships_delete on public.memberships for delete to authenticated using (public.has_min_role(project_id,'lead'));

-- parties
drop policy if exists parties_select on public.parties;
drop policy if exists parties_write  on public.parties;
create policy parties_select on public.parties for select to authenticated using (public.is_member(project_id));
create policy parties_write  on public.parties for all    to authenticated using (public.has_min_role(project_id,'lead')) with check (public.has_min_role(project_id,'lead'));

-- folders
drop policy if exists folders_select on public.folders;
drop policy if exists folders_insert on public.folders;
drop policy if exists folders_update on public.folders;
drop policy if exists folders_delete on public.folders;
create policy folders_select on public.folders for select to authenticated using (public.is_member(project_id));
create policy folders_insert on public.folders for insert to authenticated with check (public.has_min_role(project_id,'contributor'));
create policy folders_update on public.folders for update to authenticated using (public.has_min_role(project_id,'contributor')) with check (public.has_min_role(project_id,'contributor'));
create policy folders_delete on public.folders for delete to authenticated using (public.has_min_role(project_id,'lead'));

-- information_containers
drop policy if exists ic_select on public.information_containers;
drop policy if exists ic_insert on public.information_containers;
drop policy if exists ic_update on public.information_containers;
drop policy if exists ic_delete on public.information_containers;
create policy ic_select on public.information_containers for select to authenticated using (public.is_member(project_id));
create policy ic_insert on public.information_containers for insert to authenticated with check (public.has_min_role(project_id,'contributor'));
create policy ic_update on public.information_containers for update to authenticated using (public.has_min_role(project_id,'contributor')) with check (public.has_min_role(project_id,'contributor'));
create policy ic_delete on public.information_containers for delete to authenticated using (public.has_min_role(project_id,'lead'));

-- container_versions (state-gated read: WIP only visible to contributor+)
drop policy if exists cv_select on public.container_versions;
drop policy if exists cv_insert on public.container_versions;
drop policy if exists cv_update on public.container_versions;
drop policy if exists cv_delete on public.container_versions;
create policy cv_select on public.container_versions for select to authenticated
  using (public.is_member(public.project_of_container(container_id))
         and (state <> 'wip' or public.has_min_role(public.project_of_container(container_id),'contributor')));
create policy cv_insert on public.container_versions for insert to authenticated
  with check (public.has_min_role(public.project_of_container(container_id),'contributor'));
create policy cv_update on public.container_versions for update to authenticated
  using (public.has_min_role(public.project_of_container(container_id),'contributor'))
  with check (public.has_min_role(public.project_of_container(container_id),'contributor'));
create policy cv_delete on public.container_versions for delete to authenticated
  using (public.has_min_role(public.project_of_container(container_id),'lead'));

-- transmittals
drop policy if exists transmittals_select on public.transmittals;
drop policy if exists transmittals_write  on public.transmittals;
create policy transmittals_select on public.transmittals for select to authenticated using (public.is_member(project_id));
create policy transmittals_write  on public.transmittals for all    to authenticated using (public.has_min_role(project_id,'lead')) with check (public.has_min_role(project_id,'lead'));

-- audit_log: members READ their project's trail; NO authed write policy (writes only via SECURITY DEFINER
-- functions like cde_transition; update/delete already blocked by trg_audit_no_change).
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (public.is_member(project_id));

commit;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- STAGE B BACKFILL (run AFTER you sign up once, so you have an auth.uid()). Existing projects have zero
-- memberships and would be invisible under RLS — seed yourself as owner on all of them:
--
--   insert into public.memberships(project_id, user_id, role)
--   select id, '<YOUR-AUTH-UID>'::uuid, 'owner' from public.projects
--   on conflict (project_id, user_id) do nothing;
--
-- ROLLBACK (if needed):
--   drop policy if exists projects_select on public.projects;  -- …and every other policy above…
--   drop trigger if exists trg_project_owner on public.projects;
--   -- (leave the helper functions + the hardened cde_transition; they are backward-compatible.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
