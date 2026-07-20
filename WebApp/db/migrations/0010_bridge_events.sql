-- 0010_bridge_events.sql — cross-machine SSE fan-out via a shared event feed.
-- APPLIED 2026-07-20 (project autqqtwhxqrfjaztablm). Verified with TWO bridge instances: a topic created on
-- bridge B reached bridge A's SSE client via the poll (cross-machine ✓), and a change on A pushed to A's own
-- client exactly once — the poll skips its own events (no duplicate ✓).
--
-- The bridge pushes live changes (BCF topic created/updated/commented/…) to its connected SSE clients via
-- broadcast(). That only reached clients on the SAME bridge: a change made on machine A never pushed to
-- machine B's clients (they only caught up on the panel's next refetch). The bridge is zero-dependency and
-- talks to Postgres over PostgREST (HTTP), so it can't hold a LISTEN/NOTIFY connection — instead every bridge
-- APPENDS each broadcast to this table and POLLS it, re-broadcasting other bridges' events to its own SSE
-- clients (skipping its own, tagged by `origin`). Near-real-time cross-machine push with no new dependency.
--
-- Rows are ephemeral (only for live fan-out); the bridge prunes them after a few minutes.

create table if not exists public.bridge_events (
  id         bigint generated always as identity primary key,
  project_id text not null,
  origin     text,                       -- the originating bridge instance id (so it skips its own events)
  payload    jsonb not null,             -- exactly what broadcast() would send to an SSE client
  created_at timestamptz not null default now()
);
create index if not exists idx_bridge_events_id on public.bridge_events(id);

alter table public.bridge_events enable row level security;
-- Bridge-internal: only the service-key bridge (auth.uid() is null) touches it; direct client access denied.
do $$
begin
  create policy bridge_events_service on public.bridge_events for all
    using (auth.uid() is null) with check (auth.uid() is null);
exception when duplicate_object then null;
end $$;
