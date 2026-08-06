-- 0019: host→link nesting for information containers (ACC-style file tree).
-- A container published as a LINKED model of another carries parent_id → its host container.
-- on delete set null: deleting the host promotes links to top-level rather than orphaning them.
-- Applied to the live project 2026-08-06 via MCP (container_parent_link).
alter table information_containers
  add column if not exists parent_id uuid references information_containers(id) on delete set null;
create index if not exists idx_ic_parent on information_containers(parent_id);
