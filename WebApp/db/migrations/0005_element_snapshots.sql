-- 0005_element_snapshots.sql — DRAFT, NOT YET APPLIED.
--
-- Per-element, per-revision quantity snapshots keyed on the IFC GlobalId. This is the persistence tier for
-- the shared revision-diff engine (WebApp/src/sentinel-core/revision-diff.ts): one append-only fact table
-- that serves 5D cost revision tracking, 6D carbon revision tracking, and clash provenance — all of which
-- must diff by GlobalId (stable across a re-export) rather than the fragments model_id / IFC local_id
-- (both revision-unstable — see clash.ts::keyOf and migration 0004 for the RLS helpers reused below).
--
-- Posture: APPEND-ONLY. A model revision writes one immutable batch of element_snapshots; later revisions
-- write new rows under a new revision_id. Rows are never updated in place — the diff is computed by joining
-- two revisions on guid. Review before applying; RLS policies are stubbed pending the write flow.

begin;

-- One row per uploaded model revision (the unit two snapshots are diffed across).
create table if not exists public.model_revisions (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id) on delete cascade,
  container_version_id uuid references public.container_versions(id) on delete set null, -- CDE linkage (0003), optional
  rev_code             text,        -- human revision label (e.g. "P02", "C01")
  model_id             text,        -- fragments/platform model id at upload time (informational; NOT a join key)
  element_count        int,
  uploaded_by          text,        -- auth uid or service actor; free-text to match the bridge's audit style
  uploaded_at          timestamptz not null default now()
);
create index if not exists idx_model_rev_project on public.model_revisions(project_id, uploaded_at desc);

-- The immutable per-element quantity fact. Primary key (revision_id, guid) enforces one snapshot per element
-- per revision; querying a Δ is a self-join of this table on guid across two revision_ids.
create table if not exists public.element_snapshots (
  revision_id uuid not null references public.model_revisions(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade, -- denormalized for RLS + fast per-project scans
  guid        text not null,        -- IFC GlobalId — the stable join key across revisions
  category    text,                 -- e.g. "IFCWALL"
  type_name   text,
  count       numeric,              -- mirrors ElementQuantities measures (count/length/area/volume/weight)
  length      numeric,
  area        numeric,
  volume      numeric,
  weight      numeric,
  primary key (revision_id, guid)
);
create index if not exists idx_elem_snap_project_guid on public.element_snapshots(project_id, guid);

alter table public.model_revisions  enable row level security;
alter table public.element_snapshots enable row level security;

-- RLS: members read their project's revisions/snapshots; the service-key bridge writes (auth.uid() is null →
-- guards fall open exactly as in 0004). Mirrors 0004's is_member()/has_min_role() helpers. Kept minimal here;
-- tighten writes to has_min_role(project_id,'contributor') once the snapshot ingest endpoint lands.
do $$
begin
  if to_regprocedure('public.is_member(uuid)') is not null then
    create policy model_rev_read   on public.model_revisions  for select using (public.is_member(project_id));
    create policy model_rev_write  on public.model_revisions  for all
      using (auth.uid() is null or public.is_member(project_id))
      with check (auth.uid() is null or public.is_member(project_id));
    create policy elem_snap_read   on public.element_snapshots for select using (public.is_member(project_id));
    create policy elem_snap_write  on public.element_snapshots for all
      using (auth.uid() is null or public.is_member(project_id))
      with check (auth.uid() is null or public.is_member(project_id));
  end if;
end $$;

commit;
