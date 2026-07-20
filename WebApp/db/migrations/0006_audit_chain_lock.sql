-- 0006_audit_chain_lock.sql — serialize the hash-chained audit insert (fixes a tamper-evidence race).
-- APPLIED 2026-07-20 (project autqqtwhxqrfjaztablm). Verified: lock present in the function; chain intact
-- (36 rows, 0 forks, 0 broken links); a rolled-back test insert chained onto the tip correctly.
--
-- cde_audit_chain() (migration 0002) computes each audit row's hash by reading the current chain tip
-- (`select hash ... order by id desc limit 1`) and chaining off it. Under concurrent inserts, two
-- transactions both read the SAME committed tip before either commits, so both chain off it — forking the
-- chain and destroying the "single tamper-evident thread" invariant the golden-thread audit depends on.
--
-- Fix: take a transaction-scoped advisory lock at the top of the trigger so audit inserts serialize. A second
-- inserter blocks until the first commits/rolls back, then reads the true tip. The chain is GLOBAL (the tip
-- query has no project filter), so a single global lock key is correct. Lock is released automatically at
-- COMMIT/ROLLBACK. Idempotent: create-or-replace only changes the function body; no schema/data change.

create or replace function cde_audit_chain() returns trigger language plpgsql as $$
declare last_hash text;
begin
  -- Serialize concurrent audit inserts so they can't chain off the same tip (which would fork the chain).
  perform pg_advisory_xact_lock(4823710411641000001);
  select hash into last_hash from audit_log order by id desc limit 1;
  new.prev_hash := last_hash;
  new.hash := encode(
    extensions.digest(
      coalesce(last_hash,'') || new.entity_type || coalesce(new.entity_id::text,'') ||
      new.action || coalesce(new.actor,'') || coalesce(new.old_value::text,'') ||
      coalesce(new.new_value::text,'') || coalesce(new.at::text,''),
      'sha256'), 'hex');
  return new;
end $$;
