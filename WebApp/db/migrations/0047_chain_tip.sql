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
-- the tip; no API role may write the tip.
--
-- NOT YET APPLIED. Apply on the founder's OK only; probes/0047_probe.sql part 0 before, parts 1 and 2 after. Either order with
-- the bridge is safe: the bridge reads the tip only for the daily global timestamp, and falls back to the highest id without it.
--
-- ROLLBACK (if needed): create or replace 0006's cde_audit_chain() body with `set search_path = public, extensions` (0012),
-- then drop table public.audit_chain_tip.

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
  language plpgsql security definer set search_path = '' as $$
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

commit;
