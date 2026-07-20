-- Sentinel CDE 0015 — audit_log truncate guard + least-privilege on the immutable ledger.
--
-- Context: 0002 made audit_log append-only via a BEFORE UPDATE OR DELETE *row-level* trigger
-- (trg_audit_no_change), which the service_role cannot drop because the table is owned by `postgres`.
-- That closes the "rewrite/delete a historical row" vector even for a compromised bridge holding the
-- service key. BUT two gaps remained, found while reviewing the trust boundary:
--   1. Row-level triggers do NOT fire on TRUNCATE, so the immutability trigger never blocks a table wipe.
--   2. anon / authenticated / service_role were all GRANTED truncate/update/delete on audit_log — the
--      grant-level ability to wipe the ledger, independent of the row triggers.
-- This closes the wipe vector at both layers (engine-level trigger + least privilege), so the append-only
-- contract holds regardless of who holds a key.
--
-- Safe: nothing in the system updates, deletes, or truncates audit_log — it is append-only by design
-- (recordAudit/audit only INSERT; listAudit only SELECTs). INSERT + SELECT grants are left untouched.

-- 1) Engine-level block: TRUNCATE on the ledger is rejected regardless of role (statement-level trigger).
create or replace function cde_audit_no_truncate() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only (no truncate)';
end $$;

drop trigger if exists trg_audit_no_truncate on audit_log;
create trigger trg_audit_no_truncate before truncate on audit_log
  for each statement execute function cde_audit_no_truncate();

-- 2) Least privilege: PostgREST-facing roles only ever append to + read the ledger. Revoke the rest so the
--    append-only contract is enforced by privilege too, not only by the immutability triggers.
revoke update, delete, truncate on audit_log from anon, authenticated, service_role;
revoke update, delete, truncate on audit_log from public;
