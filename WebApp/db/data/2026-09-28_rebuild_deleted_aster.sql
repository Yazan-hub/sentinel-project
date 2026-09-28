-- Rebuild, into Deleted items, the two aster-tower files the founder archived and then deleted on 2026-09-28 — before
-- 0035, when Archive erased a file's drafts and Delete erased the file. The founder asked to be able to restore them
-- (2026-09-28, default decision 1: rebuild them from the ledger with their original ids).
--
-- Everything here is read from the ledger (audit_log), never typed in: each file's id, name, project and creation time
-- (its 'created' row), each version's id, label, size, platform item, uploader and upload time (its 'uploaded' row), when
-- and by whom the drafts were set aside (the file's 'archived' row) and the file deleted (its 'deleted' row). No state
-- change was ever recorded for these versions, so each was a wip draft. Not recoverable from the ledger, and left empty:
-- sha256, suitability, discipline, container type, folder and host link (so a restore lands at the project root).
--
-- The result, as 0035 would have left it: each file in Deleted items (deleted_at/by = its 'deleted' row); each version
-- deleted on its own before the file (deleted_at/by = the 'archived' row), not live. Restoring a file brings it back
-- empty; its versions are then restored one by one from Deleted items.
--
-- Run ONCE, after 0035 is applied, as the service role (the 0035 guard lets only a lead or the service move a row to
-- Deleted items). It refuses to run twice and refuses if any ledger row is not what it expects. One transaction.

begin;

create temp table rebuild_files (cid uuid primary key, created_row bigint, archived_row bigint, deleted_row bigint, n_versions int) on commit drop;
insert into rebuild_files values
  ('701fb051-d349-4eb6-9c2b-4479bd0c1453', 613, 1102, 1105, 4), -- AST_ASTR26_Aster Tower_yazan.ifc
  ('644b398c-ac0b-4a15-9e82-5c01ddc2a0da', 622, 1101, 1104, 2); -- AST_ASTR26_Aster Tower_yazan.hKNTHU.ifc
create temp table rebuild_versions (uploaded_row bigint primary key) on commit drop;
insert into rebuild_versions values (615), (619), (626), (634), (624), (632);

do $$
declare bad text;
begin
  if exists (select 1 from public.information_containers c join rebuild_files f on f.cid = c.id) then
    raise exception 'already rebuilt — a file id is in use; nothing was done';
  end if;
  -- Every ledger row names the file it should, with the action it should.
  select string_agg(format('ledger #%s', x.id), ', ') into bad from (
    select a.id from rebuild_files f join public.audit_log a on a.id in (f.created_row, f.archived_row, f.deleted_row)
     where a.entity_type <> 'container' or a.entity_id <> f.cid
        or a.action <> case a.id when f.created_row then 'created' when f.archived_row then 'archived' else 'deleted' end
    union all
    select v.uploaded_row from rebuild_versions v left join public.audit_log a on a.id = v.uploaded_row
     where a.id is null or a.entity_type <> 'file_version' or a.action <> 'uploaded'
  ) x;
  if bad is not null then raise exception 'the ledger is not as expected (%) — nothing was done', bad; end if;
  if (select count(*) from public.audit_log where id in (select created_row from rebuild_files union all select archived_row from rebuild_files union all select deleted_row from rebuild_files)) <> 6 then
    raise exception 'a file ledger row is missing — nothing was done';
  end if;
  -- No state change was recorded for any of the versions: each was a wip draft.
  if exists (select 1 from public.audit_log a join public.audit_log u on u.id in (select uploaded_row from rebuild_versions)
              where a.entity_id = u.entity_id and a.action like 'state:%') then
    raise exception 'a version has a recorded state change — rebuilding it as wip would be wrong; nothing was done';
  end if;
end $$;

-- 1. The files, under a placeholder name while their versions are added (a file in Deleted items takes no new version).
insert into public.information_containers (id, project_id, iso_name, title, created_at)
select f.cid, a.project_id, 'rebuilding ' || f.cid, a.new_value->>'iso_name', a.at
  from rebuild_files f join public.audit_log a on a.id = f.created_row;

-- 2. The versions — in Deleted items on their own (Archive set them aside), never live.
insert into public.container_versions (id, container_id, revision, state, author, notes, size_bytes, platform_item_id, is_live, created_at, deleted_at, deleted_by)
select u.entity_id, f.cid, u.new_value->>'revision', 'wip', u.actor,
       format('Rebuilt from ledger #%s on 2026-09-28: set aside by Archive (ledger #%s) before Deleted items existed.', u.id, ar.id),
       (u.new_value->>'size_bytes')::bigint, u.new_value->>'platform_item_id', false, u.at, ar.at, ar.actor
  from rebuild_versions v
  join public.audit_log u on u.id = v.uploaded_row
  join public.audit_log cr on cr.new_value->>'iso_name' = u.new_value->>'file' and cr.id in (select created_row from rebuild_files)
  join rebuild_files f on f.created_row = cr.id
  join public.audit_log ar on ar.id = f.archived_row;

-- 3. Each file to Deleted items under its own name, as its 'deleted' row recorded (one update: the name is set with the
--    move, so a live file of that name meanwhile is no conflict — a restore onto it is refused in words).
update public.information_containers c
   set iso_name = cr.new_value->>'iso_name', deleted_at = d.at, deleted_by = d.actor
  from rebuild_files f
  join public.audit_log cr on cr.id = f.created_row
  join public.audit_log d on d.id = f.deleted_row
 where c.id = f.cid;

-- 4. The counts are what the ledger said (4 and 2), or nothing stays.
do $$
begin
  if exists (select 1 from rebuild_files f
              where (select count(*) from public.container_versions v where v.container_id = f.cid and v.deleted_at is not null) <> f.n_versions) then
    raise exception 'a rebuilt file does not hold the versions its archive row counted — nothing was done';
  end if;
end $$;

-- 5. One ledger row per file: what was rebuilt, from which rows, and why.
insert into public.audit_log (project_id, entity_type, entity_id, action, actor, old_value, new_value)
select a.project_id, 'container', f.cid, 'rebuilt', 'cli', null,
       jsonb_build_object('iso_name', a.new_value->>'iso_name', 'deleted_items', true, 'versions_in_deleted_items', f.n_versions,
                          'from_ledger', jsonb_build_array(f.created_row, f.archived_row, f.deleted_row),
                          'why', 'erased by Archive and Delete before 0035; rebuilt from the ledger so a lead can restore it')
  from rebuild_files f join public.audit_log a on a.id = f.created_row;

commit;

-- Check (read-only): both files in Deleted items, 4 + 2 versions set aside, two 'rebuilt' rows.
--   select c.iso_name, c.deleted_at, c.deleted_by, count(v.*) filter (where v.deleted_at is not null) as set_aside
--     from public.information_containers c left join public.container_versions v on v.container_id = c.id
--    where c.id in ('701fb051-d349-4eb6-9c2b-4479bd0c1453', '644b398c-ac0b-4a15-9e82-5c01ddc2a0da') group by 1, 2, 3;
