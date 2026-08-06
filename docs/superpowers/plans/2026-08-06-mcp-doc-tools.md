# MCP Doc Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six read-only MCP tools exposing the document-governance layer (documents, compliance, deliverables, checks, AI integrity) to external agents.

**Architecture:** Extend the existing zero-dependency stdio JSON-RPC server (`mcp-server.mjs`) with six `TOOLS` entries and `callTool` branches, each a thin `fetch` passthrough to an existing bridge route. A small refactor makes `TOOLS`/`callTool` exports with an injected-fetch seam and main-module detection, so unit tests never spawn a process or touch the network. No bridge changes.

**Tech Stack:** Node 20+ ESM, vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-06-mcp-doc-tools-design.md` — implemented exactly.
- **Read-only.** Every new tool calls a route phases 3-5 proved writes nothing. No tool mutates governance data.
- **Zero dependencies** — the server imports only `node:*` modules and `./load-env.mjs`. Keep it that way.
- **Behavior as a server is unchanged**: same protocol version, same existing three tools, same error idiom (`bridge <status>: <text>` inside an `isError` text content).
- Tool descriptions must carry the governance distinction verbatim where stated in Task 2 (deterministic compliance facts vs gated AI suggestions), and `sentinel_doc_integrity`'s description must warn it may take minutes on a local model.
- Bridge routes consumed (all existing, live-verified in phases 3-5): `GET /bimdocs/:project`, `GET /bimdocs/:project/:docId`, `GET /bimdocs/:project/:docId/compliance`, `GET /deliverables/:project/status`, `GET /bimdocs/checks`, `POST /bimdocs/:project/:docId/integrity` (body `{provider?, model?}`).
- All npm/vitest commands from `WebApp/`. Test baseline: **355 passing**.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/mcp-server.mjs` (modify) | The server: exports + seam + six new tools. |
| `WebApp/bridge/mcp-server.test.mjs` (new) | Unit tests with injected fake fetch. |

---

### Task 1: Testability refactor + six tools + tests

One task, not two: the refactor exists only so the new tools are testable, and a reviewer judging the refactor without the tools (or vice versa) would see half a change.

**Files:**
- Modify: `WebApp/bridge/mcp-server.mjs`
- Test: `WebApp/bridge/mcp-server.test.mjs` (new)

**Interfaces:**
- Consumes: the bridge routes listed in Global Constraints (via fetch; faked in tests).
- Produces: exports `TOOLS` (array), `callTool(name, args, deps = {}) → Promise<any>` (`deps.fetch` overrides global fetch), `filterSection(doc, section) → doc-with-one-section` (throws listing available sections on no match). Task 2 (live verification) drives the unchanged stdio surface.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/mcp-server.test.mjs`:

```javascript
import { describe, it, expect, vi } from "vitest";
import { TOOLS, callTool, filterSection } from "./mcp-server.mjs";

const okJson = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const failText = (status, text) => ({ ok: false, status, json: async () => ({ message: text }), text: async () => text });

const NEW_TOOLS = [
  "sentinel_list_documents", "sentinel_get_document", "sentinel_compliance_report",
  "sentinel_deliverables_status", "sentinel_list_checks", "sentinel_doc_integrity",
];

describe("TOOLS registry", () => {
  it("contains the original three plus the six doc tools", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of ["sentinel_list_projects", "sentinel_propose", "sentinel_audit", ...NEW_TOOLS])
      expect(names).toContain(n);
    expect(TOOLS).toHaveLength(9);
  });

  it("every tool has a description and an object inputSchema", () => {
    for (const t of TOOLS) {
      expect(t.description?.length).toBeGreaterThan(20);
      expect(t.inputSchema?.type).toBe("object");
    }
  });

  it("integrity tool warns about duration and AI-suggestion status", () => {
    const t = TOOLS.find((t) => t.name === "sentinel_doc_integrity");
    expect(t.description).toMatch(/minutes/i);
    expect(t.description).toMatch(/not compliance facts/i);
  });

  it("required args are declared", () => {
    expect(TOOLS.find((t) => t.name === "sentinel_get_document").inputSchema.required).toEqual(["project", "document"]);
    expect(TOOLS.find((t) => t.name === "sentinel_doc_integrity").inputSchema.required).toEqual(["project", "document"]);
    expect(TOOLS.find((t) => t.name === "sentinel_list_documents").inputSchema.required).toEqual(["project"]);
  });
});

describe("callTool — doc tools dispatch", () => {
  it("list_documents GETs /bimdocs/:project", async () => {
    const fetch = vi.fn(async () => okJson([{ id: "d1" }]));
    const r = await callTool("sentinel_list_documents", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/demo$/);
    expect(r).toEqual([{ id: "d1" }]);
  });

  it("get_document GETs /bimdocs/:project/:docId and URL-encodes args", async () => {
    const fetch = vi.fn(async () => okJson({ id: "d1", sections: [] }));
    await callTool("sentinel_get_document", { project: "de mo", document: "d/1" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/de%20mo\/d%2F1$/);
  });

  it("compliance_report GETs the compliance route", async () => {
    const fetch = vi.fn(async () => okJson({ summary: {} }));
    await callTool("sentinel_compliance_report", { project: "demo", document: "d1" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/demo\/d1\/compliance$/);
  });

  it("deliverables_status GETs /deliverables/:project/status", async () => {
    const fetch = vi.fn(async () => okJson({ summary: { total: 0 } }));
    await callTool("sentinel_deliverables_status", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/deliverables\/demo\/status$/);
  });

  it("list_checks GETs /bimdocs/checks with no args", async () => {
    const fetch = vi.fn(async () => okJson({ checks: [], planned: [] }));
    await callTool("sentinel_list_checks", {}, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/bimdocs\/checks$/);
  });

  it("doc_integrity POSTs with provider/model passthrough", async () => {
    const fetch = vi.fn(async () => okJson({ findings: [], dropped: 0 }));
    await callTool("sentinel_doc_integrity", { project: "demo", document: "d1", provider: "local", model: "m" }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/bimdocs\/demo\/d1\/integrity$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ provider: "local", model: "m" });
  });

  it("missing required args throw before any fetch", async () => {
    const fetch = vi.fn();
    await expect(callTool("sentinel_list_documents", {}, { fetch })).rejects.toThrow(/project is required/);
    await expect(callTool("sentinel_get_document", { project: "demo" }, { fetch })).rejects.toThrow(/document is required/);
    await expect(callTool("sentinel_doc_integrity", { project: "demo" }, { fetch })).rejects.toThrow(/document is required/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bridge errors surface as 'bridge <status>: <text>' with the real message", async () => {
    const fetch = vi.fn(async () => failText(503, '{"message":"Local AI (Ollama) unreachable"}'));
    await expect(callTool("sentinel_doc_integrity", { project: "demo", document: "d1" }, { fetch }))
      .rejects.toThrow(/bridge 503:.*Ollama/);
  });

  it("unknown tool still throws", async () => {
    await expect(callTool("nope", {}, { fetch: vi.fn() })).rejects.toThrow(/unknown tool/);
  });
});

describe("callTool — existing tools regression", () => {
  it("list_projects still GETs /cde/projects", async () => {
    const fetch = vi.fn(async () => okJson([]));
    await callTool("sentinel_list_projects", {}, { fetch });
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/projects$/);
  });

  it("audit still GETs and slices to limit", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: i }));
    const fetch = vi.fn(async () => okJson(rows));
    const r = await callTool("sentinel_audit", { project: "demo", limit: 10 }, { fetch });
    expect(r).toHaveLength(10);
  });

  it("propose still POSTs to /cde/:project/propose", async () => {
    const fetch = vi.fn(async () => okJson({ verdict: "recorded" }));
    await callTool("sentinel_propose", { project: "demo", elements: [] }, { fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/cde\/demo\/propose$/);
    expect(init.method).toBe("POST");
  });
});

describe("filterSection", () => {
  const doc = { id: "d1", title: "BEP", sections: [
    { id: "s1", heading: "Naming", body: "A" },
    { id: "s2", heading: "Milestones", body: "B" },
  ] };

  it("filters by section id", () => {
    const r = filterSection(doc, "s2");
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].heading).toBe("Milestones");
    expect(r.title).toBe("BEP"); // doc metadata preserved
  });

  it("filters by exact heading when no id matches", () => {
    expect(filterSection(doc, "Naming").sections[0].id).toBe("s1");
  });

  it("no match throws an error listing available sections", () => {
    expect(() => filterSection(doc, "Nope")).toThrow(/s1.*Naming.*s2.*Milestones|Naming.*Milestones/s);
  });

  it("get_document applies the filter when section is passed", async () => {
    const fetch = vi.fn(async () => okJson(doc));
    const r = await callTool("sentinel_get_document", { project: "demo", document: "d1", section: "s1" }, { fetch });
    expect(r.sections).toHaveLength(1);
  });

  it("does not mutate the input document", () => {
    filterSection(doc, "s1");
    expect(doc.sections).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd WebApp && npx vitest run bridge/mcp-server.test.mjs`
Expected: FAIL — `mcp-server.mjs` has no exports (and importing it currently starts the readline loop; the refactor in Step 3 fixes both).

- [ ] **Step 3: Implement**

Rewrite `WebApp/bridge/mcp-server.mjs` as below. The existing three tools, protocol handling, and error idiom are IDENTICAL to the current file — the changes are: exports, the `deps.fetch` seam, `filterSection`, the six new tools, and the main-module guard around the readline wiring.

```javascript
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

// Load config/.env into process.env before reading any values (same idiom as bcf-service.mjs)
for (const [k, v] of Object.entries(loadEnv())) process.env[k] = v;

const BASE = (process.env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const BRIDGE_TOKEN = process.env.BCF_TOKEN || "";
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
```

Note the deliberate details:
- `sentinel_propose` keeps its ORIGINAL inline `if (!project)` check (its `project` is destructured out of `args`); the other tools use the `need()` helper. `sentinel_audit`'s behavior is byte-identical to before (default limit 50).
- `serverInfo.version` bumps to `"1.1"`.
- The old top-level readline is now inside `if (isMain)` — the ONLY behavioral difference when run as a server is the version string.

- [ ] **Step 4: Run to verify pass**

Run: `cd WebApp && npx vitest run bridge/mcp-server.test.mjs && npx vitest run`
Expected: new file passes; full suite 355 + new all passing.

- [ ] **Step 5: Commit**

```bash
git add WebApp/bridge/mcp-server.mjs WebApp/bridge/mcp-server.test.mjs
git commit -m "feat(mcp): six read-only doc-governance tools + testable server exports

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Live verification

**Files:** none (verification only; report defects, don't fix).

- [ ] **Step 1: Suite**

Run: `cd WebApp && npx vitest run`
Expected: all passing.

- [ ] **Step 2: Live stdio session against the running bridge**

The bridge must be up on :4100 (it is; if not, restart the SentinelBridge scheduled task after killing the PID on the port). Ollama should be up for the integrity call — check `curl -s http://localhost:11434/api/tags`; if down, start it (`Start-Process ollama.exe serve, hidden`, wait ~15s) or mark that one check NOT-RUN.

Capture the audit baseline first:

```bash
cd WebApp && node -e "import('./bridge/cde-store.mjs').then(async c => { const r = await c.listAudit('demo'); console.log('audit before:', r.length, 'newest', r[0]?.id); });"
```

Drive the server with a scripted session (note: the integrity call can take minutes — generous timeout):

```bash
cd WebApp && node -e "
const { spawn } = require('node:child_process');
const p = spawn('node', ['bridge/mcp-server.mjs'], { stdio: ['pipe','pipe','inherit'] });
const lines = [];
p.stdout.on('data', d => process.stdout.write(d));
const send = (o) => p.stdin.write(JSON.stringify(o) + '\n');
send({jsonrpc:'2.0', id:1, method:'initialize', params:{}});
send({jsonrpc:'2.0', id:2, method:'tools/list'});
send({jsonrpc:'2.0', id:3, method:'tools/call', params:{name:'sentinel_list_documents', arguments:{project:'demo'}}});
setTimeout(() => p.kill(), 15000);
"
```

Expected: initialize returns proto + version 1.1; tools/list shows NINE tools; list_documents returns the demo docs. From the returned doc id, run further single-call sessions (same pattern, one tools/call each):
1. `sentinel_get_document` full, then with `section` set to a real section id (only that section returned), then with `section:"Bogus"` (isError text listing available sections).
2. `sentinel_compliance_report` — real results.
3. `sentinel_deliverables_status` — the summary (deliverables may be empty; an honest empty plan is a PASS).
4. `sentinel_list_checks` — `midp.milestones` present under `checks`, not `planned`.
5. `sentinel_doc_integrity` (timeout 600s) — findings/dropped from the real model, or an honest `bridge 503` if Ollama is down (NOT-RUN for the model path then).
6. Regression: `sentinel_audit` with limit 5 → 5 rows.
7. Unknown project: `sentinel_list_documents {project:'nope'}` → isError `bridge 404: ...`.

- [ ] **Step 3: Read-only proof**

Re-run the audit baseline command. Expected: count and newest id identical to Step 2's capture (the whole MCP session wrote nothing).

- [ ] **Step 4: Report**

Write `.superpowers/sdd/task-2-report.md` with every check, command, real output, PASS/FAIL/NOT-RUN.

---

## Self-Review

**Spec coverage:** six tools with the exact routes/args → Task 1 (TOOLS + dispatch + tests). Read-only → no write route called anywhere; proven live in Task 2 Step 3. Governance-distinction descriptions → compliance ("DETERMINISTIC FACTS ... not AI") and integrity ("AI SUGGESTIONS ... not compliance facts", "minutes") pinned by a test. Section filter with agent-recoverable no-match error → `filterSection` + tests + live check. Testability refactor (exports, injected fetch, main guard) → Task 1 Step 3; server behavior unchanged except version string. Existing-tools regression → unit tests + live audit call. Live session incl. 9-tool listing → Task 2.
**Placeholders:** none — full server code shown; every command has expected output.
**Type consistency:** `callTool(name, args, deps)` signature matches every test; `filterSection(doc, sel)` matches its tests and the `sentinel_get_document` branch; tool names in tests ≡ TOOLS entries.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-06-mcp-doc-tools.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — executing-plans in this session.

**Which approach?**
