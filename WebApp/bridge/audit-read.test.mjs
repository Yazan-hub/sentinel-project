// GET /cde/:key/audit (cohesion phase 4c, spec Decisions 4-5): filters, an exact total, and checks that never answer
// from a 200-row window. globalThis.fetch is a fake PostgREST over an in-memory audit_log that honours the filters
// listAudit sends, so the demo case (its only verdict is the 243rd newest row) is reproduced without a network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { sb, auditQuery, listAudit, AUDIT_MAX } from "./cde-store.mjs";
import { getCheck, classifyVerdicts, classifyReview } from "./check-registry.mjs";

const DEMO = "11111111-1111-4111-8111-111111111111";
const BUSY = "22222222-2222-4222-8222-222222222222";
const V1 = "aaaaaaaa-0000-4000-8000-000000000001"; // demo's one published, judged version
const V2 = "aaaaaaaa-0000-4000-8000-000000000002";
const C1 = "cccccccc-0000-4000-8000-000000000001";
const T0 = Date.parse("2026-09-01T00:00:00Z");
const at = (id) => new Date(T0 + id * 60000).toISOString();

// demo, as measured live on 2026-09-25: 286 rows, and the only governed verdict is the 243rd newest (id 44 here,
// 286 - 44 + 1 = 243); V1's two state transitions sit further back still. busy: 1203 verdict rows, past AUDIT_MAX.
function ledger() {
  const rows = [];
  for (let id = 1; id <= 286; id++) {
    const row = { id, project_id: DEMO, entity_type: "event", entity_id: null, action: `Model published from Revit #${id}`, actor: "revit:yazan", at: at(id), new_value: null };
    if (id === 3) Object.assign(row, { entity_type: "container_version", entity_id: V1, action: "state:wip->shared", actor: "modeller@bds.jo" });
    if (id === 5) Object.assign(row, { entity_type: "container_version", entity_id: V1, action: "state:shared->published", actor: "yara@bds.jo" });
    if (id === 44) Object.assign(row, { entity_type: "file_version", entity_id: V1, action: "verdict:accepted", actor: "revit:yazan", new_value: { summary: { failing: 0 } } });
    rows.push(row);
  }
  for (let i = 1; i <= 1203; i++)
    rows.push({ id: 1000 + i, project_id: BUSY, entity_type: "file_version", entity_id: V2, action: "verdict:accepted", actor: "web", at: at(1000 + i), new_value: { summary: { failing: 0 } } });
  return rows;
}

// PostgREST's LIKE: every * is a %, then \ escapes the next character, % is any run, _ is any one character.
function like(pattern) {
  const p = pattern.replace(/\*/g, "%");
  const lit = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let re = "";
  for (let i = 0; i < p.length; i++) re += p[i] === "\\" ? lit(p[++i]) : p[i] === "%" ? ".*" : p[i] === "_" ? "." : lit(p[i]);
  return new RegExp(`^${re}$`, "s");
}

let table, calls;
function fakeRest(url, init = {}) {
  const u = new URL(String(url));
  const path = u.pathname.replace(/^\/rest\/v1\//, "");
  const q = u.searchParams;
  const prefer = init.headers?.Prefer ?? null;
  calls.push({ path, search: decodeURIComponent(u.search), prefer });
  const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
  if (path === "projects") {
    const id = { "eq.demo": DEMO, "eq.busy": BUSY }[q.get("key")];
    return json(id ? [{ id, key: q.get("key").slice(3) }] : []);
  }
  if (path === "information_containers")
    return json([{ id: C1, iso_name: "DT-ARC-M3-ZZ-0001", created_at: at(1), container_versions: [{ id: V1, revision: "P01", state: "published", is_live: true, created_at: at(2) }] }]);
  if (path !== "audit_log") return json([]);
  let rows = table.filter((r) => r.project_id === q.get("project_id").slice(3));
  for (const k of ["entity_type", "actor"]) if (q.get(k)) rows = rows.filter((r) => String(r[k]) === q.get(k).slice(3));
  const ent = q.get("entity_id");
  if (ent) {
    const ids = ent.startsWith("in.(") ? ent.slice(4, -1).split(",") : [ent.slice(3)];
    rows = rows.filter((r) => ids.includes(r.entity_id));
  }
  if (q.get("action")) { const re = like(q.get("action").slice(5)); rows = rows.filter((r) => re.test(r.action)); }
  for (const f of q.getAll("at")) {
    const v = f.slice(f.indexOf(".") + 1);
    rows = rows.filter((r) => (f.startsWith("gte.") ? r.at >= v : r.at < v));
  }
  rows.sort((a, b) => b.id - a.id);
  const limit = Number(q.get("limit")), offset = Number(q.get("offset") || 0);
  const page = rows.slice(offset, offset + limit);
  const total = /count=exact/.test(prefer || "") ? rows.length : "*";
  if (offset > 0 && offset >= rows.length) return json({ message: "Requested range not satisfiable" }, 416, { "Content-Range": `*/${total}` });
  return json(page, 200, { "Content-Range": page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}` });
}

const realFetch = globalThis.fetch;
beforeEach(() => { table = ledger(); calls = []; globalThis.fetch = vi.fn(async (url, init) => fakeRest(url, init)); });
afterEach(() => { globalThis.fetch = realFetch; });
const auditCalls = () => calls.filter((c) => c.path === "audit_log");

describe("sb({ count: true }) — the exact total from Content-Range, never a guess", () => {
  it("asks for count=exact and returns { data, total } from a-b/N", async () => {
    const r = await sb(`audit_log?project_id=eq.${DEMO}&select=*&order=id.desc&limit=2&offset=0`, { count: true });
    expect(r.data.map((x) => x.id)).toEqual([286, 285]);
    expect(r.total).toBe(286);
    expect(calls[0].prefer).toBe("count=exact");
  });

  it("an empty page (*/N) and a 416 past the end are data [] with the true total", async () => {
    expect(await sb(`audit_log?project_id=eq.${DEMO}&entity_type=eq.nothing&select=*&order=id.desc&limit=5&offset=0`, { count: true })).toEqual({ data: [], total: 0 });
    expect(await sb(`audit_log?project_id=eq.${DEMO}&select=*&order=id.desc&limit=5&offset=900`, { count: true })).toEqual({ data: [], total: 286 });
  });

  it("a reply without a total is an error, not a count", async () => {
    globalThis.fetch = vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Range": "0-0/*" } }));
    await expect(sb("audit_log?select=*", { count: true })).rejects.toThrow("Supabase gave no exact count (Content-Range: 0-0/*)");
  });

  it("without count, sb returns the rows as before", async () => {
    const rows = await sb(`audit_log?project_id=eq.${DEMO}&select=*&order=id.desc&limit=1&offset=0`);
    expect(rows.map((x) => x.id)).toEqual([286]);
    expect(calls[0].prefer).toBeNull();
  });
});

describe("auditQuery — the route's filters; a bad value is a 400 before any read", () => {
  it("no filters: newest 200 from offset 0", () => {
    expect(auditQuery({})).toEqual({ filter: "", limit: 200, offset: 0 });
    expect(auditQuery({ project: "demo", entity_type: "", actor: "  ", limit: "" })).toEqual({ filter: "", limit: 200, offset: 0 });
  });

  it("maps every filter to PostgREST, in order", () => {
    const q = auditQuery({ entity_type: "file_version", action_prefix: "verdict:", entity_id: V1, actor: "revit:yazan", since: "2026-09-01", until: "2026-09-25T12:00:00Z", limit: "50", offset: "100" });
    expect(q).toEqual({
      filter: `&entity_type=eq.file_version&action=like.verdict%3A*&entity_id=eq.${V1}&actor=eq.revit%3Ayazan&at=gte.2026-09-01T00%3A00%3A00.000Z&at=lt.2026-09-25T12%3A00%3A00.000Z`,
      limit: 50, offset: 100,
    });
  });

  it("a comma list of ids is in.(); LIKE's %, _ and \\ in a prefix are matched literally", () => {
    expect(auditQuery({ entity_id: `${V1}, ${V2}` }).filter).toBe(`&entity_id=in.(${V1},${V2})`);
    expect(auditQuery({ action_prefix: "100%_done\\" }).filter).toBe("&action=like.100%5C%25%5C_done%5C%5C*");
  });

  it("clamps the limit to 1000", () => {
    expect(AUDIT_MAX).toBe(1000);
    expect(auditQuery({ limit: 5000 }).limit).toBe(1000);
  });

  it.each([
    [{ entity_id: "nope" }, "entity_id must be a uuid or a comma list of uuids"],
    [{ entity_id: `${V1},nope` }, "entity_id must be a uuid or a comma list of uuids"],
    [{ action_prefix: "state:*" }, "action_prefix cannot contain * (PostgREST reads every * as a wildcard)"],
    [{ since: "yesterday" }, "since must be a date or date-time"],
    [{ until: "soon" }, "until must be a date or date-time"],
    [{ limit: "0" }, "limit must be an integer ≥ 1"],
    [{ limit: "ten" }, "limit must be an integer ≥ 1"],
    [{ limit: 2.5 }, "limit must be an integer ≥ 1"],
    [{ offset: "-1" }, "offset must be an integer ≥ 0"],
  ])("%j → 400", async (filters, message) => {
    expect(() => auditQuery(filters)).toThrow(message);
    await expect(listAudit("demo", filters)).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0); // refused before the project lookup
  });
});

describe("listAudit — { rows, total, limit, offset }", () => {
  it("unfiltered: the newest 200 of demo's 286, and the true total", async () => {
    const r = await listAudit("demo");
    expect(r.rows).toHaveLength(200);
    expect(r.rows[0].id).toBe(286);
    expect(r).toMatchObject({ total: 286, limit: 200, offset: 0 });
    expect(auditCalls()[0].prefer).toBe("count=exact");
  });

  it("the verdict filter finds the row the 200-row window missed", async () => {
    const r = await listAudit("demo", { entity_type: "file_version", action_prefix: "verdict:" });
    expect(r.rows.map((x) => x.id)).toEqual([44]);
    expect(r.total).toBe(1);
  });

  it("pages with offset; past the end is rows [] with the total", async () => {
    const page2 = await listAudit("demo", { offset: 200 });
    expect(page2.rows).toHaveLength(86);
    expect(page2.rows[0].id).toBe(86);
    expect(await listAudit("demo", { offset: 286 })).toEqual({ rows: [], total: 286, limit: 200, offset: 286 });
  });

  it("since / until bound the time; a big limit is clamped", async () => {
    const r = await listAudit("demo", { since: at(280), until: at(283) });
    expect(r.rows.map((x) => x.id)).toEqual([282, 281, 280]);
    expect(r.total).toBe(3);
    const all = await listAudit("demo", { limit: 5000 });
    expect(all.rows).toHaveLength(286);
    expect(all.limit).toBe(1000);
  });
});

describe("the checks read the ledger, not a 200-row window (the demo case)", () => {
  it("ids.last_verdict finds demo's verdict, the 243rd newest row", async () => {
    const r = await getCheck("ids.last_verdict").run("demo");
    expect(r).toMatchObject({ status: "met", summary: "All 1 adjudicated version(s) were accepted." });
    expect(auditCalls()[0].search).toContain("&entity_type=eq.file_version&action=like.verdict:*&select=*&order=id.desc&limit=1000&offset=0");
  });

  it("midp.review reads the published versions' state transitions, wherever they sit", async () => {
    const r = await getCheck("midp.review").run("demo");
    expect(r.status).toBe("met");
    expect(auditCalls()[0].search).toContain(`&entity_type=eq.container_version&action=like.state:*&entity_id=eq.${V1}&select=*`);
  });

  it("a read that returns fewer rows than its total is not_checkable: read N of M", async () => {
    const r = await getCheck("ids.last_verdict").run("busy");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("Read 1000 of 1203 verdict rows on this project's ledger — a partial read cannot confirm each version's latest verdict.");
    const review = classifyReview([{ iso_name: "A", versions: [{ id: V1, state: "published", revision: "P01" }] }], [], 2);
    expect(review.status).toBe("not_checkable");
    expect(review.reason).toBe("Read 0 of 2 state transitions of the published versions on this project's ledger — a partial read cannot judge review before issue.");
  });

  it("'No governed verdict has been recorded' only when the total is 0", () => {
    expect(classifyVerdicts([], 0).reason).toMatch(/^No governed verdict has been recorded/);
    expect(classifyVerdicts([], 3).reason).toMatch(/^Read 0 of 3 verdict rows/);
  });
});
