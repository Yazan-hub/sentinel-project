-- Sentinel CDE core (Phase C1) — ISO 19650 information containers, states, transmittals, audit.
-- Applied to Supabase project autqqtwhxqrfjaztablm (Yazan-hub's Project) on 2026-07-16.
-- RLS enabled with NO policies: locked to the server-side service key (bridge); role-based
-- policies land in C4 with Supabase Auth. Rollback: drop the tables + the two enum types.

create type container_state as enum ('wip','shared','published','archived');
create type party_kind as enum ('appointing','lead_appointed','appointed','viewer');

create table projects (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  appointing_party text,
  naming_convention text default 'Project-Originator-Volume-Level-Type-Role-Number',
  status_scheme text default 'uk-na',
  created_at timestamptz not null default now()
);

create table parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  kind party_kind not null default 'appointed',
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  party_id uuid references parties(id) on delete set null,
  user_id uuid,
  role text not null default 'contributor',
  created_at timestamptz not null default now()
);

create table information_containers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  iso_name text not null,
  title text,
  discipline text,
  container_type text,
  created_at timestamptz not null default now(),
  unique (project_id, iso_name)
);

create table container_versions (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references information_containers(id) on delete cascade,
  revision text not null,
  state container_state not null default 'wip',
  suitability text,
  file_ref text,
  author text,
  notes text,
  superseded boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_cv_container on container_versions (container_id);
create index idx_ic_project on information_containers (project_id);

create table transmittals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  reference text,
  sender text,
  recipients jsonb not null default '[]'::jsonb,
  purpose text,
  suitability text,
  version_ids jsonb not null default '[]'::jsonb,
  issued_at timestamptz not null default now(),
  note text
);

create table audit_log (
  id bigint generated always as identity primary key,
  project_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor text,
  old_value jsonb,
  new_value jsonb,
  at timestamptz not null default now(),
  prev_hash text,
  hash text
);
create index idx_audit_project_at on audit_log (project_id, at);

alter table projects enable row level security;
alter table parties enable row level security;
alter table memberships enable row level security;
alter table information_containers enable row level security;
alter table container_versions enable row level security;
alter table transmittals enable row level security;
alter table audit_log enable row level security;
