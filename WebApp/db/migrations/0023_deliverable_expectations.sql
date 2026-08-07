-- 0023: per-milestone delivery expectations. What revision and suitability the plan says this
-- deliverable must reach by its due date. Nullable: a row without them behaves exactly as phase 4.
-- Judged at READ time against container_versions evidence — nothing stored about the verdict.
alter table public.deliverables
  add column if not exists expected_revision text,
  add column if not exists expected_suitability text;
