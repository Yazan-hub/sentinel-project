# Sentinel MCP server — the governed graph as an agent tool

`WebApp/bridge/mcp-server.mjs` exposes the **referee layer** to AI agents / MCP clients over stdio JSON-RPC
(zero-dependency). It's the "propose API" as an agent surface: let a generator or agent PROPOSE, and Sentinel
adjudicates deterministically (IDS validation) and records the verdict immutably.

## Tools

| Tool | What it does |
|---|---|
| `sentinel_list_projects` | List the governed CDE projects. |
| `sentinel_propose` | Validate proposed elements against an IDS (buildingSMART Information Delivery Specification); returns **accepted / rejected** with per-requirement reasons and records the verdict in the hash-chained audit trail. |
| `sentinel_audit` | Read a project's immutable audit trail (proposals, clashes, ISO 19650 state transitions). |

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
- **ids** — a JSON IDS spec, or a raw `.ids` XML string (parsed by `parseIds`):
  ```json
  { "title": "Walls need a fire rating",
    "specifications": [{ "name": "FireRating on walls",
      "applicability": { "entity": "IFCWALL" },
      "requirements": { "properties": [{ "pset": "Pset_WallCommon", "name": "FireRating", "cardinality": "required" }], "attributes": [] } }] }
  ```
- Omit `ids` to just **record** the proposal (verdict `recorded`).

The verdict comes from the SAME pure `sentinel-core` validators the browser uses (bundled to
`bridge/sentinel-core.mjs` via `npm run build:bridge-core`) — one governed core, deterministic everywhere.
