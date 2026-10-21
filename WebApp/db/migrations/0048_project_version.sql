-- 0048_project_version.sql — optimistic concurrency on a project's row (spec docs/superpowers/specs/2026-10-21-human-error-guards-design.md
-- §2; evaluation 2026-10-19 §4B3).
--
--   Two leads editing Project Settings (or a form and a Revit window) each read the row, change it and write it back: the second
--   write silently drops the first. Every update now bumps projects.version and stamps who and when; a write that names the version it
--   read (the bridge's If-Match: "<version>", PATCH …&version=eq.<n>) changes nothing when another write landed first, and the bridge
--   says "changed by <updated_by> at <updated_at> — reload". updated_by is the signed-in writer's JWT email, else "the Sentinel bridge
--   (machine credential)": the service key carries no person, and a client cannot set it (the trigger always writes it).
--   metadata.snapshot (the numbers the web panels compute and auto-save: open issues, health, cost, carbon…) and metadata.updated_at
--   are not a person's edit: an update that changes only those keeps the version, so a panel's save never makes a lead's form stale.
--
-- NOT YET APPLIED. Dry-run: on PGlite with every migration (bridge/migration-0048.test.mjs). probes/0048_probe.sql is the live drill.
--
-- ROLLBACK (if needed): drop trigger trg_projects_version on public.projects; drop function public.projects_version();
--   alter table public.projects drop column version, drop column updated_at, drop column updated_by;

begin;

alter table public.projects
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;

create or replace function public.projects_version() returns trigger
  language plpgsql set search_path = public, auth as $$
begin
  if (to_jsonb(new) - 'version' - 'updated_at' - 'updated_by' - 'metadata') = (to_jsonb(old) - 'version' - 'updated_at' - 'updated_by' - 'metadata')
     and (new.metadata - 'snapshot' - 'updated_at') is not distinct from (old.metadata - 'snapshot' - 'updated_at') then
    new.version := old.version; new.updated_at := old.updated_at; new.updated_by := old.updated_by;
    return new;
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce(nullif(auth.jwt() ->> 'email', ''), 'the Sentinel bridge (machine credential)');
  return new;
end $$;

drop trigger if exists trg_projects_version on public.projects;
create trigger trg_projects_version before update on public.projects
  for each row execute function public.projects_version();

revoke execute on function public.projects_version() from public, anon, authenticated;

commit;
