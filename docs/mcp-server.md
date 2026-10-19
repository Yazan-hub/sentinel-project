# Sentinel MCP server — the governed graph as an agent tool

`WebApp/bridge/mcp-server.mjs` exposes the **referee layer** to AI agents / MCP clients over stdio JSON-RPC
(zero-dependency). It's the "propose API" as an agent surface: let a generator or agent PROPOSE, and Sentinel
adjudicates deterministically (IDS validation) and records the verdict immutably — plus a read-only window
onto the document-governance layer (BEP/EIR documents, compliance, deliverables, AI integrity).

## Tools

| Tool | What it does |
|---|---|
| `sentinel_list_projects` | List the governed CDE projects. |
| `sentinel_propose` | Validate proposed elements against an IDS (buildingSMART Information Delivery Specification); returns **accepted / rejected / recorded** (recorded: nothing adjudicated — no IDS, or nothing in its scope) with per-requirement reasons and records the verdict in the hash-chained audit trail. The referee judges by the project's installed IDS artefact; `sentinel_propose` needs no `ids` argument when one is installed. Only its declared fields (`source`, `ids`, `elements`, `agent`, `note`) are forwarded: it cannot stamp, register or override a version. |
| `sentinel_audit` | Read a project's ledger (proposals, verdicts, clashes, gate rows, ISO 19650 state transitions) newest first as `{rows, total, limit, offset}` — `total` is exact, so fewer rows than `total` means there is more. Filters: `entity_type`, `action_prefix`, `entity_id`, `actor`, `since`, `until`; `limit` (default 50, at most 1000) and `offset`. The hash chain is one chain across all projects; this read does not recompute it. Read-only. |
| `sentinel_list_documents` | List a project's governed BIM documents (BEP, EIR): id, title, type, status. Read-only. |
| `sentinel_get_document` | Read one document with its sections; pass `section` (id or exact heading) to fetch just that section. Read-only. |
| `sentinel_compliance_report` | A document's bound governance checks evaluated against live project data — **deterministic facts** (met / violations with evidence / not_checkable with the reason), computed by code, not AI. Read-only. |
| `sentinel_deliverables_status` | The MIDP/TIDP tracker: every planned deliverable classified delivered / late / in_wip / overdue / pending / unscheduled, derived at read time. Read-only. |
| `sentinel_list_checks` | The check registry: real checks plus **planned** ones Sentinel honestly cannot evaluate yet (with reasons). |
| `sentinel_doc_integrity` | AI analysis of a document against the project's configured reality. Findings are **AI suggestions gated to cited facts** — never compliance facts; uncited findings are dropped and counted. Slow (minutes on a local model); needs the AI provider running. Read-only. |
| `sentinel_propose_changeset` | Stage model elements (kinds: wall, floor, level, grid, roof, ceiling, door, window, column, furniture, room, and since MA-6-3 opening — a rectangle in a wall or a hole in a floor — and beam; a roof may carry `Slopes` per edge, a column `TopLevel`) for human review in Revit — nothing is created by this call; a person ticks each element in Revit before anything enters the model. Each element still sends `validate.identity.Class`, but the bridge sets it from the kind (wall IFCWALL, level IFCBUILDINGSTOREY, …): any other class, a subtype included, is replaced and listed in `ignored` (MA-6-1). |
| `sentinel_changeset_status` | Check a staged changeset by `changeset` (id) or list by `status`. An Undo in Revit leaves a changeset applied, so each one carries `undone`: `{ledger_id, at, guids}` (guids: how many elements the Undo removed) when its newest `changeset_reverted` ledger row is an Undo, `null` when there is none or it was redone, `{unknown: why}` when the ledger was not read (MA-6-1). Once Revit reports its re-read (MA-6-2), `result.as_built` judges each placed wall, floor, roof, ceiling, door, window, column and beam against the installed ids@n (only the verdict is stored, not the values) — `passes`, `fails` (with its failures), `not read` (a requirement Sentinel has no Revit reader for and did not read: never passed, never failed), `not in scope`, or `exported as X — not judged as Y` (an as-built class the claim's specification does not ask) — or a `why` per element (not kept, no read) or for all (no IDS installed); `judged`, `passed`, `failed`, `not_read` and `not_judged` count each element once (review fixes), other kinds are counted under `out_of_scope`, and the `changeset_applied` row carries the counts. Reported with the machine credential it is only `{why, reported_role}`. Read-only. |
| `sentinel_lod_state` | A project's judged LOD state line from `/cde/:key/journey`, the line the web's Next strip and Revit's pane print: `{lod_state: {line, share, at, ledger}}`, or "not measured" until a `lod_state` ledger row is measured against the lod_matrix in force (MA-6-1). Read-only. |
| `sentinel_standards` | A standard in force for a project (its own, else its office's): `kind` guideline, `type_catalog` (with `category`: that category's rows whole, params included; without: the category names with counts), `ids`, `lod_matrix` (its DD stage IDS), or `recipe` (MA-8-13: the registry of verified runs, project and office, each with its approvals; drafting, approving and running one are a signed-in person's - no tool does them, the count stays 17). A standard not installed is an error in words ("<kind> is not installed for <key> or its office"); an unknown project or a non-member gets the bridge's own 404 (MA-6-1). Read-only. |
| `sentinel_build_status` | A project's survey jobs (sentinel-survey, run by the bridge on the evidence pack's admitted LAS scans), newest first, or one by `job` with its untyped candidates and receipt. Read-only — a contributor starts a survey on the web; no MCP tool starts one. |
| `sentinel_edit_cost` | A project's edit cost per run (a job, else one changeset): filed, declined on the web, declined before (carried), not applied in Revit, applied, undone, kept, pending and the share changed, with the ceiling (edits after Apply other than an Undo are not seen). Read-only — a lead publishes a run's numbers on the web desk. |
| `sentinel_verify_receipt` | Re-check a verdict receipt against the immutable ledger, or fetch the authoritative receipt for an `audit_id`. Every mismatch is named individually. Read-only. |

### Claimed provenance and the receipt

Both propose tools accept an `agent` block — `{kind, model, tool, prompt}`. It is recorded on the ledger
under `claimed: true` and **never verified**: Sentinel cannot check that the caller really is the model it
says it is, and a provenance field that read as verified would be worse than none, because it would be
believed. The prompt itself is **hashed, never stored** — the ledger is append-only and immutable, which is
the wrong place to put a client's briefing material, while the digest still ties a verdict to the exact
instruction that produced it once that instruction is produced.

Every adjudication returns a **receipt** anchored on its audit row's own hash-chain entry (`ledger_hash`),
not on a digest this code invents. That makes it checkable against a ledger that is truncate-proof at the
database core: `sentinel_verify_receipt`, or `POST /receipt/:key/verify`.

Document mutation is deliberately **not** exposed: creating, editing, binding, transitioning, publishing and
deliverable writes stay in the web app's review-before-save flow. The MCP surface can inspect and reason, not
change.

## The AI boundary (v1.2)

Every `tools/call` answer, and every error, goes through one choke point (`toolResult` in `mcp-server.mjs`). The
tool code itself is unchanged; this layer exists because tool output is people's text (parameter values, names, BCF
comments, documents), and text can carry an instruction.

- **Fenced.** The answer starts with a one-line notice: everything after it is data, not instructions.
- **Cleaned.** In every value and key, invisible characters are stripped: controls (tab, CR and LF kept), bidi marks
  and overrides, zero-width characters, and the Unicode tag block.
- **No local paths.** A local file path (`C:\…`, `\\server\…`, `/home/…`) becomes its file name. URLs pass through.
- **No bulk geometry.** An array of more than 64 numbers, flat or nested (a mesh, a point cloud), is replaced by
  `{ withheld: "N numbers …" }`. A placement point or a wall's two ends still pass.

CI enforces the rest through `bridge/ai-boundary.test.mjs`. It fails if:
- an MCP tool, or one of its inputs, is named like a code runner (exec, eval, code, script, shell, compile);
- the bridge uses `eval`, `new Function` or `node:vm`;
- the Revit add-in references a C# scripting or compiler API.

The fence raises the bar against prompt injection; it is not a complete defence. Model writes still go only through
staged changesets that a person ticks in Revit.

## Run / register

The server talks to the local bridge over HTTP (`BCF_BASE`, default `http://127.0.0.1:4100`), so the bridge
must be running (`npm run bcf:serve`). Then either run it directly (`npm run mcp:serve`) or register it with an
MCP client:

```jsonc
// e.g. Claude Desktop's claude_desktop_config.json
{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["<abs-path>/sentinel-project/WebApp/bridge/mcp-server.mjs"],
      "env": { "BCF_BASE": "http://127.0.0.1:4100" }
    }
  }
}
```

## `sentinel_propose` shapes

- **elements** — the `ElementProperties` shape:
  ```json
  { "identity": { "Class": "IFCWALL", "GlobalId": "3xY…", "Name": "Basic Wall:200mm" },
    "psets": [{ "name": "Pset_WallCommon", "rows": [{ "name": "FireRating", "value": "REI60" }] }],
    "quantities": [] }
  ```
- **ids** — a JSON IDS spec (raw `.ids` XML is parsed browser-side only; pass JSON to the server):
  ```json
  { "title": "Walls need a fire rating",
    "specifications": [{ "name": "FireRating on walls",
      "applicability": { "entity": "IFCWALL" },
      "requirements": { "properties": [{ "pset": "Pset_WallCommon", "name": "FireRating", "cardinality": "required" }], "attributes": [] } }] }
  ```
- Omit `ids` to just **record** the proposal (verdict `recorded`).

The verdict comes from the SAME pure `sentinel-core` validators the browser uses (bundled to
`bridge/sentinel-core.mjs` via `npm run build:bridge-core`) — one governed core, deterministic everywhere.
