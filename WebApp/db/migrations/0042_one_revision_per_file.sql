-- 0042_one_revision_per_file.sql — a revision is registered once per file, and a platform item is one version's
-- geometry, for every writer (SEC-5):
--
--   1 · container_versions_one_revision: a unique index on (container_id, upper(btrim(revision))) — Deleted items
--       included, a label compared trimmed and in any case, as 0041's cde_version_on_insert compares it. 0041 refuses a
--       signed-in INSERT of a held revision in words; this index binds the service path too (the bridge's
--       registrations), so two registrations of one new label at once cannot both land (founder decision C-a).
--   2 · container_versions_one_item: a unique index on platform_item_id where it is set — a platform item is one
--       version's geometry (founder decision B-a). Since 0041 the bridge links only an item it has just uploaded, so
--       this holds by construction; the index makes it hold for every writer.
--
-- NOT YET APPLIED. Before the apply: the 4100 bridge runs the branch (it answers either index's refusal in words), and
-- probes/0042_probe.sql
-- part 0 is read (read-only); its first two rows must read 0 (each index would refuse the apply otherwise).
-- After it: the probe's parts 1 and 2.
--
-- ROLLBACK (if needed): drop index public.container_versions_one_revision; drop index public.container_versions_one_item.

begin;

-- 1 · one revision per file, for every writer.
create unique index container_versions_one_revision on public.container_versions (container_id, upper(btrim(revision)));

-- 2 · a platform item is one version's geometry.
create unique index container_versions_one_item on public.container_versions (platform_item_id) where platform_item_id is not null;

commit;
