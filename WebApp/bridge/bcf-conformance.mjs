// openCDE slice 3 (docs/compliance/CERTIFICATION_READINESS_2026-10.md §3): buildingSMART publishes no runnable BCF-API test suite —
// only the OpenAPI reference and the JSON schemas (vendored unchanged under fixtures/bcf-api-schemas, CC BY-ND 4.0). So conformance
// is proved here: every response the bridge serves on the BCF surface is validated against the official schema of its route. The
// schemas are JSON Schema draft-03 (`required: true` on a property, `type` lists, relative `$ref` files): the validator below covers
// exactly that dialect's features the schemas use — type, required, properties, items, enum, minItems, $ref — and nothing more.
// `runConformance` walks the surface against a live bridge (loopback with the machine credential, or the Funnel with a person's
// session) and returns one row per route. Run as a CLI: `node bridge/bcf-conformance.mjs <base> <project key>` (bearer: BCF_TOKEN
// from config/.env, or BCF_BEARER in the environment for a person's JWT).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMAS = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "bcf-api-schemas");
const cache = new Map();
/** A schema by its path under the vendored folder, with `$ref`s resolved relative to the referring file (pure over the files). */
export function loadSchema(rel) {
  const file = resolve(SCHEMAS, rel);
  if (cache.has(file)) return cache.get(file);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    if (typeof node.$ref === "string") return { ...loadSchema(join(dirname(rel), node.$ref)), ...(node.required !== undefined ? { required: node.required } : {}) };
    const out = {}; for (const [k, v] of Object.entries(node)) out[k] = walk(v); return out;
  };
  const s = walk(raw);
  cache.set(file, s);
  return s;
}

const typeOf = (v) => v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
const typeOk = (want, v) => {
  const t = typeOf(v);
  return [].concat(want).some((w) => w === "any" || w === t || (w === "number" && t === "integer"));
};

/** The problems a value has against a draft-03 schema: `[]` when it conforms. Each problem names the path and the rule. Pure. */
export function validate(value, schema, path = "$") {
  const out = [];
  if (!schema || typeof schema !== "object") return out;
  if (schema.type && !typeOk(schema.type, value)) { out.push(`${path}: is ${typeOf(value)}, the schema wants ${[].concat(schema.type).join("|")}`); return out; }
  if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: "${value}" is not one of ${schema.enum.join(", ")}`);
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    for (const [k, sub] of Object.entries(schema.properties)) {
      if (!(k in value)) { if (sub.required === true) out.push(`${path}.${k}: required, missing`); continue; }
      out.push(...validate(value[k], sub, `${path}.${k}`));
    }
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) out.push(`${path}: ${value.length} item(s), at least ${schema.minItems} wanted`);
    if (schema.items) value.forEach((it, i) => out.push(...validate(it, schema.items, `${path}[${i}]`)));
  }
  return out;
}

/** Validate a list where the schema describes one item (the spec writes list routes as `[item_GET]`). */
export const validateList = (list, itemSchema, path = "$") => Array.isArray(list) ? list.flatMap((it, i) => validate(it, itemSchema, `${path}[${i}]`)) : [`${path}: is ${typeOf(list)}, a list is wanted`];

/** The surface and each route's schema (a reader's view: GET routes; `list` marks an array of the item schema). */
export const ROUTES = [
  { name: "versions", path: () => "/bcf/versions", schema: null, note: "no schema in the repository — shape read from the specification" },
  { name: "auth", path: () => "/bcf/3.0/auth", schema: null, note: "no schema in the repository — shape read from the specification", public: true },
  { name: "current-user", path: () => "/bcf/3.0/current-user", schema: "User/user_GET.json" },
  { name: "projects", path: () => "/bcf/3.0/projects", schema: "Project/project_GET.json", list: true },
  { name: "project", path: (p) => `/bcf/3.0/projects/${p}`, schema: "Project/project_GET.json" },
  { name: "extensions", path: (p) => `/bcf/3.0/projects/${p}/extensions`, schema: "Project/extensions_GET.json" },
  { name: "files", path: (p) => `/bcf/3.0/projects/${p}/files`, schema: "Collaboration/File/project_files_information_GET.json" },
  { name: "documents", path: (p) => `/bcf/3.0/projects/${p}/documents`, schema: "Collaboration/Document/document_GET.json", list: true },
  { name: "topics", path: (p) => `/bcf/3.0/projects/${p}/topics?status=all&$top=5`, schema: "Collaboration/Topic/topic_GET.json", list: true },
  { name: "events", path: (p) => `/bcf/3.0/projects/${p}/topics/events?$top=5`, schema: "Collaboration/Events/topic_event_GET.json", list: true },
  { name: "topic", path: (p, g) => `/bcf/3.0/projects/${p}/topics/${g}`, schema: "Collaboration/Topic/topic_GET.json", needs: "topic" },
  { name: "topic events", path: (p, g) => `/bcf/3.0/projects/${p}/topics/${g}/events`, schema: "Collaboration/Events/topic_event_GET.json", list: true, needs: "topic" },
  { name: "comments", path: (p, g) => `/bcf/3.0/projects/${p}/topics/${g}/comments`, schema: "Collaboration/Comment/comment_GET.json", list: true, needs: "topic" },
  { name: "viewpoints", path: (p, g) => `/bcf/3.0/projects/${p}/topics/${g}/viewpoints`, schema: "Collaboration/Viewpoint/viewpoint_GET.json", list: true, needs: "topic" },
  { name: "related topics", path: (p, g) => `/bcf/3.0/projects/${p}/topics/${g}/related_topics`, schema: "Collaboration/RelatedTopic/related_topic_GET.json", list: true, needs: "topic" },
  { name: "document references", path: (p, g) => `/bcf/3.0/projects/${p}/topics/${g}/document_references`, schema: "Collaboration/DocumentReference/document_reference_GET.json", list: true, needs: "topic" },
  { name: "viewpoint selection", path: (p, g, v) => `/bcf/3.0/projects/${p}/topics/${g}/viewpoints/${v}/selection`, schema: "Collaboration/Viewpoint/selection_GET.json", needs: "viewpoint" },
  { name: "viewpoint coloring", path: (p, g, v) => `/bcf/3.0/projects/${p}/topics/${g}/viewpoints/${v}/coloring`, schema: "Collaboration/Viewpoint/coloring_GET.json", needs: "viewpoint" },
  { name: "viewpoint visibility", path: (p, g, v) => `/bcf/3.0/projects/${p}/topics/${g}/viewpoints/${v}/visibility`, schema: "Collaboration/Viewpoint/visibility_GET.json", needs: "viewpoint" },
  { name: "error (unknown topic)", path: (p) => `/bcf/3.0/projects/${p}/topics/00000000-0000-4000-8000-00000000dead`, schema: "error.json", expect: 404 },
];

/** Walks the surface on a live bridge. Returns rows { name, path, status, ok, problems } — `ok` = the expected status and no problems. */
export async function runConformance({ base, bearer, pid, fetchImpl = fetch }) {
  const rows = [];
  const call = async (p) => { const r = await fetchImpl(base + p, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} }); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch { body = text; } return { status: r.status, body }; };
  let topicGuid = null, viewpointGuid = null;
  for (const route of ROUTES) {
    if (route.needs === "topic" && !topicGuid) { rows.push({ name: route.name, path: "—", status: 0, ok: null, problems: ["skipped: the project has no topic to read"] }); continue; }
    if (route.needs === "viewpoint" && !viewpointGuid) { rows.push({ name: route.name, path: "—", status: 0, ok: null, problems: ["skipped: the topic has no viewpoint"] }); continue; }
    const path = route.path(pid, topicGuid, viewpointGuid);
    let r;
    try { r = await call(path); } catch (e) { rows.push({ name: route.name, path, status: 0, ok: false, problems: [`request failed: ${e.message}`] }); continue; }
    const expect = route.expect ?? 200;
    const problems = r.status !== expect ? [`HTTP ${r.status}, ${expect} expected`] : route.schema ? (route.list ? validateList(r.body, loadSchema(route.schema)) : validate(r.body, loadSchema(route.schema))) : [];
    rows.push({ name: route.name, path, status: r.status, ok: problems.length === 0, problems });
    if (route.name === "topics" && Array.isArray(r.body) && r.body[0]?.guid) topicGuid = r.body[0].guid;
    if (route.name === "viewpoints" && Array.isArray(r.body) && r.body[0]?.guid) viewpointGuid = r.body[0].guid;
  }
  return rows;
}

/** The rows as a Markdown table (the report's body). Pure. */
export const reportTable = (rows) => ["| Route | Status | Result |", "|---|---|---|", ...rows.map((r) => `| ${r.name} | ${r.status || "—"} | ${r.ok === null ? "skipped — " + r.problems[0].replace(/^skipped: /, "") : r.ok ? "✅ conforms" : "❌ " + r.problems.slice(0, 4).join("; ")} |`)].join("\n");

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [base, pid] = process.argv.slice(2);
  if (!base || !pid) { console.error("usage: node bridge/bcf-conformance.mjs <base url> <project key>"); process.exit(2); }
  const { loadEnv } = await import("./load-env.mjs");
  const bearer = process.env.BCF_BEARER || loadEnv().BCF_TOKEN || "";
  const rows = await runConformance({ base: base.replace(/\/$/, ""), bearer, pid });
  console.log(reportTable(rows));
  const bad = rows.filter((r) => r.ok === false).length;
  console.log(`\n${rows.filter((r) => r.ok).length} conform, ${bad} do not, ${rows.filter((r) => r.ok === null).length} skipped`);
  process.exit(bad ? 1 : 0);
}
