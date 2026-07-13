-- ============================================================
-- SENTINEL — Module 2: Office Knowledge Layer (PostgreSQL 16)
-- Single source of truth for standards, project bindings,
-- contributions, and the append-only audit log.
-- Git-like model: master library -> immutable releases ->
-- project = pinned version + overlay -> governed contributions.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive emails

-- ---------- Enumerations ----------
CREATE TYPE enforcement_mode AS ENUM ('monitor', 'warn', 'request', 'block');
CREATE TYPE version_status   AS ENUM ('draft', 'released', 'deprecated');
CREATE TYPE contribution_status AS ENUM
    ('proposed', 'in_review', 'changes_requested', 'approved', 'rejected', 'merged');
CREATE TYPE actor_role AS ENUM ('team_member', 'coordinator', 'bim_manager', 'system', 'ai_parser');

-- ---------- Tenancy ----------
CREATE TABLE offices (
    office_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    user_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    office_id   uuid NOT NULL REFERENCES offices,
    email       citext UNIQUE NOT NULL,
    display_name text NOT NULL,
    role        actor_role NOT NULL DEFAULT 'team_member',
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Standards library ----------
-- A "standard" is a named ruleset lineage (e.g. BDS Revit Template Rules).
CREATE TABLE standards (
    standard_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    office_id   uuid NOT NULL REFERENCES offices,
    key         text NOT NULL,              -- machine key e.g. 'bds-rtg-001'
    title       text NOT NULL,
    description text,
    created_by  uuid NOT NULL REFERENCES users,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (office_id, key)
);

-- Immutable releases. ruleset is the full token-based JSON rule schema
-- (bilingual EN/AR messages, per-rule enforcement mode, doc references).
CREATE TABLE standard_versions (
    version_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    standard_id  uuid NOT NULL REFERENCES standards,
    semver       text NOT NULL,             -- '1.4.0', '1.5.0'
    status       version_status NOT NULL DEFAULT 'draft',
    ruleset      jsonb NOT NULL,            -- full ruleset.json payload
    -- DECISION: hash = tamper-evidence only, NOT version identity. Semver is
    -- identity; identical content may be re-released (changelog-only releases,
    -- rollback releases). Do not add a unique constraint on ruleset_hash.
    ruleset_hash text GENERATED ALWAYS AS (encode(sha256(ruleset::text::bytea), 'hex')) STORED,
    changelog    text,
    source_docs  jsonb NOT NULL DEFAULT '[]', -- [{doc:'BDS-RTG-001', rev:'V1.4', acc_url:...}]
    released_by  uuid REFERENCES users,
    released_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (standard_id, semver),
    CONSTRAINT released_fields CHECK (
        status <> 'released' OR (released_by IS NOT NULL AND released_at IS NOT NULL))
);

-- Enforce immutability of released versions at the DB level.
CREATE OR REPLACE FUNCTION forbid_released_mutation() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'released' AND (
         NEW.ruleset IS DISTINCT FROM OLD.ruleset
      OR NEW.semver  IS DISTINCT FROM OLD.semver) THEN
        RAISE EXCEPTION 'Released standard_versions are immutable (version %)', OLD.version_id;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_versions_immutable
    BEFORE UPDATE ON standard_versions
    FOR EACH ROW EXECUTE FUNCTION forbid_released_mutation();

-- ---------- Projects & bindings ----------
CREATE TABLE projects (
    project_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    office_id    uuid NOT NULL REFERENCES offices,
    code         text NOT NULL,             -- 'BDS20268'
    name         text NOT NULL,             -- 'Al Najes Heights'
    acc_project_ref text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (office_id, code)
);

-- Pin + overlay: a project inherits a released version and applies an
-- EIR/BEP-driven overlay (rule additions, mode escalations, disables).
CREATE TABLE project_bindings (
    binding_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects,
    version_id   uuid NOT NULL REFERENCES standard_versions,
    overlay      jsonb NOT NULL DEFAULT '{}',  -- {add:[], override:{rule_id:{mode:...}}, disable:[]}
    overlay_source jsonb NOT NULL DEFAULT '[]',-- provenance: parsed EIR/BEP docs
    is_active    boolean NOT NULL DEFAULT true,
    bound_by     uuid NOT NULL REFERENCES users,
    bound_at     timestamptz NOT NULL DEFAULT now()
);
-- One active binding per project.
CREATE UNIQUE INDEX uq_active_binding ON project_bindings (project_id) WHERE is_active;

-- ---------- Contributions (upstream improvements) ----------
-- Reuses the request/verdict state machine from the add-in workflow.
CREATE TABLE contributions (
    contribution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    standard_id  uuid NOT NULL REFERENCES standards,
    from_project uuid REFERENCES projects,       -- NULL = office-level proposal
    base_version uuid NOT NULL REFERENCES standard_versions,
    proposed_by  uuid NOT NULL REFERENCES users,
    title        text NOT NULL,                  -- 'Formalize level naming LXX_FFL/SSL'
    rationale    text,
    patch        jsonb NOT NULL,                 -- rule diff against base_version.ruleset
    status       contribution_status NOT NULL DEFAULT 'proposed',
    reviewed_by  uuid REFERENCES users,
    verdict_note text,
    merged_into  uuid REFERENCES standard_versions, -- set when status='merged'
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT merged_needs_target CHECK (status <> 'merged' OR merged_into IS NOT NULL),
    CONSTRAINT verdict_needs_reviewer CHECK (
        status NOT IN ('approved','rejected','merged') OR reviewed_by IS NOT NULL)
);
CREATE INDEX idx_contrib_status ON contributions (standard_id, status);

-- Legal state transitions enforced in one place.
CREATE OR REPLACE FUNCTION contribution_transition_guard() RETURNS trigger AS $$
DECLARE ok boolean;
BEGIN
    ok := (OLD.status, NEW.status) IN (
        ('proposed','in_review'), ('in_review','changes_requested'),
        ('changes_requested','in_review'), ('in_review','approved'),
        ('in_review','rejected'), ('approved','merged'));
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT ok THEN
        RAISE EXCEPTION 'Illegal contribution transition % -> %', OLD.status, NEW.status;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contrib_transitions
    BEFORE UPDATE ON contributions
    FOR EACH ROW EXECUTE FUNCTION contribution_transition_guard();

-- ---------- Scan telemetry (case-study metrics) ----------
CREATE TABLE scan_reports (
    scan_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects,
    binding_id   uuid NOT NULL REFERENCES project_bindings,
    doc_title    text NOT NULL,               -- Revit document.Title
    scanned_by   uuid REFERENCES users,
    duration_ms  integer NOT NULL,
    elements_checked integer NOT NULL,
    violations   jsonb NOT NULL,              -- [{rule_id, mode, element_id, message_en, message_ar}]
    score        numeric(5,2) NOT NULL,
    scanned_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scans_project_time ON scan_reports (project_id, scanned_at DESC);

-- ---------- Append-only audit log ----------
CREATE TABLE audit_log (
    audit_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    office_id   uuid NOT NULL REFERENCES offices,
    actor_id    uuid REFERENCES users,
    actor_role  actor_role NOT NULL,
    action      text NOT NULL,               -- 'version.released', 'contribution.approved', ...
    entity_type text NOT NULL,               -- 'standard_version', 'contribution', 'project_binding'
    entity_id   uuid NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}',
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log (entity_type, entity_id, occurred_at);

-- No UPDATE/DELETE, ever (ISO 19650 information-management evidence).
CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_append_only();

-- ---------- Effective ruleset resolution ----------
-- The add-in fetches ONE thing: the pinned version merged with overlay.
CREATE OR REPLACE VIEW v_effective_rulesets AS
SELECT p.project_id, p.code AS project_code,
       sv.version_id, sv.semver,
       sv.ruleset  AS base_ruleset,
       pb.overlay,
       pb.binding_id
FROM projects p
JOIN project_bindings pb ON pb.project_id = p.project_id AND pb.is_active
JOIN standard_versions sv ON sv.version_id = pb.version_id
WHERE sv.status = 'released';
