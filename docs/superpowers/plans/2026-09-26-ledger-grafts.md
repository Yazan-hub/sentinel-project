# Phase 4c — Ledger Grafts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ledger write a covered Revit tool makes is confirmed or honestly not confirmed in that tool's own words ("ledger #id · receipt <16 hex>…", "not confirmed — …", "not recorded — …"); the audit read has filters and an exact total so no check answers from a 200-row window; anyone can check a receipt against the ledger without a token and learn a yes/no and field names — never ledger values.

**Architecture:** Bridge: `listAudit` with filters and `Prefer: count=exact`, targeted reads for `ids.last_verdict` / `midp.review`; a pure `public-verify.mjs` (route predicate, parser, name-only comparison, one byte-identical miss, 8 KB cap, 60/min window) and a service-key `publicAuditRow` that never self-creates a project. Add-in: a pure `LedgerResult`/`LedgerLine` and `GovernedNotify.Event()` (blocking, never touches UI) that the IFC gate, Governed Publish, Naming Manager, Auto-Publish, the sync scan, fix-in-place and heal use per the spec's waiting rules.

**Tech Stack:** Node bridge (vitest), TypeScript web (vite), C# Revit add-in (net48 for 2024, net8 for 2025/26; `tools/event-check`, `tools/heal-check` net8 harnesses).

Spec: `docs/superpowers/specs/2026-09-25-ledger-grafts-4c-design.md`. Branch: `feature/ledger-grafts` from master **b6f49fe**.

## Global Constraints

- (controller) Master is **b6f49fe** = f24fa8a + the pane-fix merge (`App.cs`: `ViewActivated` subscription, `IsShown`, `OnViewActivated` and the ruleset-landing guard; `Updaters/SentinelUpdater.cs`; `UI/SentinelPanelViewModel.cs` `ShowLoading`; `RevitEventHub.cs` catch logging; `Engine/RuleEngineHost.cs` `Has`; one B5 row in `docs/TESTING_PROTOCOL.md`). The plan was verified on f24fa8a: every quoted old text still matches on b6f49fe, but lines in `App.cs` after ~160 sit about 33 lines lower — match text, not line numbers; the harness totals and npm counts below are unchanged by the pane fix (it touches no harness or web file).
- Execution order: Tasks 1, 2, 3, 4, 5, 6, then the controller's Task 7 (drill, merge). Where a task quotes text an earlier task changed, the amendments give that earlier task's version as the old text; amendments override a task's text where they conflict. Tasks 3-4 are the text in scratchpad\p4c-plan-C.md.
- Branch from master b6f49fe (see the controller line above). Never deploy from a task (the controller deploys in Task 7): always pass -p:DeployToRevit=false. Nobody pushes before Task 6 is committed.
- Add-in build (dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false, and 2025): green after every task, with 0 errors. 2024 has 6 warnings: ChangesetExecutor 164, Commands.BcfIssues 322, Commands.GhostBuilder 220, GhostBuilderOrchestrator 112, RuleRegex 17 and 20. 2025 has 3: Commands.Annotate 76 and 88, Commands.BcfIssues 322. Tasks 1, 2 and 6 touch no C#.
- Build state per task: T3 is green (callers ignore the new return values until T4); T4 green; T5 green; no red window.
- npm test (cd WebApp && npm test; without config/.env set dummy SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_ANON_KEY): master 992 in 74 files; after T1 1017 in 75; after T2 1041 in 76; T3-T6 unchanged at 1041 in 76.
- Per-file vitest counts: audit-read 25, check-registry 74, mcp-server 29 (T1: RED 26 failed / 102 passed of 128, GREEN 128/128). public-verify 22, sentinel-verify 16, cors-origin 8, agent-provenance 19 (T2: RED 2 failed / 22 passed of 24 with public-verify.test failing to load; GREEN 65/65).
- tsc (npx tsc --noEmit -p . in WebApp): 24 errors in the repo throughout. After T1 the pre-existing files-panel error moves from (108,57) to (109,57). An archive copy shows 25 because src/generated/fragments-worker is untracked.
- Harness totals: event-check 42/42 after T3, 44/44 from T4. heal-check 6/9 at T5 Step 4, 9/9 from T5. Unchanged throughout: project-context-check 19/19, gate-check 123/123, fixplace-check 52/52, naming-check 37/37, org-check 46/46, snapshot-check 21/21, ghost-standards-check 125/125, artefact-cache-check 53/53.
- Task 2 transport smoke (scratchpad\p4c-public-smoke.mjs, run on a COPY of WebApp\bridge against a fake PostgREST on :4195/:4196): 13/13. It is not run in CI and never against the running bridge on :4100.
- CI: T3 renames the Revit-free step to "... + ghost standards + ledger events)" and adds tools/event-check. T5 renames it to "... + ledger events + heal)" and adds tools/heal-check.
- File ownership, T1: cde-store sb and listAudit/auditQuery, check-registry(.test), bcf-service's GET /cde/:key/audit line, mcp-server(.test), ai-tools, cde-panel.ts, files-panel.ts, docs/mcp-server.md:14.
- File ownership, T2: public-verify.mjs(.test), cde-store publicAuditRow, bcf-service's import, startup log, publicReceiptVerify, auth gate and receipt comment; public-client/sentinel-verify(.test), cors-origin(.test). T2 does NOT edit docs/verdict-contract.md.
- File ownership, T3: LedgerResult.cs, tools/event-check, GovernedNotify's summary, Event, ModelPublished, DeliveryGate and NamingRenamed.
- File ownership, T4: GovernedNotify.OfficeScan, Commands.IfcGate, Commands.GovernedPublish, Commands.NamingManager, NamingManagerService, AutoPublish, App.cs, Commands.BcfIssues, one event-check pin.
- File ownership, T5: HealRecord.cs, FamilyProcessor.cs, Commands.Phase2.cs, tools/heal-check.
- File ownership, T6: every doc (TESTING_PROTOCOL B8, handbook 03 and 05, verdict-contract §4-§6, SENTINEL_HANDBOOK, SENTINEL-USER-GUIDE, PILOT_DEMO_RUNBOOK, SECURITY_F2_ACTIVATION).
- Threading: GovernedNotify.Event and LedgerResult.Post block (6 s default), never throw and never touch UI — no LogDoctor, no Dispatcher.Invoke.
- Threading: modal tools wait with Task.Run(() => ...).GetAwaiter().GetResult(). That covers the IFC gate's Certify (both the command-body path and the export's Events job), Governed Publish's gate row BEFORE /propose, and heal inside its Events job.
- Threading: Naming Manager's batch row goes on a task, and its continuation calls window.SetStatus after the job has returned.
- Threading: AutoPublish.ModelPublished and OfficeScan run on Task.Run and are never waited on. Their continuation logs through BeginInvoke on the pane dispatcher (Application.Current?.Dispatcher ?? Dispatcher.CurrentDispatcher, captured on the API thread). OfficeScan's continuation re-reads the journey after ANY answer, because /office/scan never returns a hash.
- Threading: no Revit object crosses to a worker. The key (ProjectContext.For(doc).Key) and the payloads are built on the API thread.
- Threading: Governed Publish's RegisterVersionId, stamp /propose and LiveVersion stay on the API thread (120 s client), as on master. Moving them is phase 5.
- Honesty, Revit lines: every covered surface prints only LedgerLine.For or LedgerLine.Sentence. "ledger #<id> · receipt <16 hex>…" appears only with an integer id and a 64-hex hash the bridge returned.
- Honesty, not recorded: only for HTTP 400/401/403/404/503, a refused, unreachable or unresolvable bridge, or a throttled or unsent scan.
- Honesty, not confirmed: a timeout, any other status (500 and a proxy's 502 included), or a 2xx without a hash, with "(the entry may have landed)" where the entry could have landed.
- Honesty, not bound: an empty key sends nothing and says ProjectContext.NotBound (the IFC gate and heal prefix it with "Not recorded on the web: ").
- Honesty, badge: Governed Publish claims the version badge only when RegisterVersionId returned an id and the stamp reached the bridge with the same verdict; otherwise it says "Version badge: not confirmed — <reason>."
- Honesty, the chain: it is described as one chain over every project's rows that nothing recomputes. A public match says "matches the ledger's stored hash; the chain is not recomputed".
- Honesty, drill: never claim the drill rows before B8 has run. The capability row stays 🟩 Built until Task 7 flips it to ✅.
- Security: the anonymous verify reply carries field names only, never a ledger value (no hash, prev_hash, at, actor, verdict, summary, agent, id or key). It uses one byte-identical MISS, {"matches":false,"note":"no ledger entry on this key has that id and hash"}, for an unknown key, unknown id, other project, wrong hash and hashless row.
- Security: publicAuditRow reads with the service key only, whatever Authorization was sent. It never calls ensureProject (no 'default' self-heal, no key-specific 404 or 403), and an unknown key costs the same two GETs, the second against the nil uuid.
- Security: malformed input is a 400 before any read. The public body is capped at 8 KB (413) and there is one global in-process 60-per-minute window (429). Access-Control-Allow-Origin: * applies on that path only, with no credentials. The log records method, path and outcome, never the body.
- Security: GET /receipt/:key/:id and every /cde route still return 401 without a bearer. A wrong bearer is treated as none and gets the hash-only reply. With BCF_TOKEN unset (legacy mode) nothing changes.
- Audit read: GET /cde/:key/audit always answers {rows, total, limit, offset}. The total is exact (Prefer: count=exact plus Content-Range; */N or a 416 give rows []), never planned or estimated. limit defaults to 200 and is clamped to 1000.
- Audit read: a bad filter is a 400 before the project lookup. action_prefix escapes % _ and \ and refuses a literal * (PostgREST reads every * as a wildcard).
- Audit read: ids.last_verdict and midp.review read their own filtered rows and say "Read N of M" when fewer rows than the total came back. "No governed verdict has been recorded" is said only when the total is 0.
- Machine independence: no harness or test reads %AppData% or the running bridge, and the scratch copies run with no config/.env. Harnesses are net8 consoles compiling pure add-in files only (event-check uses SENTINEL_CHECK for ProjectContext.cs).
- Commits: every commit message ends with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- Windows: quote paths (they contain spaces). The working tree is CRLF under core.autocrlf, and plan text is LF, so match text, not bytes. Scripts passed through a Bash heredoc stay backslash-free or are written to a file first.
- Markdown tables: no | inside a cell. The B8 rows have exactly 3 pipes and the capability rows 4.

---

### Task 1: Bridge + web — `GET /cde/:key/audit` answers `{rows, total, limit, offset}` with filters and an exact total; `ids.last_verdict` and `midp.review` read the ledger rows they judge, not a 200-row window, and say "Read N of M" when a read is partial; the five readers move in the same commit

**Files:**
- Create: `WebApp/bridge/audit-read.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (`sb`: the comment and signature :30-33, the Prefer line :42, after the parse :56; `listAudit` :586-589)
- Modify: `WebApp/bridge/check-registry.mjs` (import :11; `classifyVerdicts` head :135-140; `classifyReview` signature :358 and the published guard :365-366; the unmeasured detail :390; the two `run`s :483 and :542-543)
- Modify: `WebApp/bridge/check-registry.test.mjs` (:600-604, the one test that pins the "audit window" wording)
- Modify: `WebApp/bridge/bcf-service.mjs` (:1058, the GET route)
- Modify: `WebApp/bridge/mcp-server.mjs` (`sentinel_audit` definition :49, dispatch :184-188); `WebApp/bridge/mcp-server.test.mjs` (:107-112)
- Modify: `WebApp/bridge/ai-tools.mjs` (`read_audit` :70-78)
- Modify: `WebApp/src/setups/cde-panel.ts` (`Audit` :33, `loadAll` :221-222, `renderAudit` :298-302)
- Modify: `WebApp/src/setups/files-panel.ts` (`auditByEntity` :64, `load` :123-135, `historyBlock` :313)
- Modify: `docs/mcp-server.md` (:14, the `sentinel_audit` row — the tool's reply changes shape in this commit)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-ledger-grafts-4c-design.md` Decisions 4 and 5; `WebApp/bridge/cde-store.mjs:25` (`isUuid`), `:77-98` (`ensureProject` — an unknown key stays a 404; the filters are validated before it runs), `:626` (`SNAP_PAGE = 1000`, the db-max-rows the repo assumes — asserted, not verified live), `:812-818` (`getAuditEntry`, untouched; Task 2's `publicAuditRow` sits beside it), `:941-960` (`versionVerdicts` / `listVersionVerdictRows`, already filtered with `like.verdict:*`, untouched); `WebApp/bridge/bcf-service.mjs:240-259` (`send` scrubs only a 500's message, so a 400's text reaches the caller) and `:1248-1253` (the CDE catch answers `e.status`); `WebApp/bridge/check-registry.mjs:578-612` (`runCheck` turns a throw into `error`; `runCheckScoped` rolls an office up by calling `run(key)` per project — unchanged); `WebApp/bridge/bimdocs-store.mjs:340`, `:381` (compliance and readiness call `runCheck`; the result shape is unchanged); `WebApp/bridge/cde-store-actor.test.mjs:1-22` (the fetch-stub pattern; that file needs `config/.env`, the new one does not); `WebApp/src/setups/files-panel.ts:22-35` (`Version.id`, `FileRec.id`, `AuditEvent`), `:310-313` (`historyBlock`), `:334-352` (`verdictOf` / `verdictBadge` read `auditByEntity`, so the badge comes back with the filtered read).

**Interfaces:**
- Consumes: `ensureProject(key)`, `isUuid(v)`, `listFiles(key)` (cde-store.mjs, unchanged); `result(id, label, status, {count, summary, reason, evidence})` (check-registry.mjs:18-20).
- Produces:
  - `sb(path, { method = "GET", body, prefer, service = false, count = false } = {})` — with `count: true`: `Prefer` carries `count=exact` (comma-joined after any `prefer`) and the call resolves `{ data, total }`; `total` is the `N` of `Content-Range: a-b/N`; `*/N` (an empty page) and a 416 (an offset past the end) are `{ data: [], total: N }`; a reply without `N` throws `Supabase gave no exact count (Content-Range: <header or none>)` (a 500 at the route, scrubbed). Without `count`, unchanged.
  - `export const AUDIT_LIMIT = 200, AUDIT_MAX = 1000;` (cde-store.mjs)
  - `export function auditQuery(filters = {}) → { filter: string, limit: number, offset: number }` — pure. `entity_type` → `&entity_type=eq.<v>`; `action_prefix` → `&action=like.<p with \ % _ escaped>*`; `entity_id` → `&entity_id=eq.<uuid>` or `&entity_id=in.(<uuid>,…)`; `actor` → `&actor=eq.<v>`; `since` → `&at=gte.<ISO>`; `until` → `&at=lt.<ISO>`; `limit` default 200, clamped to 1000; `offset` default 0. A blank value is no filter; other keys are ignored. Throws `Error` with `status: 400` and exactly one of: `entity_id must be a uuid or a comma list of uuids`, `action_prefix cannot contain * (PostgREST reads every * as a wildcard)`, `since must be a date or date-time`, `until must be a date or date-time`, `limit must be an integer ≥ 1`, `offset must be an integer ≥ 0`.
  - `export async function listAudit(key, filters = {}) → Promise<{ rows, total, limit, offset }>` — newest first (`order=id.desc`); `total` is the exact count of rows matching the filter; a bad filter is the 400 before `ensureProject` or any read.
  - `GET /cde/:key/audit?entity_type=&action_prefix=&entity_id=&actor=&since=&until=&limit=&offset=` → 200 `{rows, total, limit, offset}`; 400 `{message}` for a bad filter; unknown key 404 as before.
  - `classifyVerdicts(auditRows, total?)` — `total` given and fewer verdict rows than it → `not_checkable` "Read N of M verdict rows on this project's ledger — a partial read cannot confirm each version's latest verdict."; "No governed verdict has been recorded …" only when the verdict rows (and so the total) are 0. `classifyReview(files, auditRows, total?)` — fewer rows than `total` → `not_checkable` "Read N of M state transitions of the published versions on this project's ledger — a partial read cannot judge review before issue."; a version missing a transition reads "its state:wip->shared or state:shared->published row is not on the ledger, so review cannot be judged". Without `total`, the rows given are all there is (existing callers and tests unchanged).
  - MCP `sentinel_audit {project, limit?, offset?, entity_type?, action_prefix?, entity_id?, actor?, since?, until?}` → the route's reply (limit 50 unless given). ai-tools `read_audit {project, limit?, entity_type?, action_prefix?}` → `listAudit`'s reply (limit 50 unless given).

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/audit-read.test.mjs`:

```js
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
```

In `WebApp/bridge/check-registry.test.mjs` replace lines 600-604:

```js
  it("missing transitions (outside the audit window) are unmeasured, not a pass", () => {
    const r = classifyReview([file("A", [v("v1")])], []);
    expect(r.status).toBe("not_checkable");
    expect(r.evidence[0].detail).toMatch(/outside the audit window/);
  });
```

with:

```js
  it("missing transitions (not on the ledger) are unmeasured, not a pass", () => {
    const r = classifyReview([file("A", [v("v1")])], []);
    expect(r.status).toBe("not_checkable");
    expect(r.evidence[0].detail).toBe("its state:wip->shared or state:shared->published row is not on the ledger, so review cannot be judged");
  });
```

(Once `midp.review` reads every transition of the published ids, a missing one is absent from the ledger, not outside a window.)

In `WebApp/bridge/mcp-server.test.mjs` replace lines 107-112:

```js
  it("audit still GETs and slices to limit", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: i }));
    const fetch = vi.fn(async () => okJson(rows));
    const r = await callTool("sentinel_audit", { project: "demo", limit: 10 }, { fetch });
    expect(r).toHaveLength(10);
  });
```

with:

```js
  it("audit passes limit (default 50) and the filters to the route and returns its {rows, total, limit, offset}", async () => {
    const page = { rows: [{ id: 44 }], total: 1, limit: 10, offset: 0 };
    const fetch = vi.fn(async () => okJson(page));
    expect(await callTool("sentinel_audit", { project: "demo", limit: 10, entity_type: "file_version", action_prefix: "verdict:", actor: "" }, { fetch })).toEqual(page);
    expect(fetch.mock.calls[0][0]).toMatch(/\/cde\/demo\/audit\?limit=10&entity_type=file_version&action_prefix=verdict%3A$/);
    await callTool("sentinel_audit", { project: "demo" }, { fetch });
    expect(fetch.mock.calls[1][0]).toMatch(/\/cde\/demo\/audit\?limit=50$/);
  });
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/audit-read.test.mjs bridge/check-registry.test.mjs bridge/mcp-server.test.mjs
```

Expected:

```
 ❯ bridge/mcp-server.test.mjs (29 tests | 1 failed)
 ❯ bridge/check-registry.test.mjs (74 tests | 1 failed)
 ❯ bridge/audit-read.test.mjs (25 tests | 24 failed)
 Test Files  3 failed (3)
      Tests  26 failed | 102 passed (128)
```

`auditQuery` and `AUDIT_MAX` are not exported yet, so they import as `undefined` (vitest does not fail the import) and every test that uses them fails; the only audit-read test that passes is "without count, sb returns the rows as before". The demo case fails the way the live bridge does today — `ids.last_verdict` on the fixture answers `status: "not_checkable"`, `summary: ""` (the false "No governed verdict has been recorded on this project yet"), because master reads the newest 200 and the verdict is the 243rd; `midp.review` answers `not_checkable` for the same reason. check-registry fails on the old "outside the audit window" wording; mcp-server fails because the URL carries no query.

- [ ] **Step 3: `sb` — an exact total when asked**

In `WebApp/bridge/cde-store.mjs` replace lines 32-33:

```js
// (audit_log inserts, bridge_events) — those must bypass RLS by design.
export async function sb(path, { method = "GET", body, prefer, service = false } = {}) {
```

with:

```js
// (audit_log inserts, bridge_events) — those must bypass RLS by design.
// `count: true` adds Prefer count=exact and returns { data, total }: total is the N of Content-Range "a-b/N", or of
// "*/N" for an empty page or a 416 (an offset past the end), both data []. A reply with no N is an error, never a
// planned or estimated count.
export async function sb(path, { method = "GET", body, prefer, service = false, count = false } = {}) {
```

Replace line 42:

```js
  if (prefer) headers.Prefer = prefer;
```

with:

```js
  if (prefer || count) headers.Prefer = [prefer, count && "count=exact"].filter(Boolean).join(",");
```

Replace lines 56-57 (master numbering):

```js
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
```

with:

```js
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (count && (r.ok || r.status === 416)) {
    const range = r.headers.get("content-range") || "";
    const m = /^(\*|\d+-\d+)\/(\d+)$/.exec(range);
    if (!m) throw new Error(`Supabase gave no exact count (Content-Range: ${range || "none"})`);
    return { data: m[1] === "*" ? [] : data, total: Number(m[2]) };
  }
  if (!r.ok) {
```

Every other status still takes the existing error path (401/403 keep their status). No caller passes `count` except `listAudit`, so every other read and write is unchanged.

- [ ] **Step 4: `listAudit` — filters, paging and the total**

In `WebApp/bridge/cde-store.mjs` replace lines 586-589 (master numbering; +9 after Step 3):

```js
export async function listAudit(key) {
  const proj = await ensureProject(key);
  return sb(`audit_log?project_id=eq.${proj.id}&select=*&order=id.desc&limit=200`);
}
```

with:

```js
/** The ledger read's page: 200 rows unless asked, never more than 1000 (the db-max-rows SNAP_PAGE assumes). */
export const AUDIT_LIMIT = 200, AUDIT_MAX = 1000;

/** GET /cde/:key/audit's query → { filter, limit, offset } for PostgREST. Pure; a bad value throws a 400 before any
 *  read. entity_type and actor match exactly; action_prefix → like.<p>* with LIKE's \ % _ escaped (PostgREST turns
 *  every * into %, so a * cannot be matched literally and is refused); entity_id is a uuid or a comma list (→ in.());
 *  since / until → at=gte. / at=lt.; limit defaults to 200 and is clamped to 1000; offset ≥ 0. A blank value is no
 *  filter; other keys are ignored. */
export function auditQuery(f = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const has = (k) => f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== "";
  const val = (k) => String(f[k]).trim();
  let filter = "";
  if (has("entity_type")) filter += `&entity_type=eq.${encodeURIComponent(val("entity_type"))}`;
  if (has("action_prefix")) {
    const p = String(f.action_prefix);
    if (p.includes("*")) throw bad("action_prefix cannot contain * (PostgREST reads every * as a wildcard)");
    filter += `&action=like.${encodeURIComponent(p.replace(/[\\%_]/g, "\\$&"))}*`;
  }
  if (has("entity_id")) {
    const ids = val("entity_id").split(",").map((s) => s.trim());
    if (!ids.every(isUuid)) throw bad("entity_id must be a uuid or a comma list of uuids");
    filter += ids.length === 1 ? `&entity_id=eq.${ids[0]}` : `&entity_id=in.(${ids.join(",")})`;
  }
  if (has("actor")) filter += `&actor=eq.${encodeURIComponent(val("actor"))}`;
  for (const [k, op] of [["since", "gte"], ["until", "lt"]]) {
    if (!has(k)) continue;
    const t = Date.parse(val(k));
    if (Number.isNaN(t)) throw bad(`${k} must be a date or date-time`);
    filter += `&at=${op}.${encodeURIComponent(new Date(t).toISOString())}`;
  }
  const int = (k, dflt, min) => {
    if (!has(k)) return dflt;
    const n = Number(val(k));
    if (!Number.isInteger(n) || n < min) throw bad(`${k} must be an integer ≥ ${min}`);
    return n;
  };
  return { filter, limit: Math.min(int("limit", AUDIT_LIMIT, 1), AUDIT_MAX), offset: int("offset", 0, 0) };
}

/** The project's ledger rows, newest first, filtered and paged: { rows, total, limit, offset }. `total` is the exact
 *  count of rows matching the filter (not of the page), so a reader that got fewer rows than the total knows it. */
export async function listAudit(key, filters = {}) {
  const { filter, limit, offset } = auditQuery(filters);
  const proj = await ensureProject(key);
  const { data, total } = await sb(`audit_log?project_id=eq.${proj.id}${filter}&select=*&order=id.desc&limit=${limit}&offset=${offset}`, { count: true });
  return { rows: data, total, limit, offset };
}
```

Notes: `action_prefix` is not trimmed (a prefix may end in a space, as in `Proposal `); `%`, `_` and `\` are escaped with a backslash, which is Postgres LIKE's default escape. A literal `*` cannot be escaped — PostgREST rewrites every `*` to `%` before SQL sees the pattern — so it is refused rather than silently widened. No prefix Sentinel reads (`verdict:`, `state:`) contains one.

- [ ] **Step 5: the two checks read what they judge, with the total**

In `WebApp/bridge/check-registry.mjs` replace line 11:

```js
import { listFiles, getProjectMeta, listAudit, projectNamingRuleset, listTransmittals, NO_NAMING_REASON } from "./cde-store.mjs";
```

with:

```js
import { listFiles, getProjectMeta, listAudit, AUDIT_MAX, projectNamingRuleset, listTransmittals, NO_NAMING_REASON } from "./cde-store.mjs";
```

Replace lines 135-140:

```js
export function classifyVerdicts(auditRows) {
  const id = "ids.last_verdict", label = "Governed adjudication verdicts";
  const newest = new Map(); // entity_id -> row (audit rows arrive newest-first; keep the first seen)
  for (const r of auditRows) {
    if (r.entity_type !== "file_version" || !String(r.action || "").startsWith("verdict:")) continue;
    const prev = newest.get(r.entity_id);
```

with:

```js
/** `total` is the ledger's count of verdict rows (listAudit's total for the verdict filter); fewer rows than that is a
 *  partial read, which cannot say which verdict is each version's latest. Omitted, the rows given are all there is. */
export function classifyVerdicts(auditRows, total) {
  const id = "ids.last_verdict", label = "Governed adjudication verdicts";
  const verdictRows = auditRows.filter((r) => r.entity_type === "file_version" && String(r.action || "").startsWith("verdict:"));
  if (total !== undefined && verdictRows.length < total)
    return result(id, label, "not_checkable", { reason: `Read ${verdictRows.length} of ${total} verdict rows on this project's ledger — a partial read cannot confirm each version's latest verdict.` });
  const newest = new Map(); // entity_id -> row (audit rows arrive newest-first; keep the first seen)
  for (const r of verdictRows) {
    const prev = newest.get(r.entity_id);
```

The rest of `classifyVerdicts` is unchanged: with a complete read, `newest` is empty only when there are no verdict rows, so "No governed verdict has been recorded on this project yet" is said only when the total is 0.

Replace line 358:

```js
export function classifyReview(files, auditRows) {
```

with:

```js
/** `total` is the ledger's count of the rows asked for (listAudit's total); fewer rows than that is a partial read. */
export function classifyReview(files, auditRows, total) {
```

Replace lines 365-366:

```js
  if (!published.length)
    return result(id, label, "not_checkable", { reason: "Nothing has reached published on this project yet, so there is no issue to have reviewed." });
```

with:

```js
  if (!published.length)
    return result(id, label, "not_checkable", { reason: "Nothing has reached published on this project yet, so there is no issue to have reviewed." });
  if (total !== undefined && (auditRows || []).length < total)
    return result(id, label, "not_checkable", { reason: `Read ${(auditRows || []).length} of ${total} state transitions of the published versions on this project's ledger — a partial read cannot judge review before issue.` });
```

Replace line 390:

```js
          ? "its state transitions are outside the audit window read here, so review cannot be judged"
```

with:

```js
          ? "its state:wip->shared or state:shared->published row is not on the ledger, so review cannot be judged"
```

Replace line 483:

```js
    async run(key) { return classifyVerdicts(await listAudit(key)); },
```

with:

```js
    async run(key) {
      const { rows, total } = await listAudit(key, { entity_type: "file_version", action_prefix: "verdict:", limit: AUDIT_MAX });
      return classifyVerdicts(rows, total);
    },
```

Replace lines 542-543:

```js
      const [files, rows] = await Promise.all([listFiles(key), listAudit(key)]);
      return classifyReview(files, rows);
```

with:

```js
      const files = await listFiles(key);
      const ids = files.flatMap((f) => (f.versions || []).filter((v) => v.state === "published").map((v) => v.id));
      if (!ids.length) return classifyReview(files, []);
      // ponytail: every published id in one GET; batch the ids if a project publishes hundreds of versions.
      const { rows, total } = await listAudit(key, { entity_type: "container_version", action_prefix: "state:", entity_id: ids.join(","), limit: AUDIT_MAX });
      return classifyReview(files, rows, total);
```

(If PostgREST's real db-max-rows is below 1000, a read returns fewer rows than asked while `total` stays exact, so the checks say "Read N of M" — never a pass.)

- [ ] **Step 6: the route, the MCP tool and the in-app agent tool**

In `WebApp/bridge/bcf-service.mjs` replace line 1058:

```js
      if (p2 === "audit" && req.method === "GET") return send(res, 200, await cde.listAudit(p1));
```

with:

```js
      // GET /cde/:key/audit?entity_type=&action_prefix=&entity_id=&actor=&since=&until=&limit=&offset=
      //   → { rows, total, limit, offset }, newest first; total is exact; a bad filter is a 400 (cde-store.mjs auditQuery).
      if (p2 === "audit" && req.method === "GET") return send(res, 200, await cde.listAudit(p1, Object.fromEntries(url.searchParams)));
```

(The CDE catch at :1248-1253 answers `e.status`, so the 400 and its message reach the caller; `send` scrubs only a 500.)

In `WebApp/bridge/mcp-server.mjs` replace line 49:

```js
  { name: "sentinel_audit", description: "Read a project's immutable, hash-chained audit trail (the governed record of proposals, clashes, ISO 19650 state transitions).", inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" }, limit: { type: "number" } } } },
```

with:

```js
  { name: "sentinel_audit", description: "Read a project's ledger (audit_log: proposals, verdicts, clashes, gate rows, ISO 19650 state transitions), newest first, as {rows, total, limit, offset} — total is the exact count of matching rows, so fewer rows than total means there is more to page through with offset. Filters: entity_type, action_prefix (e.g. \"verdict:\", \"state:\"), entity_id (a uuid or a comma list), actor, since, until. limit defaults to 50, at most 1000. The hash chain is one chain across all projects and is not recomputed by this read.", inputSchema: { type: "object", required: ["project"], properties: { project: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, entity_type: { type: "string" }, action_prefix: { type: "string" }, entity_id: { type: "string" }, actor: { type: "string" }, since: { type: "string" }, until: { type: "string" } } } },
```

Replace lines 185-187:

```js
    const project = need(args, "project");
    const rows = await getJson(`/cde/${enc(project)}/audit`);
    return Array.isArray(rows) ? rows.slice(0, args.limit || 50) : rows;
```

with:

```js
    const project = need(args, "project");
    const q = new URLSearchParams({ limit: String(args.limit ?? 50) });
    for (const k of ["offset", "entity_type", "action_prefix", "entity_id", "actor", "since", "until"])
      if (args[k] !== undefined && args[k] !== "") q.set(k, String(args[k]));
    return await getJson(`/cde/${enc(project)}/audit?${q}`);
```

In `WebApp/bridge/ai-tools.mjs` replace lines 70-78:

```js
    description: "Read the project's immutable, hash-chained audit trail — every proposal verdict, state transition and publish. This is the golden-thread record; cite it when asked what happened or who did what.",
    input_schema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string" }, limit: { type: "number", description: "most recent N rows (default 50)" } },
    },
    run: async ({ project, limit }) => {
      const rows = await cde.listAudit(project);
      return Array.isArray(rows) ? rows.slice(0, limit || 50) : rows;
    },
```

with:

```js
    description: "Read the project's ledger (audit_log) newest first — every proposal verdict, state transition and publish — as {rows, total, limit, offset}; total is the exact count of matching rows, so fewer rows than total means older rows were not read. This is the golden-thread record; cite it when asked what happened or who did what. The hash chain is one chain across all projects and this read does not recompute it.",
    input_schema: {
      type: "object", required: ["project"],
      properties: {
        project: { type: "string" },
        limit: { type: "number", description: "most recent N rows (default 50, at most 1000)" },
        entity_type: { type: "string", description: "only this entity type, e.g. file_version, container_version, proposal, delivery_gate" },
        action_prefix: { type: "string", description: "only actions starting with this, e.g. verdict: or state:" },
      },
    },
    run: ({ project, limit, entity_type, action_prefix }) => cde.listAudit(project, { entity_type, action_prefix, limit: limit ?? 50 }),
```

(`read_audit` is a pass-through with no test of its own; `runTool` already turns a thrown 400 into the agent's error. `/ai/tools` serves the new schema as is.)

- [ ] **Step 7: the web panels read the new shape**

In `WebApp/src/setups/cde-panel.ts` replace line 33:

```ts
interface Audit { id: number; action: string; actor?: string; at: string; entity_type?: string; }
```

with:

```ts
interface Audit { id: number; action: string; actor?: string; at: string; entity_type?: string; }
// GET /cde/:key/audit's reply: a page of the ledger, newest first, and the exact count of its rows.
interface AuditPage { rows: Audit[]; total: number; }
```

Replace lines 221-222:

```ts
      const audit = (await api(`${encodeURIComponent(pid())}/audit`)) as Audit[];
      renderAudit(audit);
```

with:

```ts
      renderAudit((await api(`${encodeURIComponent(pid())}/audit?limit=20`)) as AuditPage);
```

Replace lines 298-302:

```ts
  function renderAudit(rows: Audit[]) {
    el("cde-audit").innerHTML =
      '<div style="color:#71717a;margin-bottom:.2rem">Audit trail (append-only · hash-chained)</div>' +
      (rows.length
        ? rows.slice(0, 20).map((a) => {
```

with:

```ts
  function renderAudit({ rows, total }: AuditPage) {
    el("cde-audit").innerHTML =
      `<div style="color:#71717a;margin-bottom:.2rem">Ledger (append-only · one hash chain across all projects) — newest ${rows.length} of ${total}</div>` +
      (rows.length
        ? rows.map((a) => {
```

In `WebApp/src/setups/files-panel.ts` replace line 64:

```ts
  let auditByEntity = new Map<string, AuditEvent[]>(); // entity_id → its audit events (for the version history)
```

with:

```ts
  let auditByEntity = new Map<string, AuditEvent[]>(); // entity_id → its audit events (for the version history)
  let historyGap = ""; // set when the ledger read failed or was partial — an empty history then says so
```

Replace lines 123-135 (master numbering; +1 after the line above):

```ts
      // Immutable audit trail → per-version history (uploaded / set live / state transitions, with who + when).
      // Keyed on entity_id, which the bridge sets to the container_version id for all version events.
      auditByEntity = new Map();
      try {
        const rows = (await api(`${encodeURIComponent(pid())}/audit`)) as AuditEvent[];
        for (const r of Array.isArray(rows) ? rows : []) {
          if (!r.entity_id) continue;
          const list = auditByEntity.get(r.entity_id) ?? auditByEntity.set(r.entity_id, []).get(r.entity_id)!;
          list.push(r);
        }
      } catch { /* audit unavailable — history just shows empty, panel still works */ }
      render();
      status(`${files.length} file(s) · ${files.reduce((n, f) => n + f.version_count, 0)} version(s).`);
```

with:

```ts
      // The ledger → per-version history (uploaded / set live / state transitions / verdicts, with who + when): only
      // the rows of these files and their versions (entity_id), however old, with the exact total.
      auditByEntity = new Map();
      historyGap = "";
      const ids = files.flatMap((f) => [f.id, ...f.versions.map((v) => v.id)]);
      if (ids.length) {
        try {
          // ponytail: every id in one GET; batch the ids if a project's files and versions reach the hundreds.
          const { rows, total } = (await api(`${encodeURIComponent(pid())}/audit?entity_id=${ids.join(",")}&limit=1000`)) as { rows: AuditEvent[]; total: number };
          for (const r of rows) {
            if (!r.entity_id) continue;
            const list = auditByEntity.get(r.entity_id) ?? auditByEntity.set(r.entity_id, []).get(r.entity_id)!;
            list.push(r);
          }
          if (rows.length < total) historyGap = `History read ${rows.length} of ${total} ledger rows (the newest).`;
        } catch (e) { historyGap = `History unavailable — ${(e as Error).message}.`; }
      }
      render();
      status(`${files.length} file(s) · ${files.reduce((n, f) => n + f.version_count, 0)} version(s).${historyGap ? " " + historyGap : ""}`);
```

Replace line 313 (master numbering; +7 after the two edits above):

```ts
      return '<div style="padding:.3rem .6rem .45rem 2rem;border-top:1px dashed #2a2a30;background:#141418;color:#71717a;font-size:11px">No recorded history for this version yet.</div>';
```

with:

```ts
      return `<div style="padding:.3rem .6rem .45rem 2rem;border-top:1px dashed #2a2a30;background:#141418;color:#71717a;font-size:11px">${esc(historyGap || "No recorded history for this version yet.")}</div>`;
```

The files panel's verdict badge (`verdictOf`, :334-341) reads `auditByEntity`, so demo's judged version gets its badge back and its History no longer says "No recorded history" (the 200-row cut hid both). A failed or partial read now says so instead of "No recorded history".

- [ ] **Step 8: the MCP doc row**

In `docs/mcp-server.md` replace line 14:

```
| `sentinel_audit` | Read a project's immutable audit trail (proposals, clashes, ISO 19650 state transitions). |
```

with:

```
| `sentinel_audit` | Read a project's ledger (proposals, verdicts, clashes, gate rows, ISO 19650 state transitions) newest first as `{rows, total, limit, offset}` — `total` is exact, so fewer rows than `total` means there is more. Filters: `entity_type`, `action_prefix`, `entity_id`, `actor`, `since`, `until`; `limit` (default 50, at most 1000) and `offset`. The hash chain is one chain across all projects; this read does not recompute it. Read-only. |
```

- [ ] **Step 9: GREEN — the three files, the whole suite, tsc**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/audit-read.test.mjs bridge/check-registry.test.mjs bridge/mcp-server.test.mjs
```

Expected:

```
 ✓ bridge/mcp-server.test.mjs (29 tests)
 ✓ bridge/check-registry.test.mjs (74 tests)
 ✓ bridge/audit-read.test.mjs (25 tests)
 Test Files  3 passed (3)
      Tests  128 passed (128)
```

```bash
npm test
```

Expected: `Test Files  75 passed (75)` and `Tests  1017 passed (1017)` (master 992 in 74, plus audit-read's 25; the two replaced tests keep their counts).

```bash
npx tsc --noEmit -p . 2>&1 | grep -c "error TS"
npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep "cde-panel\|files-panel"
```

Expected: `24`, and the one line `src/setups/files-panel.ts(109,57): error TS2345: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BufferSource'.` — the pre-existing `sha256Hex` error, at (108,57) on master, one line lower because of `historyGap`. No new error.

(Verified on a scratch copy of f24fa8a on 2026-09-25: RED 26 failed | 102 passed (128); GREEN 128/128 and 1017 in 75. The copy has no `config/.env`, so the suite ran with dummy `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `SUPABASE_ANON_KEY` in the environment, which only `cde-store-actor.test.mjs` needs; master gave 992 in 74 the same way. `audit-read.test.mjs`, `check-registry.test.mjs` and `mcp-server.test.mjs` also pass with no Supabase variables at all, 128/128. The copy's tsc count is 25 because `src/generated/fragments-worker` is untracked; the repo has 24 before and after.)

The route line has no unit test — `bcf-service.mjs` exports no handler; it is a pass-through of `url.searchParams` into the tested `listAudit`. Task 7's drill reads it live.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/audit-read.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/check-registry.mjs WebApp/bridge/check-registry.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/mcp-server.mjs WebApp/bridge/mcp-server.test.mjs WebApp/bridge/ai-tools.mjs WebApp/src/setups/cde-panel.ts WebApp/src/setups/files-panel.ts docs/mcp-server.md
git commit -m "feat(bridge): GET /cde/:key/audit answers {rows, total, limit, offset} with filters (entity_type, action_prefix, entity_id, actor, since, until, limit up to 1000, offset) and an exact total (Prefer count=exact, Content-Range; a 416 or */N is rows []); ids.last_verdict and midp.review read the rows they judge instead of the newest 200 and say 'Read N of M' when a read is partial

On demo the only verdict is the 243rd newest row, so ids.last_verdict said 'No governed verdict has been recorded' — false; it now reads entity_type=file_version&action_prefix=verdict: and says that sentence only when the total is 0. midp.review reads the container_version state: rows of the published ids. sb() gains {count: true} → {data, total}; a reply without a total is an error, never a guess. A bad filter is a 400 before any read; a literal * in action_prefix is refused (PostgREST reads every * as a wildcard). The five readers move in this commit: the CDE panel's ledger shows newest 20 of the total, the files panel reads its files' and versions' rows by entity_id (the verdict badge and History come back; a failed or partial read says so), the MCP sentinel_audit and the agent's read_audit pass filters through and return the page; docs/mcp-server.md's row says what it returns and that the hash chain is global and not recomputed.

audit-read.test.mjs 25 (a fake PostgREST honouring the filters; the demo fixture with the verdict outside the newest 200); npm test 1017 in 75; tsc 24, none new.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

No change needed. Applied as written to f24fa8a: all 25 blocks matched once. RED (source files reverted) was 26 failed | 102 passed (128), as stated. GREEN: the 3 files pass 128/128, and npm test gives Test Files 75 passed (75), Tests 1017 passed (1017). tsc gives 24 in the repo (25 in an archive copy because src/generated/fragments-worker is missing), and the only files-panel line is (109,57). One side effect: running vitest on an archive copy rewrites WebApp/bridge/fixtures/canonical-cases.json (CRLF in a regenerated raw string). This comes from the scratch checkout, not from the plan; `git checkout -- WebApp/bridge/fixtures/canonical-cases.json` before committing if it shows up.

---

### Task 2: Bridge — the public receipt check: `POST /receipt/:key/verify` answers a caller the gate would refuse hash-only (`public-verify.mjs`: `isPublicRoute`, `parsePublicVerify`, `comparePublic`, one byte-identical `MISS`, a 60-a-minute window, an 8 KB cap), `publicAuditRow` reads with the service key and never `ensureProject`, a member's reply is unchanged, and the badge shows a verdict only when the check compared it

**Files:**
- Create: `WebApp/bridge/public-verify.mjs`, `WebApp/bridge/public-verify.test.mjs`
- Modify: `WebApp/bridge/cde-store.mjs` (a new `publicAuditRow` straight after `getAuditEntry`, master :812-818 — Task 1 changes `sb` (:33-67) and `listAudit` (:586-589) above it, so match the quoted text, not the number)
- Modify: `WebApp/bridge/bcf-service.mjs` (master numbering; Task 1 only edits the `/cde/:key/audit` GET route near :1058, so the text quoted here is unchanged by it): the import block :20-23; the startup log :473; a new `publicReceiptVerify` above `handleRequest` and the head of `handleRequest` :495-499; the CSRF gate's tail, the `url` line and the head of the auth gate :513-529; the receipt routes' comment :1281-1285
- Modify: `WebApp/bridge/public-client/sentinel-verify.mjs` (`verify` :61-62; `verdictBadge` :79-100 and the hash title :107-109)
- Modify: `WebApp/bridge/public-client/sentinel-verify.test.mjs` (:83, :92, :98, :107-110)
- Modify: `WebApp/bridge/cors-origin.mjs` (:11-14), `WebApp/bridge/cors-origin.test.mjs` (:27)
- Modify: `docs/verdict-contract.md` (§5 :106-109; §6 :126-128)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-ledger-grafts-4c-design.md` Decision 6 and "Testing"; `WebApp/bridge/bcf-service.mjs:232-261` (`corsHeaders` echoes `res._cors` — `"*"` gives `Access-Control-Allow-Origin: *` with no `Vary`; `send()` never sets `Access-Control-Allow-Credentials`; it scrubs every 500's message to "Internal error — see the bridge log.", :246-248), `:262-264` (`readBody` turns an oversize body into `{}` — no 413, hence `readCapped`), `:65` (`MAX_JSON` is 256 MB), `:459-466` (`userJwt` for `runWithAuth`: a three-segment bearer, verified only when `SUPABASE_JWT_SECRET` is set), `:501-508` (the preflight grants Private-Network only to an allowlisted origin — the public preflight grants none: a third-party page reaches the bridge through its public Funnel URL, never a loopback one), `:510-514` (CSRF gate), `:523-536` (bearer gate), `:1281-1306` (the receipt routes; the member path — `checkReceipt` → `getAuditEntry` → `ensureProject` — is untouched); `WebApp/bridge/cde-store.mjs:33-67` (`sb`; `service: true` forces the service key whatever the request context holds), `:77-98` (`ensureProject`: the key-specific 404 text and the `default` INSERT the public path must never reach), `:812-829` (`getAuditEntry`, `receiptFor`, `checkReceipt`); `WebApp/bridge/agent-provenance.mjs:59-96` (`buildReceipt` — `verdict` is `new_value.verdict`; `verifyReceipt` — the member reply `{matches, reasons, ledger}`, left as it is, pinned by `agent-provenance.test.mjs:81-115`); `WebApp/bridge/cde-store-actor.test.mjs:1-21` (the stubbed-`fetch` pattern the new test follows); `WebApp/bridge/bridge-auth.test.mjs` (not changed: it tests the AsyncLocalStorage auth context, not the gate — the gate's public branch is pinned by the `isPublicRoute` tests, the forwarded-session test in `public-verify.test.mjs` and Step 8's smoke); `WebApp/bridge/mcp-server.mjs:114-115, :172-183` and `docs/mcp-server.md:34-36` (not changed: MCP sends `BCF_TOKEN` from the same `config/.env` the bridge arms with, so it keeps the member reply its description promises).

**Interfaces:**
- Consumes: `sb(path, { service: true })` → the parsed rows (Task 1 adds `opts.count`; without it `sb` returns exactly what it returns on master); `TOKEN`, `JWT_SECRET`, `verifyJwt(bearer, secret)`, `send(res, code, body)`, `res._cors` (bcf-service.mjs, unchanged); `runWithAuth(token, fn)` (bridge-auth.mjs, the test only).
- Produces:
  - `WebApp/bridge/public-verify.mjs` (pure, no imports):
    - `export const isPublicRoute = (method, pathname) => boolean` — true only for `POST` and `OPTIONS` on `/^\/receipt\/[^/]+\/verify$/`.
    - `export function parsePublicVerify(body)` → `{audit_id, ledger_hash, recorded_at?, verdict?, project?}`; reads `body.receipt` when it is an object, else `body`; nothing else is read (`version` included). Throws `err(400)` — `Object.assign(new Error(message), {status: 400})` — for: no object ("send {audit_id, ledger_hash} or a whole receipt as JSON"), `audit_id` not a safe integer ≥ 1 ("audit_id must be a positive integer"), `ledger_hash` not `/^[0-9a-f]{64}$/` ("ledger_hash must be 64 lowercase hex characters"), an optional that is neither null nor a string ("<field> must be a string when given"). A null optional is not supplied. No message quotes the input.
    - `export function comparePublic(row, claim, routeKey)` → `MISS` when `row` is null, hashless, another id, or its `hash` ≠ `claim.ledger_hash`; else `{matches, checked, mismatched, not_checked, note: "matches the ledger's stored hash; the chain is not recomputed"}` — `checked` always starts `["audit_id", "ledger_hash", "project"]` (the row was found under the route key's project; a supplied `project` ≠ `routeKey` is `mismatched`), then `recorded_at` (vs `row.at`) and `verdict` (vs `row.new_value?.verdict ?? null`) when supplied, else they are `not_checked`. `matches` = no mismatch. Field names only.
    - `export const MISS` — frozen `{matches: false, note: "no ledger entry on this key has that id and hash"}`; `JSON.stringify(MISS)` is the one miss body.
    - `export function createLimiter({max = 60, windowMs = 60000, now = Date.now} = {})` → `{take(): boolean}` — a fixed window; `now` is injectable for the test.
    - `export const PUBLIC_BODY_MAX = 8192` and `export const readCapped = (req, max = PUBLIC_BODY_MAX) => Promise<string | null>` — the body as UTF-8 text, or `null` over `max` bytes (a declared `Content-Length` over it is answered unread; a streamed one is cut with `req.destroy()`). These two are additions to the pinned list: the 8 KB cap needs a 413 that `readBody` cannot give.
  - `WebApp/bridge/cde-store.mjs`: `export async function publicAuditRow(key, id)` → `{id, at, hash, new_value}` or `null`. Two `GET`s, both `service: true`: `projects?key=eq.<encoded key>&select=id`, then `audit_log?id=eq.<id>&project_id=eq.<pid>&select=id,at,hash,new_value` where an unknown key's `pid` is the nil uuid (the same two reads as an unknown id). A malformed `id` reads nothing. Never `ensureProject`, never an insert, never a key-specific error (an `sb` failure throws its generic "Supabase <status>: …", which the route turns into the generic 500).
  - `WebApp/bridge/bcf-service.mjs`: in `handleRequest`, before the CORS origin is decided, the CSRF gate and the bearer gate: `url`, `bearer` and `credentialOk` (= `bearer === TOKEN` or a three-segment bearer that passes `verifyJwt` when `SUPABASE_JWT_SECRET` is set — exactly what the bearer gate accepted before; the gate now reads the same `credentialOk`). `if (TOKEN && !credentialOk && isPublicRoute(req.method, url.pathname)) return publicReceiptVerify(req, res, url)`. `publicReceiptVerify`: `res._cors = "*"`; `OPTIONS` → 204; the limiter → 429 `{message: "Too many receipt checks — try again within a minute"}`; `readCapped` → 413 `{message: "A receipt check is at most 8 KB"}`; `parsePublicVerify` (or unparseable JSON) → 400 with the parser's message; then `comparePublic(await cde.publicAuditRow(decodedKey, claim.audit_id), claim, decodedKey)` → 200; anything thrown → 500 `{message: "Internal error — see the bridge log."}`. Every call logs `[receipt] public <METHOD> <path> → <429|413|400|match|no match|500>` — never the body. A caller with a credential takes the existing `/receipt` route and gets today's `{matches, reasons, ledger}`; with `BCF_TOKEN` unset (legacy mode, no gate) nothing changes for anyone.
  - `WebApp/bridge/public-client/sentinel-verify.mjs`: `verdictBadge(receipt, check, doc)` — a confirmed check whose `checked` lacks `"verdict"` reads `• on the ledger — verdict not checked` (blue `#2563eb`, `data-sentinel-verdict="not-checked"`); the hash title reads `Entry <id> matches the ledger's stored hash (chain not recomputed).`

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/public-verify.test.mjs`:

```js
// The public receipt check (cohesion phase 4c): a yes/no and field names for anyone, never a ledger value, and one
// byte-identical miss for every kind of "no". publicAuditRow is driven through a stubbed fetch — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "node:stream";
import { isPublicRoute, parsePublicVerify, comparePublic, MISS, createLimiter, readCapped, PUBLIC_BODY_MAX } from "./public-verify.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

// cde-store reads SUPABASE_URL / _SERVICE_KEY / _ANON_KEY when it loads; where config/.env is absent (CI) stand-ins
// let sb() build its URL and arm JWT forwarding (so "service key only" is a real test). Nothing reaches them: fetch
// is stubbed in every test that reads.
process.env.SUPABASE_URL ||= "http://supabase.invalid";
process.env.SUPABASE_SERVICE_KEY ||= "stub-service-key";
process.env.SUPABASE_ANON_KEY ||= "stub-anon-key";
const { publicAuditRow } = await import("./cde-store.mjs");

const HASH = "9f2c".padEnd(64, "0");
const PREV = "1ab7".padEnd(64, "0");
// Receipt 702's shape on aster-office: a proposal row whose values must never come back to an anonymous caller.
const ROW = {
  id: 702, at: "2026-09-22T10:15:30.123456+00:00", hash: HASH, prev_hash: PREV, actor: "revit:aster-lead",
  new_value: { verdict: "accepted", summary: { in_scope: 41, passing: 41, failing: 0 }, agent: { claimed: true, model: "gpt-6" } },
};
const RECEIPT = {
  version: "sentinel-receipt/1", project: "aster-office", audit_id: 702, recorded_at: ROW.at, actor: ROW.actor,
  verdict: "accepted", ids_source: "project", summary: ROW.new_value.summary, agent: ROW.new_value.agent, ledger_hash: HASH, prev_hash: PREV,
};
const bare = { audit_id: 702, ledger_hash: HASH };

describe("isPublicRoute — POST and OPTIONS on /receipt/<key>/verify, nothing else", () => {
  it("is true for the check and its preflight", () => {
    expect(isPublicRoute("POST", "/receipt/aster-office/verify")).toBe(true);
    expect(isPublicRoute("OPTIONS", "/receipt/aster-office/verify")).toBe(true);
  });
  it("is false for the receipt read, every other method, a longer or shorter path, and every /cde route", () => {
    expect(isPublicRoute("GET", "/receipt/aster-office/702")).toBe(false);
    expect(isPublicRoute("GET", "/receipt/aster-office/verify")).toBe(false);
    expect(isPublicRoute("PUT", "/receipt/aster-office/verify")).toBe(false);
    expect(isPublicRoute("POST", "/receipt/aster-office/702")).toBe(false);
    expect(isPublicRoute("POST", "/receipt/aster-office/verify/x")).toBe(false);
    expect(isPublicRoute("POST", "/receipt/aster-office/verify/")).toBe(false);
    expect(isPublicRoute("POST", "/receipt//verify")).toBe(false);
    expect(isPublicRoute("POST", "/cde/aster-office/audit")).toBe(false);
    expect(isPublicRoute("POST", "/cde/aster-office/receipt/aster-office/verify")).toBe(false);
    expect(isPublicRoute("POST", undefined)).toBe(false);
  });
});

describe("parsePublicVerify — what an anonymous caller may send, refused before any database call", () => {
  it("reads only the five fields from a whole receipt, wrapped or bare", () => {
    const want = { audit_id: 702, ledger_hash: HASH, recorded_at: ROW.at, verdict: "accepted", project: "aster-office" };
    expect(parsePublicVerify({ receipt: RECEIPT })).toEqual(want);
    expect(parsePublicVerify(RECEIPT)).toEqual(want);
  });
  it("takes a bare {audit_id, ledger_hash}; a null optional is not supplied; version is not read", () => {
    expect(parsePublicVerify(bare)).toEqual(bare);
    expect(parsePublicVerify({ ...bare, verdict: null, recorded_at: null, version: "made-up/9" })).toEqual(bare);
  });
  it("refuses a missing body, a non-integer id and a hash that is not 64 lowercase hex — each a 400", () => {
    const bad = [null, "702", [], {}, { ledger_hash: HASH }, { ...bare, audit_id: "702" }, { ...bare, audit_id: 7.5 }, { ...bare, audit_id: 0 },
      { audit_id: 702 }, { ...bare, ledger_hash: HASH.toUpperCase() }, { ...bare, ledger_hash: HASH.slice(1) }, { ...bare, verdict: 1 }, { ...bare, project: {} }];
    for (const b of bad) expect(() => parsePublicVerify(b), JSON.stringify(b)).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("names the field it refuses, never the value it was sent", () => {
    expect(() => parsePublicVerify({ ...bare, ledger_hash: "zz-secret" })).toThrow("ledger_hash must be 64 lowercase hex characters");
    expect(() => parsePublicVerify({ ...bare, audit_id: -3 })).toThrow("audit_id must be a positive integer");
  });
});

describe("comparePublic — yes/no and field names, never a ledger value", () => {
  it("matches receipt 702 with every field checked", () => {
    expect(comparePublic(ROW, parsePublicVerify(RECEIPT), "aster-office")).toEqual({
      matches: true, checked: ["audit_id", "ledger_hash", "project", "recorded_at", "verdict"], mismatched: [], not_checked: [],
      note: "matches the ledger's stored hash; the chain is not recomputed",
    });
  });
  it("a bare id and hash match, and say what was not checked", () => {
    expect(comparePublic(ROW, bare, "aster-office")).toMatchObject({ matches: true, checked: ["audit_id", "ledger_hash", "project"], not_checked: ["recorded_at", "verdict"] });
  });
  it("the real hash with the verdict flipped does not match, and names only the field", () => {
    const r = comparePublic(ROW, parsePublicVerify({ ...RECEIPT, verdict: "rejected" }), "aster-office");
    expect(r).toMatchObject({ matches: false, mismatched: ["verdict"] });
    expect(r.checked).toContain("verdict");
  });
  it("a verdict claimed for a row that carries none is a mismatch, not a pass", () => {
    const gateRow = { ...ROW, new_value: { result: "pass" } };
    expect(comparePublic(gateRow, { ...bare, verdict: "accepted" }, "aster-office")).toMatchObject({ matches: false, mismatched: ["verdict"] });
  });
  it("a receipt naming another project, or another recorded_at, does not match", () => {
    expect(comparePublic(ROW, { ...bare, project: "aster-tower" }, "aster-office")).toMatchObject({ matches: false, mismatched: ["project"] });
    expect(comparePublic(ROW, { ...bare, recorded_at: "2026-09-22T10:15:30Z" }, "aster-office")).toMatchObject({ matches: false, mismatched: ["recorded_at"] });
  });
  it("no row, a wrong hash, another id and a hashless row are the one MISS", () => {
    for (const [row, claim] of [[null, bare], [ROW, { ...bare, ledger_hash: PREV }], [{ ...ROW, id: 703 }, bare], [{ ...ROW, hash: null }, bare]])
      expect(comparePublic(row, claim, "aster-office")).toBe(MISS);
    expect(JSON.stringify(MISS)).toBe('{"matches":false,"note":"no ledger entry on this key has that id and hash"}');
  });
  it("no reply carries a ledger value — not the actor, time, verdict, summary, agent, prev_hash, id or hash", () => {
    const replies = [
      comparePublic(ROW, parsePublicVerify(RECEIPT), "aster-office"),
      comparePublic(ROW, parsePublicVerify({ ...RECEIPT, verdict: "rejected", recorded_at: "x", project: "y" }), "aster-office"),
      comparePublic(ROW, bare, "aster-office"),
      comparePublic(null, bare, "aster-office"),
    ].map((r) => JSON.stringify(r));
    for (const text of replies)
      for (const v of [HASH, PREV, ROW.actor, ROW.at, "accepted", "rejected", "702", "41", "gpt-6", "aster-office"]) expect(text).not.toContain(v);
  });
});

describe("publicAuditRow — service key only, no ensureProject, the same two reads for every miss", () => {
  let calls;
  const realFetch = globalThis.fetch;
  const serve = (projects, rows) => {
    calls = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || "GET", auth: init.headers?.Authorization || "" });
      if (String(url).includes("/projects?")) return new Response(JSON.stringify(projects), { status: 200 });
      return new Response(JSON.stringify(rows), { status: 200 });
    });
  };
  beforeEach(() => serve([], []));
  afterEach(() => { globalThis.fetch = realFetch; });

  it("reads the project by key and the row by id AND project, and returns it", async () => {
    serve([{ id: "p-aster" }], [ROW]);
    expect(await publicAuditRow("aster-office", 702)).toEqual(ROW);
    expect(calls.map((c) => c.url.split("/rest/v1/")[1])).toEqual([
      "projects?key=eq.aster-office&select=id",
      "audit_log?id=eq.702&project_id=eq.p-aster&select=id,at,hash,new_value",
    ]);
  });
  it("an unknown key is null after the same two reads (the second against the nil uuid) — never a 404, never an insert", async () => {
    serve([], []);
    expect(await publicAuditRow("no-such-key", 702)).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("project_id=eq.00000000-0000-0000-0000-000000000000");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    serve([], []);
    expect(await publicAuditRow("default", 702)).toBeNull(); // "default" does not self-heal here
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("an unknown id on a known key is null", async () => {
    serve([{ id: "p-aster" }], []);
    expect(await publicAuditRow("aster-office", 999999)).toBeNull();
  });
  it("uses the service key even inside a forwarded session", async () => {
    serve([{ id: "p-aster" }], [ROW]);
    const forged = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "x" })).toString("base64url") + ".sig";
    await runWithAuth(forged, () => publicAuditRow("aster-office", 702));
    expect(calls.every((c) => !c.auth.includes(forged))).toBe(true);
  });
  it("a malformed id reads nothing", async () => {
    for (const id of [0, -1, 1.5, "702", null]) expect(await publicAuditRow("aster-office", id)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("createLimiter — one global fixed window", () => {
  it("allows 60 in a minute, refuses the 61st, and opens again when the window turns", () => {
    let t = 1000;
    const l = createLimiter({ max: 60, windowMs: 60000, now: () => t });
    for (let i = 0; i < 60; i++) expect(l.take()).toBe(true);
    expect(l.take()).toBe(false);
    t += 59999;
    expect(l.take()).toBe(false);
    t += 1;
    expect(l.take()).toBe(true);
  });
});

describe("readCapped — 8 KB, then 413", () => {
  const req = (chunks, headers = {}) => Object.assign(Readable.from(chunks.map((c) => Buffer.from(c))), { headers });
  it("returns the body as text at or under the cap", async () => {
    expect(PUBLIC_BODY_MAX).toBe(8192);
    expect(await readCapped(req(['{"audit_id":702,', '"ledger_hash":"x"}']))).toBe('{"audit_id":702,"ledger_hash":"x"}');
    expect(await readCapped(req(["a".repeat(8192)]))).toHaveLength(8192);
  });
  it("is null for a declared length over the cap, without reading", async () => {
    const r = req(["{}"], { "content-length": "8193" });
    expect(await readCapped(r)).toBeNull();
  });
  it("is null for a streamed body that runs past the cap", async () => {
    expect(await readCapped(req(["a".repeat(5000), "a".repeat(5000)]))).toBeNull();
  });
});
```

In `WebApp/bridge/public-client/sentinel-verify.test.mjs` replace line 83:

```js
  const text = (el) => [el.textContent, ...el.children.map(text)].join(" ").trim();
```

with:

```js
  const text = (el) => [el.textContent, ...el.children.map(text)].join(" ").trim();
  // The public reply when the receipt's verdict was compared, and when only the id and hash were.
  const verdictChecked = { matches: true, checked: ["audit_id", "ledger_hash", "project", "recorded_at", "verdict"], mismatched: [], not_checked: [] };
  const hashOnly = { matches: true, checked: ["audit_id", "ledger_hash", "project"], mismatched: [], not_checked: ["recorded_at", "verdict"] };
```

Replace line 92:

```js
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abc12345", audit_id: 5 }, { matches: true }, doc());
```

with:

```js
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abc12345", audit_id: 5 }, verdictChecked, doc());
```

Replace line 98:

```js
    const el = verdictBadge({ verdict: "rejected", ledger_hash: "h" }, { matches: true }, doc());
```

with:

```js
    const el = verdictBadge({ verdict: "rejected", ledger_hash: "h" }, verdictChecked, doc());
```

Replace lines 107-110:

```js
  it("shows a short ledger hash when there is one, and nothing when there isn't", () => {
    expect(text(verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234" }, { matches: true }, doc()))).toMatch(/abcdef12/);
    expect(verdictBadge({ verdict: "accepted" }, { matches: true }, doc()).children).toHaveLength(2);
  });
```

with:

```js
  it("shows a short ledger hash when there is one, and nothing when there isn't", () => {
    expect(text(verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234" }, verdictChecked, doc()))).toMatch(/abcdef12/);
    expect(verdictBadge({ verdict: "accepted" }, verdictChecked, doc()).children).toHaveLength(2);
  });

  it("a match that did not compare the verdict shows the entry, never the verdict the receipt claims", () => {
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234", audit_id: 702 }, hashOnly, doc());
    expect(text(el)).toMatch(/on the ledger — verdict not checked/);
    expect(text(el)).not.toMatch(/accepted/);
    expect(el.attrs["data-sentinel-confirmed"]).toBe("true");
    expect(el.attrs["data-sentinel-verdict"]).toBe("not-checked");
    // a member's full reply carries no `checked` either: the badge under-claims rather than assumes
    expect(text(verdictBadge({ verdict: "accepted" }, { matches: true, reasons: [], ledger: {} }, doc()))).toMatch(/verdict not checked/);
  });

  it("says what a match is: the ledger's stored hash, the chain not recomputed", () => {
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234", audit_id: 702 }, verdictChecked, doc());
    expect(el.children[2].title).toBe("Entry 702 matches the ledger's stored hash (chain not recomputed).");
    expect(el.children[2].title).not.toMatch(/immutable/);
  });
```

In `WebApp/bridge/cors-origin.test.mjs` replace line 27:

```js
  it("with the auth gate armed, accepts origin null from any page — every route still needs a bearer a browser never attaches by itself", () => {
```

with:

```js
  it("with the auth gate armed, accepts origin null from any page — every route but the hash-only POST /receipt/:key/verify still needs a bearer a browser never attaches by itself", () => {
```

- [ ] **Step 2: Run them — RED**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/public-verify.test.mjs bridge/public-client/sentinel-verify.test.mjs bridge/cors-origin.test.mjs
```

Expected (trimmed to the verdict lines):

```
 ❯ bridge/public-verify.test.mjs (0 test)
 ✓ bridge/cors-origin.test.mjs (8 tests)
 ❯ bridge/public-client/sentinel-verify.test.mjs (16 tests | 2 failed)
   × verdictBadge > a match that did not compare the verdict shows the entry, never the verdict the receipt claims
     → expected '✓ accepted by Sentinel abcdef12' to match /on the ledger — verdict not checked/
   × verdictBadge > says what a match is: the ledger's stored hash, the chain not recomputed
 FAIL  bridge/public-verify.test.mjs [ bridge/public-verify.test.mjs ]
Error: Failed to load url ./public-verify.mjs (resolved id: ./public-verify.mjs) in …/WebApp/bridge/public-verify.test.mjs. Does the file exist?
 Test Files  2 failed | 1 passed (3)
      Tests  2 failed | 22 passed (24)
```

- [ ] **Step 3: `public-verify.mjs` — the pure half**

Create `WebApp/bridge/public-verify.mjs`:

```js
// The public receipt check (cohesion phase 4c): anyone may ask whether a receipt is on the ledger, without a
// token, and learn a yes/no plus field NAMES — never a ledger value. Pure; bcf-service.mjs wires it in ahead of
// the CSRF and bearer gates for callers those gates would refuse, and cde-store.mjs's publicAuditRow reads the row.
//
// What a match means: the row this key's project holds under that id carries exactly that stored hash. The
// hash chain is global (one chain over every project's rows) and is NOT recomputed here — the reply says so.

const err = (status, message) => Object.assign(new Error(message), { status });
const HEX64 = /^[0-9a-f]{64}$/;

/** The one byte-identical answer for an unknown key, an unknown id, another project's id, a wrong hash and a
 *  hashless row — so the reply is never an existence oracle for keys or ids. */
export const MISS = Object.freeze({ matches: false, note: "no ledger entry on this key has that id and hash" });
const HIT_NOTE = "matches the ledger's stored hash; the chain is not recomputed";

/** Bytes a public check may send. */
export const PUBLIC_BODY_MAX = 8 * 1024;

/** True only for POST and OPTIONS on /receipt/<key>/verify — the one route the gates let an anonymous caller reach. */
export const isPublicRoute = (method, pathname) =>
  (method === "POST" || method === "OPTIONS") && /^\/receipt\/[^/]+\/verify$/.test(String(pathname ?? ""));

/** {audit_id, ledger_hash[, recorded_at, verdict, project]} from `{receipt}`, a bare receipt or a bare claim;
 *  nothing else is read. Malformed → err(400), before any database call. A null optional is "not supplied". */
export function parsePublicVerify(body) {
  const r = body && typeof body === "object" && !Array.isArray(body)
    ? (body.receipt && typeof body.receipt === "object" && !Array.isArray(body.receipt) ? body.receipt : body)
    : null;
  if (!r) throw err(400, "send {audit_id, ledger_hash} or a whole receipt as JSON");
  if (!Number.isSafeInteger(r.audit_id) || r.audit_id < 1) throw err(400, "audit_id must be a positive integer");
  if (typeof r.ledger_hash !== "string" || !HEX64.test(r.ledger_hash)) throw err(400, "ledger_hash must be 64 lowercase hex characters");
  const claim = { audit_id: r.audit_id, ledger_hash: r.ledger_hash };
  for (const f of ["recorded_at", "verdict", "project"]) {
    if (r[f] === undefined || r[f] === null) continue;
    if (typeof r[f] !== "string") throw err(400, `${f} must be a string when given`);
    claim[f] = r[f];
  }
  return claim;
}

/** The anonymous reply: MISS unless the row exists with that id and a stored hash equal to the claim's; then
 *  {matches, checked, mismatched, not_checked, note} with field names only. The project is always checked (the
 *  row was found under the route key's project; a supplied `project` must equal the key); `recorded_at` and
 *  `verdict` are checked only when supplied — a supplied verdict that differs (or a row with no verdict) is a
 *  mismatch, never a pass. */
export function comparePublic(row, claim, routeKey) {
  if (!row || !row.hash || String(row.id) !== String(claim.audit_id) || row.hash !== claim.ledger_hash) return MISS;
  const checked = ["audit_id", "ledger_hash", "project"], mismatched = [], not_checked = [];
  if (claim.project !== undefined && claim.project !== routeKey) mismatched.push("project");
  for (const [f, actual] of [["recorded_at", row.at ?? null], ["verdict", row.new_value?.verdict ?? null]]) {
    if (claim[f] === undefined) { not_checked.push(f); continue; }
    checked.push(f);
    if (claim[f] !== actual) mismatched.push(f);
  }
  return { matches: mismatched.length === 0, checked, mismatched, not_checked, note: HIT_NOTE };
}

/** A global in-process fixed window: `max` takes per `windowMs`, then false until the window turns.
 *  ponytail: one window for every caller — per-IP limits wait until the Funnel's forwarded address is verified. */
export function createLimiter({ max = 60, windowMs = 60000, now = Date.now } = {}) {
  let start = now(), used = 0;
  return {
    take() {
      const t = now();
      if (t - start >= windowMs) { start = t; used = 0; }
      if (used >= max) return false;
      used++;
      return true;
    },
  };
}

/** The request body as text, or null when it is over `max` bytes — declared (answered unread) or streamed (cut). */
export const readCapped = (req, max = PUBLIC_BODY_MAX) => new Promise((resolve) => {
  if (Number(req.headers?.["content-length"] || 0) > max) return resolve(null);
  const chunks = [];
  let total = 0;
  req.on("data", (c) => {
    total += c.length;
    if (total > max) { req.destroy(); resolve(null); } else chunks.push(c);
  });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", () => resolve(null));
});
```

- [ ] **Step 4: `publicAuditRow` — service key only, never `ensureProject`**

In `WebApp/bridge/cde-store.mjs` replace the end of `getAuditEntry` (master :816-818):

```js
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&id=eq.${n}&select=*`);
  return (Array.isArray(rows) ? rows[0] : rows) ?? null;
}
```

with:

```js
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&id=eq.${n}&select=*`);
  return (Array.isArray(rows) ? rows[0] : rows) ?? null;
}

/** The row an anonymous receipt check names (cohesion phase 4c), or null. Service key only, whatever
 *  Authorization the caller sent; never ensureProject — no "default" self-heal, no key-specific 404 or 403.
 *  An unknown key still costs the second read (against the nil uuid), so it takes as long as an unknown id. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export async function publicAuditRow(key, id) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const proj = await sb(`projects?key=eq.${encodeURIComponent(key)}&select=id`, { service: true });
  const pid = Array.isArray(proj) && proj[0]?.id ? proj[0].id : NIL_UUID;
  const rows = await sb(`audit_log?id=eq.${id}&project_id=eq.${pid}&select=id,at,hash,new_value`, { service: true });
  return (Array.isArray(rows) ? rows[0] : null) ?? null;
}
```

- [ ] **Step 5: `sentinel-verify.mjs` — a verdict only when the check compared it; "stored hash", not "immutable"**

In `WebApp/bridge/public-client/sentinel-verify.mjs` replace line 61:

```js
  /** Re-check a receipt against the ledger. The point of the whole exercise: do not take my word for it. */
```

with:

```js
  /**
   * Re-check a receipt against the ledger. The point of the whole exercise: do not take my word for it.
   * No token needed: without one the bridge answers hash-only — {matches, checked, mismatched, not_checked, note},
   * field names and never a ledger value; with a member's token it answers {matches, reasons, ledger}.
   */
```

Replace lines 79-92:

```js
 * It renders UNVERIFIED until `verify()` has confirmed the receipt against the ledger. A badge that
 * looked authoritative on the proposer's say-so would defeat its own purpose: the whole value is
 * that the reader checked, not that the writer asserted.
 */
export function verdictBadge(receipt, check, doc = globalThis.document) {
  if (!doc) throw new Error("no document available — pass one for non-browser use");
  const verdict = receipt?.verdict ?? "unknown";
  const confirmed = check?.matches === true;
  const accepted = verdict === "accepted";
  const color = !confirmed ? "#9ca3af" : accepted ? "#16a34a" : "#dc2626";

  const el = doc.createElement("span");
  el.setAttribute("data-sentinel-verdict", verdict);
  el.setAttribute("data-sentinel-confirmed", String(confirmed));
```

with:

```js
 * It renders UNVERIFIED until `verify()` has confirmed the receipt against the ledger. A badge that
 * looked authoritative on the proposer's say-so would defeat its own purpose: the whole value is
 * that the reader checked, not that the writer asserted. And it shows a verdict only when the check
 * compared it (`"verdict"` in `check.checked`): a hash match proves the entry, not the verdict the
 * receipt claims for it.
 */
export function verdictBadge(receipt, check, doc = globalThis.document) {
  if (!doc) throw new Error("no document available — pass one for non-browser use");
  const verdict = receipt?.verdict ?? "unknown";
  const confirmed = check?.matches === true;
  const verdictChecked = confirmed && Array.isArray(check.checked) && check.checked.includes("verdict");
  const accepted = verdict === "accepted";
  const color = !confirmed ? "#9ca3af" : !verdictChecked ? "#2563eb" : accepted ? "#16a34a" : "#dc2626";

  const el = doc.createElement("span");
  el.setAttribute("data-sentinel-verdict", !confirmed || verdictChecked ? verdict : "not-checked");
  el.setAttribute("data-sentinel-confirmed", String(confirmed));
```

Replace lines 95-100:

```js
  const mark = doc.createElement("span");
  mark.textContent = !confirmed ? "?" : accepted ? "✓" : "✗";
  const label = doc.createElement("span");
  label.textContent = !confirmed
    ? `${verdict} — unverified`
    : accepted ? "accepted by Sentinel" : "rejected by Sentinel";
```

with:

```js
  const mark = doc.createElement("span");
  mark.textContent = !confirmed ? "?" : !verdictChecked ? "•" : accepted ? "✓" : "✗";
  const label = doc.createElement("span");
  label.textContent = !confirmed
    ? `${verdict} — unverified`
    : !verdictChecked ? "on the ledger — verdict not checked"
    : accepted ? "accepted by Sentinel" : "rejected by Sentinel";
```

Replace line 108:

```js
      ? `Confirmed against the immutable ledger (entry ${receipt.audit_id}).`
```

with:

```js
      ? `Entry ${receipt.audit_id} matches the ledger's stored hash (chain not recomputed).`
```

- [ ] **Step 6: GREEN — the three files, and the member reply's pins unchanged**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npx vitest run bridge/public-verify.test.mjs bridge/public-client/sentinel-verify.test.mjs bridge/cors-origin.test.mjs bridge/agent-provenance.test.mjs
```

Expected:

```
 ✓ bridge/cors-origin.test.mjs (8 tests)
 ✓ bridge/agent-provenance.test.mjs (19 tests)
 ✓ bridge/public-client/sentinel-verify.test.mjs (16 tests)
 ✓ bridge/public-verify.test.mjs (22 tests)
 Test Files  4 passed (4)
      Tests  65 passed (65)
```

(`agent-provenance.test.mjs` 19/19 is the member reply's contract — `verifyReceipt` is not touched. `public-verify.test.mjs` does not depend on `config/.env`: it sets stand-in `SUPABASE_*` values only where they are absent, before it loads `cde-store.mjs`, and stubs `fetch`. Removing `{ service: true }` from `publicAuditRow`'s second read fails "uses the service key even inside a forwarded session" — checked on the scratch copy.)

- [ ] **Step 7: Wire it into the bridge — ahead of the CSRF and bearer gates, for a caller they would refuse**

In `WebApp/bridge/bcf-service.mjs` replace line 23:

```js
import { corsOrigin } from "./cors-origin.mjs";
```

with:

```js
import { corsOrigin } from "./cors-origin.mjs";
import { isPublicRoute, parsePublicVerify, comparePublic, createLimiter, readCapped } from "./public-verify.mjs";
```

In line 473 replace:

```js
"ARMED (JWT or BCF_TOKEN required; only /health exempt)"
```

with:

```js
"ARMED (JWT or BCF_TOKEN required; /health exempt; POST /receipt/:key/verify answers anyone hash-only)"
```

Replace lines 495-497:

```js
async function handleRequest(req, res) {
  const origin = req.headers.origin;
  // Per-request CORS origin: echo an allowlisted origin (or "*" only in wildcard/dev mode); otherwise none.
```

with:

```js
// ── Public receipt check (cohesion phase 4c): POST /receipt/:key/verify from a caller the auth gate would refuse.
// Any page may ask (Access-Control-Allow-Origin: *, no credentials read or allowed); the answer is hash-only
// (public-verify.mjs). At most 8 KB a check and 60 checks a minute across every caller; the log line names the
// method, the path and the outcome, never the body.
const publicLimiter = createLimiter({ max: 60, windowMs: 60000 });
async function publicReceiptVerify(req, res, url) {
  res._cors = "*";
  if (req.method === "OPTIONS") return send(res, 204);
  const done = (code, body, outcome) => {
    console.log(`[receipt] public ${req.method} ${url.pathname} → ${outcome}`);
    return send(res, code, body);
  };
  if (!publicLimiter.take()) return done(429, { message: "Too many receipt checks — try again within a minute" }, "429");
  const text = await readCapped(req);
  if (text === null) return done(413, { message: "A receipt check is at most 8 KB" }, "413");
  let claim;
  try { claim = parsePublicVerify(text ? JSON.parse(text) : null); }
  catch (e) { return done(400, { message: e?.status === 400 ? e.message : "send {audit_id, ledger_hash} or a whole receipt as JSON" }, "400"); }
  try {
    let key = null;
    try { key = decodeURIComponent(url.pathname.split("/")[2]); } catch { /* a malformed escape names no project */ }
    const cde = await import("./cde-store.mjs");
    const reply = comparePublic(key === null ? null : await cde.publicAuditRow(key, claim.audit_id), claim, key);
    return done(200, reply, reply.matches ? "match" : "no match");
  } catch (e) {
    console.error(`[receipt] public check failed: ${e?.message || e}`);
    return done(500, { message: "Internal error — see the bridge log." }, "500");
  }
}

async function handleRequest(req, res) {
  const origin = req.headers.origin;
  const url = new URL(req.url, "http://localhost");
  // The credential the auth gate below accepts: the shared BCF_TOKEN, or a Supabase JWT (checked against
  // SUPABASE_JWT_SECRET when that is set).
  const bearer = (req.headers.authorization || "").startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const credentialOk = bearer === TOKEN
    || (!!bearer && bearer.split(".").length === 3 && (!JWT_SECRET || verifyJwt(bearer, JWT_SECRET)));
  // With the gate armed, a caller it would refuse may still ask whether a receipt is on the ledger: answered
  // hash-only, ahead of the CSRF and bearer gates. A caller with a credential takes the /receipt route below and
  // gets today's full reply; with the gate off every caller already does.
  if (TOKEN && !credentialOk && isPublicRoute(req.method, url.pathname)) return publicReceiptVerify(req, res, url);
  // Per-request CORS origin: echo an allowlisted origin (or "*" only in wildcard/dev mode); otherwise none.
```

Replace lines 513-529:

```js
    return send(res, 403, { message: "Origin not allowed" });
  }
  const url = new URL(req.url, "http://localhost");

  // Auth gate (F2): when BCF_TOKEN is configured, close the anonymous service-key fall-open. Every route
  // except /health must present EITHER a forwarded Supabase JWT (→ per-user RLS) OR the shared BCF_TOKEN
  // (→ trusted desktop client, e.g. Revit). The SSE feed is no longer exempt: the web reads it as a fetch
  // stream with the Authorization header (bridge-fetch.ts bridgeEvents) and Revit already sends its bearer,
  // so the feed stays closed even when the bridge is reachable from the internet.
  // With BCF_TOKEN unset, behaviour is unchanged (legacy service-key mode). Activation = set BCF_TOKEN.
  if (TOKEN) {
    const bearer = (req.headers.authorization || "").startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
    const exempt = url.pathname === "/health";
    const jwtOk = bearer && bearer !== TOKEN && bearer.split(".").length === 3
      && (!JWT_SECRET || verifyJwt(bearer, JWT_SECRET));
    const ok = bearer === TOKEN || jwtOk;
    if (!exempt && !ok) {
```

with:

```js
    return send(res, 403, { message: "Origin not allowed" });
  }

  // Auth gate (F2): when BCF_TOKEN is configured, close the anonymous service-key fall-open. Every route
  // except /health must present EITHER a forwarded Supabase JWT (→ per-user RLS) OR the shared BCF_TOKEN
  // (→ trusted desktop client, e.g. Revit). The SSE feed is no longer exempt: the web reads it as a fetch
  // stream with the Authorization header (bridge-fetch.ts bridgeEvents) and Revit already sends its bearer,
  // so the feed stays closed even when the bridge is reachable from the internet.
  // With BCF_TOKEN unset, behaviour is unchanged (legacy service-key mode). Activation = set BCF_TOKEN.
  // (POST /receipt/:key/verify from a caller with neither was already answered hash-only, above.)
  if (TOKEN) {
    const exempt = url.pathname === "/health";
    if (!exempt && !credentialOk) {
```

(The why-log below it still reads `bearer`, now the outer one. `credentialOk` accepts exactly what `ok` accepted: `bearer === TOKEN`, or a three-segment bearer that is not the token and passes `verifyJwt` when a secret is set — `bearer !== TOKEN` is implied once the first test failed.)

Replace lines 1283-1284:

```js
  //   POST /receipt/:key/verify { receipt } → { matches, reasons, ledger }
  //   Both are READ-ONLY. Verification is offered as a service precisely so a client does not have
```

with:

```js
  //   POST /receipt/:key/verify { receipt } → { matches, reasons, ledger }   (a bearer or member JWT; an armed
  //   bridge answers every other caller hash-only in publicReceiptVerify, before the gates — phase 4c)
  //   Both are READ-ONLY. Verification is offered as a service precisely so a client does not have
```

In `WebApp/bridge/cors-origin.mjs` replace lines 11-14:

```js
// With the auth gate armed (`armed`), `null` is accepted from any page: every route then needs a bearer
// (a Supabase JWT or BCF_TOKEN) that a browser never attaches on its own, so reading a response needs a stolen
// credential, not a forged origin — and the platform frame loads with referrerPolicy no-referrer, so a
// Referer cannot be relied on there.
```

with:

```js
// With the auth gate armed (`armed`), `null` is accepted from any page: every route then needs a bearer
// (a Supabase JWT or BCF_TOKEN) that a browser never attaches on its own, so reading a response needs a stolen
// credential, not a forged origin — and the platform frame loads with referrerPolicy no-referrer, so a
// Referer cannot be relied on there. The one exception is POST /receipt/:key/verify (cohesion phase 4c): it
// answers any page, with Access-Control-Allow-Origin: *, hash-only — a yes/no and field names, never a ledger
// value — and bcf-service.mjs decides that before this function is asked (public-verify.mjs isPublicRoute).
```

Check the file parses:

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
node --check bridge/bcf-service.mjs && echo SYNTAX_OK
```

Expected: `SYNTAX_OK`.

- [ ] **Step 8: Smoke the transport on a copy of the bridge — never the running one**

No vitest reaches `handleRequest` (importing `bcf-service.mjs` starts a server with the real `config/.env`), so the gates are exercised here: a copy of `WebApp/bridge` with no `config/.env` beside it, armed with a throwaway token on :4196, against a fake PostgREST on :4195 holding one row (702 on aster-office). The running bridge on :4100, the live database and AppData are never touched.

Create `C:\Users\yazan\AppData\Local\Temp\claude\C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project\4ae86a3d-066f-4d31-a2e7-567560705d3d\scratchpad\p4c-public-smoke.mjs`:

```js
// Phase 4c transport smoke: a COPY of the bridge (no config/.env beside it) on :4196 with the gate armed, against
// a fake PostgREST on :4195 that holds one ledger row (702 on aster-office). Never touches the running bridge,
// the live database or AppData. Usage: node p4c-public-smoke.mjs <copy>/WebApp/bridge
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const bridgeDir = process.argv[2];
const PG = 4195, BR = 4196, TOKEN = "smoke-token", BASE = `http://127.0.0.1:${BR}`;
const HASH = "9f2c".padEnd(64, "0"), PREV = "1ab7".padEnd(64, "0");
const ROW = { id: 702, project_id: "p-aster", entity_type: "proposal", entity_id: null, action: "Proposal accepted", actor: "revit:aster-lead",
  old_value: null, new_value: { verdict: "accepted", summary: { in_scope: 41 } }, at: "2026-09-22T10:15:30.123456+00:00", prev_hash: PREV, hash: HASH };
const RECEIPT = { version: "sentinel-receipt/1", project: "aster-office", audit_id: 702, recorded_at: ROW.at, actor: ROW.actor, verdict: "accepted",
  ids_source: null, summary: ROW.new_value.summary, agent: null, ledger_hash: HASH, prev_hash: PREV };
const MISS = '{"matches":false,"note":"no ledger entry on this key has that id and hash"}';

const pg = createServer((req, res) => {
  const u = decodeURIComponent(req.url);
  let body = "[]";
  if (u.startsWith("/rest/v1/projects?key=eq.aster-office&")) body = JSON.stringify([{ id: "p-aster", key: "aster-office", name: "Aster Office" }]);
  else if (u.startsWith("/rest/v1/audit_log?") && u.includes("id=eq.702") && u.includes("project_id=eq.p-aster")) body = JSON.stringify([ROW]);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}).listen(PG, "127.0.0.1");

const tmp = mkdtempSync(join(tmpdir(), "p4c-smoke-"));
let log = "";
const bridge = spawn(process.execPath, ["bcf-service.mjs"], {
  cwd: bridgeDir,
  env: { ...process.env, BCF_PORT: String(BR), BCF_HOST: "127.0.0.1", BCF_TOKEN: TOKEN, BCF_CORS_ORIGIN: "", SUPABASE_URL: `http://127.0.0.1:${PG}`,
    SUPABASE_SERVICE_KEY: "fake", SUPABASE_ANON_KEY: "", SUPABASE_JWT_SECRET: "", THATOPEN_API_KEY: "", BCF_EVENT_POLL_MS: "0",
    BCF_STORE: join(tmp, "bcf-store.json"), SENTINEL_PROJECT_STORE: join(tmp, "project-store.json") },
});
bridge.stdout.on("data", (c) => { log += c; });
bridge.stderr.on("data", (c) => { log += c; });

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log("  PASS  " + name); } else { fail++; console.log("  FAIL  " + name); } };
const verify = (body, headers = {}) => fetch(`${BASE}/receipt/aster-office/verify`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
let publicPosts = 0; // every anonymous POST counts against the 60-a-minute window, whatever it answers
const anon = (body, headers) => { publicPosts++; return verify(body, headers); };

try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).status === 200) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  const pre = await fetch(`${BASE}/receipt/aster-office/verify`, { method: "OPTIONS", headers: { Origin: "https://any.example", "Access-Control-Request-Method": "POST" } });
  ok(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*" && !pre.headers.has("access-control-allow-credentials"),
    "preflight from any page: 204, Access-Control-Allow-Origin *, no credentials");

  const hit = await anon({ receipt: RECEIPT }, { Origin: "https://any.example" });
  const hitText = await hit.text();
  ok(hit.status === 200 && hit.headers.get("access-control-allow-origin") === "*" && JSON.parse(hitText).matches === true,
    "a foreign page with no bearer: past the CSRF gate, receipt 702 matches");
  ok(!hitText.includes(HASH) && !hitText.includes(PREV) && !hitText.includes("aster-lead") && !hitText.includes("2026-09-22") && !hitText.includes("ledger\""),
    "the anonymous reply carries no ledger value");

  const flipped = JSON.parse(await (await anon({ ...RECEIPT, verdict: "rejected" })).text());
  ok(flipped.matches === false && JSON.stringify(flipped.mismatched) === '["verdict"]', "the verdict flipped: matches false, mismatched [verdict]");

  const unknownId = await (await anon({ audit_id: 703, ledger_hash: HASH })).text();
  publicPosts++;
  const unknownKey = await (await fetch(`${BASE}/receipt/no-such-key/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audit_id: 702, ledger_hash: HASH }) })).text();
  const wrongHash = await (await anon({ audit_id: 702, ledger_hash: PREV })).text();
  ok(unknownId === MISS && unknownKey === MISS && wrongHash === MISS, "unknown id, unknown key and wrong hash: the same bytes");

  const bad = await anon({ audit_id: "702", ledger_hash: HASH });
  ok(bad.status === 400 && (await bad.json()).message === "audit_id must be a positive integer", "malformed: 400 naming the field");

  const big = await anon("{" + " ".repeat(9000) + "}");
  ok(big.status === 413, "a 9 KB body: 413");

  const member = await verify({ receipt: RECEIPT }, { Authorization: `Bearer ${TOKEN}` });
  const full = await member.json();
  ok(member.status === 200 && full.matches === true && Array.isArray(full.reasons) && full.ledger?.ledger_hash === HASH,
    "with the bridge token: today's full reply {matches, reasons, ledger}");

  ok((await fetch(`${BASE}/receipt/aster-office/702`)).status === 401, "GET /receipt/:key/:id without a bearer: 401");
  ok((await fetch(`${BASE}/cde/aster-office/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401,
    "POST /cde/:key/audit without a bearer: 401");
  const wrong = await (await anon({ receipt: RECEIPT }, { Authorization: "Bearer wrong" })).json();
  ok(wrong.matches === true && !("ledger" in wrong) && !("reasons" in wrong), "a wrong bearer is ignored: the hash-only reply, never the full one");

  let first429 = 0;
  for (let i = 0; i < 70 && !first429; i++) if ((await anon({ audit_id: 702, ledger_hash: HASH })).status === 429) first429 = publicPosts;
  ok(first429 === 61, `the 61st anonymous check in the minute: 429 (first 429 at call ${first429})`);

  ok(log.includes("[receipt] public POST /receipt/aster-office/verify → match") && log.includes("→ 413") && log.includes("→ 429") && !log.includes(HASH),
    "the log names method, path and outcome, never the body");
} finally {
  bridge.kill();
  pg.close();
}
console.log(`\n${pass}/${pass + fail} smoke checks pass`);
process.exit(fail === 0 ? 0 : 1);
```

Run it (PowerShell — the junction is removed with `rmdir` BEFORE the folder, because Windows PowerShell 5.1's `Remove-Item -Recurse` follows a junction into its target, which here is the repo's `node_modules`):

```powershell
$sp = "C:\Users\yazan\AppData\Local\Temp\claude\C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project\4ae86a3d-066f-4d31-a2e7-567560705d3d\scratchpad"
$copy = "$sp\p4c-smoke-copy"
$web = "C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project\WebApp"
if (Test-Path "$copy\WebApp\node_modules") { cmd /c rmdir "$copy\WebApp\node_modules" }
if (Test-Path $copy) { Remove-Item -Recurse -Force $copy }
New-Item -ItemType Directory -Force "$copy\WebApp" | Out-Null
Copy-Item -Recurse "$web\bridge" "$copy\WebApp\bridge"
New-Item -ItemType Junction -Path "$copy\WebApp\node_modules" -Target "$web\node_modules" | Out-Null
node "$sp\p4c-public-smoke.mjs" "$copy\WebApp\bridge"
cmd /c rmdir "$copy\WebApp\node_modules"
Remove-Item -Recurse -Force $copy
```

Expected:

```
  PASS  preflight from any page: 204, Access-Control-Allow-Origin *, no credentials
  PASS  a foreign page with no bearer: past the CSRF gate, receipt 702 matches
  PASS  the anonymous reply carries no ledger value
  PASS  the verdict flipped: matches false, mismatched [verdict]
  PASS  unknown id, unknown key and wrong hash: the same bytes
  PASS  malformed: 400 naming the field
  PASS  a 9 KB body: 413
  PASS  with the bridge token: today's full reply {matches, reasons, ledger}
  PASS  GET /receipt/:key/:id without a bearer: 401
  PASS  POST /cde/:key/audit without a bearer: 401
  PASS  a wrong bearer is ignored: the hash-only reply, never the full one
  PASS  the 61st anonymous check in the minute: 429 (first 429 at call 61)
  PASS  the log names method, path and outcome, never the body

13/13 smoke checks pass
```

(Measured on a scratch copy of f24fa8a with this task applied, 2026-09-25: 13/13. The copy has no `config/.env`, so `load-env.mjs` finds nothing and the bridge runs on the smoke's environment only. Not a claim about the live bridge: that is Session B8's `curl` against receipt 702, Task 7.)

- [ ] **Step 9: `docs/verdict-contract.md` — the anonymous reply beside the member's, and the badge's rule**

Replace lines 106-109:

```markdown
Mismatches are **listed, not collapsed into a boolean**: "this receipt is forged" and "this receipt
is for a different verdict" are different conversations to have with a client. A ledger row with no
chain hash is reported as *unconfirmable* rather than confirmed — the hash is the only field the
database, rather than the caller, produced.
```

with:

````markdown
Mismatches are **listed, not collapsed into a boolean**: "this receipt is forged" and "this receipt
is for a different verdict" are different conversations to have with a client. A ledger row with no
chain hash is reported as *unconfirmable* rather than confirmed — the hash is the only field the
database, rather than the caller, produced.

That reply is for a caller with the bridge's token or a member's session. **Anyone else** — any page,
`curl`, a client with no account — gets the same route hash-only: send `{ "audit_id": 412,
"ledger_hash": "<64 hex>" }` (plus `recorded_at`, `verdict`, `project` if you hold them), or the whole
receipt, of which only those five fields are read. A hit answers field names, never a ledger value:

```jsonc
{ "matches": false,
  "checked": ["audit_id", "ledger_hash", "project", "verdict"],
  "mismatched": ["verdict"],
  "not_checked": ["recorded_at"],
  "note": "matches the ledger's stored hash; the chain is not recomputed" }
```

An unknown project key, an unknown id, another project's id, a wrong hash and a row with no hash all
get the one reply `{ "matches": false, "note": "no ledger entry on this key has that id and hash" }`.
A malformed body is a 400 before any lookup; a body over 8 KB is a 413; past 60 checks a minute
(across every caller) it is a 429. `GET /receipt/:project/:auditId` still needs the token.

A match says the row carries that stored hash; it does not recompute the chain. And the chain is one
chain over every project's rows, so a member of one project holds the hash of a neighbouring row of
another: with that project's key, this check confirms one bit — "row N on key B has this hash" — and
nothing more. Closing that needs a chain per project (a migration), which is not planned.
````

Replace lines 126-128:

```markdown
`verdictBadge` renders **UNVERIFIED** until `verify()` has confirmed the receipt. A badge that looked
authoritative on the proposer's say-so would defeat its own purpose. It is built with
`createElement`, never `innerHTML`, so it is safe beside untrusted model data.
```

with:

```markdown
`verdictBadge` renders **UNVERIFIED** until `verify()` has confirmed the receipt. A badge that looked
authoritative on the proposer's say-so would defeat its own purpose. It shows the verdict only when the
check compared it (`"verdict"` in `checked`); otherwise it reads "on the ledger — verdict not checked".
It is built with `createElement`, never `innerHTML`, so it is safe beside untrusted model data.
```

- [ ] **Step 10: The whole web suite and tsc**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp"
npm test
npx tsc --noEmit -p .
```

Expected: `npm test` — Task 1's gate plus 24 tests and 1 file (22 new in `public-verify.test.mjs`, 2 new in `sentinel-verify.test.mjs`, `cors-origin.test.mjs` still 8). On f24fa8a alone this task measured `Tests 1016 passed (1016)` in `Test Files 75 passed (75)` (992 + 24, 74 + 1). `tsc` unchanged at 24 errors: `tsconfig.json` includes only `src/`, which this task does not touch.

- [ ] **Step 11: Commit**

```bash
cd "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project"
git add WebApp/bridge/public-verify.mjs WebApp/bridge/public-verify.test.mjs WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/public-client/sentinel-verify.mjs WebApp/bridge/public-client/sentinel-verify.test.mjs WebApp/bridge/cors-origin.mjs WebApp/bridge/cors-origin.test.mjs docs/verdict-contract.md
git commit -m "feat(bridge): the public receipt check — POST /receipt/:key/verify answers a caller the gate would refuse hash-only (yes/no and field names, never a ledger value; one byte-identical miss for an unknown key, id, project or hash; 400 before any read, 8 KB then 413, 60 a minute then 429, ACAO * on that path only, the body never logged); a member's reply is unchanged

public-verify.mjs (isPublicRoute, parsePublicVerify, comparePublic, MISS, createLimiter, readCapped) is pure; cde-store's publicAuditRow reads with the service key only and never ensureProject (no default self-heal, no key-specific error; an unknown key costs the same two reads as an unknown id). The badge shows a verdict only when the check compared it and says 'matches the ledger's stored hash (chain not recomputed)'. verdict-contract §5/§6 describe the anonymous reply, the global chain's one-bit residual and the badge rule.

vitest: public-verify 22, sentinel-verify 16, cors-origin 8, agent-provenance 19 (member reply unchanged); the transport smoke on a copy of the bridge 13/13.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

(1) In **Files**, delete the line "- Modify: `docs/verdict-contract.md` (§5 :106-109; §6 :126-128)". Task 6 Step 4 owns verdict-contract §4-§6 and quotes MASTER's text as its old text, so a Task 2 edit there makes Task 6's §5-§6 replacement fail. The cross-checker's run confirmed this: with Task 2's Step 9 skipped, Task 6 applied 16/16.
(2) Delete **Step 9** entirely ("`docs/verdict-contract.md` — the anonymous reply beside the member's, and the badge's rule"), both of its Replace blocks included. Task 6's §5/§6 text already has the anonymous reply, the MISS bytes, 8 KB/413, 60/min/429, ACAO *, the one-bit residual and the badge rule. Renumber Steps 10-11 to 9-10.
(3) In the old Step 10, replace the sentence starting "Expected: `npm test` — Task 1's gate plus 24 tests and 1 file" through "(992 + 24, 74 + 1)." with: "Expected: `Test Files  76 passed (76)` and `Tests  1041 passed (1041)` — Task 1's 1017 in 75, plus 22 in `public-verify.test.mjs` and 2 in `sentinel-verify.test.mjs` (one new file). `tsc` unchanged: `tsconfig.json` includes only `src/`, which this task does not touch." (measured with Tasks 1+2 applied).
(4) In the old Step 11 `git add`, remove ` docs/verdict-contract.md`. In the commit message, delete the sentence " verdict-contract §5/§6 describe the anonymous reply, the global chain's one-bit residual and the badge rule."
(5) In the Cross-task notes (part B), the "Task 6 (docs)" bullet is superseded: Task 6 writes verdict-contract §4-§6 alone.
Verified: the other 19 blocks matched after Task 1. RED is 2 failed | 22 passed (24) with public-verify.test.mjs failing to load. GREEN: the four files pass 65/65 and node --check prints SYNTAX_OK. The smoke on a copy of the bridge with Tasks 1+2 is 13/13.

---

### Task 3: Revit — `LedgerResult` and `LedgerLine` (pure) and `GovernedNotify.Event`: a ledger write returns what the ledger answered (`ledger #<id> · receipt <16 hex>…`, `not confirmed — …`, `not recorded — …`, not bound); `DeliveryGate`, `NamingRenamed` and `ModelPublished` return it; `tools/event-check`

(Written by the cross-checker from drafter C's scratch code, commits `aa1500f`/`fe69e86` in `scratchpad\p4cC`; part C's plan file was never written. Every block below was applied mechanically to a copy of f24fa8a after Tasks 1-2 and measured.)

**Files:**
- Create: `SentinelAddin/Coordination/LedgerResult.cs`
- Create: `tools/event-check/event-check.csproj`, `tools/event-check/Check.cs`
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (the class summary :12-22; `ModelPublished` :46-60; `DeliveryGate` and `NamingRenamed` :77-103)
- Modify: `.github/workflows/ci.yml` (:37-39 the Revit-free step's name, :46 its last `dotnet run`)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-ledger-grafts-4c-design.md` Decisions 1-2; `SentinelAddin/Coordination/GovernedNotify.cs:1-300` whole (the 6 s `Http` :24 and the private `Post` :276-298 stay for `FileVersion`, whose not-bound branch still calls `LogDoctor` :283 on the caller's thread; `OfficeScan` :253-274 is Task 4's); `SentinelAddin/Coordination/BcfConfig.cs:21-36` (`Load` never throws: the file, else the environment, else `http://localhost:4100`); `SentinelAddin/Engine/ProjectContext.cs:1-6`, `:18` (`NotBound`), `:42-46` (the `SENTINEL_CHECK` guard that hides the Revit-typed `For`); `tools/project-context-check/project-context-check.csproj` (the `SENTINEL_CHECK` harness pattern); `SentinelAddin/Coordination/ProposalResult.cs:14-24` (`Reached`, `Verdict`, `AuditId` as a string, `ReceiptHash` = `receipt.ledger_hash`); `WebApp/bridge/cde-store.mjs:599-617` (`recordAudit`, `return=representation`: the 201 row carries `id` and `hash`) and `:913-921` (`/propose` answers `audit_id` and `receipt`); `WebApp/bridge/bcf-service.mjs:246-248` (a 500's message is masked and may follow the insert), `:951-953` (503 CDE not configured); `WebApp/bridge/office-store.mjs:125-135` (`/office/scan` answers `{ok, received_at, violations}` — no id, no hash).

**Interfaces:**
- Consumes: `BcfConfig.Load()` → `{ServiceUrl, ServiceToken}`; `ProjectContext.NotBound` (`"This model is not bound to a web project — Sentinel ▸ Project Setup."`).
- Produces (namespace `Sentinel.Coordination`):
  - `public enum LedgerState { Recorded, NotConfirmed, NotRecorded, NotBound }`
  - `public sealed class LedgerResult` — `public readonly LedgerState State; public readonly long? Id; public readonly string? Hash; public readonly string Reason;` (private constructor) and:
    - `public static readonly TimeSpan DefaultTimeout` = 6 s;
    - `public static LedgerResult NotConfirmed(string reason)`, `NotRecorded(string reason)`, `NotBound()` (Reason = `ProjectContext.NotBound`);
    - `public static LedgerResult FromReceipt(string? auditId, string? ledgerHash)` — a positive integer id and a 64-hex hash → Recorded, else not confirmed "the bridge returned no chain hash" (Governed Publish and fix-in-place feed it `ProposalResult.AuditId` / `ReceiptHash`);
    - `public static LedgerResult FromResponse(int status, string? body)` — 2xx: the `POST /cde/:key/audit` row's `id` + `hash`, or a `/propose` body's `audit_id` + `receipt.ledger_hash` → Recorded, anything less → not confirmed "the bridge returned no chain hash"; 400/401/403/404/503 → not recorded "HTTP n: message" (message clipped at 200 chars); every other status → not confirmed "HTTP n[: message] (the entry may have landed)";
    - `public static LedgerResult FromException(Exception e, TimeSpan? timeout = null)` — `OperationCanceledException` (so `TaskCanceledException`) → not confirmed "timed out after <s> s (the entry may have landed)" (`0.#`, invariant); a refused / unreachable / unresolvable bridge (net8 `SocketException`, net48 `WebException` ConnectFailure / NameResolutionFailure, anywhere in the inner chain) → not recorded "the bridge did not answer"; anything else → not confirmed "<message> (the entry may have landed)";
    - `internal static LedgerResult Post(string serviceUrl, string? token, string projectKey, string path, object payload, TimeSpan timeout)` — BLOCKING, never throws, no Revit, no UI; an empty key sends nothing (NotBound); a non-http(s) address → not recorded; one `CancellationTokenSource(timeout)` per call over the whole send and body read; the shared `HttpClient` has `Timeout.InfiniteTimeSpan`.
  - `public static class LedgerLine` — `string For(LedgerResult r)`: `ledger #<id> · receipt <hash[0..16]>…` / `not confirmed — <reason>` / `not recorded — <reason>` / `ProjectContext.NotBound`; `string Sentence(LedgerResult r)`: `Recorded: ` + For(r), `Not recorded on the web: ` + NotBound (the IFC gate's words since 4a), else For(r) with its first letter upper-cased. (`Sentence` is an addition to the pinned surface; Tasks 4 and 5 use it for dialogs and window status.)
  - `GovernedNotify.Event(string path, object payload, string projectKey, TimeSpan? timeout = null)` → `LedgerResult` = `LedgerResult.Post(BcfConfig.Load().ServiceUrl, …ServiceToken, projectKey, path, payload, timeout ?? 6 s)`. Blocking, never throws, never calls `LogDoctor` or a Dispatcher.
  - `GovernedNotify.ModelPublished(...)`, `DeliveryGate(...)`, `NamingRenamed(...)` now return `LedgerResult` (through `Event`); their payloads are unchanged. Callers that ignore the result still compile: this task leaves every caller as it is (Task 4 wires them), so the build stays green.
  - `tools/event-check` — net8 console, compiles `LedgerResult.cs` and `ProjectContext.cs` under `SENTINEL_CHECK`; 42 checks after this task, 44 after Task 4.

- [ ] **Step 1: Write the failing harness**

Create `tools/event-check/event-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for what a Revit tool says about its ledger write (cohesion phase 4c, decision 1): every HTTP
       status and transport failure → Recorded / not confirmed / not recorded / not bound → the one line
       (LedgerResult, LedgerLine), and the POST itself against throwaway loopback "bridges". Compiles LedgerResult.cs
       and the pure half of ProjectContext.cs (SENTINEL_CHECK hides the Revit-typed For). No Revit API, no AppData,
       never the running bridge; `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>event-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
    <DefineConstants>$(DefineConstants);SENTINEL_CHECK</DefineConstants>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Coordination\LedgerResult.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\ProjectContext.cs" />
  </ItemGroup>
</Project>
```

Create `tools/event-check/Check.cs`:

```csharp
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static void Is(string got, string want, string n)
    {
        Ok(got == want, n);
        if (got != want) Console.WriteLine("        got:  " + got + "\n        want: " + want);
    }

    const string Hash = "3f9a0c1d2e4b5f60718293a4b5c6d7e8f90112233445566778899aabbccddeef";
    const string Hash2 = "0a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff0";
    // What POST /cde/:key/audit answers (recordAudit, return=representation) and what /propose answers.
    const string AuditRow = "{\"id\":812,\"project_id\":\"6f1c0000-0000-4000-8000-000000000001\",\"entity_type\":\"delivery_gate\",\"entity_id\":null," +
        "\"action\":\"IFC delivery gate PASS: a.ifc\",\"actor\":\"Revit\",\"old_value\":null,\"new_value\":{\"file\":\"a.ifc\"}," +
        "\"at\":\"2026-09-25T10:00:00+00:00\",\"prev_hash\":\"" + Hash2 + "\",\"hash\":\"" + Hash + "\"}";
    const string ProposeBody = "{\"verdict\":\"rejected\",\"summary\":{\"in_scope\":4,\"passing\":3,\"failing\":1},\"audit_id\":813," +
        "\"recorded_at\":\"2026-09-25T10:00:01+00:00\",\"receipt\":{\"version\":\"sentinel-receipt/1\",\"audit_id\":813,\"ledger_hash\":\"" + Hash2 + "\",\"prev_hash\":\"" + Hash + "\"}}";

    static int Main()
    {
        Console.WriteLine("LedgerResult + LedgerLine — what the ledger answered, in the one set of words\n");
        Responses();
        Exceptions();
        Lines();
        Posts();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. an HTTP answer → state → line ─────────────────────────────────────────────────────────────────
    static void Responses()
    {
        var row = LedgerResult.FromResponse(201, AuditRow);
        Ok(row.State == LedgerState.Recorded && row.Id == 812 && row.Hash == Hash, "201 with the audit row → Recorded, its id and hash");
        Is(LedgerLine.For(row), "ledger #812 · receipt 3f9a0c1d2e4b5f60…", "the line: ledger #id · receipt <16 hex>…");
        Is(LedgerLine.For(LedgerResult.FromResponse(200, ProposeBody)), "ledger #813 · receipt 0a1b2c3d4e5f6071…", "200 /propose → audit_id and receipt.ledger_hash, never the prev_hash");
        Is(LedgerLine.For(LedgerResult.FromResponse(200, ProposeBody.Replace("\"audit_id\":813,\"recorded_at\"", "\"audit_id\":\"813\",\"recorded_at\""))),
           "ledger #813 · receipt 0a1b2c3d4e5f6071…", "an audit id sent as a string reads the same");

        const string NoHash = "not confirmed — the bridge returned no chain hash";
        Is(LedgerLine.For(LedgerResult.FromResponse(201, "{\"ok\":true,\"received_at\":\"2026-09-25T10:00:00Z\",\"violations\":3}")), NoHash,
           "201 from /office/scan (no row comes back) → not confirmed, no chain hash");
        var hashless = new[]
        {
            AuditRow.Replace("\"hash\":\"" + Hash + "\"", "\"hash\":null"),       // a hashless row; its prev_hash is not its hash
            AuditRow.Replace("\"hash\":\"" + Hash + "\"", "\"hash\":\"3f9a0c1d2e4b\""), // not 64 hex
            AuditRow.Replace("\"id\":812,", ""),                                   // no id
            AuditRow.Replace("\"id\":812,", "\"id\":0,"),                          // not a row id
            ProposeBody.Replace("\"receipt\":{", "\"receipt\":null,\"x\":{"),     // /propose with no receipt
            "", "not json",
        };
        Ok(hashless.All(b => LedgerLine.For(LedgerResult.FromResponse(201, b)) == NoHash), "2xx without an id and a 64-hex hash → not confirmed, every shape");

        Is(LedgerLine.For(LedgerResult.FromResponse(400, "{\"message\":\"entity_type must be a string\"}")), "not recorded — HTTP 400: entity_type must be a string", "400 → not recorded, with the bridge's message");
        Is(LedgerLine.For(LedgerResult.FromResponse(401, "{\"message\":\"Unauthorized\"}")), "not recorded — HTTP 401: Unauthorized", "401 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(403, "{\"message\":\"Origin not allowed\"}")), "not recorded — HTTP 403: Origin not allowed", "403 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(404, "{\"message\":\"Project \\\"nope\\\" does not exist — create it in the web app (Projects → + New project) first.\"}")),
           "not recorded — HTTP 404: Project \"nope\" does not exist — create it in the web app (Projects → + New project) first.", "404 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(503, "{\"message\":\"CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service.\"}")),
           "not recorded — HTTP 503: CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service.", "503 → not recorded");
        Is(LedgerLine.For(LedgerResult.FromResponse(500, "{\"message\":\"Internal error — see the bridge log.\"}")),
           "not confirmed — HTTP 500: Internal error — see the bridge log. (the entry may have landed)", "500 (masked; may follow the insert) → not confirmed");
        Is(LedgerLine.For(LedgerResult.FromResponse(502, "<html>Bad Gateway</html>")), "not confirmed — HTTP 502 (the entry may have landed)", "a proxy's 502 page → not confirmed, the status alone");
        Ok(new[] { 409, 413, 429, 504 }.All(s => LedgerResult.FromResponse(s, "{\"message\":\"x\"}").State == LedgerState.NotConfirmed),
           "only 400/401/403/404/503 read not recorded — 409, 413, 429, 504 stay not confirmed");
        var longMsg = new string('x', 300);
        Ok(LedgerLine.For(LedgerResult.FromResponse(400, "{\"message\":\"" + longMsg + "\"}")) == "not recorded — HTTP 400: " + new string('x', 200) + "…",
           "a long bridge message is clipped at 200 characters");
    }

    // ── 2. a transport failure → state → line ────────────────────────────────────────────────────────────
    static void Exceptions()
    {
        Is(LedgerLine.For(LedgerResult.FromException(new TaskCanceledException())), "not confirmed — timed out after 6 s (the entry may have landed)",
           "a timeout → not confirmed after the default 6 s, may have landed");
        Is(LedgerLine.For(LedgerResult.FromException(new OperationCanceledException(), TimeSpan.FromMilliseconds(500))),
           "not confirmed — timed out after 0.5 s (the entry may have landed)", "the line names the cap that ran out");
        const string NoAnswer = "not recorded — the bridge did not answer";
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed", new SocketException((int)SocketError.ConnectionRefused)))),
           NoAnswer, "connection refused (net8) → not recorded, the bridge did not answer");
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed",
               new WebException("Unable to connect to the remote server", new SocketException((int)SocketError.ConnectionRefused), WebExceptionStatus.ConnectFailure, null)))),
           NoAnswer, "connection refused (net48: WebException ConnectFailure) → not recorded");
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed", new SocketException((int)SocketError.HostNotFound)))),
           NoAnswer, "an unknown host → not recorded");
        Is(LedgerLine.For(LedgerResult.FromException(new HttpRequestException("send failed", new IOException("The response ended prematurely.")))),
           "not confirmed — The response ended prematurely. (the entry may have landed)", "a reset after sending → not confirmed");
        Ok(LedgerResult.FromException(new HttpRequestException("send failed", new WebException("x", WebExceptionStatus.ReceiveFailure))).State == LedgerState.NotConfirmed,
           "net48 ReceiveFailure (after sending) → not confirmed");
    }

    // ── 3. the sentences, not bound, receipts from /propose ─────────────────────────────────────────────
    static void Lines()
    {
        var nb = LedgerResult.NotBound();
        Ok(nb.State == LedgerState.NotBound && LedgerLine.For(nb) == ProjectContext.NotBound, "not bound → ProjectContext.NotBound, word for word");
        Is(LedgerLine.Sentence(nb), "Not recorded on the web: This model is not bound to a web project — Sentinel ▸ Project Setup.",
           "not bound as a sentence: the IFC gate's words since 4a");
        Is(LedgerLine.Sentence(LedgerResult.FromResponse(201, AuditRow)), "Recorded: ledger #812 · receipt 3f9a0c1d2e4b5f60…", "Recorded: ledger #id · receipt …");
        Is(LedgerLine.Sentence(LedgerResult.NotRecorded("the bridge did not answer")), "Not recorded — the bridge did not answer", "Not recorded — the bridge did not answer");
        Is(LedgerLine.Sentence(LedgerResult.FromException(new TaskCanceledException())), "Not confirmed — timed out after 6 s (the entry may have landed)", "Not confirmed — timed out …");
        Ok(LedgerResult.FromReceipt("813", Hash2).State == LedgerState.Recorded
           && new (string?, string?)[] { (null, Hash2), ("813", null), ("x", Hash2), ("-1", Hash2), ("0", Hash2), ("813", "abc") }
               .All(p => LedgerLine.For(LedgerResult.FromReceipt(p.Item1, p.Item2)) == "not confirmed — the bridge returned no chain hash"),
           "a ProposalResult's AuditId + ReceiptHash → Recorded only with both");
    }

    // ── 4. the POST itself, against loopback "bridges" ─────────────────────────────────────────────────
    record Seen(string Line, string Auth, string ContentType, string Body);

    // Accepts one request, reads its head and body, answers (status, body) after delayMs; a client that gave up is not an error.
    static (Task<Seen> Seen, string Url) Bridge(int status, string body, int delayMs = 0)
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)l.LocalEndpoint).Port;
        var t = Task.Run(async () =>
        {
            try
            {
                using var c = await l.AcceptTcpClientAsync();
                var s = c.GetStream();
                var buf = new byte[65536];
                var got = new List<byte>();
                int headEnd;
                while ((headEnd = IndexOf(got, "\r\n\r\n")) < 0)
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.AddRange(buf.Take(n));
                }
                var head = Encoding.ASCII.GetString(got.Take(Math.Max(headEnd, 0)).ToArray()).Split("\r\n");
                string H(string name) => head.FirstOrDefault(h => h.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase))?.Substring(name.Length + 1).Trim() ?? "";
                var length = int.TryParse(H("Content-Length"), out var cl) ? cl : 0;
                while (got.Count < headEnd + 4 + length)
                {
                    var n = await s.ReadAsync(buf);
                    if (n == 0) break;
                    got.AddRange(buf.Take(n));
                }
                var seen = new Seen(head[0], H("Authorization"), H("Content-Type"), Encoding.UTF8.GetString(got.Skip(headEnd + 4).ToArray()));
                await Task.Delay(delayMs);
                var bytes = Encoding.UTF8.GetBytes(body);
                var reply = $"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n";
                try { await s.WriteAsync(Encoding.ASCII.GetBytes(reply).Concat(bytes).ToArray()); await s.FlushAsync(); }
                catch (IOException) { /* the client's cap ran out first */ }
                return seen;
            }
            finally { l.Stop(); }
        });
        return (t.WaitAsync(TimeSpan.FromSeconds(30)), url); // a client that never connects fails the check instead of hanging it
    }

    static int IndexOf(List<byte> b, string m)
    {
        var p = Encoding.ASCII.GetBytes(m);
        for (int i = 0; i + p.Length <= b.Count; i++) if (p.Select((x, j) => b[i + j] == x).All(x => x)) return i;
        return -1;
    }

    static string DeadUrl()
    {
        var dead = new TcpListener(IPAddress.Loopback, 0);
        dead.Start();
        var url = "http://127.0.0.1:" + ((IPEndPoint)dead.LocalEndpoint).Port;
        dead.Stop();
        return url;
    }

    static void Posts()
    {
        Ok(LedgerResult.DefaultTimeout == TimeSpan.FromSeconds(6), "an event waits 6 s by default");
        var payload = new { entity_type = "delivery_gate", actor = "Revit", action = "IFC delivery gate PASS: a.ifc" };

        var (seen, url) = Bridge(201, AuditRow);
        var r = LedgerResult.Post(url + "/", "tok", " demo tower ", "/audit", payload, TimeSpan.FromSeconds(5));
        var s = seen.GetAwaiter().GetResult();
        Is(LedgerLine.For(r), "ledger #812 · receipt 3f9a0c1d2e4b5f60…", "a 201 row from a live POST → Recorded");
        Is(s.Line, "POST /cde/demo%20tower/audit HTTP/1.1", "POST /cde/<escaped, trimmed key>/audit");
        Ok(s.Auth == "Bearer tok" && s.ContentType.StartsWith("application/json"), "the bridge bearer and a JSON body are sent");
        Is(s.Body, "{\"entity_type\":\"delivery_gate\",\"actor\":\"Revit\",\"action\":\"IFC delivery gate PASS: a.ifc\"}", "the payload goes as it was built");

        var (seen2, url2) = Bridge(201, AuditRow);
        LedgerResult.Post(url2, "", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        Ok(seen2.GetAwaiter().GetResult().Auth == "", "no token → no Authorization header");

        var (seen3, url3) = Bridge(500, "{\"message\":\"Internal error — see the bridge log.\"}");
        var r500 = LedgerResult.Post(url3, "", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        seen3.GetAwaiter().GetResult();
        var (seen4, url4) = Bridge(503, "{\"message\":\"CDE not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env, then restart the service.\"}");
        var r503 = LedgerResult.Post(url4, "", "demo", "/audit", payload, TimeSpan.FromSeconds(5));
        seen4.GetAwaiter().GetResult();
        Ok(r500.State == LedgerState.NotConfirmed && r503.State == LedgerState.NotRecorded, "a live 500 → not confirmed, a live 503 → not recorded");

        var sw = Stopwatch.StartNew();
        var down = LedgerResult.Post(DeadUrl(), "", "demo", "/audit", payload, TimeSpan.FromSeconds(10));
        Is(LedgerLine.Sentence(down), "Not recorded — the bridge did not answer", "bridge stopped → Not recorded — the bridge did not answer");
        Ok(sw.Elapsed < TimeSpan.FromSeconds(8), "a refused connection answers before the cap runs out");

        var unknown = LedgerResult.Post("http://sentinel-event-check.invalid", "", "demo", "/audit", payload, TimeSpan.FromSeconds(10));
        Is(LedgerLine.For(unknown), "not recorded — the bridge did not answer", "an unresolvable bridge host → not recorded");

        var silent = new TcpListener(IPAddress.Loopback, 0);
        silent.Start();
        sw.Restart();
        var quiet = LedgerResult.Post("http://127.0.0.1:" + ((IPEndPoint)silent.LocalEndpoint).Port, "", "demo", "/audit", payload, TimeSpan.FromMilliseconds(500));
        var took = sw.Elapsed;
        silent.Stop();
        Is(LedgerLine.For(quiet), "not confirmed — timed out after 0.5 s (the entry may have landed)", "a bridge that takes the request and never answers → not confirmed");
        Ok(took < TimeSpan.FromSeconds(3), "0.5 s asked, under 3 s waited");

        var watch = new TcpListener(IPAddress.Loopback, 0);
        watch.Start();
        var unbound = LedgerResult.Post("http://127.0.0.1:" + ((IPEndPoint)watch.LocalEndpoint).Port, "", "  ", "/audit", payload, TimeSpan.FromSeconds(5));
        Thread.Sleep(200);
        var asked = watch.Pending();
        watch.Stop();
        Ok(unbound.State == LedgerState.NotBound && !asked, "an empty key sends nothing and reads not bound");

        Is(LedgerLine.For(LedgerResult.Post("localhost:4100", "", "demo", "/audit", payload, TimeSpan.FromSeconds(5))),
           "not recorded — the bridge address is not an http(s) URL (localhost:4100)", "a bridge address that is not a URL → not recorded, nothing sent");
    }
}
```

- [ ] **Step 2: Run it — RED**

Run (repo root): `dotnet run --project tools/event-check`

Expected: the build fails before any check runs:

```
CSC : error CS2001: Source file '…\tools\event-check\..\..\SentinelAddin\Coordination\LedgerResult.cs' could not be found. […\tools\event-check\event-check.csproj]

The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `LedgerResult.cs` — the result, the POST and the one formatter**

Create `SentinelAddin/Coordination/LedgerResult.cs`:

```csharp
using System;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using Sentinel.Engine; // ProjectContext.NotBound

namespace Sentinel.Coordination;

/// <summary>What one ledger write came to, as far as it was measured (cohesion phase 4c, decision 1).</summary>
public enum LedgerState { Recorded, NotConfirmed, NotRecorded, NotBound }

/// <summary>
/// The outcome of one governed event. <see cref="LedgerState.Recorded"/> only when the bridge handed back the row's id
/// and its 64-hex chain hash; <see cref="LedgerState.NotConfirmed"/> when the entry may have landed but nothing proves
/// it (a timeout, a 5xx — a 500 can follow the insert and the bridge masks its text —, a 2xx with no hash);
/// <see cref="LedgerState.NotRecorded"/> when the bridge refused before writing (400/401/403/404/503) or was never
/// reached; <see cref="LedgerState.NotBound"/> when the document has no web project and nothing was sent. Revit-free
/// and UI-free: tools/event-check compiles this file.
/// </summary>
public sealed class LedgerResult
{
    /// <summary>The cap on one event POST, body included, when the caller passes none.</summary>
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(6);

    private const string NoHash = "the bridge returned no chain hash";
    private const string MayHaveLanded = " (the entry may have landed)";

    public readonly LedgerState State;
    public readonly long? Id;
    public readonly string? Hash;
    public readonly string Reason;

    private LedgerResult(LedgerState state, string reason, long? id = null, string? hash = null)
    {
        State = state;
        Reason = reason;
        Id = id;
        Hash = hash;
    }

    public static LedgerResult NotConfirmed(string reason) => new(LedgerState.NotConfirmed, reason);
    public static LedgerResult NotRecorded(string reason) => new(LedgerState.NotRecorded, reason);
    public static LedgerResult NotBound() => new(LedgerState.NotBound, ProjectContext.NotBound);

    /// <summary>An audit id and a chain hash as the bridge handed them back (a /propose body's audit_id and
    /// receipt.ledger_hash, which ProposalResult carries) → Recorded, else not confirmed "no chain hash".</summary>
    public static LedgerResult FromReceipt(string? auditId, string? ledgerHash) =>
        long.TryParse(auditId, NumberStyles.None, CultureInfo.InvariantCulture, out var id) && id > 0 && IsHash(ledgerHash)
            ? new LedgerResult(LedgerState.Recorded, "", id, ledgerHash)
            : NotConfirmed(NoHash);

    /// <summary>An HTTP answer → what it proves. 2xx: the POST /cde/:key/audit row's id + hash, or a /propose body's
    /// audit_id + receipt.ledger_hash → Recorded, anything less → not confirmed. 400/401/403/404/503 are answered
    /// before any write → not recorded "HTTP n: message". Any other status → not confirmed.</summary>
    public static LedgerResult FromResponse(int status, string? body)
    {
        string? message = null, id = null, hash = null;
        try
        {
            using var d = JsonDocument.Parse(body ?? "");
            var root = d.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                message = Str(root, "message");
                if (root.TryGetProperty("receipt", out var receipt)) { id = Scalar(root, "audit_id"); hash = Str(receipt, "ledger_hash"); }
                else { id = Scalar(root, "id"); hash = Str(root, "hash"); }
            }
        }
        catch (JsonException) { /* not JSON (a proxy's page, an empty body): the status alone speaks */ }
        if (status >= 200 && status < 300) return FromReceipt(id, hash);
        var what = "HTTP " + status + (string.IsNullOrWhiteSpace(message) ? "" : ": " + Clip(message!));
        return status is 400 or 401 or 403 or 404 or 503 ? NotRecorded(what) : NotConfirmed(what + MayHaveLanded);
    }

    /// <summary>A transport failure → what it proves. The call's own cap running out may follow the insert → not
    /// confirmed "timed out after N s"; a refused, unreachable or unresolvable bridge never saw the request → not
    /// recorded "the bridge did not answer"; anything else (a reset after sending) → not confirmed.</summary>
    public static LedgerResult FromException(Exception e, TimeSpan? timeout = null)
    {
        if (e is OperationCanceledException) // TaskCanceledException included
            return NotConfirmed("timed out after " + (timeout ?? DefaultTimeout).TotalSeconds.ToString("0.#", CultureInfo.InvariantCulture) + " s" + MayHaveLanded);
        if (NeverConnected(e)) return NotRecorded("the bridge did not answer");
        return NotConfirmed(Clip(e.InnerException?.Message ?? e.Message) + MayHaveLanded);
    }

    // Every call carries its own cap (a token per call), so a label names the cap that actually ran out.
    private static readonly HttpClient Http = new HttpClient { Timeout = System.Threading.Timeout.InfiniteTimeSpan };

    /// <summary>POST <paramref name="payload"/> as JSON to {serviceUrl}/cde/{key}{path} and read what the ledger
    /// answered. BLOCKING (≤ <paramref name="timeout"/>, body included); never throws; no Revit, no UI. An empty key
    /// sends nothing. <c>GovernedNotify.Event</c> is this with the bridge from BcfConfig; the harness drives it
    /// against its own loopback bridges.</summary>
    internal static LedgerResult Post(string serviceUrl, string? token, string projectKey, string path, object payload, TimeSpan timeout)
    {
        var key = (projectKey ?? "").Trim();
        if (key.Length == 0) return NotBound();
        var url = (serviceUrl ?? "").TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + path;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            return NotRecorded("the bridge address is not an http(s) URL (" + serviceUrl + ")");
        string json;
        try { json = JsonSerializer.Serialize(payload); }
        catch (Exception e) { return NotRecorded("the event could not be written as JSON (" + e.Message + ")"); }
        try
        {
            using var cts = new CancellationTokenSource(timeout);
            using var msg = new HttpRequestMessage(HttpMethod.Post, uri) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            if (!string.IsNullOrWhiteSpace(token)) msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // SendAsync buffers the body before it returns, under this token: the cap covers the whole read.
            using var resp = Http.SendAsync(msg, cts.Token).GetAwaiter().GetResult();
            return FromResponse((int)resp.StatusCode, resp.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        }
        catch (Exception e) { return FromException(e, timeout); }
    }

    // The request never reached the bridge: refused, unreachable or unresolvable. net8 raises HttpRequestException →
    // SocketException; net48 (Revit 2024) HttpRequestException → WebException (ConnectFailure, NameResolutionFailure).
    private static bool NeverConnected(Exception e)
    {
        for (var x = e; x != null; x = x.InnerException)
        {
            if (x is SocketException s && s.SocketErrorCode is SocketError.ConnectionRefused or SocketError.HostNotFound
                    or SocketError.NoData or SocketError.TryAgain or SocketError.HostUnreachable or SocketError.NetworkUnreachable
                    or SocketError.AddressNotAvailable) return true;
            if (x is WebException w && w.Status is WebExceptionStatus.ConnectFailure or WebExceptionStatus.NameResolutionFailure) return true;
        }
        return false;
    }

    private static bool IsHash(string? h)
    {
        if (h is null || h.Length != 64) return false;
        foreach (var c in h) if (!Uri.IsHexDigit(c)) return false;
        return true;
    }

    private static string Clip(string s) => s.Length <= 200 ? s : s.Substring(0, 200) + "…";

    private static string? Str(JsonElement o, string name) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    // An id arrives as a JSON number (bigint) or a string.
    private static string? Scalar(JsonElement o, string name)
    {
        if (o.ValueKind != JsonValueKind.Object || !o.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch { JsonValueKind.String => p.GetString(), JsonValueKind.Number => p.GetRawText(), _ => null };
    }
}

/// <summary>The only words for a ledger outcome (decision 1). Every Revit surface that writes to the ledger prints
/// one of these; none says "recorded" without the row's id and hash.</summary>
public static class LedgerLine
{
    /// <summary>"ledger #812 · receipt 3f9a0c1d2e4b5f60…", "not confirmed — …", "not recorded — …", or
    /// <see cref="ProjectContext.NotBound"/>.</summary>
    public static string For(LedgerResult r) => r.State switch
    {
        LedgerState.Recorded => "ledger #" + r.Id + " · receipt " + r.Hash!.Substring(0, 16) + "…",
        LedgerState.NotConfirmed => "not confirmed — " + r.Reason,
        LedgerState.NotRecorded => "not recorded — " + r.Reason,
        _ => ProjectContext.NotBound,
    };

    /// <summary>The same as a sentence, for a dialog or a status line: "Recorded: ledger #812 · receipt …",
    /// "Not confirmed — …", "Not recorded — …", or "Not recorded on the web: This model is not bound …" (the IFC
    /// gate's words since phase 4a).</summary>
    public static string Sentence(LedgerResult r)
    {
        if (r.State == LedgerState.Recorded) return "Recorded: " + For(r);
        if (r.State == LedgerState.NotBound) return "Not recorded on the web: " + ProjectContext.NotBound;
        var line = For(r);
        return char.ToUpperInvariant(line[0]) + line.Substring(1);
    }
}
```

(`System.Net.Http` and `System.Text.Json` are already referenced by the add-in on net48 — `GovernedNotify.cs` uses both. `WebException` is how net48's `HttpClient` reports a refused connection; net8 reports a `SocketException`. `.invalid` never resolves, so the unresolvable-host check needs no network.)

- [ ] **Step 4: Run it — GREEN**

Run: `dotnet run --project tools/event-check`

Expected: 42 `PASS` lines, ending

```
  PASS  an empty key sends nothing and reads not bound
  PASS  a bridge address that is not a URL → not recorded, nothing sent

42/42 checks pass
```

- [ ] **Step 5: `GovernedNotify` — `Event`, and the three `/audit` writers return what it answered**

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 12-22):

```csharp
{
    /// <summary>
    /// Fire-and-forget notifications from Revit INTO the web app's governed layer (bridge <c>/cde/...</c>).
    /// This is the compatibility bridge between authoring (Revit) and the referee layer (Sentinel web): it
    /// records what Revit did in the project's immutable, hash-chained audit trail, so the CDE timeline shows
    /// authoring events alongside coordination + governance. It NEVER throws and NEVER blocks the Revit save
    /// flow — an absent or slow bridge is a silent no-op. The bridge comes from <see cref="BcfConfig"/>
    /// (ServiceUrl + ServiceToken); the project is ALWAYS the caller's document key (ProjectContext) — there is
    /// no machine default, and an empty key records nothing (and says so in the Doctor log).
    /// </summary>
    internal static class GovernedNotify
```

with:

```csharp
{
    /// <summary>
    /// Notifications from Revit INTO the web app's governed layer (bridge <c>/cde/...</c>): what Revit did lands on
    /// the project's ledger (audit_log; its hash chain runs through the whole table, not per project), so the CDE
    /// timeline shows authoring events alongside coordination + governance. A ledger event (<see cref="Event"/> and
    /// the wrappers that return a <see cref="LedgerResult"/>) is BLOCKING — 6 s cap — and says what the ledger
    /// answered: callers run it OFF the Revit API thread and wait (a modal tool) or continue on the task (save, sync),
    /// then print <see cref="LedgerLine"/> on their own thread. Nothing here throws; only <see cref="FileVersion"/>'s
    /// not-bound Doctor line touches UI, on the caller's thread. The bridge comes from <see cref="BcfConfig"/>
    /// (ServiceUrl + ServiceToken); the project is ALWAYS the caller's document key (ProjectContext) — there is
    /// no machine default, and an empty key records nothing and says so.
    /// </summary>
    internal static class GovernedNotify
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 46-53):

```csharp
        private const string NotBoundError = "this model is not bound to a web project — Sentinel ▸ Project Setup";

        /// <summary>Record a "model published from Revit" event in the governed audit trail.</summary>
        public static void ModelPublished(string modelName, long bytes, string projectKey)
        {
            Post("/audit", new
            {
                entity_type = "model",
```

with:

```csharp
        private const string NotBoundError = "this model is not bound to a web project — Sentinel ▸ Project Setup";

        /// <summary>
        /// POST one governed event to <c>{ServiceUrl}/cde/{key}{path}</c> and return what the ledger answered —
        /// <see cref="LedgerLine"/> is the only text for it. BLOCKING, ≤ 6 s unless <paramref name="timeout"/> says
        /// otherwise: a modal tool waits with <c>Task.Run(() => …).GetAwaiter().GetResult()</c>, a save or sync handler
        /// continues on the task. Never throws and never touches UI — no LogDoctor, no Dispatcher: a worker calling
        /// back into a thread that waits on it would deadlock; the caller prints the line on its own thread. An empty
        /// key sends nothing (<see cref="LedgerState.NotBound"/>).
        /// </summary>
        public static LedgerResult Event(string path, object payload, string projectKey, TimeSpan? timeout = null)
        {
            var cfg = BcfConfig.Load(); // never throws: the file, else the environment, else localhost
            return LedgerResult.Post(cfg.ServiceUrl, cfg.ServiceToken, projectKey, path, payload, timeout ?? LedgerResult.DefaultTimeout);
        }

        /// <summary>Record a "model published from Revit" event on the ledger (AutoPublish continues on the task and
        /// logs the line).</summary>
        public static LedgerResult ModelPublished(string modelName, long bytes, string projectKey) =>
            Event("/audit", new
            {
                entity_type = "model",
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 56-60):

```csharp
                new_value = new { model = modelName, kb = bytes / 1024, source = "revit", at = DateTime.UtcNow.ToString("o") },
            }, projectKey);
        }

        /// <summary>
```

with:

```csharp
                new_value = new { model = modelName, kb = bytes / 1024, source = "revit", at = DateTime.UtcNow.ToString("o") },
            }, projectKey);

        /// <summary>
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 77-81):

```csharp

        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) in the governed audit trail. The web CDE timeline then shows the
        /// certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The row names
        /// the contract that judged (contract_ref · contract_source · contract_sha256), all null when none was
```

with:

```csharp

        /// <summary>
        /// Record an IFC Delivery Gate verdict (KF-1) on the ledger. The web CDE timeline then shows the
        /// certificate that decided whether a deliverable was fit for upload: PASS, FAIL or NOT CHECKED. The row names
        /// the contract that judged (contract_ref · contract_source · contract_sha256), all null when none was
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 83-90):

```csharp
        /// a pass or a fail. The row is <see cref="Sentinel.Engine.GateLines.AuditValue"/>, which has the Node intake
        /// gate row's shape and is pinned by tools/gate-check. <c>sha256</c> ties it to the exact bytes certified.
        /// </summary>
        public static void DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey)
        {
            Post("/audit", new
            {
                entity_type = "delivery_gate",
```

with:

```csharp
        /// a pass or a fail. The row is <see cref="Sentinel.Engine.GateLines.AuditValue"/>, which has the Node intake
        /// gate row's shape and is pinned by tools/gate-check. <c>sha256</c> ties it to the exact bytes certified.
        /// The IFC gate and Governed Publish wait for the answer and print its line.
        /// </summary>
        public static LedgerResult DeliveryGate(string fileName, Sentinel.Engine.IfcDeliveryGate.GateResult gate, string projectKey) =>
            Event("/audit", new
            {
                entity_type = "delivery_gate",
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 93-103):

```csharp
                new_value = Sentinel.Engine.GateLines.AuditValue(fileName, gate),
            }, projectKey);
        }

        /// <summary>Record a Naming Manager batch in the governed audit trail (fire-and-forget).</summary>
        public static void NamingRenamed(IEnumerable<object> rows, string actor, string projectKey)
        {
            var list = rows.ToList();
            Post("/audit", new
            {
                entity_type = "naming",
```

with:

```csharp
                new_value = Sentinel.Engine.GateLines.AuditValue(fileName, gate),
            }, projectKey);

        /// <summary>Record a Naming Manager batch on the ledger: one row for the batch (the window continues on the
        /// task and shows the line).</summary>
        public static LedgerResult NamingRenamed(IEnumerable<object> rows, string actor, string projectKey)
        {
            var list = rows.ToList();
            return Event("/audit", new
            {
                entity_type = "naming",
```

- [ ] **Step 6: CI runs the harness**

Replace (in `.github/workflows/ci.yml`, lines 37-39):

```yaml
      - run: dotnet build SentinelAddin -c Release -p:RevitVersion=${{ matrix.revit }} -p:DeployToRevit=false
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards)
        if: matrix.revit == 2026
```

with:

```yaml
      - run: dotnet build SentinelAddin -c Release -p:RevitVersion=${{ matrix.revit }} -p:DeployToRevit=false
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events)
        if: matrix.revit == 2026
```

Replace (in `.github/workflows/ci.yml`, line 46):

```yaml
          dotnet run --project tools/ghost-standards-check
```

with:

```yaml
          dotnet run --project tools/ghost-standards-check
          dotnet run --project tools/event-check
```

- [ ] **Step 7: Both builds and the harnesses that compile add-in files**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` and `dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false`

Expected: `0 Error(s)` on both; 6 warnings on 2024 (ChangesetExecutor 164, Commands.BcfIssues 322, Commands.GhostBuilder 220, GhostBuilderOrchestrator 112, RuleRegex 17 and 20) and 3 on 2025 (Commands.Annotate 76 and 88, Commands.BcfIssues 322) — master's set, none in a file this task touched. The four callers (`Commands.IfcGate.cs:118`, `Commands.GovernedPublish.cs:74`, `Engine/AutoPublish.cs:67`, `Workflow/NamingManagerService.cs:161`) still call the writers as statements and discard the result until Task 4.

Run: `dotnet run --project tools/event-check` → `42/42 checks pass`; `dotnet run --project tools/project-context-check` → `19/19 checks pass`; `dotnet run --project tools/gate-check` → `123/123 checks pass`.

- [ ] **Step 8: Commit**

```bash
git add SentinelAddin/Coordination/LedgerResult.cs SentinelAddin/Coordination/GovernedNotify.cs tools/event-check/event-check.csproj tools/event-check/Check.cs .github/workflows/ci.yml
git commit -m "feat(revit): LedgerResult and LedgerLine — a ledger write says what the ledger answered: ledger #<id> · receipt <16 hex>… only with the row's id and 64-hex hash, not recorded only when nothing was written (HTTP 400/401/403/404/503, or the bridge did not answer), not confirmed after a timeout, a 5xx or a 2xx without a hash (the entry may have landed), the not-bound text when the model has no project; GovernedNotify.Event (blocking, 6 s, never throws, never touches UI) and DeliveryGate / NamingRenamed / ModelPublished return it; tools/event-check 42/42 in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

Part C's plan file (p4c-plan-C.md) did not exist. Drafter C left code only, in scratchpad\p4cC commits aa1500f (task3) and fe69e86 (task4). The complete Task 3 text is now at C:\Users\yazan\AppData\Local\Temp\claude\C--Users-yazan-Claude-Projects-Co-BIM-Assistant-sentinel-project\4ae86a3d-066f-4d31-a2e7-567560705d3d\scratchpad\p4c-plan-C.md, section "### Task 3". I wrote it from that code after reviewing it against the spec and the pinned interface. Every Replace block was generated from the diff against master and applied mechanically to f24fa8a+T1+T2: 11/11 edits matched, and the resulting tree is identical to the measured one.
Gates measured:
- Step 2 RED: `CSC : error CS2001: Source file '…\tools\event-check\..\..\SentinelAddin\Coordination\LedgerResult.cs' could not be found.`
- Step 4: event-check 42/42.
- Step 7: both builds have 0 errors (6 warnings on 2024, 3 on 2025, master's set); project-context-check 19/19; gate-check 123/123.
Additions to the pinned surface:
- `LedgerLine.Sentence(r)`: "Recorded: " + For, "Not recorded on the web: " + NotBound, otherwise For with its first letter capitalised.
- `LedgerResult.FromReceipt(auditId, ledgerHash)`, and the factories `NotConfirmed`, `NotRecorded` and `NotBound`.
- `FromException(e, TimeSpan? timeout = null)` takes an optional cap so the line names the cap that ran out.
- `internal LedgerResult.Post(serviceUrl, token, key, path, payload, timeout)`.
- The fields are readonly fields (State, Id, Hash, Reason).
Event and Post never call LogDoctor or a Dispatcher. Only FileVersion's old fire-and-forget Post still logs its not-bound line, on the caller's thread.

---

### Task 4: Revit — the covered tools print the line: the IFC gate (both paths) waits and ends `Recorded: ledger #…` or says why not; Governed Publish waits for the gate row before `/propose`, prints the gate row's and the verdict's lines and says `Version badge: not confirmed — <reason>` instead of promising the ✓; Naming Manager's status gains the line; Auto-Publish and the sync scan never block and log theirs; fix-in-place says `ledger #…` where it said `audit <id>`

**Files:**
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (`OfficeScan`, :267-289 as Task 3 leaves it — master :253-274)
- Modify: `SentinelAddin/Commands.IfcGate.cs` (`Certify`, :115-124 — both paths call it: the command body's "certify an existing file" and the export's Events job)
- Modify: `SentinelAddin/Commands.GovernedPublish.cs` (summary :16-18; gate :70-78; unreachable :98-107; reject :114-124; outbox and accept :140-172)
- Modify: `SentinelAddin/Commands.NamingManager.cs` (usings :3-7; the rename job :80-87), `SentinelAddin/Workflow/NamingManagerService.cs` (usings :3-4; `Apply` :107-111, :160-162)
- Modify: `SentinelAddin/Engine/AutoPublish.cs` (usings :1-2; the publish tail :62-69)
- Modify: `SentinelAddin/App.cs` (`OnSynchronized` :182-189; the Naming Manager and Governed Publish tooltips :254-261)
- Modify: `SentinelAddin/Commands.BcfIssues.cs` (fix-in-place: the Check status :222-224; the re-check evidence :289-295; the Resolved status :318-320)
- Modify: `tools/event-check/Check.cs` (after :195-196, Task 3's numbering)
- Read for reference: spec Decisions 2-3 and 7; `SentinelAddin/Commands.IfcGate.cs:20-125` (`Certify` :111-124; the export job :79-107; `using System.Threading.Tasks` :3); `SentinelAddin/Commands.GovernedPublish.cs:1-184` (the contract load's `Task.Run` idiom :53; a gate FAIL returns before `/propose` :76-78; `Propose` :92 and `RegisterVersionId` / the stamp `Propose` / `LiveVersion` :144-148 stay on the API thread as on master — the 120 s calls are not moved in 4c); `SentinelAddin/Coordination/ProposalResult.cs:14-24`; `SentinelAddin/Commands.NamingManager.cs:71-89` and `SentinelAddin/UI/NamingManagerWindow.cs:162-163` (`SetStatus` / `SetBusy` are `Dispatcher.Invoke`: safe from a worker only when the UI thread is not waiting on it — the continuation runs after the job returned); `SentinelAddin/Workflow/NamingManagerService.cs:105-165`; `SentinelAddin/Engine/AutoPublish.cs:40-80` (runs in the Events job; `FileVersion` stays fire-and-forget); `SentinelAddin/App.cs:163-200` (`OnSynchronized`; `RefreshJourney(doc)` :194-200) and `SentinelAddin/UI/SentinelPanelViewModel.cs:94`, `:124-134` (`LogDoctor` → `OnUi`; the pane's dispatcher is `Application.Current?.Dispatcher ?? Dispatcher.CurrentDispatcher`, the idiom this task repeats); `SentinelAddin/Commands.BcfIssues.cs:215-325`; `SentinelAddin/Engine/GateLines.cs:60-110` (`PublishRejected`, `PublishLine`, `GateDialog`).

**Interfaces:**
- Consumes (Task 3): `GovernedNotify.Event`, `DeliveryGate` / `NamingRenamed` / `ModelPublished` → `LedgerResult`; `LedgerResult.FromReceipt`, `NotBound()`, `NotRecorded(reason)`; `LedgerLine.For`, `LedgerLine.Sentence`.
- Produces:
  - `GovernedNotify.OfficeScan(ScanReport report, string projectKey)` → `LedgerResult` (was `void`): BLOCKING ≤ 6 s through `Event("/office/scan", <the report's own JSON as a JsonElement>, key)`; an empty key → NotBound; within 60 s of the last post → not recorded "a scan report went less than a minute ago; this one was not sent (one a minute per process)"; a 201 reads "not confirmed — the bridge returned no chain hash" (the route writes through `audit()`, return=minimal — deferred, spec Decision 3).
  - `NamingManagerService.Apply(Document doc, IEnumerable<NamingRow> rows, Ruleset rs, string? projectKey, out Task<LedgerResult>? ledger)` — the batch row is posted on a task (`null` when nothing was renamed); its only caller is `NamingManagerCommand`.
  - Surfaces: the IFC gate dialog ends `LedgerLine.Sentence(r)` (both paths, waited with `Task.Run(...).GetAwaiter().GetResult()`); Governed Publish shows `Gate row: <line>` on the gate FAIL, unreachable, reject and accept dialogs and `Verdict row: <line>` (from `FromReceipt(verdict.AuditId, verdict.ReceiptHash)`) on reject, outbox failure and accept, and `Version badge: ✓ <verdict> stamped on this version.` only when `RegisterVersionId` returned an id and the stamp call reached the bridge with the same verdict, else `Version badge: not confirmed — <reason>.`; Naming Manager's status `Renamed n/m. … Ledger: waiting for the bridge…` then `… Recorded: ledger #…` (or why not); the Doctor log gets `Auto-publish of <title>: <line>` and `Scan report: <line>` from a `BeginInvoke` on the pane's dispatcher, and the journey is re-read after the scan post answered; fix-in-place's Check status, evidence comment and Resolved status carry `LedgerLine.For(FromReceipt(res.AuditId, res.ReceiptHash))`.

- [ ] **Step 1: Pin the scan report's wire payload**

The scan report keeps its own JSON (snake_case, an explicit `null`), so `OfficeScan` hands `Event` a `JsonElement`. This check passes at once on Task 3's `LedgerResult` — it pins what Step 2 relies on.

Replace (in `tools/event-check/Check.cs`, lines 195-196):

```csharp

        var (seen3, url3) = Bridge(500, "{\"message\":\"Internal error — see the bridge log.\"}");
```

with:

```csharp

        // A payload that already has its wire shape (the scan report: snake_case, an explicit null) goes as a JsonElement.
        const string Wire = "{\"doc_title\":\"Tower A\",\"ruleset_ref\":null,\"violations\":[{\"rule_id\":\"N-01\",\"element_id\":7}]}";
        var (seen5, url5) = Bridge(201, "{\"ok\":true,\"received_at\":\"2026-09-25T10:00:00Z\",\"violations\":1}");
        using (var wire = System.Text.Json.JsonDocument.Parse(Wire))
            Is(LedgerLine.For(LedgerResult.Post(url5, "", "demo", "/office/scan", wire.RootElement, TimeSpan.FromSeconds(5))),
               "not confirmed — the bridge returned no chain hash", "a 201 from /office/scan → not confirmed, no chain hash");
        Is(seen5.GetAwaiter().GetResult().Body, Wire, "a JsonElement payload is sent exactly as it is");

        var (seen3, url3) = Bridge(500, "{\"message\":\"Internal error — see the bridge log.\"}");
```

Run: `dotnet run --project tools/event-check` → `44/44 checks pass`.

- [ ] **Step 2: `OfficeScan` returns what the ledger answered**

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 267-277):

```csharp

        /// <summary>Post a scan report to <c>POST /cde/{key}/office/scan</c> (the Phase-3 seam). Fire-and-forget,
        /// at most one per minute per process — sync storms must not become request storms. An empty key posts
        /// nothing (App.OnSynchronized already skips unbound documents; this keeps the rule for any other caller).</summary>
        public static void OfficeScan(Sentinel.Engine.ScanReport report, string projectKey)
        {
            var key = KeyOf(projectKey);
            if (key.Length == 0) return;
            var now = DateTime.UtcNow;
            if (now - _lastScanPost < ScanThrottle) return;
            _lastScanPost = now;
```

with:

```csharp

        /// <summary>Post a scan report to <c>POST /cde/{key}/office/scan</c> (the Phase-3 seam) and return what the
        /// ledger answered. At most one per minute per process — sync storms must not become request storms; a
        /// throttled report is not sent and says so. The route writes its ledger row through audit() (return=minimal),
        /// so a 201 reads "not confirmed — the bridge returned no chain hash" until that follow-up lands. BLOCKING
        /// (≤ 6 s): App.OnSynchronized runs it on a task and never waits. An empty key posts nothing. Never throws.</summary>
        public static LedgerResult OfficeScan(Sentinel.Engine.ScanReport report, string projectKey)
        {
            if (KeyOf(projectKey).Length == 0) return LedgerResult.NotBound();
            var now = DateTime.UtcNow;
            if (now - _lastScanPost < ScanThrottle)
                return LedgerResult.NotRecorded("a scan report went less than a minute ago; this one was not sent (one a minute per process)");
            _lastScanPost = now;
```

Replace (in `SentinelAddin/Coordination/GovernedNotify.cs`, lines 279-289):

```csharp
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/office/scan";
                var content = new StringContent(ScanReportDto.From(report).ToJson(), Encoding.UTF8, "application/json");
                var msg = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
                if (!string.IsNullOrWhiteSpace(cfg.ServiceToken))
                    msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", cfg.ServiceToken);
                _ = Http.SendAsync(msg).ContinueWith(t => { _ = t.Exception; msg.Dispose(); }, TaskScheduler.Default);
            }
            catch { /* never throw into Revit */ }
        }
```

with:

```csharp
            {
                // The report keeps its own wire shape (snake_case, an explicit null ruleset): Event's serializer writes a
                // JsonElement exactly as it is.
                using var wire = JsonDocument.Parse(ScanReportDto.From(report).ToJson());
                return Event("/office/scan", wire.RootElement, projectKey);
            }
            catch (Exception e) { return LedgerResult.NotRecorded("the scan report could not be written (" + e.Message + ")"); }
        }
```

- [ ] **Step 3: IFC Delivery Gate — both paths wait and print the line**

Replace (in `SentinelAddin/Commands.IfcGate.cs`, lines 115-124):

```csharp
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract, contractSource);
        // Record the gate verdict and the contract that judged in the document's web project audit trail
        // (fire-and-forget, never blocks; an unbound document records nothing and says so in the Doctor log).
        Sentinel.Coordination.GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey);
        TaskDialog.Show("Sentinel — IFC Delivery Gate",
            Sentinel.Engine.GateLines.GateDialog(r, projectKey) +
            (projectKey.Length == 0 ? "\n\nNot recorded on the web: " + Sentinel.Engine.ProjectContext.NotBound
                                    // The audit POST is fire-and-forget: say "sent", never "recorded" (B6: bridge stopped).
                                    : "\n\nSent to the audit trail of project '" + projectKey + "' (not confirmed — the gate does not wait for the bridge)."));
    }
```

with:

```csharp
        var r = Sentinel.Engine.IfcDeliveryGate.Validate(ifcPath, contract, contractSource);
        // Record the gate verdict and the contract that judged on the document's web project ledger and wait for the
        // answer OFF this thread (≤ 6 s) — both callers are API contexts: the command body and the export's event job.
        // The dialog ends with what the ledger answered: "Recorded: ledger #<id> · receipt <16 hex>…", not confirmed,
        // not recorded, or — unbound — nothing sent.
        var ledger = Task.Run(() => Sentinel.Coordination.GovernedNotify.DeliveryGate(Path.GetFileName(ifcPath), r, projectKey)).GetAwaiter().GetResult();
        TaskDialog.Show("Sentinel — IFC Delivery Gate",
            Sentinel.Engine.GateLines.GateDialog(r, projectKey) + "\n\n" + Sentinel.Coordination.LedgerLine.Sentence(ledger));
    }
```

- [ ] **Step 4: Governed Publish — the gate row first and waited for; both lines; the badge only when measured**

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 16-18):

```csharp
/// project's IDS via the referee API
/// (<c>POST /cde/:key/propose</c>), record the verdict to the immutable audit chain, and <b>publish + version
/// ONLY on a passing verdict</b>. A fail is recorded (and each failing requirement auto-opens as a BCF issue
```

with:

```csharp
/// project's IDS via the referee API
/// (<c>POST /cde/:key/propose</c>), record the verdict on the ledger, and <b>publish + version
/// ONLY on a passing verdict</b>. A fail is recorded (and each failing requirement auto-opens as a BCF issue
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 70-78):

```csharp

        // 2) IFC Delivery Gate (the contract@n above) → certificate; record the verdict. A gate FAIL stops here. NOT
        //    CHECKED (no contract installed) continues to the IDS, and every dialog below says the gate was not checked.
        var gate = Sentinel.Engine.IfcDeliveryGate.Validate(tempPath, contract, contractSource);
        Sentinel.Coordination.GovernedNotify.DeliveryGate(ifcName, gate, projectKey);
        if (gate.Outcome == Sentinel.Engine.GateOutcome.Fail)
        {
            TaskDialog.Show("Sentinel — Governed Publish", Sentinel.Engine.GateLines.PublishRejected(gate));
            TryDelete(tempPath);
```

with:

```csharp

        // 2) IFC Delivery Gate (the contract@n above) → certificate; record the verdict on the ledger and WAIT for the
        //    answer (off this thread, ≤ 6 s) before /propose, so the gate row lands first; every dialog below prints its
        //    line. A gate FAIL stops here. NOT CHECKED (no contract installed) continues to the IDS, and every dialog
        //    below says the gate was not checked.
        var gate = Sentinel.Engine.IfcDeliveryGate.Validate(tempPath, contract, contractSource);
        var gateLedger = Task.Run(() => Sentinel.Coordination.GovernedNotify.DeliveryGate(ifcName, gate, projectKey)).GetAwaiter().GetResult();
        var gateRow = "Gate row: " + Sentinel.Coordination.LedgerLine.For(gateLedger);
        if (gate.Outcome == Sentinel.Engine.GateOutcome.Fail)
        {
            TaskDialog.Show("Sentinel — Governed Publish", Sentinel.Engine.GateLines.PublishRejected(gate) + "\n\n" + gateRow);
            TryDelete(tempPath);
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 98-101):

```csharp
            TaskDialog.Show("Sentinel — Governed Publish",
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n\n" +
                "The Sentinel bridge could not be reached to adjudicate + record the verdict.\n\n" +
                (verdict.Error is { Length: > 0 } ? "Reason: " + verdict.Error + "\n\n" : "") +
```

with:

```csharp
            TaskDialog.Show("Sentinel — Governed Publish",
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n" + gateRow + "\n\n" +
                "The Sentinel bridge did not return a verdict — nothing was published, and no verdict row is confirmed.\n\n" +
                (verdict.Error is { Length: > 0 } ? "Reason: " + verdict.Error + "\n\n" : "") +
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 106-107):

```csharp

        if (verdict.Verdict == "rejected")
```

with:

```csharp

        // The deciding proposal row: /propose hands back its audit_id and receipt.ledger_hash (ProposalResult).
        var verdictRow = "Verdict row: " + Sentinel.Coordination.LedgerLine.For(
            Sentinel.Coordination.LedgerResult.FromReceipt(verdict.AuditId, verdict.ReceiptHash));

        if (verdict.Verdict == "rejected")
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 114-116):

```csharp
                head +
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n\n" +
                (nameFailed ? "NAMING:\n• " + string.Join("\n• ", verdict.NamingFailures) + "\n\n" : "") +
```

with:

```csharp
                head +
                Sentinel.Engine.GateLines.PublishLine(gate, projectKey) + "\n" +
                gateRow + "\n" +
                verdictRow + "\n\n" +
                (nameFailed ? "NAMING:\n• " + string.Join("\n• ", verdict.NamingFailures) + "\n\n" : "") +
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 122-124):

```csharp
                        ? "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again."
                        : "The rejection is recorded in the immutable audit trail. Fix the failures and retry."));
            TryDelete(tempPath);
```

with:

```csharp
                        ? "Rename the model to match the project's ISO 19650 naming convention and run Governed Publish again."
                        : "Fix the failures and retry."));
            TryDelete(tempPath);
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 140-150):

```csharp
                "Verdict " + verdict.Verdict.ToUpperInvariant() + ", but copying the IFC into the upload outbox failed: " + ex.Message +
                "\n\nThe verdict is recorded; upload the file manually if needed.");
        }

        var versionId = Sentinel.Coordination.GovernedNotify.RegisterVersionId(doc.Title, bytes, "Revit", projectKey: projectKey);
        if (versionId != null && judged)
            Sentinel.Coordination.GovernedNotify.Propose(elements, versionId, actor: "Revit", containerName: ifcName, projectKey: projectKey); // stamp the badge

        var live = Sentinel.Coordination.GovernedQuery.LiveVersion(doc.Title, projectKey);
        var revLine = live is null ? "published as a new version" : $"published as {live.Revision} · {live.State}";
        // Every line names what judged, from the bridge's answer — never from a local file.
```

with:

```csharp
                "Verdict " + verdict.Verdict.ToUpperInvariant() + ", but copying the IFC into the upload outbox failed: " + ex.Message +
                "\n\n" + verdictRow + "\nUpload the file manually if needed.");
        }

        // The version and its badge are claimed only when measured: RegisterVersionId handed back the new version's
        // id, and the stamp call (a second adjudication that writes verdict:<v> onto that version) answered with the
        // same verdict. Otherwise `badge` says why the badge is not confirmed.
        var versionId = Sentinel.Coordination.GovernedNotify.RegisterVersionId(doc.Title, bytes, "Revit", projectKey: projectKey);
        string? badge = null;
        if (versionId is null) badge = "the version was not registered (the bridge returned no version id)";
        else if (judged)
        {
            var stamp = Sentinel.Coordination.GovernedNotify.Propose(elements, versionId, actor: "Revit", containerName: ifcName, projectKey: projectKey);
            badge = !stamp.Reached ? "the stamp call failed (" + stamp.Error + ")"
                  : stamp.Verdict != verdict.Verdict ? "the stamp call judged it " + stamp.Verdict + ", not " + verdict.Verdict
                  : null;
        }

        var live = versionId is null ? null : Sentinel.Coordination.GovernedQuery.LiveVersion(doc.Title, projectKey);
        var revLine = versionId is null ? "copied to the upload outbox; the new version is not confirmed"
                    : live is null ? "published as a new version" : $"published as {live.Revision} · {live.State}";
        // Every line names what judged, from the bridge's answer — never from a local file.
```

Replace (in `SentinelAddin/Commands.GovernedPublish.cs`, lines 165-172):

```csharp
            (judged && gate.Outcome == Sentinel.Engine.GateOutcome.NotChecked ? Sentinel.Engine.GateLines.JudgedAlone(gate) + "\n" : "") +
            "SHA-256: " + gate.FileSha256.Substring(0, Math.Min(16, gate.FileSha256.Length)) + "…\n\n" +
            (judged
                ? "The Sentinel bridge uploads the geometry; the coordinator sees the new version with a ✓ verdict " +
                  "badge and the hash-chained audit entry behind it."
                : "The Sentinel bridge uploads the geometry. No verdict badge: nothing was judged — the audit entry " +
                  "records the publish as \"recorded\". Install an IDS on the project or its office to judge the next one."));
        TryDelete(tempPath);
```

with:

```csharp
            (judged && gate.Outcome == Sentinel.Engine.GateOutcome.NotChecked ? Sentinel.Engine.GateLines.JudgedAlone(gate) + "\n" : "") +
            "SHA-256: " + gate.FileSha256.Substring(0, Math.Min(16, gate.FileSha256.Length)) + "…\n" +
            gateRow + "\n" +
            verdictRow + "\n\n" +
            (judged
                ? "The Sentinel bridge uploads the geometry.\n" +
                  (badge is null ? $"Version badge: ✓ {verdict.Verdict} stamped on this version." : "Version badge: not confirmed — " + badge + ".")
                : "The Sentinel bridge uploads the geometry. No verdict badge: nothing was judged — the verdict is " +
                  "\"recorded\"." + (badge is null ? "" : "\nVersion: not confirmed — " + badge + ".") +
                  "\nInstall an IDS on the project or its office to judge the next one."));
        TryDelete(tempPath);
```

- [ ] **Step 5: Naming Manager — the batch row on a task, its line in the window's status**

Replace (in `SentinelAddin/Workflow/NamingManagerService.cs`, lines 3-4):

```csharp
using System.Linq;
using Autodesk.Revit.DB;
```

with:

```csharp
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
```

Replace (in `SentinelAddin/Workflow/NamingManagerService.cs`, lines 107-111):

```csharp
    /// <summary>ONE transaction; per row: re-validate against the rule, re-check uniqueness LIVE, rename;
    /// each success collected for one batched audit-store write, then one ledger post for the batch.</summary>
    public static List<(NamingRow Row, bool Ok, string Message)> Apply(Document doc, IEnumerable<NamingRow> rows, Ruleset rs, string? projectKey)
    {
        var results = new List<(NamingRow, bool, string)>();
```

with:

```csharp
    /// <summary>ONE transaction; per row: re-validate against the rule, re-check uniqueness LIVE, rename;
    /// each success collected for one batched audit-store write, then one ledger row for the batch, posted on a task:
    /// <paramref name="ledger"/> (null when nothing was renamed) — the window continues on it and shows the line.</summary>
    public static List<(NamingRow Row, bool Ok, string Message)> Apply(Document doc, IEnumerable<NamingRow> rows, Ruleset rs, string? projectKey,
                                                                    out Task<LedgerResult>? ledger)
    {
        ledger = null;
        var results = new List<(NamingRow, bool, string)>();
```

Replace (in `SentinelAddin/Workflow/NamingManagerService.cs`, lines 160-162):

```csharp
        if (done.Count > 0)
            GovernedNotify.NamingRenamed(done.Select(r => (object)new { id = r.Item1.ElementId, from = r.Item1.Current, to = renamedMap[r.Item1], rule = r.Item1.RuleId }), user, projectKey ?? "");
        return results;
```

with:

```csharp
        if (done.Count > 0)
        {
            // Built here, on the API thread; posted off it (≤ 6 s), so the rename never waits on the bridge.
            var ledgerRows = done.Select(r => (object)new { id = r.Item1.ElementId, from = r.Item1.Current, to = renamedMap[r.Item1], rule = r.Item1.RuleId }).ToList();
            var key = projectKey ?? "";
            ledger = Task.Run(() => GovernedNotify.NamingRenamed(ledgerRows, user, key));
        }
        return results;
```

Replace (in `SentinelAddin/Commands.NamingManager.cs`, lines 3-4):

```csharp
using System.Linq;
using Autodesk.Revit.Attributes;
```

with:

```csharp
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
```

Replace (in `SentinelAddin/Commands.NamingManager.cs`, lines 6-7):

```csharp
using Autodesk.Revit.UI;
using Sentinel.Engine;
```

with:

```csharp
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
```

Replace (in `SentinelAddin/Commands.NamingManager.cs`, lines 80-82):

```csharp
                    if (d == null || !d.Equals(doc)) { window.SetStatus("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                    var results = NamingManagerService.Apply(d, ticked, App.Engine!.RulesetFor(d), projectKey);
                    var ok = results.Count(r => r.Ok);
```

with:

```csharp
                    if (d == null || !d.Equals(doc)) { window.SetStatus("switch back to the model the Naming Manager was opened on — nothing was done"); window.SetBusy(false); return; }
                    var results = NamingManagerService.Apply(d, ticked, App.Engine!.RulesetFor(d), projectKey, out var ledger);
                    var ok = results.Count(r => r.Ok);
```

Replace (in `SentinelAddin/Commands.NamingManager.cs`, lines 84-87):

```csharp
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine.RulesetFor(d)));
                    window.SetStatus($"Renamed {ok}/{results.Count}." + (failed.Count > 0 ? " Not renamed — " + string.Join(" · ", failed.Take(6)) + (failed.Count > 6 ? " · …" : "") : ""));
                    window.SetBusy(false);
                }
```

with:

```csharp
                    window.SetRows(NamingManagerService.BuildRows(d, App.Engine.RulesetFor(d)));
                    var status = $"Renamed {ok}/{results.Count}." + (failed.Count > 0 ? " Not renamed — " + string.Join(" · ", failed.Take(6)) + (failed.Count > 6 ? " · …" : "") : "");
                    window.SetStatus(ledger is null ? status : status + " Ledger: waiting for the bridge…");
                    window.SetBusy(false);
                    // The batch's ledger row is on a task (≤ 6 s). Its line follows from the worker through the window's
                    // dispatcher; this handler has returned by then, so nothing waits on the worker.
                    ledger?.ContinueWith(t => window.SetStatus(status + " " + LedgerLine.Sentence(t.Result)), TaskScheduler.Default);
                }
```

- [ ] **Step 6: Auto-Publish — never blocks the save; the line goes to the Doctor log**

Replace (in `SentinelAddin/Engine/AutoPublish.cs`, lines 1-2):

```csharp
using System;
using Autodesk.Revit.DB;
```

with:

```csharp
using System;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
```

Replace (in `SentinelAddin/Engine/AutoPublish.cs`, lines 62-69):

```csharp
            };
            // On a successful publish, record it in the web app's governed audit trail AND append a version to
            // the file-version history (so Revit publishes share the web's version timeline). Fire-and-forget.
            if (r.state == PlatformExporter.State.Ok)
            {
                Sentinel.Coordination.GovernedNotify.ModelPublished(doc.Title, r.bytes, ctx.Key);
                Sentinel.Coordination.GovernedNotify.FileVersion(doc.Title, r.bytes, ctx.Key);
            }
```

with:

```csharp
            };
            // On a successful publish, record it on the ledger AND append a version to the file-version history (so
            // Revit publishes share the web's version timeline). Neither blocks the save: the ledger row goes out on a
            // task and its line lands in the Doctor log on the pane's thread (BeginInvoke — never Invoke from the
            // worker); the version POST stays fire-and-forget.
            if (r.state == PlatformExporter.State.Ok)
            {
                var title = doc.Title;
                var key = ctx.Key;
                var bytes = r.bytes;
                var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
                Task.Run(() => Sentinel.Coordination.GovernedNotify.ModelPublished(title, bytes, key)).ContinueWith(t => ui.BeginInvoke(new Action(() =>
                    App.PanelVm?.LogDoctor("Auto-publish of " + title + ": " + Sentinel.Coordination.LedgerLine.For(t.Result)))), TaskScheduler.Default);
                Sentinel.Coordination.GovernedNotify.FileVersion(title, bytes, key);
            }
```

- [ ] **Step 7: The sync scan and the tooltips**

Replace (in `SentinelAddin/App.cs`, lines 182-189):

```csharp
        Sentinel.Engine.AutoPublish.Trigger(e.Document); // sync-to-central → refresh the web copy too
        // Phase 3 seam closed: the scan report reaches the bridge (office.model_health reads the latest). Throttled,
        // fire-and-forget. An unbound document posts nothing (silently: a sync is not the place for a dialog).
        if (ctx.IsBound) Sentinel.Coordination.GovernedNotify.OfficeScan(report, ctx.Key);
        // After the scan report that completes the `model` step. That POST is fire-and-forget, so this GET can
        // race it and still read the step as todo — ↻ on the strip settles it.
        RefreshJourney(e.Document);
    }
```

with:

```csharp
        Sentinel.Engine.AutoPublish.Trigger(e.Document); // sync-to-central → refresh the web copy too
        // Phase 3 seam closed: the scan report reaches the bridge (office.model_health reads the latest). Throttled;
        // posted on a task and never waited for — a sync must not block. When the bridge has answered, its ledger line
        // goes to the Doctor log and the journey is re-read, so the `model` step is never read before its report
        // lands. Both on the pane's thread through BeginInvoke — never Invoke from the worker. The key and the ruleset
        // source are read here, on the API thread. An unbound document posts nothing (silently: a sync is not the
        // place for a dialog) and its strip says not bound.
        if (ctx.IsBound)
        {
            var key = ctx.Key;
            var local = Engine.SourceFor(e.Document);
            var vm = PanelVm;
            var ui = System.Windows.Application.Current?.Dispatcher ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
            Task.Run(() => Sentinel.Coordination.GovernedNotify.OfficeScan(report, key)).ContinueWith(t => ui.BeginInvoke(new Action(() =>
            {
                vm.LogDoctor("Scan report: " + Sentinel.Coordination.LedgerLine.For(t.Result));
                vm.RefreshJourney(key, local);
            })), TaskScheduler.Default);
        }
        else RefreshJourney(e.Document);
    }
```

Replace (in `SentinelAddin/App.cs`, lines 254-256):

```csharp
        Push(va, "Sentinel_NamingManager", "Naming\nManager", "Sentinel.Commands.NamingManagerCommand", "family",
            "Review family and type names against the office naming rules: recovered proposals, duplicates blocked, rename only what you tick. Everything is audited.");

```

with:

```csharp
        Push(va, "Sentinel_NamingManager", "Naming\nManager", "Sentinel.Commands.NamingManagerCommand", "family",
            "Review family and type names against the office naming rules: recovered proposals, duplicates blocked, rename only what you tick. Each batch is one ledger row, and the window says whether it landed.");

```

Replace (in `SentinelAddin/App.cs`, lines 259-261):

```csharp
        Push(pu, "Sentinel_GovernedPublish", "Governed\nPublish", "Sentinel.Commands.GovernedPublishCommand", "govern",
            "One governed action: export the active view to IFC, run the delivery gate, adjudicate against the project IDS, record the verdict immutably, and publish + version ONLY if it passes. A fail is recorded and each failing requirement auto-opens as a BCF issue (live-synced to the web and back into Revit).");
        var pub = Pull(pu, "Sentinel_Publish", "Publish", "publish",
```

with:

```csharp
        Push(pu, "Sentinel_GovernedPublish", "Governed\nPublish", "Sentinel.Commands.GovernedPublishCommand", "govern",
            "One governed action: export the active view to IFC, run the delivery gate, adjudicate against the project IDS, record the verdict on the ledger, and publish + version ONLY if it passes. A fail is recorded and each failing requirement auto-opens as a BCF issue (live-synced to the web and back into Revit).");
        var pub = Pull(pu, "Sentinel_Publish", "Publish", "publish",
```

- [ ] **Step 8: Fix in Revit — `ledger #…` where it said `audit <id>`**

Replace (in `SentinelAddin/Commands.BcfIssues.cs`, lines 222-224):

```csharp
                            var other = res.FailuresTotal >= 0 && res.FailuresMatched >= 0 ? res.FailuresTotal - res.FailuresMatched : fold.OtherOpen;
                            fix.SetStatus($"Check: {fold.Pass} would pass, {fold.Fail} would fail{(other > 0 ? $" \u00b7 {other} failure(s) on other requirements not part of this issue" : "")} \u00b7 IDS {res.IdsLabel} \u00b7 audit {res.AuditId}");
                            fix.SetBusy(false);
```

with:

```csharp
                            var other = res.FailuresTotal >= 0 && res.FailuresMatched >= 0 ? res.FailuresTotal - res.FailuresMatched : fold.OtherOpen;
                            fix.SetStatus($"Check: {fold.Pass} would pass, {fold.Fail} would fail{(other > 0 ? $" \u00b7 {other} failure(s) on other requirements not part of this issue" : "")} \u00b7 IDS {res.IdsLabel} \u00b7 {LedgerLine.For(LedgerResult.FromReceipt(res.AuditId, res.ReceiptHash))}");
                            fix.SetBusy(false);
```

Replace (in `SentinelAddin/Commands.BcfIssues.cs`, lines 289-291):

```csharp
                        var passed = fold.PassGuids;
                        var receipt = string.IsNullOrEmpty(res.ReceiptHash) ? "" : $" \u00b7 receipt {res.ReceiptHash!.Substring(0, Math.Min(16, res.ReceiptHash.Length))}";
                        // A topic lists at most 500 GUIDs (bridge viewpoint cap). When it names more failures than
```

with:

```csharp
                        var passed = fold.PassGuids;
                        var ledgerLine = LedgerLine.For(LedgerResult.FromReceipt(res.AuditId, res.ReceiptHash));
                        // A topic lists at most 500 GUIDs (bridge viewpoint cap). When it names more failures than
```

Replace (in `SentinelAddin/Commands.BcfIssues.cs`, lines 293-295):

```csharp
                        var unlisted = Math.Max(0, req.Failing - total);
                        var evidence = $"{(applied ? "Fixed" : "Verified")} in Revit by {user}: {passed}/{total} element(s) now pass {req.Requirement}. Referee re-check against IDS {res.IdsLabel}, audit {res.AuditId}{receipt}."
                            + (unlisted > 0 ? $" {unlisted} of the {req.Failing} failing element(s) are not listed on this issue and were NOT examined." : "");
```

with:

```csharp
                        var unlisted = Math.Max(0, req.Failing - total);
                        var evidence = $"{(applied ? "Fixed" : "Verified")} in Revit by {user}: {passed}/{total} element(s) now pass {req.Requirement}. Referee re-check against IDS {res.IdsLabel}, {ledgerLine}."
                            + (unlisted > 0 ? $" {unlisted} of the {req.Failing} failing element(s) are not listed on this issue and were NOT examined." : "");
```

Replace (in `SentinelAddin/Commands.BcfIssues.cs`, lines 318-320):

```csharp
                        fix.SetStatus(s >= 200 && s < 300
                            ? $"\u2713 {passed}/{total} pass \u2014 evidence posted and the issue is now Resolved (audit {res.AuditId}). Closing it stays a human decision on the web."
                            : $"Evidence posted; status unchanged (HTTP {s}).");
```

with:

```csharp
                        fix.SetStatus(s >= 200 && s < 300
                            ? $"\u2713 {passed}/{total} pass \u2014 evidence posted and the issue is now Resolved ({ledgerLine}). Closing it stays a human decision on the web."
                            : $"Evidence posted; status unchanged (HTTP {s}).");
```

- [ ] **Step 9: Builds, harnesses, and the words that must be gone**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` and the same with `2025`.

Expected: `0 Error(s)`; the same 6 warnings on 2024 and 3 on 2025 as Task 3 (`Commands.BcfIssues.cs(322,31)` CS4014 is master's, not this task's).

Run: `dotnet run --project tools/event-check` → `44/44 checks pass`; `dotnet run --project tools/fixplace-check` → `52/52 checks pass`; `dotnet run --project tools/gate-check` → `123/123 checks pass`; `dotnet run --project tools/naming-check` → `37/37 checks pass`.

Run (repo root): `git grep -n -E "Sent to the audit trail|the gate does not wait for the bridge|immutable audit|audit \{res.AuditId\}|record the verdict immutably" -- SentinelAddin`

Expected: nothing.

- [ ] **Step 10: Commit**

```bash
git add SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/Commands.IfcGate.cs SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Commands.NamingManager.cs SentinelAddin/Workflow/NamingManagerService.cs SentinelAddin/Engine/AutoPublish.cs SentinelAddin/App.cs SentinelAddin/Commands.BcfIssues.cs tools/event-check/Check.cs
git commit -m "feat(revit): the covered tools say what the ledger recorded — the IFC gate (both paths) waits up to 6 s and ends 'Recorded: ledger #<id> · receipt <16 hex>…' or why not; Governed Publish posts and waits for the gate row before /propose, prints the gate row's and the verdict's lines, and says 'Version badge: not confirmed — <reason>' unless the version registered and the stamp returned the same verdict; Naming Manager's status gains the batch row's line; Auto-Publish and the sync scan post on a task and log their line to the Doctor log (BeginInvoke), the journey re-read after the scan answered; fix-in-place prints ledger #… instead of 'audit <id>'; 'immutable audit trail' and 'Sent to the audit trail' are gone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

Same source: the complete Task 4 text is p4c-plan-C.md, section "### Task 4" (28/28 edits matched after Task 3). It covers:
- the event-check JsonElement pin, which passes at once and brings the total to 44/44;
- OfficeScan returning a LedgerResult;
- the IFC gate's Certify, which waits via Task.Run(...).GetAwaiter().GetResult() on both paths and ends with LedgerLine.Sentence;
- Governed Publish: "Gate row: <line>" on the gate FAIL, unreachable, reject and accept dialogs, and "Verdict row: <line>" from FromReceipt(verdict.AuditId, verdict.ReceiptHash). The ✓ badge line appears only when RegisterVersionId returned an id and the stamp reached the bridge with the same verdict, else "Version badge: not confirmed — <reason>." The "immutable audit trail" sentence is removed;
- Naming Manager: Apply gets an `out Task<LedgerResult>?`, and the status shows "Ledger: waiting for the bridge…" and then the Sentence;
- AutoPublish and OfficeScan: Task.Run plus a ContinueWith → BeginInvoke into LogDoctor ("Auto-publish of <title>: <line>", "Scan report: <line>"), with the journey re-read after the scan answers;
- the tooltips: the Naming Manager "Everything is audited." is replaced;
- fix-in-place: LedgerLine.For(FromReceipt(...)) instead of "audit <id>".
Gates measured: both builds 0 errors with the same 6/3 warnings; event-check 44/44; fixplace-check 52/52; gate-check 123/123; naming-check 37/37. `git grep -n -E "Sent to the audit trail|the gate does not wait for the bridge|immutable audit|audit \{res.AuditId\}|record the verdict immutably" -- SentinelAddin` prints nothing (7 hits on master).
Deviation from the pin: OfficeScan's continuation refreshes the journey after ANY answer. /office/scan writes through audit() and returns no hash, so it can never be Recorded.

---

### Task 5: Revit — Heal Loaded Families writes one `family_heal` ledger row per run, on the document and key captured at command time, and its report ends with what the ledger recorded; `tools/heal-check`

**Files:**
- Create: `SentinelAddin/Workflow/HealRecord.cs`
- Modify: `SentinelAddin/Workflow/FamilyProcessor.cs` (:28-36, `ScanLoaded`'s summary, signature and first lines; :102, the scratch shared-parameter file)
- Modify: `SentinelAddin/Commands.Phase2.cs` (:185-198, `SanitizeLoadedCommand`'s summary through its four counts; :205-211, the report dialog)
- Create: `tools/heal-check/heal-check.csproj`, `tools/heal-check/Check.cs`
- Modify: `.github/workflows/ci.yml` (:38 the Revit-free step's name, :46 its last `dotnet run` line — as Task 3 leaves them)
- Read for reference: spec `docs/superpowers/specs/2026-09-25-ledger-grafts-4c-design.md` Decisions 1-3 and the definition of done ("heal on a bound model prints its ledger line and `GET /cde/<key>/audit?entity_type=family_heal` returns the row"); `SentinelAddin/Workflow/FamilyProcessor.cs:1-146` (whole file: the job at :32-94 sorts each family into Clean / Healed / RequiresHumanInteraction / Failed; a failure closes the family document without saving, :82-90; `InjectSharedParameters` :97-136 points `app.SharedParametersFilename` at `Path.GetTempPath()` + `Sentinel_SP.txt`, creates it empty if missing, defines any missing parameter in its group `Sentinel`, and restores the office's file afterwards — no office shared-parameter file is ever read); `SentinelAddin/Commands.Phase2.cs:1-6` (usings: no `System.Threading.Tasks`, so `Task` is written in full) and :185-215 (the command today reads no key and posts nothing — F16); `SentinelAddin/RevitEventHub.cs:19-47` (`Enqueue` raises the ExternalEvent; `Execute` runs each job on the API thread and swallows its exceptions); `SentinelAddin/App.cs:145-152` (`ReloadRuleset` captures `doc` and checks `doc.IsValidObject` inside the job — the idiom `ScanLoaded` repeats) and `SentinelAddin/Commands.IfcGate.cs:79-85` (the focus-drift pin this task gives heal); `SentinelAddin/Engine/ProjectContext.cs:18` (`NotBound`) and :44-45 (`For(doc)`: API thread; null and family documents unbound); `SentinelAddin/Coordination/GovernedNotify.cs:24` (the 6 s client) and :276-298 (`Post`, the fire-and-forget Task 3's `Event` supersedes for waited calls); `WebApp/bridge/cde-store.mjs:599-617` (`recordAudit`: service key, `return=representation`, an absent `entity_id` is null, `resolveActor` keeps a bearer caller's actor) and `WebApp/bridge/bcf-service.mjs:1059` (`POST /cde/:key/audit` → 201 with the row); `SentinelAddin/Standards/StandardsBuilder.cs:359` (the `"revit:" + Environment.UserName` actor idiom); `SentinelAddin/Commands.Workflow.cs:71` (Review Flag uses the same scratch file under its own literal — not a heal path, left as it is); `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:47` and :99 (F16: 212/212 healed, "one gate: `AST_Description`", no ledger row); `tools/project-context-check/project-context-check.csproj` and `Check.cs:50-66` (a net8 harness compiling pure add-in files; the repo root found by walking up from `AppContext.BaseDirectory`; source scans); `SentinelAddin/Sentinel.csproj:64-67` (net48 global usings: `System`, `System.Collections.Generic`, `System.Linq`); `.github/workflows/ci.yml:38-46`.

**Interfaces:**
- Consumes (Task 3, pinned): `LedgerResult Sentinel.Coordination.GovernedNotify.Event(string path, object payload, string projectKey, TimeSpan? timeout = null)` — blocking (6 s by default), never throws, never touches UI; an empty key sends nothing and is `LedgerState.NotBound`; `string Sentinel.Coordination.LedgerLine.For(LedgerResult r)` (`ledger #<id> · receipt <16 hex>…`, `not confirmed — …`, `not recorded — …`, the not-bound text); `enum Sentinel.Coordination.LedgerState { Recorded, NotConfirmed, NotRecorded, NotBound }`. Unchanged: `Sentinel.Engine.ProjectContext.For(Document?)`, `FamilyProcessor.FamilyVerdict { TypeName, FamilyName, Result, Notes }`, `FamilyProcessor.HealResult`.
- Produces:
  - `public static class Sentinel.Workflow.HealRecord` (pure, no Revit API):
    - `public const int MaxNames = 50;`
    - `public const string SharedParameterFile = "Sentinel_SP.txt";`
    - `public const string SharedParameterSource` = `"Sentinel_SP.txt in the temp folder: a scratch file where the heal defines each missing parameter, not an office shared-parameter file"` (ASCII only; no workstation path).
    - `public static object Payload(int scanned, int clean, IReadOnlyList<string> healed, IReadOnlyList<string> human, IReadOnlyList<string> failed, string user)` → the `POST /cde/:key/audit` body `{entity_type: "family_heal", actor: "revit:" + user, action: "Family heal: <healed> healed, <human> for a human, <failed> failed of <scanned>", new_value: {scanned, clean, healed[], human[], failed[] (each the first 50 family names in scan order), healed_total, human_total, failed_total, shared_parameter_source (SharedParameterSource when at least one family was healed, else "not named"), source: "revit"}}` — the counts in `action` and the totals are the true counts, never the capped ones.
  - `public static void FamilyProcessor.ScanLoaded(Document doc, Action<List<FamilyVerdict>> onDone)` — was `ScanLoaded(Action<List<FamilyVerdict>> onDone)`, which healed `uiapp.ActiveUIDocument` at event time; its only caller is `SanitizeLoadedCommand`. A document closed before the job runs is left alone: no report, no row.
  - Heal Loaded Families' report ends with a blank line and `Recorded: ` + `LedgerLine.For(r)` when `r.State` is `Recorded` (`Recorded: ledger #<id> · receipt <16 hex>…`), otherwise `LedgerLine.For(r)` with its first letter upper-cased (`Not recorded — the bridge did not answer`, `Not confirmed — timed out after 6 s (the entry may have landed)`, the not-bound text) — the IFC gate's convention (Task 4, spec definition of done).
  - `tools/heal-check` — net8.0 console, 9 checks, in CI's Revit-free step.

- [ ] **Step 1: Write the failing harness**

Create `tools/heal-check/heal-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <!-- Offline check for the heal's ledger row (cohesion phase 4c, simulation F16): the family_heal body - counts,
       at most 50 family names per outcome beside the true totals, the shared-parameter source - and that Heal
       Loaded Families heals the document the command captured, injects through the file the row names and records
       the run through GovernedNotify.Event (a source scan). No Revit API; `dotnet run` from this folder. -->
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AssemblyName>heal-check</AssemblyName>
    <RootNamespace>Sentinel.Checks</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Workflow\HealRecord.cs" />
  </ItemGroup>
</Project>
```

Create `tools/heal-check/Check.cs`:

```csharp
using System.Text.Json;
using Sentinel.Workflow;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    const string Source = "Sentinel_SP.txt in the temp folder: a scratch file where the heal defines each missing parameter, not an office shared-parameter file";

    static string[] Names(string stem, int n) => Enumerable.Range(1, n).Select(i => stem + i.ToString("00")).ToArray();
    static JsonElement Row(object payload) => JsonDocument.Parse(JsonSerializer.Serialize(payload)).RootElement;

    static int Main()
    {
        Console.WriteLine("Heal Loaded Families — one family_heal ledger row per run\n");

        // ── 1. the body POST /cde/:key/audit receives for one run (GovernedNotify serializes it the same way) ──
        var small = JsonSerializer.Serialize(HealRecord.Payload(4, 1, new[] { "AST_Door_Single" }, new[] { "AST_Stair_CAD" }, new[] { "AST_Locked" }, "tester"));
        Ok(small == "{\"entity_type\":\"family_heal\",\"actor\":\"revit:tester\",\"action\":\"Family heal: 1 healed, 1 for a human, 1 failed of 4\","
                  + "\"new_value\":{\"scanned\":4,\"clean\":1,\"healed\":[\"AST_Door_Single\"],\"human\":[\"AST_Stair_CAD\"],\"failed\":[\"AST_Locked\"],"
                  + "\"healed_total\":1,\"human_total\":1,\"failed_total\":1,\"shared_parameter_source\":\"" + Source + "\",\"source\":\"revit\"}}",
           "a run is one family_heal row: counts, names, totals, the shared-parameter file, source revit");

        // ── 2. a 212-family run is one row, not a 212-name list; the totals stay true ──────────────────────────
        var big = Row(HealRecord.Payload(212, 101, Names("AST_Healed_", 60), Names("AST_Human_", 51), Array.Empty<string>(), "tester"));
        var v = big.GetProperty("new_value");
        Ok(HealRecord.MaxNames == 50 && v.GetProperty("healed").EnumerateArray().Select(e => e.GetString()).SequenceEqual(Names("AST_Healed_", 50)),
           "60 healed → the first 50 names, in scan order");
        Ok(v.GetProperty("healed_total").GetInt32() == 60 && big.GetProperty("action").GetString() == "Family heal: 60 healed, 51 for a human, 0 failed of 212",
           "…beside healed_total 60, and the action counts all of them");
        Ok(v.GetProperty("human").GetArrayLength() == 50 && v.GetProperty("human_total").GetInt32() == 51 && v.GetProperty("failed").GetArrayLength() == 0,
           "each outcome is capped on its own (51 for a human → 50 names, total 51)");

        // ── 3. the file is named only when a family was healed from it ────────────────────────────────────────
        var none = Row(HealRecord.Payload(3, 2, Array.Empty<string>(), new[] { "AST_Stair_CAD" }, Array.Empty<string>(), "tester"));
        Ok(none.GetProperty("new_value").GetProperty("shared_parameter_source").GetString() == "not named", "nothing healed → shared_parameter_source \"not named\"");
        var empty = Row(HealRecord.Payload(0, 0, Array.Empty<string>(), Array.Empty<string>(), Array.Empty<string>(), "tester"));
        Ok(empty.GetProperty("action").GetString() == "Family heal: 0 healed, 0 for a human, 0 failed of 0", "a model with no editable family is still one row, of 0");

        // ── 4. the add-in's wiring (source scan, repo root found from the build output) ─────────────────────────
        string root = AppContext.BaseDirectory;
        for (int i = 0; i < 8 && !Directory.Exists(Path.Combine(root, "SentinelAddin")); i++)
            root = Path.GetFullPath(Path.Combine(root, ".."));
        var processor = File.ReadAllText(Path.Combine(root, "SentinelAddin", "Workflow", "FamilyProcessor.cs"));
        var command = File.ReadAllText(Path.Combine(root, "SentinelAddin", "Commands.Phase2.cs"));
        Ok(processor.Contains("Path.Combine(Path.GetTempPath(), HealRecord.SharedParameterFile)") && !processor.Contains("\"Sentinel_SP.txt\""),
           "the heal injects through the file the row names (one spelling)");
        Ok(processor.Contains("ScanLoaded(Document doc,") && !processor.Contains("ActiveUIDocument"),
           "ScanLoaded heals the document it is handed, never the one in focus when the job runs");
        Ok(command.Contains("ProjectContext.For(doc).Key") && command.Contains("ScanLoaded(doc,")
           && command.Contains("GovernedNotify.Event(\"/audit\", payload, key)") && command.Contains("LedgerLine.For(ledger)"),
           "Heal Loaded Families records the run on the key captured at command time and prints the ledger line");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 2: Run it — RED**

Run (repo root): `dotnet run --project tools/heal-check`

Expected: the build fails before any check runs:

```
CSC : error CS2001: Source file '…\tools\heal-check\..\..\SentinelAddin\Workflow\HealRecord.cs' could not be found. […\tools\heal-check\heal-check.csproj]

The build failed. Fix the build errors and run again.
```

- [ ] **Step 3: `HealRecord.cs` — the row, pure**

Create `SentinelAddin/Workflow/HealRecord.cs`:

```csharp
namespace Sentinel.Workflow;

/// <summary>
/// The one ledger row a Heal Loaded Families run writes (cohesion phase 4c; simulation F16: the heal left no ledger
/// row). Pure — no Revit API — so tools/heal-check compiles it. <see cref="FamilyProcessor"/> injects through
/// <see cref="SharedParameterFile"/>, so the row cannot name a file the heal did not use.
/// </summary>
public static class HealRecord
{
    /// <summary>Family names kept per outcome; the totals stay true. A 212-family run is one row, not a 212-name list.</summary>
    public const int MaxNames = 50;

    /// <summary>The scratch shared-parameter file, in the temp folder, where the heal defines each parameter it injects.</summary>
    public const string SharedParameterFile = "Sentinel_SP.txt";

    /// <summary>What the row names as the injected parameters' source: the file by name, never a workstation path.
    /// ASCII only, so the serialized row reads the same everywhere.</summary>
    public const string SharedParameterSource =
        SharedParameterFile + " in the temp folder: a scratch file where the heal defines each missing parameter, not an office shared-parameter file";

    /// <summary>The <c>POST /cde/:key/audit</c> body for one run. <paramref name="healed"/>, <paramref name="human"/>
    /// and <paramref name="failed"/> are family names in scan order; <paramref name="user"/> is the Windows user.</summary>
    public static object Payload(int scanned, int clean, IReadOnlyList<string> healed, IReadOnlyList<string> human,
                                 IReadOnlyList<string> failed, string user) => new
    {
        entity_type = "family_heal",
        actor = "revit:" + user,
        action = $"Family heal: {healed.Count} healed, {human.Count} for a human, {failed.Count} failed of {scanned}",
        new_value = new
        {
            scanned,
            clean,
            healed = healed.Take(MaxNames).ToArray(),
            human = human.Take(MaxNames).ToArray(),
            failed = failed.Take(MaxNames).ToArray(),
            healed_total = healed.Count,
            human_total = human.Count,
            failed_total = failed.Count,
            // Only a healed family carries definitions from the file: a failed one is closed without saving.
            shared_parameter_source = healed.Count > 0 ? SharedParameterSource : "not named",
            source = "revit",
        },
    };
}
```

(`System.Linq` and `System.Collections.Generic` are global usings on net48 — `Sentinel.csproj:64-67` — and implicit on net8 and in the harness. The strings are ASCII because `JsonSerializer`'s default encoder escapes `—` and `+`; the row would still be equal, but the harness's byte comparison would not.)

- [ ] **Step 4: Run it — the row passes, the wiring is still missing**

Run: `dotnet run --project tools/heal-check`

Expected:

```
Heal Loaded Families — one family_heal ledger row per run

  PASS  a run is one family_heal row: counts, names, totals, the shared-parameter file, source revit
  PASS  60 healed → the first 50 names, in scan order
  PASS  …beside healed_total 60, and the action counts all of them
  PASS  each outcome is capped on its own (51 for a human → 50 names, total 51)
  PASS  nothing healed → shared_parameter_source "not named"
  PASS  a model with no editable family is still one row, of 0
  FAIL  the heal injects through the file the row names (one spelling)
  FAIL  ScanLoaded heals the document it is handed, never the one in focus when the job runs
  FAIL  Heal Loaded Families records the run on the key captured at command time and prints the ledger line

6/9 checks pass
```

- [ ] **Step 5: `FamilyProcessor` — heal the document it is handed, through the file the row names**

Steps 5 and 6 change a signature and its only caller: do not build between them.

Replace (in `SentinelAddin/Workflow/FamilyProcessor.cs`, lines 28-36):

```csharp
    /// <summary>Scan every editable, user-loadable model family in the active
    /// document; heal what is safely healable. Callback gets the full report.</summary>
    public static void ScanLoaded(Action<List<FamilyVerdict>> onDone)
    {
        App.Events?.Enqueue(uiapp =>
        {
            var doc = uiapp.ActiveUIDocument?.Document;
            var verdicts = new List<FamilyVerdict>();
            if (doc is null) { onDone(verdicts); return; }
```

with:

```csharp
    /// <summary>Scan every editable, user-loadable model family in <paramref name="doc"/> — the document the
    /// command captured, never whichever one has focus when the job runs — and heal what is safely healable.
    /// Callback gets the full report.</summary>
    public static void ScanLoaded(Document doc, Action<List<FamilyVerdict>> onDone)
    {
        App.Events?.Enqueue(uiapp =>
        {
            if (!doc.IsValidObject) return; // closed before the job ran: nothing healed, nothing to record
            var verdicts = new List<FamilyVerdict>();
```

(`uiapp` stays: `InjectSharedParameters(uiapp.Application, …)` at :70 still needs it.)

Replace (in `SentinelAddin/Workflow/FamilyProcessor.cs`, line 102):

```csharp
        var tempSp = Path.Combine(Path.GetTempPath(), "Sentinel_SP.txt");
```

with:

```csharp
        var tempSp = Path.Combine(Path.GetTempPath(), HealRecord.SharedParameterFile); // the file the heal's ledger row names
```

- [ ] **Step 6: `SanitizeLoadedCommand` — capture the document and its key, record the run, print the line**

Replace (in `SentinelAddin/Commands.Phase2.cs`, lines 185-198):

```csharp
/// <summary>Retroactive scan + auto-heal of families already in the project.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class SanitizeLoadedCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        if (c.Application.ActiveUIDocument?.Document is null) return Result.Cancelled;

        Workflow.FamilyProcessor.ScanLoaded(verdicts =>
        {
            int healed = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Healed);
            int human = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.RequiresHumanInteraction);
            int clean = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Clean);
            int failed = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Failed);
```

with:

```csharp
/// <summary>Retroactive scan + auto-heal of families already in the project. Each run is one <c>family_heal</c> row
/// on the document's web project ledger (cohesion phase 4c; simulation F16). The document and its key are captured
/// here, on the API thread at command time: the heal runs later on the Events queue and must never heal, or record
/// against, whichever model has focus by then.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class SanitizeLoadedCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var doc = c.Application.ActiveUIDocument?.Document;
        if (doc is null) return Result.Cancelled;
        var key = Sentinel.Engine.ProjectContext.For(doc).Key; // "" when unbound: Event sends nothing and says so

        Workflow.FamilyProcessor.ScanLoaded(doc, verdicts =>
        {
            List<string> Names(Workflow.FamilyProcessor.HealResult r) =>
                verdicts.Where(v => v.Result == r).Select(v => v.FamilyName).ToList();
            var healedNames = Names(Workflow.FamilyProcessor.HealResult.Healed);
            var humanNames = Names(Workflow.FamilyProcessor.HealResult.RequiresHumanInteraction);
            var failedNames = Names(Workflow.FamilyProcessor.HealResult.Failed);
            int healed = healedNames.Count, human = humanNames.Count, failed = failedNames.Count;
            int clean = verdicts.Count(v => v.Result == Workflow.FamilyProcessor.HealResult.Clean);
```

Replace (in `SentinelAddin/Commands.Phase2.cs`, lines 205-211):

```csharp
            TaskDialog.Show("Sentinel — Family Auto-Heal",
                verdicts.Count + " families scanned\n" +
                "✓ Clean: " + clean + "\n" +
                "⚡ Auto-healed (shared params injected + reloaded): " + healed + "\n" +
                "⚠ Requires human interaction (geometry/CAD): " + human + "\n" +
                "✕ Failed: " + failed +
                (human > 0 ? "\n\nManual attention needed:\n" + string.Join("\n", needsHuman) : ""));
```

with:

```csharp
            // One ledger row per run, waited for (6 s cap) on this Events job. Event never touches the UI, so the
            // wait cannot deadlock; the report then says what the ledger recorded, or why that is not confirmed.
            var payload = Workflow.HealRecord.Payload(verdicts.Count, clean, healedNames, humanNames, failedNames, Environment.UserName);
            var ledger = System.Threading.Tasks.Task.Run(() => Sentinel.Coordination.GovernedNotify.Event("/audit", payload, key)).GetAwaiter().GetResult();
            var line = Sentinel.Coordination.LedgerLine.For(ledger);
            var said = ledger.State == Sentinel.Coordination.LedgerState.Recorded ? "Recorded: " + line
                     : line.Length > 0 ? char.ToUpperInvariant(line[0]) + line.Substring(1) : line;

            TaskDialog.Show("Sentinel — Family Auto-Heal",
                verdicts.Count + " families scanned\n" +
                "✓ Clean: " + clean + "\n" +
                "⚡ Auto-healed (shared params injected + reloaded): " + healed + "\n" +
                "⚠ Requires human interaction (geometry/CAD): " + human + "\n" +
                "✕ Failed: " + failed +
                (human > 0 ? "\n\nManual attention needed:\n" + string.Join("\n", needsHuman) : "") +
                "\n\n" + said);
```

(The `needsHuman` list between the two replacements, :200-203, is unchanged: it still lists `TypeName` and two notes for the dialog. The payload is built on the API thread before `Task.Run`: plain strings and numbers, no Revit object crosses to the worker.)

- [ ] **Step 7: Run it — GREEN; both builds; the scan harness**

Run: `dotnet run --project tools/heal-check`

Expected:

```
Heal Loaded Families — one family_heal ledger row per run

  PASS  a run is one family_heal row: counts, names, totals, the shared-parameter file, source revit
  PASS  60 healed → the first 50 names, in scan order
  PASS  …beside healed_total 60, and the action counts all of them
  PASS  each outcome is capped on its own (51 for a human → 50 names, total 51)
  PASS  nothing healed → shared_parameter_source "not named"
  PASS  a model with no editable family is still one row, of 0
  PASS  the heal injects through the file the row names (one spelling)
  PASS  ScanLoaded heals the document it is handed, never the one in focus when the job runs
  PASS  Heal Loaded Families records the run on the key captured at command time and prints the ledger line

9/9 checks pass
```

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false` and `dotnet build SentinelAddin -c Release -p:RevitVersion=2025 -p:DeployToRevit=false`

Expected: `0 Error(s)` on both, with exactly the warnings Task 4 left and none in `Commands.Phase2.cs`, `Workflow/FamilyProcessor.cs` or `Workflow/HealRecord.cs`. (Measured on master plus a stub of Task 3's pinned surface: 6 warnings on 2024 — ChangesetExecutor 164, Commands.BcfIssues 322, Commands.GhostBuilder 220, GhostBuilderOrchestrator 112, RuleRegex 17 and 20; 3 on 2025 — Commands.Annotate 76 and 88, Commands.BcfIssues 322 — the same set as master's.)

Run: `dotnet run --project tools/project-context-check` → `19/19 checks pass` (it scans every add-in source; this task adds no machine-key or `.ProjectId` read). `dotnet run --project tools/event-check` → the count Task 3 set, unchanged (no file it compiles changed).

- [ ] **Step 8: CI runs the harness**

Replace (in `.github/workflows/ci.yml`, line 38):

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards)
```

with:

```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + heal)
```

(If Task 3 already extended this name, its line is the old text: add ` + heal` before the closing parenthesis.)

Replace (in `.github/workflows/ci.yml`, line 46):

```yaml
          dotnet run --project tools/ghost-standards-check
```

with:

```yaml
          dotnet run --project tools/ghost-standards-check
          dotnet run --project tools/heal-check
```

(Unique whether or not Task 3 appended `tools/event-check` after it; the order of the checks does not matter.)

- [ ] **Step 9: Commit**

```bash
git add SentinelAddin/Workflow/HealRecord.cs SentinelAddin/Workflow/FamilyProcessor.cs SentinelAddin/Commands.Phase2.cs tools/heal-check/heal-check.csproj tools/heal-check/Check.cs .github/workflows/ci.yml
git commit -m "feat(revit): Heal Loaded Families writes one family_heal ledger row per run (counts, at most 50 family names per outcome beside the totals, the scratch shared-parameter file it injected from or \"not named\") on the document and key captured at command time, waits for it (6 s) and ends its report with the ledger line; ScanLoaded takes the document instead of ActiveUIDocument at event time; tools/heal-check (simulation F16)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

**Amendments (controller, after the cross-check — override the task where they conflict):**

(1) Step 6, second replacement: in its NEW block, replace the three lines
```
            var line = Sentinel.Coordination.LedgerLine.For(ledger);
            var said = ledger.State == Sentinel.Coordination.LedgerState.Recorded ? "Recorded: " + line
                     : line.Length > 0 ? char.ToUpperInvariant(line[0]) + line.Substring(1) : line;
```
with the one line
```
            var said = Sentinel.Coordination.LedgerLine.Sentence(ledger);
```
This reuses Task 3's formatter (the same words as the IFC gate). An unbound model then ends "Not recorded on the web: This model is not bound to a web project — Sentinel ▸ Project Setup."
(2) Step 1, tools/heal-check/Check.cs: replace `command.Contains("LedgerLine.For(ledger)")` with `command.Contains("LedgerLine.Sentence(ledger)")`. Also fix the Interfaces "Produces" bullet about the report ending: it now reads "…ends with a blank line and `LedgerLine.Sentence(r)` (`Recorded: ledger #<id> · receipt <16 hex>…`, `Not recorded — …`, `Not confirmed — …`, or `Not recorded on the web: ` + NotBound)". Add `LedgerLine.Sentence` to Consumes.
(3) Step 8, first replacement: the old text is Task 3's line, not master's:
```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events)
```
and the new text is
```yaml
      - name: Revit-free checks (fix-in-place + naming + org + snapshot + gate + ghost standards + ledger events + heal)
```
Drop the "(If Task 3 already extended this name…)" note. The second replacement (after the ghost-standards-check line) matched as written.
(4) Step 7: replace "`dotnet run --project tools/event-check` → the count Task 3 set, unchanged (no file it compiles changed)." with "`dotnet run --project tools/event-check` → `44/44 checks pass` (Task 4's count; no file it compiles changed)."
Verified with (1)-(3) applied after Tasks 1-4: heal-check 9/9 (6/9 at Step 4, unchanged by the amendment); both builds 0 errors with 6/3 warnings; project-context-check 19/19; event-check 44/44.

---

### Task 6: Docs — Session B8 "the ledger answers", the capability row (🟩 Built), the verdict contract's public reply and the one global chain, and the lines of the handbook, user guide, runbook and F2 note that 4c makes untrue

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new `## Session B8 — the ledger answers` inserted before line 148, `## Session C — Validate panel (the referee's home turf)`, i.e. after the B7 table and its blank line)
- Modify: `docs/handbook/05-capability-status.md` (new row before line 18; line 22, the ledger row; line 49, the bridge auth gate row)
- Modify: `docs/verdict-contract.md` (lines 86-93, the receipt's chain fields and the anchor paragraph; lines 95-128, §5 and §6 whole)
- Modify: `docs/handbook/03-security-and-ledger.md` (line 11, the hash-chaining bullet)
- Modify: `docs/SENTINEL_HANDBOOK.md` (lines 79, 81, 88, 90: the IFC Delivery Gate, Heal, Governed Publish and Auto-Publish rows)
- Modify: `SENTINEL-USER-GUIDE.md` (line 26 IFC Delivery Gate, line 28 Heal Loaded Families, line 31 Naming Manager)
- Modify (found by the sweep, not in the spec's list): `docs/PILOT_DEMO_RUNBOOK.md` (line 115: reads `GET /cde/:key/audit` as a bare array, which Task 1 ends), `docs/SECURITY_F2_ACTIVATION.md` (line 9: the gate's exemptions — `/events` is no longer exempt, bcf-service.mjs:517-525, and 4c adds the public receipt check)
- Read for reference: the spec's Goal, definition of done, Decisions 1-7, Testing and Out of scope; the pinned texts this task quotes — `LedgerLine` (`ledger #<id> · receipt <16 hex>…`, `not confirmed — the bridge returned no chain hash`, `not confirmed — timed out after 6 s (the entry may have landed)`, `not recorded — HTTP <n>: <message>`, `not recorded — the bridge did not answer`, `ProjectContext.NotBound` = `This model is not bound to a web project — Sentinel ▸ Project Setup.`), the heal row (Task 5), the public `MISS` body `{"matches":false,"note":"no ledger entry on this key has that id and hash"}` and the hit note `matches the ledger's stored hash; the chain is not recomputed` (spec Decision 6), the badge's `on the ledger — verdict not checked` and `matches the ledger's stored hash (chain not recomputed)`; `docs/TESTING_PROTOCOL.md:85-148` (B5-B7: `| Step | Pass criteria |`, no `|` inside a cell); `docs/handbook/05-capability-status.md:16-18` (the 4b rows; commit 8be462e wrote row 17 as `🟩 Built … Moves to ✅ on the Session B7 drill`), :22, :49; `docs/verdict-contract.md:73-130`; `docs/handbook/03-security-and-ledger.md:5-16`; `docs/SENTINEL_HANDBOOK.md:72-106`; `SENTINEL-USER-GUIDE.md:20-31` (the guide has no Publish panel, so no Governed Publish line to change); `docs/PILOT_DEMO_RUNBOOK.md:113-116`; `docs/SECURITY_F2_ACTIVATION.md:9`, :14 (a past verification record, left as it is); `docs/reviews/cohesion-review-2026-09-23.md:83` (the "hash-chained per-project ledger" claim: a dated review, left as written — the spec's Facts correct it); `WebApp/db/migrations/0002_cde_state_machine_c2.sql:18-29` (append-only trigger), `0006_audit_chain_lock.sql:1-29` (the global chain and its hash inputs), `0015_audit_truncate_guard.sql:1-32`; `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md:158` (receipt 702 on `aster-office` is an accepted verdict; flipped, the member reply says `verdict does not match the ledger (receipt: rejected, ledger: accepted)`) and :290-292 (with the bridge stopped, the add-in's Tailscale address answers `502: Bad Gateway`; `%AppData%\Sentinel\bcf-config.json`'s `serviceUrl` on this workstation is that `https://…ts.net` address); `WebApp/bridge/bcf-service.mjs:501-536` (OPTIONS → 204; the CSRF gate's 403 `Origin not allowed`; the 401 gate), :1058-1059; `WebApp/bridge/check-registry.mjs:135-160`, :478-484; `WebApp/bridge/office-store.mjs:125-135` (`/office/scan` writes through `audit()` and answers `{ok, received_at, violations}` — no id, no hash); `WebApp/src/setups/files-panel.ts:313` (`No recorded history for this version yet.`); `SentinelAddin/Coordination/GovernedNotify.cs:48-58` (`Model published from Revit: <title>`, entity `model`), :97-107 (`Naming Manager renamed <n> item(s) in Revit`, entity `naming`); `SentinelAddin/Commands.GovernedPublish.cs:71-78` (a gate FAIL stops before `/propose`) and :144-146 (the badge stamp is a second `/propose`, so it writes a second proposal row).

**Interfaces:**
- Consumes: the strings Tasks 1-5 pin (above) and Task 1's `{rows, total, limit, offset}` reply and filters.
- Produces: `## Session B8 — the ledger answers` in `docs/TESTING_PROTOCOL.md`, which the controller's Task 7 runs; the capability row "Ledger grafts …" (🟩 Built; the ✅ flip belongs to Task 7). No code, test or harness changes: builds and test counts stay as Task 5 left them.

Master grep that Steps 2-9 must empty (repo root; `.` stands in for `*`, `$` and backticks, which the shell or `git grep -E` would read):

`git grep -n -E 'record the verdict ..immutably..|Truncate/tamper-proof|and the SSE ./events. must present|cde/.KEY/audit"|a DBA cannot rewrite|each row references the prior row|each rename lands in the request store, ROI and the ledger' -- '*.md' ':!docs/superpowers/**' ':!docs/reviews/**' ':!docs/testing/**' ':!graphify-out/**'`

hits today exactly: `SENTINEL-USER-GUIDE.md:31`, `docs/PILOT_DEMO_RUNBOOK.md:115`, `docs/SECURITY_F2_ACTIVATION.md:9`, `docs/SENTINEL_HANDBOOK.md:88`, `docs/handbook/03-security-and-ledger.md:11`, `docs/handbook/05-capability-status.md:22`, `docs/verdict-contract.md:93`.

- [ ] **Step 1: Run the master grep above** — expect exactly the seven hits listed.

- [ ] **Step 2: `docs/TESTING_PROTOCOL.md` — Session B8, before Session C**

Replace (in `docs/TESTING_PROTOCOL.md`, line 148):

```markdown
## Session C — Validate panel (the referee's home turf)
```

with:

````markdown
## Session B8 — the ledger answers

Every ledger write a covered Revit tool makes is confirmed in the tool's own words, or honestly not; the audit read has filters and an exact total; anyone can check a receipt without a token and learn a yes/no and field names, never a ledger value. `<16 hex>` is the first 16 characters of the row's 64-hex `hash`. Shell for the bridge rows — Git Bash, the managed bridge up on the branch; `GET …/cde/…` below means `curl -s -H "Authorization: Bearer $T" "$B/cde/…"`, and no anonymous call sends an Authorization header:

```bash
cd WebApp
B=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_BASE || 'http://127.0.0.1:4100')")
T=$(node --input-type=module -e "import { loadEnv } from './bridge/load-env.mjs'; process.stdout.write(loadEnv().BCF_TOKEN || '')")
mkdir -p /tmp/b8 && cd /tmp/b8
curl -s -H "Authorization: Bearer $T" "$B/receipt/aster-office/702" -o r702.json
node -e "
const fs = require('fs'), r = JSON.parse(fs.readFileSync('r702.json', 'utf8')).receipt;
const put = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
put('whole.json', r);
put('wrapped.json', { receipt: r });
put('flipped.json', { ...r, verdict: r.verdict === 'accepted' ? 'rejected' : 'accepted' });
put('bare.json', { audit_id: r.audit_id, ledger_hash: r.ledger_hash });
put('unknown-id.json', { audit_id: 999999999, ledger_hash: r.ledger_hash });
put('wrong-hash.json', { audit_id: r.audit_id, ledger_hash: (r.ledger_hash[0] === 'a' ? 'b' : 'a') + r.ledger_hash.slice(1) });
put('malformed.json', { audit_id: '702', ledger_hash: 'abc' });
put('big.json', { ...r, pad: 'x'.repeat(9000) });
console.log(r.audit_id, r.verdict, r.ledger_hash.slice(0, 16));
"
v() { curl -s -w " %{http_code}" -X POST -H "Content-Type: application/json" --data-binary "@$1" "$B/receipt/$2/verify"; echo; }
```

The `node` line prints `702 accepted <16 hex>`.

| Step | Pass criteria |
|---|---|
| Deploy | Revit closed → `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys; the managed bridge restarted on the branch; from the repo root `dotnet run --project tools/event-check` ends `<n>/<n> checks pass` and `dotnet run --project tools/heal-check` ends `9/9 checks pass` |
| Audit read | `GET …/cde/demo/audit` → `{rows, total, limit: 200, offset: 0}`, `rows` newest first, `total` above 200 (demo held 286 rows on 2026-09-25); `…/audit?limit=5000` → `limit: 1000`; `…/audit?limit=2` and `…/audit?limit=2&offset=2` share no id; an `offset` past `total` → `rows: []`; `…/audit?entity_type=file_version&action_prefix=verdict:` → only `file_version` rows whose `action` starts `verdict:`; `…/audit?entity_id=not-a-uuid` → 400 |
| `ids.last_verdict` on demo | from `WebApp`: `node --input-type=module -e "import { runCheck } from './bridge/check-registry.mjs'; console.log(JSON.stringify(await runCheck('ids.last_verdict', 'demo')))"` → not the `not_checkable` "No governed verdict has been recorded on this project yet …" that master answered from its 200-row window (demo's verdict row, id 114, sat outside the newest 200 on 2026-09-25); it judges the rows `…/audit?entity_type=file_version&action_prefix=verdict:` returns — `met` "All <n> adjudicated version(s) were accepted." when each version's newest verdict is `verdict:accepted`, `violations` naming each rejected version, `not_checkable` with the recorded-without-an-IDS reason for `verdict:recorded` |
| Web | the web app on `demo`: Files ▸ the History of an old version (one whose rows are among demo's oldest, e.g. the container version behind the `state:` rows 1–6) lists them — never "No recorded history for this version yet." — the same rows `…/audit?entity_id=<that version id>` returns; the CDE panel's audit list still shows the newest rows |
| IFC gate — bridge up | the Demo Tower model (bound to `demo`), a 3D view → IFC Delivery Gate, "Export active view to IFC, then certify" → the result dialog ends `Recorded: ledger #<id> · receipt <16 hex>…`, with no "Sent to the audit trail" and no "(not confirmed — the gate does not wait for the bridge)"; `…/audit?entity_type=delivery_gate&limit=1` → `rows[0].id` is `<id>` and `rows[0].hash` begins with the dialog's 16 hex; "Certify an existing IFC file" on the file just written → a new `Recorded: ledger #<id2> · receipt <16 hex>…` with `<id2>` above `<id>` |
| Bridge stopped | set `serviceUrl` in `%AppData%\Sentinel\bcf-config.json` to `http://127.0.0.1:4100` (keep the Tailscale address to restore; the add-in reads the file on every call) and stop the managed bridge → the IFC gate on Demo Tower still certifies (the contract `(cached HH:mm)`) and ends `Not recorded — the bridge did not answer`, at once (a refused connection does not wait 6 s); Heal Loaded Families on Aster Tower ends the same line; a save with Auto-Publish on is not slower and the Doctor log gets `not recorded — the bridge did not answer`. Restore the Tailscale address, bridge still stopped → the gate ends `Not confirmed — HTTP 502` … `(the entry may have landed)`: the proxy answers 502, and a 5xx is never read as not recorded. Start the bridge → `…/audit?entity_type=delivery_gate&limit=1` is still `<id2>` and `…/audit?entity_type=family_heal` has the total it had before (nothing landed while stopped) |
| Silent bridge | `serviceUrl` at `http://127.0.0.1:4100` again, the managed bridge stopped, and in its place `node -e "require('net').createServer(() => {}).listen(4100, '127.0.0.1')"` (accepts, never answers) → the IFC gate on Demo Tower ends `Not confirmed — timed out after 6 s (the entry may have landed)`, never `Not recorded`; stop the listener, restore the Tailscale address, start the bridge |
| Unbound | a model with no web project in Project Setup → the IFC gate's result and Heal Loaded Families' report each end with `This model is not bound to a web project — Sentinel ▸ Project Setup.`; nothing is posted (no new row under any key) |
| Governed Publish — gate FAIL on Demo | Governed Publish on Demo Tower (the pilot's `contract@1` fails its export, as in B6) → the gate-FAIL dialog carries the gate row's line `ledger #<g> · receipt <16 hex>…`; nothing is proposed, so there is no verdict line; `…/cde/demo/audit?entity_type=delivery_gate&limit=1` → `<g>` |
| Governed Publish — the verdict on Aster Tower | Governed Publish on Aster Tower (bound to `aster-tower`; no contract, so the gate is NOT CHECKED and the IDS judges) → the dialog — rejected, accepted or "Published — not judged" — carries the gate row's line `ledger #<g> · receipt <16 hex>…` and the verdict's `ledger #<p> · receipt <16 hex>…`, `<g>` below `<p>` (the gate row is posted and waited for before `/propose`); `…/cde/aster-tower/audit?entity_type=delivery_gate&limit=1` → `<g>`; `curl -s -H "Authorization: Bearer $T" "$B/receipt/aster-tower/<p>"` → a receipt whose `ledger_hash` begins with the verdict line's 16 hex; a reject says nothing of an "immutable audit trail"; an accept promises the ✓ verdict badge only when the version registered and the stamp returned the same verdict, else it reads `version badge: not confirmed — <reason>` |
| Naming Manager | Aster Tower → Naming Manager, tick one `proposed` row, Apply → the window's status carries `ledger #<id> · receipt <16 hex>…` after the rename; `…/cde/aster-tower/audit?entity_type=naming&limit=1` → `<id>` with `action` `Naming Manager renamed 1 item(s) in Revit`; undo, close without saving |
| Heal — bound model | Aster Tower → Heal Loaded Families → the report's counts, then `Recorded: ledger #<id> · receipt <16 hex>…`; `…/cde/aster-tower/audit?entity_type=family_heal` → `total` at least 1 and `rows[0]` is `<id>`, its `hash` beginning with the 16 hex, `actor` `revit:<Windows user>`, `action` `Family heal: <h> healed, <n> for a human, <f> failed of <s>` with the report's four numbers, `new_value` with `scanned`, `clean`, `healed`, `human` and `failed` (at most 50 family names each) beside `healed_total`, `human_total` and `failed_total`, `shared_parameter_source` `Sentinel_SP.txt in the temp folder: a scratch file where the heal defines each missing parameter, not an office shared-parameter file` when `<h>` is above 0 (else `not named`), and `source: "revit"`; the web's CDE panel on `aster-tower` lists the row; close the model without saving |
| Auto-Publish and the sync scan | Auto-Publish on, save Aster Tower → the save does not wait on the bridge; the Doctor log then gets a line with `ledger #<id> · receipt <16 hex>…` for `Model published from Revit: <title>` (`…/audit?entity_type=model&limit=1` → `<id>`); Sync with Central → the Doctor log gets the scan post's line — for this route `not confirmed — the bridge returned no chain hash`, since `/office/scan` writes its row through `audit()` and returns no id (spec Decision 3 defers that) — and the Next strip's `model` step reads done without pressing ↻ |
| Fix in Revit | on a referee-raised IDS topic (run only if one is open; otherwise mark it not run): **Check** → the status names `ledger #<id> · receipt <16 hex>…` where it said `audit <id>`; after Apply ticked and the re-check, the evidence comment on the topic carries `ledger #<id> · receipt <16 hex>…` |
| Anonymous check — the receipt | `v whole.json aster-office` → ` 200`, `matches: true`, `checked` includes `verdict` and `recorded_at`, `mismatched` and `not_checked` empty, `note` `matches the ledger's stored hash; the chain is not recomputed`; no `ledger`, no `reasons`, and no value from the ledger (no hash, time, actor, summary or verdict); `v wrapped.json aster-office` (the client's `{"receipt": …}` body) → the same bytes |
| Anonymous check — a flipped verdict, a bare pair | `v flipped.json aster-office` → `matches: false`, `mismatched: ["verdict"]`; `v bare.json aster-office` → `matches: true` with `recorded_at` and `verdict` under `not_checked` — not sent, so not counted |
| Anonymous check — one miss | `v unknown-id.json aster-office > m1; v whole.json no-such-key > m2; v wrong-hash.json aster-office > m3; v whole.json demo > m4; v whole.json default > m5; cmp m1 m2 && cmp m1 m3 && cmp m1 m4 && cmp m1 m5 && cat m1` → exactly `{"matches":false,"note":"no ledger entry on this key has that id and hash"} 200`; `GET …/cde/projects` lists the same keys as before this row (nothing created, no `default` self-heal) |
| Anonymous check — refused input | `v malformed.json aster-office` → ` 400`; `v big.json aster-office` → ` 413`; `for i in $(seq 1 121); do v bare.json aster-office; done > rate.txt; grep -c " 429$" rate.txt` → at least `1` (one window of 60 for every caller together; 121 calls span at most two windows) while the member check below still answers `200`; a minute later `v bare.json aster-office` → ` 200` |
| Member check unchanged | `curl -s -H "Authorization: Bearer $T" -X POST -H "Content-Type: application/json" --data-binary @whole.json "$B/receipt/aster-office/verify"` → today's `{matches: true, reasons: [], ledger: {…}}`; with `@flipped.json` → `matches: false` and the reason `verdict does not match the ledger (receipt: rejected, ledger: accepted)` |
| Transport | `curl -s -i -X OPTIONS -H "Origin: https://example.org" -H "Access-Control-Request-Method: POST" "$B/receipt/aster-office/verify"` → `204` with `Access-Control-Allow-Origin: *` and no `Access-Control-Allow-Credentials`; `curl -s -i -X POST -H "Origin: https://example.org" -H "Content-Type: application/json" --data-binary @bare.json "$B/receipt/aster-office/verify"` → `200`, `Access-Control-Allow-Origin: *`, `matches: true`; the same Origin on `POST $B/cde/aster-office/audit` → `403` `Origin not allowed`; with no bearer, `GET $B/receipt/aster-office/702`, `GET $B/cde/aster-office/audit` and `POST $B/receipt/aster-office/verify/x` → `401` |
| Bridge log | the managed bridge's log has one line per anonymous check naming the method, the path and the outcome; searching it for 702's 16 hex finds nothing (no body is logged); `rm -r /tmp/b8` |
| Honesty | no covered Revit surface reads "Sent to the audit trail", "not confirmed — the gate does not wait for the bridge" or "immutable audit trail"; a `ledger #` line appears only with an id and a hash the bridge returned; a timeout or a 5xx never reads "not recorded"; no anonymous reply carries a ledger value; `docs/verdict-contract.md` and the handbook describe one chain over every project that nothing recomputes |

## Session C — Validate panel (the referee's home turf)
````

- [ ] **Step 3: `docs/handbook/05-capability-status.md` — the 4c row, the ledger row, the gate's one open path**

Replace (in `docs/handbook/05-capability-status.md`, line 18):

```markdown
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
```

with:

```markdown
| Ledger grafts (every covered Revit tool prints what the ledger recorded; `GET /cde/:key/audit` filtered with an exact total; a public hash-only receipt check) | 🟩 Built | The IFC Delivery Gate (both paths), Governed Publish (the gate row and the verdict), Naming Manager, Heal Loaded Families, Auto-Publish and Fix in Revit say what the ledger recorded in one formatter's words (`LedgerLine`, pinned by `tools/event-check`): `ledger #<id> · receipt <16 hex>…` only when the bridge returned the row's id and 64-hex hash; `not recorded — …` only when nothing was written (HTTP 400, 401, 403, 404 or 503, or the bridge did not answer); `not confirmed — … (the entry may have landed)` after a timeout or a 5xx, and `not confirmed — the bridge returned no chain hash` for an answer without one; the not-bound text when the model has no web project. The modal tools wait up to 6 s on a worker; Naming Manager sets its window status; Auto-Publish and the sync scan never block and log their line to the Doctor log. Governed Publish posts and waits for the gate row before `/propose` and says `version badge: not confirmed — <reason>` instead of promising the ✓ when the version or its stamp is not confirmed. Heal writes one `family_heal` row per run on the document and key captured at command time — counts, at most 50 family names per outcome beside the totals, `shared_parameter_source` (`tools/heal-check`) — F16's ledger half; the report still does not name the parameter it injected. `GET /cde/:key/audit` answers `{rows, total, limit, offset}` with `entity_type`, `action_prefix`, `entity_id`, `actor`, `since`, `until`, `limit` (default 200, at most 1000) and `offset`; the total is exact (`Prefer: count=exact`); `ids.last_verdict` and `midp.review` read their own filtered rows and say "read N of M" when a read is partial. `POST /receipt/:key/verify` answers a caller without a token with a yes/no and field names, never a ledger value: one byte-identical miss for an unknown key, id, project or hash; 8 KB; 60 a minute for every caller together; `Access-Control-Allow-Origin: *` on that path only; a member's reply is unchanged. The hash chain is one chain over every project's rows and nothing recomputes it: a match means the ledger's stored hash, and a holder of a receipt and another project's key can confirm one bit about the neighbouring row (per-project chaining is a migration, not done). Deferred (spec Decision 3): ledger rows for auto-fix, requests, fix-in-place Apply, MEP voids, the Ghost, Datum, Massing and Annotate builds, CDE-01, changesets, the Standards snapshot and ruleset install; routes that write through `audit()` return no id, so the sync scan's line reads `not confirmed — the bridge returned no chain hash`. Moves to ✅ on the Session B8 drill |
| One-button Revit command + governance ribbon | 🟩 Built | Verified building on Revit 2024–2026 |
```

Replace (in `docs/handbook/05-capability-status.md`, line 22):

```markdown
| Immutable hash-chained audit ledger | ✅ Verified | Truncate/tamper-proof at the DB core (`0015`) |
```

with:

```markdown
| Append-only hash-chained ledger (one chain over every project) | ✅ Verified | Append-only and truncate-guarded at the DB core (`0002`, `0015`); each row's hash covers the previous row of the whole table, whichever project wrote it (`0006`) — one chain, not one per project; nothing recomputes the chain at runtime, and a receipt check compares the stored hash (`docs/verdict-contract.md` §4–§5) |
```

Replace (in `docs/handbook/05-capability-status.md`, line 49):

```markdown
| Bridge auth gate (JWT-or-token, F2) | ✅ Verified | **Armed live 2026-07-26**: env-loader gap fixed (old procedure failed open), 401/200 verified over loopback + HTTPS; optional HS256 JWT verification rejects the public anon key (role check, regression-tested) |
```

with:

```markdown
| Bridge auth gate (JWT-or-token, F2) | ✅ Verified | **Armed live 2026-07-26**: env-loader gap fixed (old procedure failed open), 401/200 verified over loopback + HTTPS; optional HS256 JWT verification rejects the public anon key (role check, regression-tested). One path is open by design since phase 4c: `POST` and `OPTIONS` on `/receipt/:key/verify`, the hash-only public receipt check (field names only, 8 KB, 60 a minute; see the Ledger grafts row — verified by the Session B8 drill) |
```

- [ ] **Step 4: `docs/verdict-contract.md` — one global chain (§4); the anonymous reply beside the member's (§5); the badge rule (§6)**

Replace (in `docs/verdict-contract.md`, lines 86-93):

````markdown
  "ledger_hash": "9f2c…",             // the audit row's OWN hash-chain entry
  "prev_hash":   "1ab7…"
}
```

The anchor is **the ledger's hash chain**, not a digest this code invents — and that chain is
truncate-proof at the Postgres core (migrations 0006/0015: UPDATE, DELETE and TRUNCATE are blocked by
triggers and least-privilege grants, so a compromised bridge or a DBA cannot rewrite it).
````

with:

````markdown
  "ledger_hash": "9f2c…",             // the audit row's OWN hash-chain entry
  "prev_hash":   "1ab7…"              // the previous row's hash in the WHOLE ledger — often another project's
}
```

The anchor is **the ledger's hash chain**, not a digest this code invents. It is **one chain for the
whole ledger, not one per project**: each row's hash covers the previous row's hash — whichever project
wrote that row — and the row's own `entity_type`, `entity_id`, `action`, `actor`, `old_value`,
`new_value` and `at` (migration 0006); the row's `id` and `project_id` are not in the hash. The ledger
is append-only at the Postgres core (migrations 0002/0015: UPDATE, DELETE and TRUNCATE are blocked by
triggers and least-privilege grants, so a bridge holding the service key cannot rewrite it; a database
superuser is outside that guarantee, as for any database). Nothing in Sentinel recomputes the chain at
runtime: a receipt is checked against the hash the ledger stored (§5).
````

Replace (in `docs/verdict-contract.md`, lines 95-128 — §5 and §6 whole, from the §5 heading to the end of §6's last paragraph; if Task 2's doc line landed inside §5 or §6, the old text is those sections as Task 2 left them, and this new text supersedes that line):

````markdown
## 5. Verify — the part that matters

`POST /receipt/:project/verify` with `{ "receipt": … }`, or
`GET /receipt/:project/:auditId` for the authoritative one.

```jsonc
{ "matches": false,
  "reasons": ["verdict does not match the ledger (receipt: accepted, ledger: rejected)"],
  "ledger":  { /* the real receipt */ } }
```

Mismatches are **listed, not collapsed into a boolean**: "this receipt is forged" and "this receipt
is for a different verdict" are different conversations to have with a client. A ledger row with no
chain hash is reported as *unconfirmable* rather than confirmed — the hash is the only field the
database, rather than the caller, produced.

## 6. The client

`bridge/public-client/sentinel-verify.mjs` — one file, zero dependencies, no build step.

```html
<script type="module">
  import { Sentinel, verdictBadge } from "./sentinel-verify.mjs";
  const s = new Sentinel({ baseUrl: "http://127.0.0.1:4100", project: "bds" });

  const verdict = await s.propose({ elements, agent: { kind: "agent", model: "gpt-6", prompt } });
  const check   = await s.verify(verdict.receipt);       // do not take the proposer's word for it
  document.body.append(verdictBadge(verdict.receipt, check));
</script>
```

`verdictBadge` renders **UNVERIFIED** until `verify()` has confirmed the receipt. A badge that looked
authoritative on the proposer's say-so would defeat its own purpose. It is built with
`createElement`, never `innerHTML`, so it is safe beside untrusted model data.
````

with:

````markdown
## 5. Verify — the part that matters

`POST /receipt/:project/verify` with `{ "receipt": … }`, or
`GET /receipt/:project/:auditId` for the authoritative one. The POST answers two kinds of caller.

**A member** — the bridge's bearer token, or a signed-in member's session — gets the full reply, as
before (the MCP tool `sentinel_verify_receipt` is one):

```jsonc
{ "matches": false,
  "reasons": ["verdict does not match the ledger (receipt: accepted, ledger: rejected)"],
  "ledger":  { /* the real receipt */ } }
```

Mismatches are **listed, not collapsed into a boolean**: "this receipt is forged" and "this receipt
is for a different verdict" are different conversations to have with a client. A ledger row with no
chain hash is reported as *unconfirmable* rather than confirmed — the hash is the only field the
database, rather than the caller, produced.

**Anyone else** — no token, from any web page — sends the receipt, or just `{ "audit_id": 702,
"ledger_hash": "<64 hex>" }` with `recorded_at`, `verdict` and `project` if it has them; only those
five fields are read. The reply names fields and never carries a ledger value:

```jsonc
{ "matches": false,
  "checked":     ["audit_id", "ledger_hash", "project", "verdict"],  // compared (names only)
  "mismatched":  ["verdict"],                                        // compared and different
  "not_checked": ["recorded_at"],                                    // not sent: never counted as a pass
  "note": "…" }
```

`matches: true` needs the id, the hash and the project to match, and every field that was sent to
match; its note reads "matches the ledger's stored hash; the chain is not recomputed". An unknown
project key, an unknown id, a row of another project, a wrong hash and a row with no chain hash all
get the same bytes, so the answer says nothing about which keys or ids exist:

```json
{"matches":false,"note":"no ledger entry on this key has that id and hash"}
```

A malformed body — an id that is not an integer, a hash that is not 64 lowercase hex — is a 400
before any read; a body over 8 KB is a 413; past 60 anonymous checks a minute (one window for every
caller together, not per address) the answer is a 429. This path alone answers
`Access-Control-Allow-Origin: *`, without credentials; the bridge logs the method, the path and the
outcome of an anonymous check, never its body. `GET /receipt/…` and every `/cde` route still need
the bearer.

**What a match does not say.** The check compares the hash the ledger stored for that row; it does not
recompute the hash or walk the chain. And because the chain runs across projects (§4), a receipt's
`prev_hash` is often another project's row: someone holding it and that project's key can confirm one
bit — "row N on that key has this hash" — and learn nothing else. Removing that needs per-project
chaining, a migration Sentinel has not made.

## 6. The client

`bridge/public-client/sentinel-verify.mjs` — one file, zero dependencies, no build step.

```html
<script type="module">
  import { Sentinel, verdictBadge } from "./sentinel-verify.mjs";
  const s = new Sentinel({ baseUrl: "http://127.0.0.1:4100", project: "bds" });

  const verdict = await s.propose({ elements, agent: { kind: "agent", model: "gpt-6", prompt } });
  const check   = await s.verify(verdict.receipt);       // do not take the proposer's word for it
  document.body.append(verdictBadge(verdict.receipt, check));
</script>
```

`verdictBadge` renders **UNVERIFIED** until `verify()` has confirmed the receipt. A badge that looked
authoritative on the proposer's say-so would defeat its own purpose. It shows a verdict only when the
check compared it (`verdict` in the reply's `checked`); a receipt confirmed on its id and hash alone
reads "on the ledger — verdict not checked", and a confirmed badge's title says the entry "matches the
ledger's stored hash (chain not recomputed)". It is built with `createElement`, never `innerHTML`, so
it is safe beside untrusted model data.
````

- [ ] **Step 5: `docs/handbook/03-security-and-ledger.md` — the chain is global and nothing recomputes it**

Replace (in `docs/handbook/03-security-and-ledger.md`, line 11):

```markdown
- **Hash chaining** — each row references the prior row's hash, so a silently altered or excised row breaks the chain and is detectable.
```

with:

```markdown
- **Hash chaining** — each row's hash covers the prior row's hash, so a silently altered or excised row breaks the chain. It is **one chain for the whole table, not one per project** — the prior row may be another project's (migration `0006`) — and nothing in Sentinel recomputes it at runtime: finding a break takes a recompute in SQL, and a receipt check compares the stored hash (`docs/verdict-contract.md` §5).
```

- [ ] **Step 6: `docs/SENTINEL_HANDBOOK.md` — the four covered tools' rows**

Replace (in `docs/SENTINEL_HANDBOOK.md`, line 79):

```markdown
| **IFC Gate → IFC Delivery Gate** | Exports + certifies an IFC against the project's delivery contract (`contract@n`, EIR-as-code), named in the dialog and the certificate. **FAIL = do not upload.** No contract installed → **NOT CHECKED**, never a pass. | At a formal deliverable. | Coordinator |
```

with:

```markdown
| **IFC Gate → IFC Delivery Gate** | Exports + certifies an IFC against the project's delivery contract (`contract@n`, EIR-as-code), named in the dialog and the certificate. **FAIL = do not upload.** No contract installed → **NOT CHECKED**, never a pass. The verdict's ledger row is waited for (up to 6 s): the dialog ends `Recorded: ledger #<id> · receipt <16 hex>…`, or says the row was not recorded or is not confirmed, and why. | At a formal deliverable. | Coordinator |
```

Replace (in `docs/SENTINEL_HANDBOOK.md`, line 81):

```markdown
| **Family Health → Heal Loaded Families** | Scans families already in the project; injects missing shared parameters and reloads silently. | To fix a model that's already polluted. | Coordinator |
```

with:

```markdown
| **Family Health → Heal Loaded Families** | Scans families already in the project; injects missing shared parameters and reloads silently. Each run is one `family_heal` row on the model's web project ledger, and the report ends with that row's ledger line. | To fix a model that's already polluted. | Coordinator |
```

Replace (in `docs/SENTINEL_HANDBOOK.md`, line 88):

```markdown
| **Governed Publish** ⭐ | The flagship. **One action**: export the active view to IFC → run the delivery gate → adjudicate against the project IDS → record the verdict **immutably** → publish + version **only if it passes**. A fail is recorded and each failing requirement **auto-opens as a BCF issue**, live-synced to the web and back into Revit. | Every real deliverable. This is the referee. | Coordinator |
```

with:

```markdown
| **Governed Publish** ⭐ | The flagship. **One action**: export the active view to IFC → run the delivery gate → adjudicate against the project IDS → record the verdict **on the ledger** → publish + version **only if it passes**. A fail is recorded and each failing requirement **auto-opens as a BCF issue**, live-synced to the web and back into Revit. The dialog names the gate row's and the verdict's ledger entries (`ledger #<id> · receipt <16 hex>…`), and says `version badge: not confirmed — <reason>` rather than promise the ✓ badge when the version or its stamp is not confirmed. | Every real deliverable. This is the referee. | Coordinator |
```

Replace (in `docs/SENTINEL_HANDBOOK.md`, line 90):

```markdown
| **Publish → Auto-Publish on save** | Toggle push-on-save: every save/sync re-exports + uploads. Throttled. | Turn on for a live-shared model; off for very large ones. | Modeller |
```

with:

```markdown
| **Publish → Auto-Publish on save** | Toggle push-on-save: every save/sync re-exports + uploads. Throttled. Each publish's ledger line goes to the panel's Doctor log; the ledger post never holds up the save. | Turn on for a live-shared model; off for very large ones. | Modeller |
```

- [ ] **Step 7: `SENTINEL-USER-GUIDE.md` — the IFC gate, heal and Naming Manager say what the ledger recorded**

Replace (in `SENTINEL-USER-GUIDE.md`, line 26):

```markdown
| **IFC Delivery Gate** ⭐ | KF-1. Exports the active 3D view to IFC in the schema the contract asks for (IFC4 → IFC4 Reference View, IFC2X3 → IFC2x3 CV2; IFC2x3 when there is no contract), or takes an existing .ifc, re-parses the file, and diffs it against the delivery contract installed on the document's web project or its office (`contract@n`, named `contract@n · source · sha` in the dialogs and the certificate — schema, required entities/psets, proxy-ratio cap, georeference including `IfcMapConversion`). Issues a signed certificate (`.sentinel-cert.json`, SHA-256): `PASS`, `FAIL`, or `NOT_CHECKED` when no contract is installed ("none — not installed for <key> or its office"; an unbound model reads "not bound — Sentinel ▸ Project Setup") — the file and its sha are recorded, nothing is judged, never a pass. FAIL = don't upload to the CDE. |
```

with:

```markdown
| **IFC Delivery Gate** ⭐ | KF-1. Exports the active 3D view to IFC in the schema the contract asks for (IFC4 → IFC4 Reference View, IFC2X3 → IFC2x3 CV2; IFC2x3 when there is no contract), or takes an existing .ifc, re-parses the file, and diffs it against the delivery contract installed on the document's web project or its office (`contract@n`, named `contract@n · source · sha` in the dialogs and the certificate — schema, required entities/psets, proxy-ratio cap, georeference including `IfcMapConversion`). Issues a signed certificate (`.sentinel-cert.json`, SHA-256): `PASS`, `FAIL`, or `NOT_CHECKED` when no contract is installed ("none — not installed for <key> or its office"; an unbound model reads "not bound — Sentinel ▸ Project Setup") — the file and its sha are recorded, nothing is judged, never a pass. FAIL = don't upload to the CDE. The gate's ledger row is waited for (up to 6 s) and the dialog says what happened: `Recorded: ledger #<id> · receipt <16 hex>…`; `Not recorded — …` when nothing was written (the bridge did not answer, or refused before writing); `Not confirmed — … (the entry may have landed)` after a timeout or a server error; an unbound model sends nothing. |
```

Replace (in `SENTINEL-USER-GUIDE.md`, line 28):

```markdown
| **Heal Loaded Families** | Scans families already in the project. Missing shared params → auto-heals (EditFamily in background, inject, silent reload). Geometry/CAD problems → flagged "requires human interaction", never touched. |
```

with:

```markdown
| **Heal Loaded Families** | Scans families already in the project. Missing shared params → auto-heals (EditFamily in background, inject, silent reload). Geometry/CAD problems → flagged "requires human interaction", never touched. Each run writes one `family_heal` row on the model's web project ledger — the counts, up to 50 family names per outcome beside the totals, and where the injected parameters were defined (`Sentinel_SP.txt`, a scratch file in the temp folder, not an office shared-parameter file) — and the report ends with that row's ledger line. |
```

Replace (in `SENTINEL-USER-GUIDE.md`, line 31):

```markdown
- **Naming Manager** — every family/type in scope of a `family`/`type` rule: current → proposed name, why (conforming / proposed / needs a human / BLOCKED duplicate), instance count. Proposals are recovered from the name and the measured width, never guessed; duplicates are blocked, never suffixed. Rename only the ticked rows; each rename lands in the request store, ROI and the ledger. The office code comes from the ruleset's `org`.
```

with:

```markdown
- **Naming Manager** — every family/type in scope of a `family`/`type` rule: current → proposed name, why (conforming / proposed / needs a human / BLOCKED duplicate), instance count. Proposals are recovered from the name and the measured width, never guessed; duplicates are blocked, never suffixed. Rename only the ticked rows; each rename lands in the request store and ROI, and each Apply is one ledger row whose line (`ledger #<id> · receipt <16 hex>…`, or why it is not recorded or not confirmed) shows in the window's status. The office code comes from the ruleset's `org`.
```

- [ ] **Step 8: `docs/PILOT_DEMO_RUNBOOK.md` — the verdict read, in the new reply shape**

Replace (in `docs/PILOT_DEMO_RUNBOOK.md`, line 115):

```bash
curl -s "$BASE/cde/$KEY/audit" | node -e 'const a=JSON.parse(require("fs").readFileSync(0));console.log("verdict events:",a.filter(e=>e.action.startsWith("verdict:")).map(e=>e.action))'
```

with:

```bash
curl -s "$BASE/cde/$KEY/audit?entity_type=file_version&action_prefix=verdict:" | node -e 'const a=JSON.parse(require("fs").readFileSync(0));console.log("verdict events:",a.total,a.rows.map(e=>e.action))'
```

(After Task 1 the route answers `{rows, total, limit, offset}`; the old line would throw `a.filter is not a function`.)

- [ ] **Step 9: `docs/SECURITY_F2_ACTIVATION.md` — the gate's exemptions as they are**

Replace (in `docs/SECURITY_F2_ACTIVATION.md`, line 9 — this fragment only; the rest of the line stays):

```markdown
every route except `/health` and the SSE `/events` must present
```

with:

```markdown
every route except `/health` and the public receipt check (`POST` and `OPTIONS` on `/receipt/:key/verify`, cohesion phase 4c: a hash-only reply, 8 KB, 60 a minute — `docs/verdict-contract.md` §5) must present
```

(`/events` has not been exempt since the SSE feed moved to a fetch stream with the Authorization header — bcf-service.mjs:517-525 exempts `/health` only. Line 14's "`/events` no-auth → 200 (exempt)" records a past verification and stays.)

- [ ] **Step 10: Verify**

Run the master grep above → prints nothing.

Run: `git grep -c -E "one chain (for the|over every)" -- docs/verdict-contract.md docs/handbook/03-security-and-ledger.md docs/handbook/05-capability-status.md`
Expected:

```
docs/handbook/03-security-and-ledger.md:1
docs/handbook/05-capability-status.md:2
docs/verdict-contract.md:1
```

Run: `grep -c -F '{"matches":false,"note":"no ledger entry on this key has that id and hash"}' docs/verdict-contract.md docs/TESTING_PROTOCOL.md`
Expected: `docs/verdict-contract.md:1` and `docs/TESTING_PROTOCOL.md:1` (if Task 2 put the miss body anywhere in the contract outside §5-§6, the first count is 2: delete that copy).

Run (no `|` inside a cell — every row of the B8 table has exactly three, every row of the capability table four):

```bash
awk '/^## Session B8/{f=1;next} /^## /{f=0} f && /^[|]/{ if (gsub(/[|]/,"|") != 3) print "TESTING_PROTOCOL " NR }' docs/TESTING_PROTOCOL.md
awk '/^[|]/{ if (gsub(/[|]/,"|") != 4) print "capability " NR }' docs/handbook/05-capability-status.md
```

Expected: both print nothing.

Run: `git diff --stat`
Expected:

```
 SENTINEL-USER-GUIDE.md                  |  6 ++--
 docs/PILOT_DEMO_RUNBOOK.md              |  2 +-
 docs/SECURITY_F2_ACTIVATION.md          |  2 +-
 docs/SENTINEL_HANDBOOK.md               |  8 ++---
 docs/TESTING_PROTOCOL.md                | 53 +++++++++++++++++++++++++++++
 docs/handbook/03-security-and-ledger.md |  2 +-
 docs/handbook/05-capability-status.md   |  5 +--
 docs/verdict-contract.md                | 59 +++++++++++++++++++++++++++++----
 8 files changed, 118 insertions(+), 19 deletions(-)
```

(Counts from master; if Task 2 edited §5 or §6 of the contract, that file's line differs by Task 2's lines.) No code file changed, so the add-in builds, the harnesses and `cd WebApp && npm test` stay as Task 5 left them.

- [ ] **Step 11: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/verdict-contract.md docs/handbook/03-security-and-ledger.md docs/SENTINEL_HANDBOOK.md SENTINEL-USER-GUIDE.md docs/PILOT_DEMO_RUNBOOK.md docs/SECURITY_F2_ACTIVATION.md
git commit -m "docs: the ledger answers — Session B8 drill, capability row (Built), the verdict contract's anonymous reply beside the member's and the badge rule, one global hash chain that nothing recomputes (contract §4, handbook 03 and 05), the IFC gate / Governed Publish / heal / Naming Manager / Auto-Publish lines say what the ledger recorded, the runbook's verdict read in the {rows, total} shape, the F2 gate's exemptions as they are

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Amendments (controller, after the cross-check — override the task where they conflict):**

Old texts matched master 16/16 with Task 2's verdict-contract step removed (Task 2 amendment). The master grep lists exactly the 7 hits and prints nothing afterwards. `one chain` gives 1/2/1, the MISS bytes 1+1, the pipe awk prints nothing, and the diff stat is 8 files, 118 insertions(+), 19 deletions(-), as stated.
To match the strings Tasks 3-4 actually print, make these exact replacements inside Step 2's B8 table (each old fragment occurs once; the rows keep 3 pipes, verified):
(a) Deploy row: replace "ends `<n>/<n> checks pass` and" with "ends `44/44 checks pass` and".
(b) Row "Governed Publish — the verdict on Aster Tower":
- replace "carries the gate row's line `ledger #<g> · receipt <16 hex>…` and the verdict's `ledger #<p> · receipt <16 hex>…`, `<g>` below `<p>`" with "carries `Gate row: ledger #<g> · receipt <16 hex>…` and `Verdict row: ledger #<p> · receipt <16 hex>…`, `<g>` below `<p>`";
- replace "an accept promises the ✓ verdict badge only when the version registered and the stamp returned the same verdict, else it reads `version badge: not confirmed — <reason>` |" with "an accept reads `Version badge: ✓ accepted stamped on this version.` only when the version registered and the stamp returned the same verdict, else `Version badge: not confirmed — <reason>.` |".
(c) Naming Manager row: replace "Apply → the window's status carries `ledger #<id> · receipt <16 hex>…` after the rename;" with "Apply → the window's status reads `Renamed 1/1. Ledger: waiting for the bridge…`, then `Renamed 1/1. Recorded: ledger #<id> · receipt <16 hex>…`;".
(d) Row "Auto-Publish and the sync scan": replace "the Doctor log then gets a line with `ledger #<id> · receipt <16 hex>…` for `Model published from Revit: <title>` (`…/audit?entity_type=model&limit=1` → `<id>`); Sync with Central → the Doctor log gets the scan post's line — for this route `not confirmed — the bridge returned no chain hash`, since" with "the Doctor log then gets `Auto-publish of <title>: ledger #<id> · receipt <16 hex>…` (`…/audit?entity_type=model&limit=1` → `<id>`, `action` `Model published from Revit: <title>`); Sync with Central → the Doctor log gets `Scan report: not confirmed — the bridge returned no chain hash` (within a minute of the previous scan post: `Scan report: not recorded — a scan report went less than a minute ago; this one was not sent (one a minute per process)`), since".
Also: Step 4's second replacement (§5-§6 whole) takes master's text as its old text, so drop the parenthetical "if Task 2's doc line landed inside §5 or §6…", and drop the same caveat in Step 10.
With these amendments the diff stat is unchanged (TESTING_PROTOCOL still +53), and the "Bridge stopped", "Silent bridge" and "Unbound" rows already match what LedgerLine.Sentence prints.

---

### Task 7: Deploy, drill (Session B8) and merge (controller)

- [ ] **Step 1:** Restart the managed bridge on the branch; `GET /health`; the Task 1 route checks on `demo` (`?entity_type=file_version&action_prefix=verdict:` → `total` and the verdict row; `?offset=100000` → `rows: []` with the total; a bad `limit` → 400) and `ids.last_verdict` on `demo` no longer says "No governed verdict has been recorded".
- [ ] **Step 2:** The anonymous verify matrix with `curl` and no bearer against receipt 702 on `aster-office`: real id + hash → `matches: true`; the verdict flipped → `matches: false`, `mismatched: ["verdict"]`; unknown id and unknown key → byte-identical miss bodies; a body over 8 KB → 413; no ledger value in any anonymous reply; a member's bearer reply unchanged.
- [ ] **Step 3:** With Revit closed: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024` deploys. Run the Revit rows of Session B8 (IFC gate on Demo: `Recorded: ledger #…`; the not-recorded row with a loopback `serviceUrl` as the session describes; Governed Publish on Demo's gate FAIL and on Aster; Naming Manager's status; heal on a bound model and its row via `GET /cde/<key>/audit?entity_type=family_heal`; the pane-fix "Switching documents" row of Session B5). Drill exports go to a local scratch folder, never the office's Autodesk Forma folder; any config change is backed up and restored. Record Session B8 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`; rows not run live are marked **not run** with the reason.
- [ ] **Step 4:** Capability row → ✅; `cd WebApp && npm test`; harnesses green; normalise co-author trailers (UTF-8 msg filter); merge `--no-ff` into master; ledger; memory; `graphify update .`.
