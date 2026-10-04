-- 0037_changeset_bridge_only.sql — the changeset store is written by the bridge alone (MA-3a, review amendment C1).
--
-- Why: MA-3a makes a web decline BIND in Revit through the changeset doc (each ghost's `review`, the doc's `review_rev` —
-- spec amendment S1). 0033 left the 'changeset' store's floor at 'contributor', so a signed-in contributor could PATCH a
-- changeset doc straight through PostgREST with the public anon key and their own JWT, skipping the bridge: set a declined
-- ghost back to proposed (a re-open by a non-lead, with no changeset_reopened row), delete a review, or write review.by as
-- someone else — and Revit would obey the forged doc. 0034 closed the same hole for the clash register. After this,
-- 'changeset' joins 'clash', 'tender', 'manifest', 'federation' and 'keystore': no signed-in writer; the bridge writes it with
-- the service key after its own role check (contributor to propose, report, withdraw, accept or decline; lead to re-open).
--
-- NOT YET APPLIED — apply on the founder's "apply", AFTER the bridge that writes changesets with the service key runs (MA-3a's
-- changesets-store.mjs: docInsert and rewrite pass { service: true }). A bridge before MA-3a forwards a signed-in person's
-- changeset writes, which this refuses (an insert: 42501; a swap: 0 rows patched, a 409). Then run probes/0037_probe.sql and
-- record its result here.
--
-- Reads are unchanged (any member reads a changeset: bridge_docs_read, 0033). Deletes: bridge_docs_delete asks for a non-null
-- floor, so a signed-in lead no longer deletes changeset rows directly either (the bridge deletes nothing of them).
--
-- ROLLBACK (if needed): re-run 0034's bridge_docs_floor (the 'changeset' line back at 'contributor').

create or replace function public.bridge_docs_floor(p_store text) returns text
  language sql immutable set search_path = public as $$
  select case p_store
    when 'doc_comments'    then 'viewer'
    when 'rfi'             then 'contributor'
    when 'office_snapshot' then 'contributor'
    when 'office_scan'     then 'contributor'
  end;
$$;
