// Sentinel MCP server — zero-dependency, stdio JSON-RPC. Exposes the governed-graph "referee" to AI agents
// and MCP clients: list the CDE projects, PROPOSE elements for deterministic IDS / ISO 19650 adjudication
// (accepted/rejected + reasons, recorded immutably), read the hash-chained audit trail — and, read-only,
// the document-governance layer: BEP/EIR documents, their deterministic compliance results, the MIDP
// deliverables status, the check registry, and the gated AI integrity analysis. Talks to the local bridge
// over HTTP (BCF_BASE, default http://127.0.0.1:4100).
//
// Register (e.g. Claude Desktop / any MCP client):
//   { "mcpServers": { "sentinel": { "command": "node", "args": ["<abs>/WebApp/bridge/mcp-server.mjs"] } } }
//
// TOOLS and callTool are exported for unit tests (injected fetch via deps); the readline server only
// starts when this file is the entry module, so importing it from a test is side-effect-free.
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./load-env.mjs";
import { ADDIN_SOURCES } from "./changesets-logic.mjs";
import { loaBand, LOA_SPEC } from "./sentinel-core.mjs";

// Merge config/.env without mutating process.env (the ai-gateway/cde-store idiom): importing this
// module from a test must not copy secrets into the test runner's environment.
const env = { ...process.env, ...loadEnv() };

const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const BRIDGE_TOKEN = env.BCF_TOKEN || "";
const authHeaders = BRIDGE_TOKEN ? { Authorization: `Bearer ${BRIDGE_TOKEN}` } : {};
const PROTO = "2024-11-05";
const enc = encodeURIComponent;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const asText = (o) => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });

/** MA-6-1: the standards an agent may read (sentinel_standards). */
const STANDARD_KINDS = ["guideline", "type_catalog", "ids", "lod_matrix"];

export const TOOLS = [
  { name: "sentinel_list_projects", description: "List the governed CDE projects (id, key, name).", inputSchema: { type: "object", properties: {} } },
  {
    name: "sentinel_propose",
    description: "Propose elements to the governed layer. They're validated against an IDS (buildingSMART Information Delivery Specification) and the verdict — accepted / rejected (with per-requirement reasons) — is recorded in the project's immutable, hash-chained audit trail. The response carries a RECEIPT anchored on that ledger entry's chain hash, which anyone can re-check with sentinel_verify_receipt. Use to answer 'are these elements / is this model compliant?'.",
    inputSchema: {
      type: "object", required: ["project", "elements"],
      properties: {
        project: { type: "string", description: "the project key" },
        source: { type: "string", description: "who/what is proposing (agent or tool name)" },
        ids: { description: "an IDS spec as JSON {title, specifications:[{name, applicability:{entity}, requirements:{properties:[{pset,name,cardinality}], attributes:[…]}}]}. Omit to just record the proposal. (Raw .ids XML is parsed browser-side only — pass JSON here.)" },
        elements: { type: "array", description: "elements in the ElementProperties shape: {identity:{Class:'IFCWALL', GlobalId, Name?}, psets:[{name:'Pset_WallCommon', rows:[{name:'FireRating', value:'REI60'}]}], quantities:[…]}" },
        agent: { type: "object", description: "CLAIMED provenance, recorded on the ledger and never verified by Sentinel: {kind:'agent'|'human', model, tool, prompt}. The prompt is HASHED, never stored — supply it (or a prompt_sha256) so the verdict can later be tied to the exact instruction that produced the elements." },
        note: { type: "string" },
      },
    },
  },
  { name: "sentinel_audit", description: "Read a project's ledger (audit_log: proposals, verdicts, clashes, gate rows, ISO 19650 state transitions), newest first, as {rows, total, limit, offset} — total is the exact count of matching rows, so fewer rows than total means there is more to page through with offset. Filters: entity_type, action_prefix (e.g. \"verdict:\", \"state:\"), entity_id (a uuid or a comma list), actor, since, until. limit defaults to 50, at most 1000. The hash chain is one chain across all projects and is not recomputed by this read.", inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, entity_type: { type: "string" }, action_prefix: { type: "string" }, entity_id: { type: "string" }, actor: { type: "string" }, since: { type: "string" }, until: { type: "string" } } } },

  // ── Document governance (read-only): BEP/EIR documents, compliance, deliverables, checks, integrity ──
  {
    name: "sentinel_list_documents",
    description: "List a project's governed BIM documents (BEP, EIR): id, title, doc_type, status (wip/shared/published/archived). Read-only.",
    inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string", description: "the project key" } } },
  },
  {
    name: "sentinel_get_document",
    description: "Read one governed BIM document with its sections (heading, body, state, owner, check bindings). Pass `section` (a section id or exact heading) to return only that section — use it to avoid pulling a whole BEP when you need one part. Read-only.",
    inputSchema: {
      type: "object", required: ["project", "document"],
      properties: {
        project: { type: "string", description: "the project key" },
        document: { type: "string", description: "the document id (from sentinel_list_documents)" },
        section: { type: "string", description: "optional: a section id or exact heading — returns only that section" },
      },
    },
  },
  {
    name: "sentinel_compliance_report",
    description: "Run a document's compliance report: every section's bound governance checks evaluated against live project data. Results are DETERMINISTIC FACTS (met / violations with evidence / not_checkable with an honest reason) — computed by code, not AI. Read-only; writes nothing.",
    inputSchema: { type: "object", required: ["project", "document"], properties: { project: { type: "string" }, document: { type: "string" } } },
  },
  {
    name: "sentinel_deliverables_status",
    description: "The MIDP/TIDP deliverables tracker: every planned deliverable classified as delivered / late / in_wip (arrived but never published) / overdue / pending / unscheduled, derived at read time from what actually arrived in the CDE. Includes per-row dates and a summary. Read-only.",
    inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" } } },
  },
  {
    name: "sentinel_list_checks",
    description: "List the governance check registry: real checks (bindable, evaluated deterministically) and PLANNED checks (topics Sentinel honestly cannot evaluate yet, with the reason). Use to know what compliance can and cannot measure.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sentinel_doc_integrity",
    description: "AI integrity analysis: reads a document against the project's configured reality (naming ruleset, checks, deliverables) and reports contradictions. Findings are AI SUGGESTIONS gated to cited grounded facts — not compliance facts; uncited findings are dropped and counted. SLOW: may take minutes on a local model, and requires the AI provider (e.g. Ollama) to be running. Read-only; writes nothing.",
    inputSchema: {
      type: "object", required: ["project", "document"],
      properties: {
        project: { type: "string" }, document: { type: "string" },
        provider: { type: "string", description: "optional AI provider id (default: local Ollama)" },
        model: { type: "string", description: "optional model name" },
      },
    },
  },

  // ── Governed AI modeling: staged element changesets (propose → human ticks in Revit → result) ──
  {
    name: "sentinel_propose_changeset",
    description:
      "Propose model elements for human review in Revit. Nothing is created by this call: elements are adjudicated against the project's IDS (verdicts attached per element) and STAGED; a person reviews and ticks each element inside Revit before anything enters the model, and the result (created element ids or rejection) is recorded in the audit trail. Element kinds: wall, floor, level, grid, roof, ceiling, door, window, column, furniture, room, opening, beam, mass. Geometry in millimetres, project-internal coordinates: walls/grids need place.LocationCurve {start:[x,y,z], end:[x,y,z]} (an arc wall adds mid:[x,y,z], a point on its arc); floors place.LocationLoop [[x,y,z]×≥3]; levels place.BaseElevation; roofs and ceilings place.LevelName and place.Boundary, one simple closed outline [[x,y]×3–256] (a roof is flat unless it sends place.Slopes — one entry per Boundary edge, Slopes[i] for the edge Boundary[i]→[i+1] (a closing point is no edge), null where the edge defines no slope (a gable), else its pitch in degrees above 0 and at most 75; optional place.BaseOffset; a ceiling needs place.Offset, its height above the level); doors and windows place.FamilyName, place.LevelName and place.Location [x,y,z], a point on the location line of exactly one wall of that level, z = the level's elevation (a window: optional place.SillHeight; both: optional place.FlipFacing, place.FlipHand — or, for an opening read from a drawn block, place.Rotation, the plan angle in degrees (0 up to 360) of the block's X axis, with optional place.Mirrored: the add-in then flips the instance to that hinge side and swing side, and neither flip may be sent with it); columns and furniture place.FamilyName, place.LevelName and place.Location [x,y,z], unhosted on that level, z = the level's elevation (a column may name place.TopLevel, the level its top reaches); rooms place.LevelName, place.Location [x,y,z] (a point inside its walls: Revit finds the boundary there, and Apply refuses a room the walls do not close, one where a room already stands, or two in one enclosed area), place.Name and optional place.Number (one line each; no type, no family, no Mark); openings (no type, no family, no Mark) place.LevelName and exactly one shape: a rectangle cut in a wall — place.Location [x,y,z], its middle on the location line of exactly one wall of that level, z = the level's elevation, the rectangle within that wall's ends, bottom and top, with place.Width and place.Height (mm, above 50 and at most 20000) and place.SillHeight (its bottom above the level, 0 to 20000 mm) — or a hole in a floor of that level (a stair void): place.Boundary, one simple closed outline [[x,y]×3–256], inside exactly one floor and reaching no other; beams place.LocationCurve {start:[x,y,z], end:[x,y,z]} (straight, no mid; z = the beam's top), place.LevelName and place.FamilyName with place.TypeName (a Structural Framing type), or facts; masses (no type, no family, no Mark, no level) place.Boundary, one simple closed outline [[x,y]×3–256] (its footprint), with place.BaseElevation and place.TopElevation (mm, in the levels' elevation frame, as a level's place.BaseElevation; the top 100 to 1000000 mm above the base) — a DirectShape in Mass (Generic Models where Revit refuses Mass, said on the result) that Shell a Mass in Revit turns into typed walls, a floor per storey and a roof, one storey per level. Every kind but a level, grid, room, opening or mass also needs place.TypeName, the exact name of a type already loaded in the model — Sentinel never takes the model's first type, loads no families and creates no types — or, on a project whose guideline and type catalogue are installed, leaves TypeName out and sends facts {thickness_mm?, params?: {Function?, Location?, Material?, …}}: the bridge then types the element by the office's layer-free rules from exactly those facts (never measured, never guessed), fills place.TypeName (and a door's, window's, column's, furniture's or beam's FamilyName: send none of your own then) with a type the catalogue holds, records who typed it and from what in `typing`, and otherwise answers 400 naming what is missing (no guideline or catalogue installed, no rule for those facts, no thickness for a {thickness} type, a type the catalogue lacks and the sizes it has); an element the bridge typed is never pre-ticked. Any create may carry place.Mark; a floor may carry place.Structural (true/false). Each element: {kind, validate:{identity:{Class, Name}, psets:[]}, place:{...}}. Optional op (default create), with none of a create's place fields (no LocationCurve, Location, Boundary, Mark or Structural — a retype keeps the element's own Mark): retype changes an EXISTING wall, floor, roof, ceiling, door or window named by target:{unique_id: its Revit UniqueId, type_before?} to place.TypeName — or, with facts, to the type the bridge resolves (a door or window also needs place.FamilyName: it keeps its host); attach re-tops an existing wall (place.BaseLevel and place.TopLevel, two different level names); one of each per element. A rehost (a door or window no wall hosts, replaced by the office type in the one wall it stands in, the old instance removed) is a signed-in member's, filed by Promote in Revit — the bridge refuses one from this tool. set_parameter writes one value on an existing TYPE named by target:{unique_id} with place.TypeName (and a door's or window's place.FamilyName): parameter \"Pset_Name.Property\" (the kind's own common set), revit_parameter?, from (the value read on the type: \"\" — set_parameter fills an empty value only, and Revit refuses the write when the type reads anything else), to, and value_source {kind: catalogue | clause}; the bridge checks the value against the installed type catalogue's row of exactly that type, or the one value the installed ids@n's whole-class clauses pin (a clause that sets a minimum pins none), refuses it when the other source disagrees, and refuses anything else (a person types their own value in Revit); it builds the element's validate itself from kind, parameter and to; one per type and parameter, never pre-ticked. An optional reason (≤500 characters) is shown to the reviewer. Trust: the bridge sets pretick, accuracy, confidence, typing, claimed and proposal_guid itself — a posted one is ignored and listed back in the reply's `ignored` as \"ignored: set by the bridge\", as is a `measured` block (no survey job backs it). An agent's element is never pre-ticked, and its accuracy is not_measured. validate.identity.Class is still required: send the kind's class (wall IFCWALL, floor IFCSLAB, level IFCBUILDINGSTOREY, …) — the bridge sets it from the kind, so any other class, a subtype included, is replaced and listed as \"ignored: set by the bridge from kind\". Building a model: file one changeset per storey (each is one Undo in Revit; a storey whose levels do not exist yet cannot be applied); create your own levels, uniquely named, in the first storey's changeset; give walls place.BaseLevel and place.TopLevel; send facts (thickness_mm, params.Location), not TypeName, to have the bridge type an element — read sentinel_standards (guideline, type_catalog) first.",
    inputSchema: {
      type: "object", required: ["project", "name", "elements"],
      properties: {
        project: { type: "string", description: "the project key" },
        name: { type: "string", description: "human-readable changeset name (shown to the reviewer in Revit)" },
        source: { type: "string", description: "agent self-label (a claim: recorded, never verified). dwg, promote and photo are the Revit add-in's own sources — a changeset labelled with one is filed as \"agent\"." },
        elements: { type: "array", description: "the proposed elements (see tool description for the shape)" },
        agent: { type: "object", description: "CLAIMED provenance, recorded on the ledger and never verified by Sentinel: {kind:'agent'|'human', model, tool, prompt}. The prompt is HASHED, never stored — supply it (or a prompt_sha256) so the verdict can later be tied to the exact instruction that produced the elements." },
      },
    },
  },
  {
    name: "sentinel_verify_receipt",
    description: "Check a verdict receipt against the immutable ledger. Pass the whole `receipt` object returned by sentinel_propose, or just an `audit_id` to fetch the authoritative one. Returns {matches, reasons[], ledger} — every mismatch is named, because 'this receipt is forged' and 'this receipt is for a different verdict' are different answers. Read-only.",
    inputSchema: {
      type: "object", required: ["project"],
      properties: {
        project: { type: "string", description: "the project key" },
        receipt: { type: "object", description: "a receipt to check against the ledger" },
        audit_id: { type: "number", description: "instead of a receipt: fetch the authoritative receipt for this ledger entry" },
      },
    },
  },
  {
    name: "sentinel_changeset_status",
    description: "Check staged changesets: pass `changeset` (id) for one, or `status` (proposed|applied|partially_applied|declined|withdrawn) to list. If both `changeset` and `status` are passed, `changeset` wins. Shows per-element verdicts and, once a human reviewed in Revit, the created element ids. An Undo in Revit leaves a changeset applied, so each one carries `undone`: {ledger_id, at, guids: how many elements the Undo removed} when its newest changeset_reverted ledger row is an Undo, null when there is none or it was redone, {unknown: why} when the ledger was not read (never a guess). Once Revit reports its re-read, result.as_built judges each placed wall, floor, roof, ceiling, door, window, column and beam against the installed ids@n (only the verdict is stored, not the values): per element a verdict of passes, fails (with its failures), not read (a requirement Sentinel has no Revit reader for: never passed, never failed), not in scope, or exported as another class (not judged) — or a why (not kept, no read); the counts judged, passed, failed, not_read and not_judged count each element once, and other kinds are counted under out_of_scope. With no IDS installed it says why and judges none; reported with the machine credential it is only {why, reported_role}. MA-8-5: a survey changeset measured against the scan also carries `measured`: {ledger_id, at, status, error?, reference, claimed, counts, loa_spec, elements: [{proposal_guid, cid, kind, status, p95_mm, reference, loa, loa_why?}]} from its newest verify:measured row (null when never measured, {unknown: why} when the ledger was not read). `loa` is the USIBD Level of Accuracy band of a measured wall, computed when read from its p95 (relative to the admitted scan, in the lead's frame — not survey control; `loa_spec` names the spec table read); null with `loa_why` means no band — insufficient data, missing, not measured, not a wall, or the LOA table has not yet been read from the USIBD specification (then every wall says so). `measured.status` other than done: the run did not finish (failed or refused), `error` says why, `elements` is [] and no element was measured — an earlier done run is not shown. A band whose `reference` is \"revit (claimed)\" (or an element's, on a mixed run) rests on the add-in's re-read at Apply, not on the changeset's own geometry (\"as filed\"). Read-only.",
    inputSchema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string" }, changeset: { type: "string" }, status: { type: "string" } },
    },
  },
  {
    name: "sentinel_build_status",
    description: "Read a project's survey jobs (MA-4c: sentinel-survey, run by the bridge on this PC over the evidence pack's admitted LAS, LAZ and E57 scans). Pass `job` (e.g. job-0001) for one job with its candidates — untyped geometry {cid, kind: level|wall|floor|ceiling|door|window, geometry, measured, evidence[], fit} in millimetres in the scan's own frame — and its receipt; omit it for the newest jobs first: status (queued, running, done, failed, refused), stage, pct, the scans read (ids, sha256), the scans refused with why, and once ended the build:run ledger row. Candidates carry no type and propose nothing (typing and changesets are MA-4d); LOD 200 as found, never survey grade. MA-5a-3: a drawing job (reader sentinel-drawing, over the pack's admitted vector PDF plans; page 1) holds walls (paired faces in the page's heaviest line weight) and doors (swing arcs, with any W x H tag in tag_width_mm/tag_height_mm) in PAPER millimetres from the page's bottom-left (geometry.units paper_mm, no scale) — they are proposed with a 2-point alignment, MA-5a-4. MA-6-8: an IFC job (reader sentinel-ifc, run inside the bridge over the newest admitted .ifc model, or the one named by `item`; with no `item` the newest model of any provider; a third party's carries its provider and licence) holds level, wall (a curtain wall is a wall flagged `curtain`), floor, opening, door, window and column candidates in model millimetres (0.2.0; cid = the IFC GlobalId; receipt.not_read lists what the reader left out, by GlobalId, with why, and receipt.not_read_by_class counts it by IFC class; a stair is listed there with its box) - they are proposed with the lead's frame (ifc-planner), never pre-ticked. Read-only: no tool starts a job — a contributor starts it on the web (Files ▸ Evidence ▸ Run survey, or Read drawings).",
    inputSchema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string", description: "the project key" }, job: { type: "string", description: "optional: a job id (job-NNNN) — that job with its candidates" } },
    },
  },
  // MA-8-1 (C11): how much of what was filed a person changed, per run.
  {
    name: "sentinel_edit_cost",
    description: "Read a project's edit cost per run (a survey, drawing or IFC job, else one changeset): ghosts filed, declined on the web, declined before (carried from an earlier changeset, left out of the share), not applied in Revit (unticked, or removed at commit), applied, undone (an Undo in Revit), kept, pending, withdrawn (ghosts of withdrawn changesets, not in the share), and share_changed = (web + not applied + undone) / (filed - pending - carried), null when nothing is decided. Computed at read time from the changesets and their changeset_reverted rows; every run says its ceiling: edits made after Apply, other than an Undo in Revit, are not seen. Read-only: publishing a run's numbers is a lead's, on the web desk.",
    inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string", description: "the project key" } } },
  },
  // MA-6-1: an agent reads what judges it — the LOD line and the standards in force — before it proposes.
  {
    name: "sentinel_lod_state",
    description: "Read a project's judged LOD state line, the same line the web's Next strip and Revit's pane print: {lod_state: {line, share, at, ledger}} from the newest lod_state ledger row (Revit's count, claimed). It reads \"not measured\" until Promote (DD) or a reviewed Apply in Revit records a lod_state row, or when the lod_matrix in force is not the one that row was measured against; null for an office. Read-only.",
    inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string", description: "the project key" } } },
  },
  {
    name: "sentinel_standards",
    description: "Read a standard in force for a project (its own, else its office's — what every judge reads). kind: guideline (the office's typing rules: which type a wall, floor, … of given facts gets), type_catalog (the types the office models with), ids (the installed ids@n proposals are judged against), lod_matrix (the DD stage IDS made from the LOD matrix in force). type_catalog takes category (Walls, Floors, Roofs, Ceilings, Doors, Windows, Columns, Furniture, Structural Framing — a beam's) and returns that category's rows whole — family, type, width_mm, height_mm and params (e.g. Fire Rating); without category it returns the category names with their counts. Read the guideline and the catalogue before proposing, so the facts you send type to a type the IDS passes. A standard not installed is an error in words. Read-only.",
    inputSchema: {
      type: "object", required: ["project", "kind"],
      properties: {
        project: { type: "string", description: "the project key" },
        kind: { type: "string", enum: STANDARD_KINDS },
        category: { type: "string", description: "type_catalog only: the Revit category whose rows to return (e.g. Walls); omit for the category names with counts" },
      },
    },
  },

  // ── Ask the open Sentinel app over the platform's channel (roadmap item 4; bridge/ask-sentinel.mjs) ──
  {
    name: "sentinel_ask_app",
    description: "Ask the open Sentinel app: a signed-in Sentinel tab in the platform project (THATOPEN_PROJECT_ID), under the same That Open account as this server's token, answers over the platform's channel with its own sessions. Read-only, two commands: sentinel.status (app version, projects, signed in, bridge reachable — presence only, never a verdict) and sentinel.deliveries {name?, limit ≤ 20} (per IFC: the platform's hint, its failures, the run id, and the ledger line — 'ledger #N', 'not on this project's ledger yet' or 'ledger not read — why'; when the hint and the ledger row disagree both are given). When Sentinel is not open (the answer says 'Sentinel is not open (and joined) … — not answered') or no reply comes, do not guess: use sentinel_audit with entity_type platform_gate, which answers from the bridge without the app.",
    inputSchema: {
      type: "object", required: ["type"],
      properties: {
        type: { type: "string", enum: ["sentinel.status", "sentinel.deliveries"] },
        payload: { type: "object", description: "for sentinel.deliveries: {name?: one IFC file name, limit?: at most 20}; omit for sentinel.status" },
        app_id: { type: "string", description: "the published Sentinel app's id (WebApp/.thatopen appId); omit to ask the local dev app (thatopen serve)" },
      },
    },
  },
];

/** Return a copy of the doc holding only the section matching `sel` (id first, then exact heading).
 *  Throws listing the available sections when nothing matches, so an agent can self-correct. */
export function filterSection(doc, sel) {
  const sections = doc?.sections || [];
  const hit = sections.find((s) => s.id === sel) || sections.find((s) => s.heading === sel);
  if (!hit) {
    const available = sections.map((s) => `${s.id} ("${s.heading}")`).join(", ");
    throw new Error(`section "${sel}" not found — available: ${available || "none"}`);
  }
  return { ...doc, sections: [hit] };
}

const need = (args, key) => {
  const v = args?.[key];
  if (!v || typeof v !== "string") throw new Error(`${key} is required`);
  return v;
};

/** MA-6-1 (amendment 9): an Undo in Revit leaves a changeset applied and writes a changeset_reverted row only — so the status tool reads
 *  the ledger, as the web desk does (review-desk readLedger): one read per UNDONE_CHUNK applied changesets asked, rows newest first, so a
 *  changeset's first row is its newest; an "undo" there is `undone`, a redo or no row is null. A failed or cut read (total > rows) is
 *  {unknown} for that read's changesets only — never "not undone". Sets `undone` on each changeset in place; the stored doc is never touched.
 *  Review fix: chunked, so a list over a project's whole history stays under the bridge's 16 KiB request line (about 37 bytes an id). */
const UNDONE_CHUNK = 100;
async function markUndone(project, list, getJson) {
  const ids = [];
  for (const c of list) {
    if (!c || typeof c !== "object") continue;
    c.undone = null;
    if (c.status === "applied" || c.status === "partially_applied") ids.push(c.id);
  }
  const newest = new Map();
  for (let i = 0; i < ids.length; i += UNDONE_CHUNK) {
    const chunk = ids.slice(i, i + UNDONE_CHUNK);
    try {
      const page = await getJson(`/cde/${enc(project)}/audit?entity_type=changeset&action_prefix=changeset_reverted&entity_id=${chunk.map(enc).join(",")}&limit=1000`);
      if (!Array.isArray(page?.rows)) throw new Error("the bridge answered without rows");
      if ((page.total ?? 0) > page.rows.length) throw new Error(`the ledger holds more changeset_reverted rows (${page.total}) than one read returns`);
      for (const r of page.rows) if (!newest.has(r.entity_id)) newest.set(r.entity_id, r);
    } catch (e) {
      for (const c of list) if (chunk.includes(c?.id)) c.undone = { unknown: `ledger not read: ${e?.message || e} — an Undo in Revit may not show` };
    }
  }
  for (const c of list) {
    const r = newest.get(c?.id);
    if (r?.new_value?.op === "undo") c.undone = { ledger_id: r.id, at: r.at, guids: r.new_value.count ?? r.new_value.guids?.length ?? null };
  }
}

/** MA-8-5: a measured changeset's newest verify:measured row, with the LOA band of each element — computed here, when the row is read, from
 *  its p95 (a repeat measure is a 409, so a stored row is never rewritten; older rows get bands too). Candidates: an applied or partially
 *  applied changeset whose job's reader is sentinel-survey. One ledger read each (amendment 16), 10 at a time. Sets `measured` in place:
 *  null when never measured, {unknown: why} when the ledger was not read — never a guess. The stored doc is never touched.
 *  ponytail: N reads for a list, chunked by 10 in parallel; a ledger view of the newest row per entity if lists grow. */
const MEASURED_PARALLEL = 10;
async function markMeasured(project, list, getJson) {
  const cands = [];
  for (const c of list) {
    if (!c || typeof c !== "object") continue;
    c.measured = null;
    if ((c.status === "applied" || c.status === "partially_applied") && String(c.job?.reader ?? "").startsWith("sentinel-survey")) cands.push(c);
  }
  for (let i = 0; i < cands.length; i += MEASURED_PARALLEL) {
    await Promise.all(cands.slice(i, i + MEASURED_PARALLEL).map(async (c) => {
      try {
        const page = await getJson(`/cde/${enc(project)}/audit?entity_type=changeset&action_prefix=verify:measured&entity_id=${enc(c.id)}&limit=1`);
        if (!Array.isArray(page?.rows)) throw new Error("the bridge answered without rows");
        const r = page.rows[0];
        if (!r) return;
        const v = r.new_value ?? {};
        // review: the row's own verdict travels with it — a failed or refused run has no elements, and must not read as "measured, nothing in it";
        // the reference says whether the numbers rest on the add-in's re-read (claimed) or the changeset's own geometry
        const done = !v.status || v.status === "done"; // the bridge always writes a status; a row without one is read as done
        c.measured = { ledger_id: r.id, at: r.at, status: v.status ?? null, ...(v.error ? { error: v.error } : {}), reference: v.reference ?? null, claimed: v.claimed ?? null,
          counts: v.counts ?? null, loa_spec: LOA_SPEC.source,
          elements: (done && Array.isArray(v.elements) ? v.elements : []).map((m) => {
            const b = loaBand(m);
            return { proposal_guid: m.proposal_guid, cid: m.cid ?? null, kind: m.kind ?? null, status: m.status, p95_mm: m.p95_mm ?? null, reference: m.reference ?? null, loa: b.band, ...(b.band === null ? { loa_why: b.why } : {}) };
          }) };
      } catch (e) { c.measured = { unknown: `ledger not read: ${e?.message || e}` }; }
    }));
  }
}

export async function callTool(name, args = {}, deps = {}) {
  const f = deps.fetch || fetch;
  // DELIBERATE change from v1.0 for list_projects/audit: they previously .json()'d any response with
  // no ok-check, so a bridge 404/500 surfaced as a confusing parsed error body. All GET tools now
  // throw the same "bridge <status>: <text>" error the other tools always used.
  const getJson = async (path) => {
    const r = await f(`${BASE}${path}`, { headers: authHeaders });
    if (!r.ok) throw Object.assign(new Error(`bridge ${r.status}: ${await r.text()}`), { status: r.status });
    return await r.json();
  };

  if (name === "sentinel_list_projects") return await getJson("/cde/projects");
  if (name === "sentinel_propose") {
    // Only the declared fields reach the referee: an MCP client can neither stamp a verdict on a version (version_id),
    // register one (register) nor override anything.
    const { project, source, ids, elements, agent, note } = args;
    const body = { source, ids, elements, agent, note };
    if (!project) throw new Error("project is required");
    const r = await f(`${BASE}/cde/${enc(project)}/propose`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_verify_receipt") {
    const project = need(args, "project");
    if (args.receipt) {
      const r = await f(`${BASE}/receipt/${enc(project)}/verify`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ receipt: args.receipt }) });
      if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
      return await r.json();
    }
    if (args.audit_id === undefined) throw new Error("pass either receipt or audit_id");
    const r = await f(`${BASE}/receipt/${enc(project)}/${enc(String(args.audit_id))}`, { headers: authHeaders });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_audit") {
    const project = need(args, "project");
    const q = new URLSearchParams({ limit: String(args.limit ?? 50) });
    for (const k of ["offset", "entity_type", "action_prefix", "entity_id", "actor", "since", "until"])
      if (args[k] !== undefined && args[k] !== "") q.set(k, String(args[k]));
    return await getJson(`/cde/${enc(project)}/audit?${q}`);
  }

  if (name === "sentinel_list_documents") return await getJson(`/bimdocs/${enc(need(args, "project"))}`);
  if (name === "sentinel_get_document") {
    const doc = await getJson(`/bimdocs/${enc(need(args, "project"))}/${enc(need(args, "document"))}`);
    return args.section ? filterSection(doc, args.section) : doc;
  }
  if (name === "sentinel_compliance_report")
    return await getJson(`/bimdocs/${enc(need(args, "project"))}/${enc(need(args, "document"))}/compliance`);
  if (name === "sentinel_deliverables_status")
    return await getJson(`/deliverables/${enc(need(args, "project"))}/status`);
  if (name === "sentinel_list_checks") return await getJson("/bimdocs/checks");
  if (name === "sentinel_doc_integrity") {
    const project = need(args, "project"), document = need(args, "document");
    const body = {};
    if (args.provider) body.provider = args.provider;
    if (args.model) body.model = args.model;
    const r = await f(`${BASE}/bimdocs/${enc(project)}/${enc(document)}/integrity`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }

  if (name === "sentinel_propose_changeset") {
    const project = need(args, "project"), nm = need(args, "name");
    if (!Array.isArray(args.elements) || !args.elements.length) throw new Error("elements is required (non-empty array)");
    // MA-1a item 8: an agent never files as the Revit add-in (ADDIN_SOURCES), and its claimed provenance block — which
    // the schema has always advertised — goes with the changeset to the ledger. Review amendment C1: the tool sends a
    // source it controls — the label when it is text and not one of the add-in's, else "agent". A source that is not
    // text is never forwarded: the bridge reads contract 2's { reader } object, and callTool does not check its
    // arguments against the input schema, so { reader: "promote" } would otherwise be stored as "promote".
    const label = typeof args.source === "string" ? args.source.trim() : "";
    const source = !label || ADDIN_SOURCES.includes(label.toLowerCase()) ? "agent" : label;
    const r = await f(`${BASE}/changesets/${enc(project)}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ name: nm, source, elements: args.elements, agent: args.agent }) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_changeset_status") {
    const project = need(args, "project");
    const got = args.changeset ? await getJson(`/changesets/${enc(project)}/${enc(need(args, "changeset"))}`)
      : await getJson(`/changesets/${enc(project)}${args.status ? `?status=${enc(args.status)}` : ""}`);
    await markUndone(project, Array.isArray(got) ? got : [got], getJson);
    await markMeasured(project, Array.isArray(got) ? got : [got], getJson);
    return got;
  }
  if (name === "sentinel_build_status") {
    const project = need(args, "project");
    return await getJson(`/cde/${enc(project)}/build/jobs${args.job ? `/${enc(need(args, "job"))}` : ""}`);
  }
  if (name === "sentinel_edit_cost") return await getJson(`/changesets/${enc(need(args, "project"))}/edit-cost`);
  // MA-6-1: the agent's reads (A-1, A-2) — through the routes the web and Revit read, on the same credential.
  if (name === "sentinel_lod_state") {
    const j = await getJson(`/cde/${enc(need(args, "project"))}/journey`);
    return { lod_state: j.lod_state };
  }
  if (name === "sentinel_standards") {
    const project = need(args, "project"), kind = need(args, "kind");
    if (!STANDARD_KINDS.includes(kind)) throw new Error(`kind must be one of ${STANDARD_KINDS.join(", ")}`);
    const j = await getJson(`/cde/${enc(project)}/artefacts/${kind === "lod_matrix" ? "lod_matrix/ids" : kind}`).catch((e) => {
      // Review fix: a 404 for an unknown project or a non-member (no_project) is the bridge's own words, not "not installed".
      throw e.status === 404 && /not_installed|no lod_matrix installed/.test(e.message) ? new Error(`${kind} is not installed for ${project} or its office (${e.message})`) : e;
    });
    if (kind !== "type_catalog") return j;
    // The catalogue is large (343 KB on the pilot): one category's rows whole (amendment 6: params too, so an agent sees the Fire
    // Rating its facts would type to), matched as the typer matches (sameCategory: the name or the row's BuiltInCategory).
    const rows = Array.isArray(j.body?.types) ? j.body.types : [];
    const counts = {};
    for (const t of rows) counts[t.category] = (counts[t.category] ?? 0) + 1;
    const head = { ref: j.ref ?? null, source: j.source ?? null, sha256: j.sha256 ?? null };
    if (!args.category) return { ...head, categories: counts };
    const { sameCategory } = await import("./sentinel-core.mjs");
    const types = rows.filter((t) => sameCategory(t, String(args.category)));
    if (!types.length) throw new Error(`no ${args.category} types in ${head.ref} — its categories: ${Object.entries(counts).map(([c, n]) => `${c} (${n})`).join(", ") || "none"}`);
    return { ...head, category: args.category, types };
  }

  if (name === "sentinel_ask_app") {
    const m = await import("./ask-sentinel.mjs");
    const type = need(args, "type");
    if (!m.COMMANDS.includes(type)) throw new Error(`type must be one of ${m.COMMANDS.join(", ")} — Sentinel answers no other command`);
    return await (deps.ask || m.ask)({ type, payload: args.payload, appId: args.app_id, kind: "mcp" });
  }

  throw new Error(`unknown tool: ${name}`);
}

// Start the stdio server only when run directly (node mcp-server.mjs) — importing from a test is inert.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  createInterface({ input: process.stdin }).on("line", async (raw) => {
    const line = raw.trim();
    if (!line) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const { id, method, params } = msg;
    try {
      if (method === "initialize") return ok(id, { protocolVersion: PROTO, capabilities: { tools: {} }, serverInfo: { name: "sentinel", version: "1.1" } });
      if (method === "notifications/initialized" || method === "notifications/cancelled") return; // notifications: no reply
      if (method === "tools/list") return ok(id, { tools: TOOLS });
      if (method === "ping") return ok(id, {});
      if (method === "tools/call") {
        try { return ok(id, asText(await callTool(params?.name, params?.arguments))); }
        catch (e) { return ok(id, { content: [{ type: "text", text: "ERROR: " + (e?.message || e) }], isError: true }); }
      }
      if (id !== undefined) return rpcErr(id, -32601, `method not found: ${method}`);
    } catch (e) {
      if (id !== undefined) rpcErr(id, -32603, String(e?.message || e));
    }
  });
  process.stderr.write(`[sentinel-mcp] ready (bridge ${BASE})\n`);
}
