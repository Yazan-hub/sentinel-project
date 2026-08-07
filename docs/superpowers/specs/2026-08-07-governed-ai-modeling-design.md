# Governed AI modeling — design

**Post-roadmap feature A** (from `docs/research/2026-08-07-ai-revit-showcase-analysis.md`), the
flagship counter to the ungoverned Claude-to-Revit generation wave: any agent may PROPOSE model
elements; **nothing enters the Revit model without deterministic adjudication and a human tick in
Revit**, and the whole thread — proposal, verdicts, human decision, created element ids — lands in
the hash-chained audit trail.

## Context and prior art (all merged, all reused)

- **GhostBuilder** (`SentinelAddin/GhostBuilder/`) already places walls, floors, levels, grids and
  auto-provisions types from LLM output, in one transaction, with the mandatory
  ExternalEvent thread pattern ("Revit API writes must NEVER run from Task.Run").
- **GhostReviewWindow** is an existing pre-write tick-list (checkbox per row, only ticked rows
  build). Its pre-tick is a local confidence heuristic — this feature replaces that gate, for the
  agent path, with the referee's verdict.
- **`POST /cde/:key/propose`** already adjudicates `ElementProperties` against IDS
  (sentinel-core), per-element failures tagged by GlobalId — but it is validate-and-forget.
- **`bridge_docs`** (generic JSONB store, `store` + `project_id` + `doc_id` unique) already backs
  clash/RFI/tender/pack — the natural changeset store.
- Nothing flows bridge→Revit today; the add-in's only inbound machinery is SSE topic display.

The feature is the WIRING: staged changesets between the existing adjudicator and the existing
placer, with the existing review-window pattern showing referee verdicts instead of heuristics.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| v1 vocabulary | Walls, floors, levels, grids (+ auto-provisioned types) | Exactly what GhostBuilder places today — zero new placement code; the feature is governance wiring |
| Delivery into Revit | Ribbon button "Review AI proposals" (pull) | No threading surprises; user controls when to engage. SSE badge is a later nicety |
| Changeset content | Immutable after propose | The add-in must only ever execute what was adjudicated; agents withdraw + re-propose to change |
| Element shape | Validate-shape AND place-shape side by side | Both already exist (`ElementProperties`, `GhostElement`); inventing a third or merging them couples IDS to geometry |
| Sub-projects | A1 bridge+MCP (merge alone), then A2 add-in | A1 is fully testable without Revit; A2 needs deploy cycles. One contract, two plans |
| Web UI | None in v1 | The review surface is Revit, where the geometry is. API+MCP suffice; a web strip is YAGNI until asked |

## The changeset contract (the load-bearing artifact)

```jsonc
// bridge_docs row: store="changeset", project_id=<uuid>, doc_id=<changeset id>
{
  "id": "<uuid>",                        // doc_id
  "name": "Level 2 core walls",          // agent-supplied, human-readable
  "source": "<agent self-label>",        // display only; actor below is the verified identity
  "actor": "<resolveActor at propose>",
  "status": "proposed",                  // proposed | applied | partially_applied | declined | withdrawn
  "created_at": "<iso>", "updated_at": "<iso>",
  "adjudication": {                      // verbatim summary of the propose-time IDS run
    "verdict": "accepted|rejected|recorded",
    "summary": { /* sentinel-core aggregate */ },
    "ids_source": "server|client|none"   // SENTINEL_IDS server-spec override is honest here
  },
  "elements": [{
    "proposal_guid": "<uuid>",           // the thread key: verdicts, ticks and results all reference it
    "kind": "wall|floor|level|grid",
    "verdict": { "status": "accepted|rejected|recorded", "failures": [ /* per-element sentinel-core failures */ ] },
    "validate": { /* ElementProperties: identity{Class,GlobalId,Name,PredefinedType}, psets[], quantities[] */ },
    "place": { /* GhostElement fields: TypeName, LevelName, LocationCurve|LocationPoint|LocationLoop, BaseElevation, TopElevation, ... */ }
  }],
  "result": {                            // null until the add-in reports
    "applied": [{ "proposal_guid": "…", "revit_element_id": 123456, "revit_unique_id": "…" }],
    "rejected": ["<proposal_guid>", …],  // unticked by the human
    "note": "<free text from the reviewer>",
    "reported_at": "<iso>", "reported_by": "<resolveActor at result>"
  }
}
```

- `validate.identity.GlobalId` may be synthetic at propose time (the element does not exist yet);
  `proposal_guid` is the identity that survives into the result mapping. The result's
  `revit_element_id`/`revit_unique_id` are the golden thread to the real model.
- Geometry units: millimetres and project-internal coordinates, documented in the MCP tool
  description (GhostBuilder's existing convention).

## Lifecycle

```
agent → POST /changesets/:key ──► proposed ──(human ticks in Revit)──► applied
                                     │                                  or partially_applied
                                     │                                  or declined (0 ticked, or txn rolled back)
                                     └──(agent) POST …/withdraw ──► withdrawn
```

- Status transitions are the ONLY mutations after propose; each is audited
  (`changeset_proposed`, `changeset_applied`, `changeset_withdrawn`) with `resolveActor`.
- `result` may be written exactly once (a second report is a 409). Withdraw is legal only from
  `proposed` (409 otherwise). The add-in must skip changesets whose status is no longer
  `proposed` at execution time (re-fetch before the transaction).
- A transaction failure in Revit rolls back the WHOLE changeset and reports `declined` with the
  exception note — never a silent partial (`partially_applied` means "human unticked some", never
  "some failed silently").

## A1 — bridge + MCP

**`WebApp/bridge/changesets-logic.mjs`** (new, pure): `validateChangeset(body)` — name required;
elements non-empty array, ≤ `MAX_CHANGESET_ELEMENTS` (200); every element's `kind` in the v1
vocabulary; place-shape sanity per kind (finite numbers; walls/grids need a two-point
`LocationCurve`; floors a closed `LocationLoop`; levels a numeric `BaseElevation`); validate-shape
minimally an `identity.Class`. Assigns `proposal_guid`s. Throws 400 naming the element index and
field. Pure status/transition helpers (`canWithdraw`, `deriveResultStatus(applied, rejected,
total)`).

**`WebApp/bridge/changesets-store.mjs`** (new): `proposeChangeset(key, body, actor)` — validate →
run the EXISTING adjudication path over the validate-shapes (same call `/propose` uses, honouring
the `SENTINEL_IDS` server override; no IDS configured → `recorded`, stated in
`adjudication.ids_source`) → attach per-element verdicts (sentinel-core failures grouped by the
synthetic GlobalId → mapped to `proposal_guid`) → `docInsert(store:"changeset")` → audit.
`listChangesets(key, {status})`, `getChangeset(key, id)`, `reportResult(key, id, body, actor)`
(409 on double-report or non-proposed status; derives applied/partially_applied/declined),
`withdrawChangeset(key, id, actor)`. All writes audited; reads write nothing.

**Routes** (`bcf-service.mjs`, new `/changesets` family):
`POST /changesets/:key` · `GET /changesets/:key?status=` · `GET /changesets/:key/:id` ·
`POST /changesets/:key/:id/result` · `POST /changesets/:key/:id/withdraw`.

**MCP** (`mcp-server.mjs`): `sentinel_propose_changeset` — description states the referee model
plainly: "Proposes model elements for HUMAN review in Revit. Nothing is created by this call;
elements are adjudicated against the project's IDS and staged. A person ticks each element in
Revit before anything enters the model." Units/coordinates documented. `sentinel_changeset_status`
— poll one changeset (or list by status). Both read the same routes; the propose tool is the ONE
governed write the MCP surface gains, and what it writes is a proposal, not model data.

## A2 — add-in

- **Ribbon**: "Review AI proposals" button (existing `Push` helper, `App.cs`), enabled when
  `BcfConfig` is configured.
- **Fetch**: `GET /changesets/:key?status=proposed` via the `GovernedQuery` blocking-read pattern
  (4s timeout, never throws); empty → TaskDialog "No pending proposals."
- **Review window**: `GhostReviewWindow` pattern (code-only WPF): header = changeset name, source,
  adjudication verdict + ids_source; one row per element: kind, name, type, level, verdict badge
  (accepted ✓ / rejected ✗ with failure list in tooltip / recorded —). Pre-ticked ONLY when the
  element verdict is `accepted`; `rejected` rows CAN be ticked (the human may overrule with eyes
  open — the result records that they did) but start unticked with a red badge; `recorded` rows
  start unticked with an honest "no spec to adjudicate against" note.
- **Execute**: ticked rows → existing GhostBuilder placement (DatumBuilder/MassingBuilder etc.)
  via ExternalEvent, ONE transaction named `"Sentinel AI changeset: <name>"`. Re-fetch status
  before starting (skip if no longer `proposed`). Collect `ElementId`/`UniqueId` per placed
  element.
- **Report**: `POST …/result` with the applied mapping + unticked guids + optional reviewer note
  (GovernedNotify fire-and-forget pattern is NOT enough here — result must confirm; use the
  blocking `GovHttp` pattern with a clear TaskDialog on failure and a retry).
- Transaction failure → RollBack + report `declined` with the exception message.

## Error handling

- Unknown project → 404 (`ensureProject`); malformed changeset → 400 naming element index/field;
  over element cap → 413; double result / withdraw-after-decision / result-on-withdrawn → 409
  with the current status in the message.
- Adjudication engine throwing (bad IDS json) → 502 from propose, nothing stored (a changeset
  must never exist without its verdicts).
- Add-in fetch failures → TaskDialog, never silent; result-report failure → retry dialog, and the
  changeset stays visibly un-reported (the bridge status is the truth; the add-in shows what the
  bridge says, not local state).
- An agent proposing kinds outside the vocabulary gets the 400 naming the allowed set — the MCP
  description lists it too.

## Testing

A1 unit: `validateChangeset` per-kind geometry rules + index-naming errors; lifecycle helpers;
store with mocked `sb`/adjudicator — verdict attachment (failures grouped to the right
`proposal_guid`), double-report 409, withdraw rules, result-status derivation (all ticked →
applied; some → partially_applied; none → declined). MCP: tool schemas + dispatch with fake fetch.
A1 live: propose (with and without IDS configured — `ids_source` honest), list/get, withdraw,
result, read-only proof on GETs, audit thread shows propose→result with verified actors.

A2: C# build clean; live end-to-end on a scratch Revit model — MCP propose (walls+level+grid) →
ribbon → tick subset → elements exist in Revit with the reported ids → bridge status
`partially_applied` → audit chain complete. Rejected-but-ticked overrule recorded. Transaction
failure path (e.g. duplicate level elevation) → declined + note.

## Verification

1. A1: `npx vitest run` + build clean; live checks above with real output pasted (baseline 425).
2. A2: add-in deployed (user closes Revit), end-to-end run on the pilot model, evidence pasted.
3. Read-only proof on all GET surfaces; every write's audit row carries a `resolveActor` identity.
4. The external-user script gains Part H (agent proposes → human governs in Revit) once A2 ships.
