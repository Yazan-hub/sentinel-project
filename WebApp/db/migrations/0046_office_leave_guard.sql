-- 0046_office_leave_guard.sql — a project leaves its office only through a lead of that office (AI privacy review H2,
-- spec docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md).
--
--   0033's projects_office_guard asks for the lead role on the office a project JOINS, but not on the one it LEAVES: a project
--   lead could set office_key to null (or to another office they lead) straight through PostgREST and so drop the office's
--   ai_policy — "AI stays on this network" — and every office standard, with no bridge ledger row. This re-creates the
--   function with one more check: on an update that changes office_key away from a non-null old value, the caller must be a
--   platform admin or hold the lead role on the OLD office. The service key (no auth.uid()) is unchanged, as in 0033.
--   The bridge refuses the same change first, in the same words (cde-store.mjs updateProject).
--
-- APPLIED 2026-10-20 local on the founder's "Apply 0046" (migration 0046_office_leave_guard, project autqqtwhxqrfjaztablm, after
-- 0045_project_chain); the live function body was 0033's before it. probes/0046_probe.sql part 0 "true, false" before the apply and
-- "true, true" after (still security definer, search_path public, auth); part 1 "PROBE 0046: 5 of 5 as expected." (rolled back; 0
-- probe projects, 0 probe users after). Dry-run: on PGlite with every migration (bridge/migration-0046.test.mjs).
--
-- ROLLBACK (if needed): re-run 0033_trust_boundaries.sql's section 2 (create or replace function public.projects_office_guard …).

begin;

create or replace function public.projects_office_guard() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is not null then
    if new.kind = 'office' and (tg_op = 'INSERT' or old.kind is distinct from 'office')
       and not public.is_platform_admin() then
      raise exception 'an office is created by a platform admin — nothing was saved' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.kind is distinct from old.kind and not public.has_min_role(old.id, 'owner') then
      raise exception 'a project''s kind is changed by its owner — nothing was saved' using errcode = '42501';
    end if;
    if new.office_key is not null and (tg_op = 'INSERT' or new.office_key is distinct from old.office_key)
       and not public.is_platform_admin()
       and not public.has_min_role((select p.id from public.projects p where p.key = new.office_key), 'lead') then
      raise exception 'attaching a project to an office needs the lead role on that office — nothing was saved'
        using errcode = '42501';
    end if;
    -- 0046: leaving an office, detached or moved, needs the lead role on the office it leaves.
    if tg_op = 'UPDATE' and old.office_key is not null and new.office_key is distinct from old.office_key
       and not public.is_platform_admin()
       and not public.has_min_role((select p.id from public.projects p where p.key = old.office_key), 'lead') then
      raise exception 'a project leaves its office only through a lead of that office — nothing was saved'
        using errcode = '42501';
    end if;
  end if;
  if new.office_key is not null then
    if new.kind = 'office' then raise exception 'an office cannot belong to an office'; end if;
    if new.office_key = new.key then raise exception 'a project cannot be its own office'; end if;
    if not exists (select 1 from public.projects p where p.key = new.office_key and p.kind = 'office')
      then raise exception 'office_key must name a project of kind office'; end if;
  end if;
  if tg_op = 'UPDATE' and old.kind = 'office' and new.kind = 'project'
     and exists (select 1 from public.projects c where c.office_key = new.key)
    then raise exception 'this office still has projects; detach them before changing its kind'; end if;
  return new;
end $$;

commit;
