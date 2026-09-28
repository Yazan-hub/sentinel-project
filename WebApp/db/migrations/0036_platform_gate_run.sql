-- 0036_platform_gate_run.sql — each run of the platform delivery gate is on the ledger exactly once (roadmap item 3,
-- part A; spec docs/superpowers/specs/2026-09-29-platform-native-design.md).
--
-- Why: bridge/platform-gate-ledger.mjs copies every finished run of That Open's delivery-gate component (the platform's
-- own run record, read with the bridge's platform token) onto the ledger as one `platform_gate` row keyed by the run's
-- execution id. Two bridges, the CLI beside a bridge, or a retry after a lost reply could write the same run twice:
-- audit_log has no unique key (0001), and the ledger is append-only (0015), so a second row could never be taken back.
-- The writer's own "already recorded?" read is a check-then-write; only the database can make it once-only.
--
-- NOT YET APPLIED — apply on the founder's go, then run probes/0036_probe.sql. The index build fails if two
-- platform_gate rows already share an execution id; none exists (read-only check 2026-09-29: no platform_gate row).
--
-- What it does:
--   1. A partial unique index on the run's execution id (new_value->>'execution_id') among platform_gate rows only.
--      A second row of the same run is 23505. The chain trigger (0002/0006) runs in the same statement, so the refused
--      insert rolls back with it and the chain tip never moves; the writer counts 23505 as "already recorded".
--   2. Nothing else: no other entity type is touched (the index is partial). A platform_gate row without an execution
--      id would not be unique (NULLs are distinct), so the writer refuses it before any insert (rowOf), and the probe's
--      part 1 checks that none exists.

create unique index if not exists audit_platform_gate_run
  on public.audit_log ((new_value->>'execution_id')) where entity_type = 'platform_gate';
