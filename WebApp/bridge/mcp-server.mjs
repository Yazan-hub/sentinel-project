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

export const TOOLS = [
  { name: "sentinel_list_projects", description: "List the governed CDE projects (id, key, name).", inputSchema: { type: "object", properties: {} } },
  {
    name: "sentinel_propose",
    description: "Propose elements to the governed layer. They're validated against an IDS (buildingSMART Information Delivery Specification) and the verdict — accepted / rejected (with per-requirement reasons) — is recorded in the project's immutable, hash-chained audit trail. Use to answer 'are these elements / is this model compliant?'.",
    inputSchema: {
      type: "object", required: ["project", "elements"],
      properties: {
        project: { type: "string", description: "the project key" },
        source: { type: "string", description: "who/what is proposing (agent or tool name)" },
        ids: { description: "an IDS spec as JSON {title, specifications:[{name, applicability:{entity}, requirements:{properties:[{pset,name,cardinality}], attributes:[…]}}]}. Omit to just record the proposal. (Raw .ids XML is parsed browser-side only — pass JSON here.)" },
        elements: { type: "array", description: "elements in the ElementProperties shape: {identity:{Class:'IFCWALL', GlobalId, Name?}, psets:[{name:'Pset_WallCommon', rows:[{name:'FireRating', value:'REI60'}]}], quantities:[…]}" },
        note: { type: "string" },
      },
    },
  },
  { name: "sentinel_audit", description: "Read a project's immutable, hash-chained audit trail (the governed record of proposals, clashes, ISO 19650 state transitions).", inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" }, limit: { type: "number" } } } },

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
      "Propose model elements for human review in Revit. Nothing is created by this call: elements are adjudicated against the project's IDS (verdicts attached per element) and STAGED; a person reviews and ticks each element inside Revit before anything enters the model, and the result (created element ids or rejection) is recorded in the audit trail. v1 element kinds: wall, floor, level, grid. Geometry in millimetres, project-internal coordinates: walls/grids need place.LocationCurve {start:[x,y,z], end:[x,y,z]}; floors place.LocationLoop [[x,y,z]×≥3]; levels place.BaseElevation. Each element: {kind, validate:{identity:{Class, Name}, psets:[]}, place:{...}}.",
    inputSchema: {
      type: "object", required: ["project", "name", "elements"],
      properties: {
        project: { type: "string", description: "the project key" },
        name: { type: "string", description: "human-readable changeset name (shown to the reviewer in Revit)" },
        source: { type: "string", description: "agent self-label" },
        elements: { type: "array", description: "the proposed elements (see tool description for the shape)" },
      },
    },
  },
  {
    name: "sentinel_changeset_status",
    description: "Check staged changesets: pass `changeset` (id) for one, or `status` (proposed|applied|partially_applied|declined|withdrawn) to list. Shows per-element verdicts and, once a human reviewed in Revit, the created element ids. Read-only.",
    inputSchema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string" }, changeset: { type: "string" }, status: { type: "string" } },
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

export async function callTool(name, args = {}, deps = {}) {
  const f = deps.fetch || fetch;
  // DELIBERATE change from v1.0 for list_projects/audit: they previously .json()'d any response with
  // no ok-check, so a bridge 404/500 surfaced as a confusing parsed error body. All GET tools now
  // throw the same "bridge <status>: <text>" error the other tools always used.
  const getJson = async (path) => {
    const r = await f(`${BASE}${path}`, { headers: authHeaders });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  };

  if (name === "sentinel_list_projects") return await getJson("/cde/projects");
  if (name === "sentinel_propose") {
    const { project, ...body } = args;
    if (!project) throw new Error("project is required");
    const r = await f(`${BASE}/cde/${enc(project)}/propose`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_audit") {
    const project = need(args, "project");
    const rows = await getJson(`/cde/${enc(project)}/audit`);
    return Array.isArray(rows) ? rows.slice(0, args.limit || 50) : rows;
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
    const r = await f(`${BASE}/changesets/${enc(project)}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ name: nm, source: args.source, elements: args.elements }) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_changeset_status") {
    const project = need(args, "project");
    if (args.changeset) return await getJson(`/changesets/${enc(project)}/${enc(need(args, "changeset"))}`);
    return await getJson(`/changesets/${enc(project)}${args.status ? `?status=${enc(args.status)}` : ""}`);
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
