-- 0051_office_register_read.sql — BIM documents workspace R1c (design docs/superpowers/specs/2026-10-24-bim-documents-workspace-design.md
--   §4 Office register, §10; plan docs/superpowers/plans/2026-11-12-bim-documents-workspace-r1c.md, Task 1).
--
--   The office register (store office_register in bridge_docs) is the office's own standard: only leads and owners of the office read it,
--   in the bridge and in the database. bridge_docs_read is replaced so a viewer of the office reads every store as before except
--   office_register. Writes to office_register and annex stay service-only (bridge_docs_floor is null for them, so no signed-in
--   write policy passes); nothing else changes.
--
-- Dry-run: on PGlite with every migration (bridge/migration-0051.test.mjs). Probe: probes/0051_probe.sql (part 1 catalog, part 2 behaviour).
-- Rollback (never run casually): re-create bridge_docs_read as 0033 made it:
--   drop policy bridge_docs_read on public.bridge_docs;
--   create policy bridge_docs_read on public.bridge_docs for select to authenticated using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));

drop policy if exists bridge_docs_read on public.bridge_docs;
create policy bridge_docs_read on public.bridge_docs
  for select to authenticated
  using (project_id = '' or (public.bridge_docs_role(project_id, 'viewer')
                             and (store <> 'office_register' or public.bridge_docs_role(project_id, 'lead'))));
