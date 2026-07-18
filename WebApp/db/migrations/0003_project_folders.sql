-- 0003 — Per-project folder tree (ACC/Forma-style "Project Files").
-- Purely organisational; the ISO 19650 WIP/Shared/Published/Archived state stays on container_versions.
-- Scoped by project_id, so every platform project automatically gets its own independent folder structure.
-- Applied to Supabase project autqqtwhxqrfjaztablm via MCP apply_migration (2026-07).

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null,
  kind text not null default 'folder',   -- 'root' | 'folder'
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists folders_project_idx on public.folders(project_id);
create index if not exists folders_parent_idx on public.folders(parent_id);

-- No duplicate sibling names within a project (case-insensitive), including at the root (null parent).
create unique index if not exists folders_unique_sibling
  on public.folders (project_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

alter table public.folders enable row level security; -- locked to the service key, like the rest of the CDE

-- File a container into a folder (nullable = unfiled / project root).
alter table public.information_containers
  add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists information_containers_folder_idx on public.information_containers(folder_id);

-- Default seed (Project Files → Architecture/Structure/MEP/Civil/Shared/Incoming/Reports) is created lazily
-- by the bridge (cde-store.ensureFolders) on first access per project, so it also covers pre-existing projects.
