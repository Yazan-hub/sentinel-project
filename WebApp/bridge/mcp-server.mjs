// Sentinel MCP server — zero-dependency, stdio JSON-RPC. Exposes the governed-graph "referee" to AI agents
// and MCP clients: list the CDE projects, PROPOSE elements for deterministic IDS / ISO 19650 adjudication
// (accepted/rejected + reasons, recorded immutably), and read the hash-chained audit trail. Talks to the
// local bridge over HTTP (BCF_BASE, default http://127.0.0.1:4100).
//
// Register (e.g. Claude Desktop / any MCP client):
//   { "mcpServers": { "sentinel": { "command": "node", "args": ["<abs>/WebApp/bridge/mcp-server.mjs"] } } }
import { createInterface } from "node:readline";

const BASE = (process.env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const PROTO = "2024-11-05";
const enc = encodeURIComponent;

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const asText = (o) => ({ content: [{ type: "text", text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });

const TOOLS = [
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
];

async function callTool(name, args = {}) {
  if (name === "sentinel_list_projects") return await (await fetch(`${BASE}/cde/projects`)).json();
  if (name === "sentinel_propose") {
    const { project, ...body } = args;
    if (!project) throw new Error("project is required");
    const r = await fetch(`${BASE}/cde/${enc(project)}/propose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`bridge ${r.status}: ${await r.text()}`);
    return await r.json();
  }
  if (name === "sentinel_audit") {
    const { project, limit } = args;
    if (!project) throw new Error("project is required");
    const rows = await (await fetch(`${BASE}/cde/${enc(project)}/audit`)).json();
    return Array.isArray(rows) ? rows.slice(0, limit || 50) : rows;
  }
  throw new Error(`unknown tool: ${name}`);
}

createInterface({ input: process.stdin }).on("line", async (raw) => {
  const line = raw.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") return ok(id, { protocolVersion: PROTO, capabilities: { tools: {} }, serverInfo: { name: "sentinel", version: "1.0" } });
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
