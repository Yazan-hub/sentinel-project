-- 0047_chain_tip.sql — the global ledger chain cannot fork under two concurrent writers (found by the careful review of 0045,
-- 2026-10-20; drill LV's open item).
--
-- cde_audit_chain() (0002, locked in 0006) finds the chain's tip as `select hash from audit_log order by id desc limit 1`, under
-- an advisory lock. But a row's id is drawn BEFORE the BEFORE trigger takes the lock: writer A can hold id 100 while writer B,
-- holding 101, takes the lock first and chains on. A then chains onto 101 (the highest id) — and the next writer C (102) reads
-- the highest committed id, 101, again: A and C share one parent. A fork: two rows claim the same predecessor.
-- Checked live before this (2026-10-20, 2,930 rows): 0 forks, 0 dangling links, one root, every hash recomputes — the race had
-- not happened yet.
--
-- The fix: the tip is kept, not guessed. audit_chain_tip holds one row — the id and hash of the last row chained — read and moved
-- by the trigger under the same lock, so each writer chains onto the one before it in lock order: one line, whatever the ids.
-- The hash formula is unchanged byte for byte (every existing hash still recomputes; nothing is rehashed or updated). The tip is
-- seeded from the existing chain's one end (the row whose hash no row names as its prev_hash); the apply refuses if the chain
-- has more or fewer than one end. The trigger becomes SECURITY DEFINER with an empty search_path, so it — and only it — moves
-- the tip; no API role may write the tip. It also pins TimeZone UTC and DateStyle 'ISO, MDY' — the live sessions' own settings
-- (checked 2026-10-20), so every hash so far is the same bytes, and a session in another zone can no longer change how `at`
-- is rendered into a hash. The apply checks, before it commits, that the trigger's owner owns the tip (or bypasses RLS).
-- The trigger must stay the last BEFORE INSERT row trigger on audit_log (a later one returning NULL would move the tip with no
-- row written): bridge/migration-0047.test.mjs pins it.
--
-- APPLIED 2026-10-20 ~13:10 UTC on the founder's OK ("Yes, apply + drill"), project autqqtwhxqrfjaztablm. probes/0047_probe.sql
-- part 0: no tip table, 1 end, 0 forks, sessions ISO, MDY / UTC, owner postgres (bypassrls); part 1: 7 of 7 true; part 2:
-- "PROBE 0047: 5 of 5 as expected." (rolled back). Live two-session drill: the database tool ran the two sessions one after the
-- other, so the race itself did not occur live — the three drill rows (#3056–#3058, project ledger-drill-2026-10-20) form one
-- line, 0 forks, tip #3058. Either order with the bridge is safe: the bridge reads the tip only for the daily global timestamp,
-- and falls back to the highest id without it.
--
-- ROLLBACK (if needed), only while audit_chain_tip.audit_id = max(audit_log.id) (else the old body's "highest id" forks the
-- chain at once): under the same lock, create or replace 0006's cde_audit_chain() body with `set search_path = public,
-- extensions` (0012), then drop table public.audit_chain_tip.

begin;

-- No ledger row is written while the tip is seeded: an insert waits here, then runs the new trigger body.
lock table public.audit_log in share row exclusive mode;

create table public.audit_chain_tip (
  one      boolean primary key default true check (one),
  audit_id bigint not null, -- no foreign key: the trigger writes it BEFORE its ledger row exists
  hash     text   not null check (hash ~ '^[0-9a-f]{64}$')
);

-- The existing chain's end: the one row whose hash no row names as its prev_hash.
do $$
declare ends int;
begin
  select count(*) into ends from public.audit_log a
   where not exists (select 1 from public.audit_log b where b.prev_hash = a.hash);
  if (select count(*) from public.audit_log) > 0 and ends <> 1 then
    raise exception '0047: the ledger chain has % ends, not one — it forked or broke; nothing was changed', ends;
  end if;
  insert into public.audit_chain_tip(audit_id, hash)
  select a.id, a.hash from public.audit_log a
   where not exists (select 1 from public.audit_log b where b.prev_hash = a.hash);
end $$;

create or replace function public.cde_audit_chain() returns trigger
  language plpgsql security definer set search_path = '' set timezone = 'UTC' set datestyle = 'ISO, MDY' as $$
declare last_hash text;
begin
  -- Serialize concurrent audit inserts (0006's key), then chain onto the kept tip — never onto "the highest id".
  perform pg_advisory_xact_lock(4823710411641000001);
  select t.hash into last_hash from public.audit_chain_tip t;
  new.prev_hash := last_hash;
  new.hash := encode(
    extensions.digest(
      coalesce(last_hash,'') || new.entity_type || coalesce(new.entity_id::text,'') ||
      new.action || coalesce(new.actor,'') || coalesce(new.old_value::text,'') ||
      coalesce(new.new_value::text,'') || coalesce(new.at::text,''),
      'sha256'), 'hex');
  insert into public.audit_chain_tip(one, audit_id, hash) values (true, new.id, new.hash)
    on conflict (one) do update set audit_id = excluded.audit_id, hash = excluded.hash;
  return new;
end $$;

-- Only the trigger (its owner) moves the tip; the bridge reads it for the daily global timestamp.
alter table public.audit_chain_tip enable row level security;
revoke all on public.audit_chain_tip from public, anon, authenticated, service_role;
grant select on public.audit_chain_tip to service_role;
revoke execute on function public.cde_audit_chain() from public, anon, authenticated, service_role;

-- The trigger writes the tip as its owner: refuse to commit a ledger that could not write a row.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_class c on c.oid = 'public.audit_chain_tip'::regclass
                 join pg_roles r on r.oid = p.proowner
                 where p.oid = 'public.cde_audit_chain()'::regprocedure and (p.proowner = c.relowner or r.rolsuper or r.rolbypassrls)) then
    raise exception '0047: the chain trigger''s owner could not write the tip (row level security) — nothing was changed';
  end if;
end $$;

commit;
