-- 0045_project_chain.sql — a hash chain per project, beside the global one (docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md
-- §5 "Ledger verification and anchoring").
--
-- The ledger is ONE chain across every project (0002, 0006): an auditor of one project could not check that project's rows without
-- the operator's whole database. This adds a second chain, per project, computed alongside — audit_log and its global hashes are not
-- touched (no column added, no row updated, nothing rehashed):
--
--   audit_project_chain(audit_id, project_id, project_seq, project_hash): one row per ledger row that names a project. project_seq
--   counts 1, 2, 3 … per project; project_hash = sha256 of the text cde_project_chain_preimage() builds — a tag, then each field as
--   "<UTF-8 byte length>:<text>\n" ("-\n" for a null): the project id, the seq, the previous project_hash, the ledger row's id and
--   global hash, its entity_type, entity_id, action, actor, old_value::text, new_value::text, and its time in UTC (microseconds).
--   Self-contained (only that project's rows are needed), unambiguous (no field can lend bytes to its neighbour) and the same in any
--   session time zone. WebApp/bridge/ledger-verify.mjs rebuilds the same text offline.
--
--   An AFTER INSERT trigger on audit_log appends the chain row in the same transaction, under 0006's chain lock (still held from the
--   BEFORE trigger), so each project's seq is the order its rows took the lock: one line, never a fork. That is the id order except
--   when two writers race (an id is drawn before the lock is taken), so seq, not id, is the chain's order. The existing rows are
--   appended here, in id order, by the same function. The table is append-only like the ledger (no update, delete or truncate;
--   nobody but the trigger inserts). audit_project_chain_v gives a member the exact texts that were hashed (security_invoker: the
--   reader's own RLS applies).
--
--   The hash covers old_value::text and new_value::text — jsonb's own text, which Postgres has rendered the same way since jsonb
--   came (9.4) and which the view renders again on every read. A change to that rendering, or to those columns' type, would make
--   every past project_hash fail to recompute: never change either without carrying the old text.
--
-- APPLIED 2026-10-20 ~08:56 UTC on the founder's OK ("Yes, apply", after the careful review's fixes), project autqqtwhxqrfjaztablm,
-- BEFORE the 4100 bridge runs the branch (either order is safe: a bridge without the branch never reads the table; the branch's bridge
-- says "the project chain is not set up" in words until it exists). probes/0045_probe.sql part 0: 0 names taken, 2,856 ledger rows
-- name a project; part 1: 9 of 9 true (2,856 chain rows in 108 projects); part 2: "PROBE 0045: 8 of 8 as expected." (rolled back;
-- 2,856 chain rows = 2,856 ledger rows after).
--
-- ROLLBACK (if needed): drop trigger trg_audit_project_chain on public.audit_log; drop view public.audit_project_chain_v;
-- drop table public.audit_project_chain; drop function public.cde_project_chain_after(), public.cde_project_chain_append(public.audit_log),
-- public.cde_project_chain_preimage(public.audit_log, bigint, text), public.cde_chain_field(text), public.cde_chain_at(timestamptz),
-- public.cde_project_chain_no_change().

begin;

-- No ledger row is written while the chain is built: an insert waits here, then sees the new trigger.
lock table public.audit_log in share row exclusive mode;

create table public.audit_project_chain (
  audit_id     bigint primary key references public.audit_log(id),
  project_id   uuid   not null,
  project_seq  bigint not null check (project_seq >= 1),
  project_hash text   not null check (project_hash ~ '^[0-9a-f]{64}$'),
  unique (project_id, project_seq)
);

-- A ledger time as the chain hashes it: UTC, microseconds, whatever the session's time zone.
create or replace function public.cde_chain_at(t timestamptz) returns text
  language sql stable set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

-- One field of the preimage: "<UTF-8 byte length>:<text>\n", or "-\n" for a null.
create or replace function public.cde_chain_field(x text) returns text
  language sql immutable set search_path = '' as $$
  select coalesce(octet_length(x)::text || ':' || x, '-') || E'\n' $$;

create or replace function public.cde_project_chain_preimage(a public.audit_log, seq bigint, prev text) returns text
  language sql stable set search_path = '' as $$
  select 'sentinel-project-chain/1' || E'\n'
    || public.cde_chain_field(a.project_id::text) || public.cde_chain_field(seq::text) || public.cde_chain_field(prev)
    || public.cde_chain_field(a.id::text) || public.cde_chain_field(a.hash)
    || public.cde_chain_field(a.entity_type) || public.cde_chain_field(a.entity_id::text) || public.cde_chain_field(a.action)
    || public.cde_chain_field(a.actor) || public.cde_chain_field(a.old_value::text) || public.cde_chain_field(a.new_value::text)
    || public.cde_chain_field(public.cde_chain_at(a.at)) $$;

-- Appends one ledger row to its project's chain (a row with no project is in the global chain only).
create or replace function public.cde_project_chain_append(a public.audit_log) returns void
  language plpgsql security definer set search_path = '' as $$
declare last_seq bigint; last_hash text;
begin
  if a.project_id is null then return; end if;
  select c.project_seq, c.project_hash into last_seq, last_hash
    from public.audit_project_chain c where c.project_id = a.project_id order by c.project_seq desc limit 1;
  insert into public.audit_project_chain(audit_id, project_id, project_seq, project_hash)
  values (a.id, a.project_id, coalesce(last_seq, 0) + 1,
          encode(extensions.digest(public.cde_project_chain_preimage(a, coalesce(last_seq, 0) + 1, last_hash), 'sha256'), 'hex'));
end $$;

create or replace function public.cde_project_chain_after() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  -- 0006's key: already held by the BEFORE trigger in this transaction; taken again so this order holds on its own.
  perform pg_advisory_xact_lock(4823710411641000001);
  perform public.cde_project_chain_append(new);
  return null;
end $$;

create or replace function public.cde_project_chain_no_change() returns trigger
  language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_project_chain is append-only';
end $$;

create trigger trg_project_chain_no_change before update or delete on public.audit_project_chain
  for each row execute function public.cde_project_chain_no_change();
create trigger trg_project_chain_no_truncate before truncate on public.audit_project_chain
  for each statement execute function public.cde_project_chain_no_change();

-- The existing ledger, in id order, through the same function the trigger calls.
do $$
declare r public.audit_log;
begin
  for r in select * from public.audit_log where project_id is not null order by id loop
    perform public.cde_project_chain_append(r);
  end loop;
end $$;

create trigger trg_audit_project_chain after insert on public.audit_log
  for each row execute function public.cde_project_chain_after();

do $$
begin
  if (select count(*) from public.audit_log where project_id is not null) <> (select count(*) from public.audit_project_chain) then
    raise exception '0045: the project chain does not cover every ledger row that names a project';
  end if;
end $$;

-- The texts a project's chain hashed, row by row (a reader's own RLS applies to both tables).
create view public.audit_project_chain_v with (security_invoker = true) as
  select c.project_id, c.project_seq, c.project_hash, a.id as audit_id, a.hash, a.prev_hash, a.entity_type, a.entity_id, a.action,
         a.actor, a.old_value::text as old_text, a.new_value::text as new_text, public.cde_chain_at(a.at) as at_utc
    from public.audit_project_chain c join public.audit_log a on a.id = c.audit_id;

-- Read-only to the API roles; a member reads their own projects' rows. Only the trigger (its owner) inserts.
alter table public.audit_project_chain enable row level security;
create policy project_chain_select on public.audit_project_chain for select to authenticated using (public.is_member(project_id));
revoke all on public.audit_project_chain from public, anon, authenticated, service_role;
revoke all on public.audit_project_chain_v from public, anon, authenticated, service_role;
grant select on public.audit_project_chain, public.audit_project_chain_v to authenticated, service_role;
revoke execute on function public.cde_project_chain_append(public.audit_log), public.cde_project_chain_after(),
  public.cde_project_chain_no_change() from public, anon, authenticated, service_role;

commit;
