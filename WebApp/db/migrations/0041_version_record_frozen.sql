-- 0041_version_record_frozen.sql — a version's record is written once, by its registration; a judged file keeps its name;
-- geometry comes only from the bridge; a revision is registered once per file; an issued transmittal stays as issued; a
-- project key is never uuid-shaped; one live project links a platform project (SEC-4):
--
--   1 · cde_protect_published (0040's body): a signed-in UPDATE of a version changes only its state (cde_transition), its
--       live pointer (a draft's, cv_update; an issued one's is the bridge's, 0040) and its Deleted-items stamp (0035) — in
--       every state. Its file reference, size, sha256, revision, suitability, author and notes are the registration's
--       (founder decision K-a); the bridge's service path is unchanged.
--   2 · a signed-in INSERT of a version carries no geometry, and takes a revision its file does not hold yet, Deleted items
--       included, a label compared trimmed and in any case (trg_version_on_insert): the bridge links an item it uploaded, after the hash check, with the service key
--       (founder decision L-b; 0040 left the INSERT to the caller); a new upload takes a new revision (K-c).
--   3 · cde_container_frozen (0038's body): a file whose version a verdict row names keeps its name, for every writer
--       (founder decision K-b: a new name is a new file).
--   4 · transmittals: a lead issues one (INSERT); no signed-in UPDATE or DELETE (transmittals_write dropped).
--   5 · projects.key is never uuid-shaped (projects_key_not_uuid).
--   6 · one live (not archived) project links a platform project (projects_one_live_platform_link) — for every writer.
--
-- APPLIED 2026-10-06 ~12:00 local on the founder's "apply" (migration 0041_version_record_frozen), AFTER the 4100 bridge was
-- restarted on the branch 6fa6636; probes/0041_probe.sql part 0 read before it (14 wip and 3 shared versions on a verdict,
-- 37 wip or shared with no sha256, 15 files whose name freezes — all in office or drill projects, 0 revisions held twice,
-- 0 uuid-shaped keys, 0 platform links held twice), part 1 6 of 6 true, part 2 "PROBE 0041: 24 of 24 as expected."
-- Before the apply: the 4100 bridge runs the branch (its intake links geometry with the service key after
-- registering; a bridge from before it would be refused by rule 2 on every signed-in intake), and probes/0041_probe.sql
-- part 0 is read (read-only) and its counts are the founder's; its "linked by more than one" row must read 0 (rule 6).
-- After it: the probe's parts 1 and 2.
--
-- ROLLBACK (if needed): 0040's cde_protect_published; drop trigger trg_version_on_insert on public.container_versions;
-- drop function public.cde_version_on_insert(); 0038's cde_container_frozen; drop policy transmittals_insert and
-- 0004's transmittals_write; alter table public.projects drop constraint projects_key_not_uuid; drop index
-- public.projects_one_live_platform_link.

begin;

-- 1 · a version's record is the registration's: a signed-in UPDATE moves only its state, its live pointer and its stamp.
create or replace function public.cde_protect_published() returns trigger
  language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'published' then raise exception 'published versions are immutable (cannot delete)'; end if;
    return old;
  end if;
  if new.container_id is distinct from old.container_id then
    raise exception 'a version stays in its file';
  end if;
  if old.platform_item_id is not null and new.platform_item_id is distinct from old.platform_item_id then
    raise exception 'a version''s geometry is attached once — its platform item is already set';
  end if;
  if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
    raise exception 'a version''s sha256 is written once';
  end if;
  if new.platform_item_id is distinct from old.platform_item_id and auth.uid() is not null then
    raise exception 'a version''s geometry is attached by the bridge';
  end if;
  if old.state in ('published', 'archived') and new.is_live is distinct from old.is_live and auth.uid() is not null then
    raise exception 'the live pointer of an issued version is moved by the bridge';
  end if;
  if old.state = 'published' and new.state not in ('published', 'archived') then
    raise exception 'a published version can only move to archived';
  end if;
  if old.state in ('published', 'archived')
     and (to_jsonb(new) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[])
         is distinct from (to_jsonb(old) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[]) then
    raise exception 'a version that is % changes only its state, its live pointer and its geometry link', old.state;
  end if;
  if auth.uid() is not null
     and (to_jsonb(new) - '{state,is_live,deleted_at,deleted_by}'::text[])
         is distinct from (to_jsonb(old) - '{state,is_live,deleted_at,deleted_by}'::text[]) then
    raise exception 'a version''s record is written when it is registered — a new upload is a new version';
  end if;
  return new;
end $$;

-- 2 · a signed-in INSERT carries no geometry and takes a revision its file does not hold yet (Deleted items included).
create or replace function public.cde_version_on_insert() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.platform_item_id is not null and auth.uid() is not null then
    raise exception 'a version''s geometry is attached by the bridge';
  end if;
  if auth.uid() is not null
     and exists (select 1 from public.container_versions x where x.container_id = new.container_id
                   and upper(btrim(x.revision)) = upper(btrim(new.revision))) then
    raise exception 'a revision is registered once per file — a new upload takes a new revision';
  end if;
  return new;
end $$;

-- A trigger function is not checked for EXECUTE when it fires (0031, 0035, 0038).
revoke execute on function public.cde_version_on_insert() from public, anon, authenticated;

drop trigger if exists trg_version_on_insert on public.container_versions;
create trigger trg_version_on_insert before insert on public.container_versions
  for each row execute function public.cde_version_on_insert();

-- 3 · a file whose version a verdict judged keeps its name (0038's body and one rule).
create or replace function public.cde_container_frozen() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'a file stays in its project';
  end if;
  if new.iso_name is distinct from old.iso_name
     and exists (select 1 from public.container_versions v where v.container_id = old.id and v.state in ('published', 'archived')) then
    raise exception 'a file that holds a published or archived version keeps its name';
  end if;
  if new.iso_name is distinct from old.iso_name
     and exists (select 1 from public.container_versions v
                   join public.audit_log a on a.entity_id = v.id and a.project_id = old.project_id
                  where v.container_id = old.id and a.entity_type = 'file_version' and a.action like 'verdict:%') then
    raise exception 'a file whose version a verdict judged keeps its name — a new name is a new file: upload it under the new name';
  end if;
  return new;
end $$;

-- 4 · an issued transmittal stays as issued.
drop policy if exists transmittals_write on public.transmittals;
drop policy if exists transmittals_insert on public.transmittals;
create policy transmittals_insert on public.transmittals for insert to authenticated
  with check (public.has_min_role(project_id, 'lead'));

-- 5 · a project key is never uuid-shaped.
alter table public.projects add constraint projects_key_not_uuid
  check (key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- 6 · one live project links a platform project.
create unique index projects_one_live_platform_link on public.projects ((metadata->'settings'->>'platform_project_id'))
  where metadata->'settings'->>'platform_project_id' is not null and (metadata->'settings'->>'archived') is distinct from 'true';

commit;
