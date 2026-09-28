-- 0034_clash_register_bridge_only.sql — the clash register is written by the bridge alone.
--
-- Why: the founder's decision of 2026-09-28 (3D spec Decision 4) locks ⚑ Raise until the Federation Gate passed on the
-- whole live set. The bridge asks the gate before it records a clash (POST /clash/:pid → 409 in words) and before it
-- creates a Clash issue. But 0033 left the 'clash' store's floor at 'contributor', so a signed-in contributor could still
-- insert register rows straight through PostgREST with the public anon key and their own JWT, and skip the lock (found by
-- the lock's review, 2026-09-28). After this, 'clash' joins 'tender', 'manifest', 'federation' and 'keystore': no
-- signed-in writer; the bridge writes it with the service key after its own role check (contributor to record or move a
-- clash, lead to reset the register) and, for a new record, the gate's lock.
--
-- NOT YET APPLIED — applied only by the controller after the founder approves it, then probed with
-- probes/0034_probe.sql. The running bridge is safe on either side of it: since the lock's fix it writes every clash
-- record, status move and reset with the service key, which row-level security does not stop.
--
-- Reads are unchanged (any member reads the register: bridge_docs_read, 0033). Deletes: bridge_docs_delete asks for a
-- non-null floor, so a signed-in lead no longer deletes clash rows directly either; the bridge's reset (lead) does it.

create or replace function public.bridge_docs_floor(p_store text) returns text
  language sql immutable set search_path = public as $$
  select case p_store
    when 'doc_comments'    then 'viewer'
    when 'rfi'             then 'contributor'
    when 'changeset'       then 'contributor'
    when 'office_snapshot' then 'contributor'
    when 'office_scan'     then 'contributor'
  end;
$$;
