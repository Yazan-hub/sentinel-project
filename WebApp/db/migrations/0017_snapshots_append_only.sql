-- Sentinel CDE 0017 — F13: element_snapshots write posture (role gate + no in-place rewrite).
--
-- ✅ APPLIED 2026-07-23 (project autqqtwhxqrfjaztablm). Post-apply verification, run live:
--   * row counts unchanged — element_snapshots 37,525 · model_revisions 19 (identical before/after)
--   * policies now element_snapshots{read:SELECT, insert:INSERT, delete:DELETE} (no UPDATE policy at all)
--     and model_revisions{read, insert, update, delete}; trg_snapshot_no_update present
--   * an in-place UPDATE is REJECTED even for the elevated role:
--       "element_snapshots is append-only — write a new revision instead of editing revision 67decff4…"
--   * the FK cascade still works — a temp model_revision + child snapshot were inserted, the revision
--     deleted, and the child row went with it (0 left). Both checks ran inside a DO block ending in a
--     RAISE, so every test write was rolled back; counts re-confirmed at 37,525 / 19 afterwards.
--   * `npm run security:check` still locks anon out of all 7 guarded tables; 99 WebApp tests pass;
--     Supabase security advisors report NO new lint from this migration.
--
-- Context (audit F13). 0005 declared element_snapshots "APPEND-ONLY … Rows are never updated in place",
-- and the whole 5D/6D revision-diff engine depends on that: a Δ is a self-join of two revisions on guid,
-- so silently editing a historical row rewrites cost and carbon history that has already been reported.
-- But nothing enforced it. After 0016 the table is member-scoped `TO authenticated`, which leaves two gaps:
--   1. Any member — including a `viewer` — can INSERT/UPDATE/DELETE snapshots. Every other CDE write in
--      0004 requires `contributor`; this table was stubbed ("tighten writes … once the snapshot ingest
--      endpoint lands" — 0005 line 52) and never revisited.
--   2. Nothing blocks an in-place UPDATE, so the append-only contract was documentation, not a constraint.
--
-- On DELETE — a deliberate deviation from the audit's wording. element_snapshots is reachable by
-- `on delete cascade` from BOTH model_revisions and projects (0005). A blanket DELETE guard like the audit
-- ledger's would make deleting a project or a superseded revision fail outright, which is a functional
-- regression, not a hardening. Snapshots are derived data a project owner may legitimately discard —
-- unlike audit_log, which is evidence. So DELETE stays with the FK cascade and the role gate below;
-- only the *rewrite* vector is closed at engine level.

-- Checked against the live code paths before writing this: the ONLY writer is
-- cde-store.mjs::ingestRevision (one `POST model_revisions` + chunked `POST element_snapshots`, both
-- `prefer: return=minimal` — plain inserts, NOT `resolution=merge-duplicates`), and the only readers are
-- SELECTs (listRevisions / the paged snapshot fetch). Nothing in the system issues an UPDATE against
-- either table, so the trigger below cannot break ingest.

begin;

-- 1) Role gate: writing quantity facts is a contributor+ action, matching folders / information_containers
--    / container_versions in 0004. Reading stays open to any member (0016's elem_snap_read is untouched).
drop policy if exists elem_snap_write on public.element_snapshots;
create policy elem_snap_insert on public.element_snapshots for insert to authenticated
  with check (public.has_min_role(project_id, 'contributor'));
create policy elem_snap_delete on public.element_snapshots for delete to authenticated
  using (public.has_min_role(project_id, 'contributor'));
-- (No UPDATE policy at all: with RLS enabled and no permissive policy for the command, UPDATE is
--  default-deny for `authenticated`. The trigger below is what also stops a service_role rewrite.)

-- Same gate on the revision header, so a viewer cannot forge or retitle a revision either.
drop policy if exists model_rev_write on public.model_revisions;
create policy model_rev_insert on public.model_revisions for insert to authenticated
  with check (public.has_min_role(project_id, 'contributor'));
create policy model_rev_update on public.model_revisions for update to authenticated
  using      (public.has_min_role(project_id, 'contributor'))
  with check (public.has_min_role(project_id, 'contributor'));
create policy model_rev_delete on public.model_revisions for delete to authenticated
  using (public.has_min_role(project_id, 'lead'));

-- 2) Engine-level immutability: RLS does not constrain service_role, and the bridge holds the service key.
--    A row-level BEFORE UPDATE trigger fires for every role, so a compromised bridge cannot quietly restate
--    last month's quantities. Mirrors trg_audit_no_change (0002) — same reasoning, weaker scope (no DELETE).
create or replace function public.cde_snapshot_no_update() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'element_snapshots is append-only — write a new revision instead of editing revision %', old.revision_id;
end $$;

drop trigger if exists trg_snapshot_no_update on public.element_snapshots;
create trigger trg_snapshot_no_update before update on public.element_snapshots
  for each row execute function public.cde_snapshot_no_update();

-- 3) Least privilege, matching 0015's treatment of the ledger: PostgREST-facing roles never need UPDATE
--    here. (anon already had everything revoked in 0016.)
revoke update on public.element_snapshots from authenticated, service_role;
revoke update on public.element_snapshots from public;

commit;

-- POST-APPLY VERIFICATION (run these; expected results in brackets)
--   select count(*) from public.element_snapshots;                          [unchanged, ~37,525]
--   update public.element_snapshots set area = 1 where guid = <any>;        [ERROR: append-only]
--   -- as a viewer JWT: insert into public.element_snapshots …              [0 rows / RLS denial]
--   -- as a contributor JWT: insert …                                       [succeeds]
--   -- delete a test model_revision as owner                                [cascade still removes its snapshots]
--
-- ROLLBACK
--   drop trigger if exists trg_snapshot_no_update on public.element_snapshots;
--   drop function if exists public.cde_snapshot_no_update();
--   grant update on public.element_snapshots to authenticated, service_role;
--   drop policy if exists elem_snap_insert on public.element_snapshots;
--   drop policy if exists elem_snap_delete on public.element_snapshots;
--   create policy elem_snap_write on public.element_snapshots
--     for all to authenticated using (is_member(project_id)) with check (is_member(project_id));
--   -- (and the mirrored model_revisions policies from 0016)
