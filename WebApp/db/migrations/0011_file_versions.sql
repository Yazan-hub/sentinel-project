-- 0011_file_versions.sql — file-versioning metadata on container_versions.
-- A "file" is an information_container; its versions are container_versions (0001). This migration enriches
-- each version row with the blob-level facts a file-version history needs — the size, a content hash, the
-- That Open Platform item id (so a past version can be reopened in the viewer), and a single "live" pointer
-- per file (the version that is currently the project's working copy). Everything else about a version
-- (ISO 19650 state, suitability, author, notes, superseded) already lives on container_versions.
--
-- Additive + idempotent. No existing row is rewritten; is_live defaults false, and a backfill marks the
-- newest version of each container live so pre-existing containers show a current version immediately.
-- Rollback: drop the four columns + the partial unique index.

begin;

alter table public.container_versions add column if not exists size_bytes       bigint;
alter table public.container_versions add column if not exists sha256           text;
alter table public.container_versions add column if not exists platform_item_id text;  -- That Open Platform item id (viewer load)
alter table public.container_versions add column if not exists is_live          boolean not null default false;

-- At most one live version per container (the "current" pointer). Partial unique index: only live rows collide.
create unique index if not exists idx_cv_one_live_per_container
  on public.container_versions (container_id) where is_live;

-- Backfill: mark the newest version of each container live, unless one already is.
with newest as (
  select distinct on (container_id) id
  from public.container_versions
  order by container_id, created_at desc, id desc
)
update public.container_versions cv
set is_live = true
from newest n
where cv.id = n.id
  and not exists (select 1 from public.container_versions x where x.container_id = cv.container_id and x.is_live);

commit;
