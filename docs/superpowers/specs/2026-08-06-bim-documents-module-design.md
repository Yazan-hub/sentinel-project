# BIM Documents Module — Design Spec

**Date:** 2026-08-06
**Status:** Approved (design confirmed in session)
**Sub-project:** 1 of 6 (roadmap: documents → ingestion → enforcement → MIDP/TIDP → AI drafting → MCP tools)

## Purpose

Author, manage, version, and export ISO 19650 project documents (BEP, EIR; more types later) inside the Sentinel WebApp as **structured, sectioned records** — not document blobs — so later sub-projects can bind sections to live enforcement (naming ruleset, scorecard, sync guard), deliverable tracking, AI drafting, and MCP tools.

Competitive context: matches the authoring core of Plannerly Plan / Morta / BIMWorkplace; the structured-section + `bindings` design is what lets Sentinel later close the loop none of them close (documents enforced against the live model/CDE).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Storage | Dedicated tables (`bim_documents`, `bim_document_versions`), migration 0020 |
| v1 doc types | BEP + EIR templates (schema is type-open) |
| PDF export | Print stylesheet + browser Save-as-PDF (no new dependencies) |
| Section states | Reuse existing CDE vocabulary: `wip` / `shared` / `published` / `archived` |

## 1. Schema — `WebApp/db/migrations/0020_bim_documents.sql`

**`bim_documents`**
- `id uuid pk default gen_random_uuid()`
- `project_id` — same project reference style as existing tables (verify against 0003/0011 during planning: uuid FK vs. platform key text; follow the dominant pattern)
- `doc_type text not null` — `'BEP' | 'EIR'` in v1; open text, no enum constraint
- `title text not null`
- `status text not null default 'wip'` — check constraint: `wip|shared|published|archived`
- `sections jsonb not null default '[]'` — ordered array of section objects:
  ```json
  {
    "id": "uuid-or-slug",
    "heading": "3.2 Information delivery strategy",
    "guidance": "template guidance text shown to the author",
    "body": "markdown",
    "state": "wip",
    "owner": "user id or email, nullable",
    "bindings": {}
  }
  ```
  `bindings` is reserved (always `{}` in v1) — sub-project 3 fills it with e.g. `{"naming_ruleset": "...", "scorecard_check": "..."}`.
- `created_by`, `created_at`, `updated_at`

**`bim_document_versions`** (append-only)
- `id uuid pk`, `document_id uuid fk`, `version_no int` (unique per document), `snapshot jsonb` (full document row at publish time), `label text` (e.g. "P02 — issued for tender"), `published_by`, `published_at`
- Append-only enforcement in the style of migration 0017 (`snapshots_append_only`): trigger/guard rejecting UPDATE and DELETE. Published document versions are the contractual artifact and must be tamper-evident.

**RLS** — mirror the `is_member(...)` policy pattern from 0004/0009: service-key bridge open; authenticated users scoped to member projects. No anon access (consistent with 0016/0018 hardening).

## 2. Templates

Static JSON, same idiom as `WebApp/bridge/naming-ruleset.json`:
- `bep-template.json` — ISO 19650-2 post-appointment BEP section structure (project info, roles & responsibilities/RACI summary, information delivery strategy, federation strategy, CDE workflow, naming & container standards, LOIN summary, methods & procedures, software/versions, QA & model checking)
- `eir-template.json` — exchange information requirements structure (organizational context, information requirements, LOIN expectations, standards & methods, CDE requirements, delivery milestones, acceptance criteria)

Each section carries `heading` + `guidance` (author-facing help text) + optional starter `body`. "New document" = deep-copy template sections with fresh ids, all states `wip`.

Location: decided in planning — either served by the bridge (`/docs/templates`) from a `templates/` folder next to `naming-ruleset.json`, or bundled into the frontend. Prefer bridge-served so templates are editable without rebuild.

## 3. Bridge endpoints

Extend the existing bridge service (same file/registration pattern as current `/cde/*` routes; same token auth):

- `GET  /docs/templates` — list available templates (type, title, section count)
- `GET  /docs/:project` — list documents for a project (id, type, title, status, version count, updated_at)
- `POST /docs/:project` — create document from template `{doc_type, title}`
- `GET  /docs/:project/:docId` — full document
- `PATCH /docs/:project/:docId/section/:sectionId` — update body/owner/state of one section; carries `updated_at` for stale-write detection (409 on mismatch)
- `POST /docs/:project/:docId/transition` — document-level state change (`wip→shared→published→archived`), validated transitions only
- `POST /docs/:project/:docId/publish` — snapshot into `bim_document_versions` with `{label}`, bump `version_no`, set status `published`
- `GET  /docs/:project/:docId/versions` — version list; `GET .../versions/:n` — one snapshot

All writes append to the existing audit/event mechanism if one is exposed to the bridge (verify in planning; if the audit chain is container-scoped only, document events are logged in v2 — do not force it in v1).

## 4. UI — `WebApp/src/setups/docs-panel.ts`

Plain-DOM panel following `files-panel.ts` conventions (factory function returning `HTMLElement`, `STATE_COLOR` map reuse, `bridge-fetch` for calls, docked via the same shell/tab registration as other panels).

Views within the panel:
1. **Document list** — per active project: type badge, title, status chip, version count, "New document" (template picker: BEP / EIR)
2. **Editor** — section list sidebar (heading + state chip + owner initials) → section detail: guidance text (collapsible), markdown textarea body, state selector, owner field. Save per section (PATCH). Stale-write: on 409, warn and offer overwrite/reload.
3. **Versions** — list of published versions with label/date/author; open a version read-only
4. **Document view** — full rendered document (all sections in order, markdown rendered), used both for reading and as the print surface

## 5. Export (print stylesheet)

The Document view gets a `@media print` stylesheet: project + document title header, version/suitability stamp, section page-break rules, footer with version label + date, panel chrome hidden. Export = browser Save-as-PDF. No server dependency.

## 6. Error handling

- Bridge errors surface as inline panel messages (match files-panel behavior)
- Section save: optimistic UI, rollback on failure, 409 stale-write flow as above
- State transitions validated server-side (single source of transition rules in the bridge); UI hides invalid transitions
- RLS denial = same handling as other panels (verify pattern in planning)

## 7. Testing

- Vitest (pure logic, no network): template instantiation (fresh ids, wip states, deep copy), transition validation rules, version snapshot construction
- One bridge smoke test hitting the docs endpoints against a test project (same style as existing bridge checks, if present; otherwise a minimal script)

## Out of scope (later sub-projects)

- PDF/Word EIR ingestion (sub-project 2)
- Section `bindings` enforcement against naming ruleset / scorecard / sync guard (3)
- MIDP/TIDP deliverable tracker (4)
- AI section drafting + integrity analysis via copilot engine (5)
- MCP tools for documents in `mcp-server.mjs` (6)
- Rich-text editing, concurrent multi-user editing (CRDT), e-signatures, server-side PDF
