-- 0030_artefact_store_service_only.sql — standards artefacts are written by the bridge only (cohesion phase 4a,
-- spec docs/superpowers/specs/2026-09-25-revit-standards-from-project-design.md, decision 9).
-- NOT YET APPLIED — applied by the founder or an approved call, AFTER the bridge that installs artefacts with the
-- service key (artefact-store.mjs wire()) is running. Applied before it, a signed-in lead's install is refused.
--
-- 0028's bridge_docs_write let every member INSERT/UPDATE/DELETE any bridge_docs row of their project through
-- PostgREST, artefacts included: a member could rewrite ids@3's body and every later verdict would judge by it
-- (resolveArtefact flags pointer_sha_mismatch, but nothing prevented the write). Artefact rows are now excluded
-- from the authenticated write policy; the bridge installs them with the service key (which bypasses RLS) after
-- its own lead check. bridge_docs_read is unchanged, so members still read their project's artefacts, and every
-- other store keeps exactly 0028's member access.
begin;

drop policy if exists bridge_docs_write on public.bridge_docs;

create policy bridge_docs_write on public.bridge_docs
  for all to authenticated
  using (
    store <> 'artefact'
    and project_id <> ''
    and is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  )
  with check (
    store <> 'artefact'
    and project_id <> ''
    and is_member((select id from public.projects p where p.key = bridge_docs.project_id or p.id::text = bridge_docs.project_id))
  );

commit;

-- Verify after applying:
--   select policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'bridge_docs';
--   → bridge_docs_read (SELECT, unchanged) and bridge_docs_write (ALL) whose qual and with_check both begin
--     with (store <> 'artefact'::text).
