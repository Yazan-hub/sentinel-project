-- 0007_project_metadata.sql — unify the split-brain "projects" store into one source of truth.
-- APPLIED 2026-07-20 (project autqqtwhxqrfjaztablm). Verified: all 7 local projects lazy-migrated into
-- projects.metadata (real rate_pack/boq_baseline preserved), list is union-safe, carbon_baseline now
-- persists (was silently dropped), and core fields default on read (no null-stage regression).
--
-- Sentinel kept project governance metadata (stage, dimensions, gates, 5D rate_pack + boq_baseline, 6D
-- carbon_baseline, owner snapshot) in a per-MACHINE local JSON file (bridge/project-store.json), separate
-- from the Supabase `projects` row that holds the same project's CDE identity + containers + audit. Same
-- logical project, two stores, keyed differently → divergence risk, and the metadata (baselines, rate packs)
-- was trapped per-machine instead of team-wide like everything else Sentinel now persists server-side.
--
-- Fix: a JSONB `metadata` column on public.projects becomes the single home for that governance metadata. The
-- bridge's /projects routes read/write it here (lazy-migrating any existing local-JSON metadata on first
-- access), falling back to the local file only when the CDE isn't configured. Idempotent; no data change.

alter table public.projects add column if not exists metadata jsonb not null default '{}'::jsonb;
