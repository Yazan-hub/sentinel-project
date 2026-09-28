-- 0035_deleted_items.sql — Deleted items, as in ACC/Forma: a file or version is never erased by a person; it moves to
-- Deleted items and can be restored with its history.
--
-- Why: on 2026-09-28 the founder archived two draft-only files (Archive discarded their drafts: a hard delete) and then
-- deleted the emptied entries (a hard delete of the container) — nothing could be restored. The founder chose the
-- ACC/Forma behaviour with every default recommendation (2026-09-28): deleted items are kept for ever, no permanent
-- purge, a lead or owner deletes and restores, a deleted file frees its name (a restore onto a taken name is refused,
-- as in ACC), a restored file whose folder was deleted meanwhile lands at the project root, a restored draft keeps its
-- state, a file whose versions are all archived may go to Deleted items, and a viewer may still read deleted rows.
--
-- NOT YET APPLIED — applied only by the controller after the founder approves it, then probed with
-- probes/0035_probe.sql. The bridge that writes deleted_at must be running before the apply is used: until the apply,
-- the new columns do not exist and the soft-delete PATCH is refused with a 400 in words (nothing is deleted).
--
-- What it does:
--   1. deleted_at / deleted_by on information_containers and container_versions.
--   2. The file name is unique among the files NOT in Deleted items (a deleted file frees its name, as in ACC).
--   3. No signed-in caller hard-deletes a file or a version any more: ic_delete and cv_delete are dropped. A project's
--      own delete still cascades (referential cascades bypass RLS); the bridge's service key is the only other path.
--   4. One guard trigger on both tables, before the others (triggers fire in name order):
--      - moving a file or version to, or back from, Deleted items is a lead's (or the service key's, which the bridge
--        role-checks first);
--      - a file holding a PUBLISHED version is not deleted (the old rule, same words: archive instead); a published or
--        archived VERSION is never deleted on its own;
--      - a deleted version stops being live (so a restore never collides with the one-live-version index) and comes back
--        not live;
--      - nothing is added to, or changed on, a file in Deleted items — restore it first. A folder or host delete may still
--        null its folder_id / parent_id (their ON DELETE SET NULL), so a restore lands it at the project root.

alter table public.information_containers add column if not exists deleted_at timestamptz;
alter table public.information_containers add column if not exists deleted_by text;
alter table public.container_versions     add column if not exists deleted_at timestamptz;
alter table public.container_versions     add column if not exists deleted_by text;

alter table public.information_containers drop constraint if exists information_containers_project_id_iso_name_key;
create unique index if not exists ic_project_name_not_deleted
  on public.information_containers (project_id, iso_name) where deleted_at is null;

drop policy if exists ic_delete on public.information_containers;
drop policy if exists cv_delete on public.container_versions;

create or replace function public.cde_deleted_items_guard() returns trigger
  language plpgsql security definer set search_path = public, auth as $$
declare
  v_proj uuid;
  v_file_deleted timestamptz;
begin
  if tg_table_name = 'information_containers' then
    if new.deleted_at is distinct from old.deleted_at then
      if auth.uid() is not null and not public.has_min_role(new.project_id, 'lead') then
        raise exception 'a file is moved to or restored from Deleted items by a lead or owner' using errcode = '42501';
      end if;
      if new.deleted_at is not null and exists (
        select 1 from public.container_versions v where v.container_id = new.id and v.state = 'published' and v.deleted_at is null
      ) then
        raise exception 'published versions are immutable (cannot delete) — archive instead' using errcode = 'P0001';
      end if;
      return new;
    end if;
    if old.deleted_at is not null and (
      new.iso_name is distinct from old.iso_name or new.title is distinct from old.title or
      new.discipline is distinct from old.discipline or new.container_type is distinct from old.container_type or
      new.project_id is distinct from old.project_id
    ) then
      raise exception 'this file is in Deleted items — restore it first' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- container_versions
  select c.project_id, c.deleted_at into v_proj, v_file_deleted from public.information_containers c where c.id = new.container_id;
  if tg_op = 'INSERT' then
    if v_file_deleted is not null then
      raise exception 'this file is in Deleted items — restore it first' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if auth.uid() is not null and not public.has_min_role(v_proj, 'lead') then
      raise exception 'a version is moved to or restored from Deleted items by a lead or owner' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.state in ('published', 'archived') then
      raise exception 'published and archived versions are never deleted — archive the file instead' using errcode = 'P0001';
    end if;
    if new.deleted_at is null and v_file_deleted is not null then
      raise exception 'this file is in Deleted items — restore the file first' using errcode = 'P0001';
    end if;
    new.is_live := false; -- out of the live pointer while deleted, and back not live
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'this version is in Deleted items — restore it first' using errcode = 'P0001';
  end if;
  if v_file_deleted is not null then
    raise exception 'this file is in Deleted items — restore it first' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function public.cde_deleted_items_guard() from anon, public;

drop trigger if exists trg_deleted_items on public.information_containers;
create trigger trg_deleted_items before update on public.information_containers
  for each row execute function public.cde_deleted_items_guard();

drop trigger if exists trg_deleted_items on public.container_versions;
create trigger trg_deleted_items before insert or update on public.container_versions
  for each row execute function public.cde_deleted_items_guard();
