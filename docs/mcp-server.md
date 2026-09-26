# Sentinel MCP server — the governed graph as an agent tool

`WebApp/bridge/mcp-server.mjs` exposes the **referee layer** to AI agents / MCP clients over stdio JSON-RPC
(zero-dependency). It's the "propose API" as an agent surface: let a generator or agent PROPOSE, and Sentinel
adjudicates deterministically (IDS validation) and records the verdict immutably — plus a read-only window
onto the document-governance layer (BEP/EIR documents, compliance, deliverables, AI integrity).

## Tools

| Tool | What it does |
|---|---|
| `sentinel_list_projects` | List the governed CDE projects. |
| `sentinel_propose` | Validate proposed elements against an IDS (buildingSMART Information Delivery Specification); returns **accepted / rejected** with per-requirement reasons and records the verdict in the hash-chained audit trail. The referee judges by the project's installed IDS artefact; `sentinel_propose` needs no `ids` argument when one is installed. |
| `sentinel_audit` | Read a project's ledger (proposals, verdicts, clashes, gate rows, ISO 19650 state transitions) newest first as `{rows, total, limit, offset}` — `total` is exact, so fewer rows than `total` means there is more. Filters: `entity_type`, `action_prefix`, `entity_id`, `actor`, `since`, `until`; `limit` (default 50, at most 1000) and `offset`. The hash chain is one chain across all projects; this read does not recompute it. Read-only. |
| `sentinel_list_documents` | List a project's governed BIM documents (BEP, EIR): id, title, type, status. Read-only. |
| `sentinel_get_document` | Read one document with its sections; pass `section` (id or exact heading) to fetch just that section. Read-only. |
| `sentinel_compliance_report` | A document's bound governance checks evaluated against live project data — **deterministic facts** (met / violations with evidence / not_checkable with the reason), computed by code, not AI. Read-only. |
| `sentinel_deliverables_status` | The MIDP/TIDP tracker: every planned deliverable classified delivered / late / in_wip / overdue / pending / unscheduled, derived at read time. Read-only. |
| `sentinel_list_checks` | The check registry: real checks plus **planned** ones Sentinel honestly cannot evaluate yet (with reasons). |
| `sentinel_doc_integrity` | AI analysis of a document against the project's configured reality. Findings are **AI suggestions gated to cited facts** — never compliance facts; uncited findings are dropped and counted. Slow (minutes on a local model); needs the AI provider running. Read-only. |
| `sentinel_propose_changeset` | Stage model elements (v1 vocabulary: wall, floor, level, grid) for human review in Revit — nothing is created by this call; a person ticks each element in Revit before anything enters the model. |
| `sentinel_changeset_status` | Check a staged changeset by `changeset` (id) or list by `status`. Read-only. |
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
