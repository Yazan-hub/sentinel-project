# Office Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An office is a `projects` row of kind `office` that projects belong to; office readiness rolls up its projects with one evidence line per project; a project without its own IDS judges by its office's; the hub, the settings panel and the Revit picker show the office.

**Architecture:** Migration `0029` adds `kind` and `office_key` to `projects` with a trigger guard (file already written on the branch; applied to the live database by the founder). A small deps-injected module `bridge/office-scope.mjs` answers "which office owns this key", "which projects belong to this office", "which keys does an assessment read", and rolls up per-project check results (pure). `cde-store` gains the fields and a `listProjectRows()` query; `check-registry.runCheck` becomes scope-aware for the rollup-eligible checks; the artefact resolver's office step wires to the real helper. Web hub, settings, and the Revit picker read the two fields.

**Tech Stack:** Postgres (Supabase) migration; Node 20 ESM bridge; vitest; TypeScript panels; C# add-in (compile only).

## Global Constraints

- Honesty rule: rolled-up statuses are worst-of across projects (`violations` > `error` > `not_checkable` > `met`); a rolled-up `met` needs at least one project with data and every project with data met; evidence names each project (`[key] …`); no count is a percentage across projects; an office with no children and no data of its own is `not_checkable` with the reason "no projects belong to this office".
- Statuses vocabulary stays `met | violations | not_checkable | error` (the readiness vocabulary of `office-checks.mjs` / `check-registry.mjs`).
- Assigning `office_key` is a lead action on the project; changing `kind` is an owner action; both audited with old and new values.
- Template items (`office.snapshot`, `office.naming_rules`, `office.template_types`, `office.worksets`, `office.shared_params`) never roll up: they read the office's own snapshot.
- Office code is data: no `BDS`/`AST` literal in code.
- The migration `WebApp/db/migrations/0029_project_office.sql` exists on the branch and is NOT yet applied to the live database — code must tolerate rows without the columns (`kind` undefined → `project`, `office_key` undefined → null) and any smoke step that writes `office_key` may fail with a Postgres "column does not exist" error until it is applied; report that as expected, not as a bug.
- Branch `feature/office-entity`; commit messages end with a Co-Authored-By trailer (the controller normalises the model name before merge).
- Tests from `WebApp/`: `npx vitest run <file>`; `npm test` (767 today) must stay green.

## File structure

| File | Responsibility |
|---|---|
| `WebApp/db/migrations/0029_project_office.sql` | `kind`, `office_key`, guard trigger (already on the branch). |
| `WebApp/bridge/office-scope.mjs` | `officeKeyOf`, `listOfficeProjects`, `projectScope`, `rollupResults`, `ROLLUP_CHECK_IDS`; deps-injected. |
| `WebApp/bridge/office-scope.test.mjs` | in-memory rows; every helper; the rollup rules. |
| `WebApp/bridge/cde-store.mjs` | `listProjectRows`, fields on create/update/list, re-exports. |
| `WebApp/bridge/bcf-service.mjs` | `GET /cde/projects/:key/scope`; owner check on `kind`. |
| `WebApp/bridge/artefact-store.mjs` | default `officeKeyOf`. |
| `WebApp/bridge/check-registry.mjs` | scope-aware `runCheck`. |
| `WebApp/src/setups/projects-hub-panel.ts`, `project-settings-panel.ts` | grouping, office pickers. |
| `SentinelAddin/UI/SettingsDialog.xaml.cs` | picker text with the office. |
| Docs | `docs/TESTING_PROTOCOL.md` (Session B2), `docs/handbook/05-capability-status.md`, `demo/aster/README.md`. |

---

### Task 1: `office-scope.mjs` — helpers and the rollup, pure

**Files:**
- Create: `WebApp/bridge/office-scope.mjs`
- Test: `WebApp/bridge/office-scope.test.mjs`
- Read for reference: `WebApp/bridge/check-registry.mjs:17-19` (`result()` shape), `WebApp/bridge/changesets-store.mjs:1-25` (the deps-injection idiom).

**Interfaces:**
- Consumes: `listProjectRows()` (Task 2 adds it to `cde-store`; injected here) → `[{ id, key, name, kind, office_key }]`.
- Produces: `ROLLUP_CHECK_IDS: Set<string>`; `officeKeyOf(key, deps?) → Promise<string | null>`; `listOfficeProjects(officeKey, deps?) → Promise<[{ key, name, id }]>` (404 unknown key, 409 not an office); `projectScope(key, deps?) → Promise<{ key, kind, office_key, keys: string[] }>`; `rollupResults(id, label, perProject: [{ key, result }]) → result`.

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/office-scope.test.mjs`:

```js
// The office as a scope: which keys an assessment reads, and how per-project results roll up honestly.
import { describe, it, expect } from "vitest";
import { officeKeyOf, listOfficeProjects, projectScope, rollupResults, ROLLUP_CHECK_IDS } from "./office-scope.mjs";

const rows = [
  { id: "u-office", key: "aster-office", name: "Aster Studio", kind: "office", office_key: null },
  { id: "u-tower", key: "aster-tower", name: "Aster Tower", kind: "project", office_key: "aster-office" },
  { id: "u-villa", key: "aster-villa", name: "Aster Villa", kind: "project", office_key: "aster-office" },
  { id: "u-demo", key: "demo", name: "Demo", kind: "project", office_key: null },
  { id: "u-old", key: "old-project", name: "Old" },                       // row from before the migration
];
const deps = { listProjectRows: async () => rows };
const r = (status, over = {}) => ({ id: "office.model_health", label: "Live model health", status, count: 0, summary: "", evidence: [], ...over });

describe("office scope helpers", () => {
  it("answers which office owns a key, null for an office, a project without one, or a pre-migration row", async () => {
    expect(await officeKeyOf("aster-tower", deps)).toBe("aster-office");
    expect(await officeKeyOf("aster-office", deps)).toBeNull();
    expect(await officeKeyOf("demo", deps)).toBeNull();
    expect(await officeKeyOf("old-project", deps)).toBeNull();
    expect(await officeKeyOf("nope", deps)).toBeNull();
  });
  it("lists an office's projects, refuses a project or an unknown key", async () => {
    expect(await listOfficeProjects("aster-office", deps)).toEqual([{ key: "aster-tower", name: "Aster Tower", id: "u-tower" }, { key: "aster-villa", name: "Aster Villa", id: "u-villa" }]);
    await expect(listOfficeProjects("aster-tower", deps)).rejects.toMatchObject({ status: 409 });
    await expect(listOfficeProjects("nope", deps)).rejects.toMatchObject({ status: 404 });
  });
  it("scopes an office to itself plus its children, a project to itself", async () => {
    expect(await projectScope("aster-office", deps)).toEqual({ key: "aster-office", kind: "office", office_key: null, keys: ["aster-office", "aster-tower", "aster-villa"] });
    expect(await projectScope("aster-tower", deps)).toEqual({ key: "aster-tower", kind: "project", office_key: "aster-office", keys: ["aster-tower"] });
    expect(await projectScope("old-project", deps)).toEqual({ key: "old-project", kind: "project", office_key: null, keys: ["old-project"] });
    await expect(projectScope("nope", deps)).rejects.toMatchObject({ status: 404 });
  });
  it("names the rollup-eligible checks and leaves the template items out", () => {
    for (const id of ["office.model_health", "office.bep", "office.roles", "office.task_teams", "office.naming_standard", "cde.states", "naming.containers", "ids.last_verdict"]) expect(ROLLUP_CHECK_IDS.has(id)).toBe(true);
    for (const id of ["office.snapshot", "office.naming_rules", "office.template_types", "office.worksets", "office.shared_params"]) expect(ROLLUP_CHECK_IDS.has(id)).toBe(false);
  });
});

describe("rollupResults", () => {
  it("is not checkable with no projects, naming the reason", () => {
    expect(rollupResults("office.model_health", "Live model health", [])).toMatchObject({ status: "not_checkable", reason: "no projects belong to this office", evidence: [] });
  });
  it("worst status wins and evidence is prefixed with the project key", () => {
    const out = rollupResults("office.model_health", "Live model health", [
      { key: "aster-office", result: r("not_checkable", { reason: "No scan report received" }) },
      { key: "aster-tower", result: r("violations", { count: 85, summary: "tower: 85 warn", evidence: [{ label: "VN-01", detail: "12 warn" }] }) },
      { key: "aster-villa", result: r("met", { summary: "villa: 3 warn" }) },
    ]);
    expect(out.status).toBe("violations");
    expect(out.count).toBe(85);
    expect(out.evidence).toContainEqual({ label: "[aster-tower] VN-01", detail: "12 warn" });
    expect(out.evidence).toContainEqual({ label: "[aster-office]", detail: "No scan report received" });
    expect(out.summary).toContain("aster-tower: violations — tower: 85 warn");
    expect(out.summary).toContain("aster-villa: met — villa: 3 warn");
  });
  it("is met only when every project with data is met, and says which had none", () => {
    const met = rollupResults("office.roles", "Roles", [{ key: "a", result: r("met", { summary: "ok" }) }, { key: "b", result: r("not_checkable", { reason: "no members" }) }]);
    expect(met.status).toBe("met");
    expect(met.evidence).toContainEqual({ label: "[b]", detail: "no members" });
    const none = rollupResults("office.roles", "Roles", [{ key: "a", result: r("not_checkable", { reason: "x" }) }, { key: "b", result: r("not_checkable", { reason: "y" }) }]);
    expect(none.status).toBe("not_checkable");
    expect(none.reason).toBe("a: x; b: y");
    const err = rollupResults("office.roles", "Roles", [{ key: "a", result: r("met") }, { key: "b", result: r("error", { summary: "Check failed: boom" }) }]);
    expect(err.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/office-scope.test.mjs`
Expected: FAIL — cannot resolve `./office-scope.mjs`.

- [ ] **Step 3: Write the module**

`WebApp/bridge/office-scope.mjs`:

```js
// The office as a scope (cohesion phase 2). An office is a projects row of kind "office"; a project
// belongs to at most one office (projects.office_key, migration 0029). Two things live here: which keys
// an assessment reads for a given key, and how per-project check results roll up — worst status wins,
// every evidence line names its project, never a blended figure (honesty rule). Deps-injected so the
// sequencing is unit-tested without Supabase; the default reads cde-store's project rows lazily.

/** Checks that roll up across an office's projects. Template items are deliberately absent: the
 *  template is an office asset, so office.snapshot / naming_rules / template_types / worksets /
 *  shared_params read the office's own snapshot only. */
export const ROLLUP_CHECK_IDS = new Set([
  "office.model_health", "office.bep", "office.roles", "office.task_teams", "office.naming_standard",
  "cde.states", "naming.containers", "ids.last_verdict",
]);

const err = (status, message) => Object.assign(new Error(message), { status });

async function wire(deps = {}) {
  const cde = deps.listProjectRows ? null : await import("./cde-store.mjs");
  return { listProjectRows: deps.listProjectRows || cde.listProjectRows };
}
const kindOf = (row) => (row?.kind === "office" ? "office" : "project");   // rows from before the migration have no kind

export async function officeKeyOf(key, deps) {
  const rows = await (await wire(deps)).listProjectRows();
  const me = rows.find((r) => r.key === key);
  return me && kindOf(me) === "project" ? (me.office_key ?? null) : null;
}

export async function listOfficeProjects(officeKey, deps) {
  const rows = await (await wire(deps)).listProjectRows();
  const office = rows.find((r) => r.key === officeKey);
  if (!office) throw err(404, `Project "${officeKey}" does not exist`);
  if (kindOf(office) !== "office") throw err(409, `"${officeKey}" is a project, not an office`);
  return rows.filter((r) => r.office_key === officeKey).map((r) => ({ key: r.key, name: r.name, id: r.id }));
}

/** The keys an assessment of `key` reads: the office plus its projects, or the project alone. */
export async function projectScope(key, deps) {
  const rows = await (await wire(deps)).listProjectRows();
  const me = rows.find((r) => r.key === key);
  if (!me) throw err(404, `Project "${key}" does not exist`);
  const kind = kindOf(me);
  const keys = kind === "office" ? [key, ...rows.filter((r) => r.office_key === key).map((r) => r.key)] : [key];
  return { key, kind, office_key: kind === "project" ? (me.office_key ?? null) : null, keys };
}

const RANK = { violations: 3, error: 2, not_checkable: 1, met: 0 };

/** Roll per-project results of one check into the office's: worst status wins; `met` needs at least
 *  one project with data and every project with data met; evidence keeps its project; counts add
 *  (they are violation counts, never percentages). */
export function rollupResults(id, label, perProject) {
  if (!perProject.length) return { id, label, status: "not_checkable", count: 0, summary: "", reason: "no projects belong to this office", evidence: [] };
  const withData = perProject.filter((p) => p.result.status === "met" || p.result.status === "violations");
  let status = "not_checkable";
  const worst = perProject.reduce((w, p) => (RANK[p.result.status] ?? 1) > (RANK[w] ?? 1) ? p.result.status : w, "met");
  if (worst === "violations" || worst === "error") status = worst;
  else if (withData.length && withData.every((p) => p.result.status === "met")) status = "met";
  const evidence = [];
  for (const p of perProject) {
    for (const e of p.result.evidence || []) evidence.push({ ...e, label: `[${p.key}] ${e.label}` });
    if (p.result.status === "not_checkable") evidence.push({ label: `[${p.key}]`, detail: p.result.reason || "not checkable" });
  }
  const summary = perProject.map((p) => `${p.key}: ${p.result.status}${p.result.summary ? " — " + p.result.summary : p.result.reason ? " — " + p.result.reason : ""}`).join(" | ");
  const out = { id, label, status, count: perProject.reduce((n, p) => n + (p.result.count || 0), 0), summary, evidence };
  if (status === "not_checkable") out.reason = withData.length ? "some projects are not checkable" : perProject.map((p) => `${p.key}: ${p.result.reason || "not checkable"}`).join("; ");
  return out;
}
```

- [ ] **Step 4: Run the test, commit**

Run: `cd WebApp && npx vitest run bridge/office-scope.test.mjs`
Expected: PASS, 7 tests.

```bash
git add WebApp/bridge/office-scope.mjs WebApp/bridge/office-scope.test.mjs
git commit -m "feat(bridge): office scope — who owns a key, an office's projects, the keys an assessment reads, and an honest rollup of per-project results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Bridge — project fields, rows query, scope route, resolver wiring

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs:173-240` (`listProjects`, `createProject`, `updateProject`; add `listProjectRows`; re-export the office helpers)
- Modify: `WebApp/bridge/bcf-service.mjs:876-895` (projects routes: owner check on `kind`, `GET /cde/projects/:key/scope`)
- Modify: `WebApp/bridge/artefact-store.mjs` (`wire()` default `officeKeyOf`)
- Test: `WebApp/bridge/artefact-store.test.mjs` (one added test)
- Read for reference: `WebApp/bridge/members-store.mjs:129` (`requireMinRole(key, min)`), `cde-store.mjs:224-240` (audit idiom in `updateProject`).

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `listProjectRows() → [{ id, key, name, kind, office_key }]` (service query); `listProjects()` rows carry `kind`, `office_key`, `office_name`; `createProject({ kind?, office_key? })`; `updateProject(key, { office_key?, kind? })`; `GET /cde/projects/:key/scope` → `projectScope`; `cde-store` re-exports `officeKeyOf`, `listOfficeProjects`, `projectScope`.

- [ ] **Step 1: The rows query and the fields**

In `cde-store.mjs` add after `listProjects`:

```js
/** Every project's identity and office relation, service-key read (the office helpers need to see rows the
 *  caller is not a member of, e.g. a project's office). Rows from before migration 0029 have no kind/office_key. */
export async function listProjectRows() {
  const rows = await sb(`projects?select=id,key,name,kind,office_key&order=created_at.asc`, { service: true });
  return (rows || []).map((r) => ({ id: r.id, key: r.key, name: r.name, kind: r.kind ?? "project", office_key: r.office_key ?? null }));
}
export { officeKeyOf, listOfficeProjects, projectScope } from "./office-scope.mjs";
```

If PostgREST rejects `kind,office_key` in the select because the migration is not applied yet, fall back: catch the error, re-query `select=id,key,name`, and map with `kind: "project", office_key: null`. Write that fallback in `listProjectRows` (one try/catch around the first query, matching `/column .* does not exist|42703/`).

In `listProjects()` add `kind`, `office_key` to the select (same fallback), and after mapping, attach `office_name` from the rows: `const byKey = new Map(rows.map((p) => [p.key, p.name]));` and each item `kind: p.kind ?? "project", office_key: p.office_key ?? null, office_name: p.office_key ? byKey.get(p.office_key) ?? null : null`.

In `createProject(b)` add to the insert body: `kind: b.kind === "office" ? "office" : "project", office_key: b.office_key || null` and to the audit `new_value`: `kind, office_key`. (When the migration is not applied, the insert fails with the column error — expected until applied.)

In `updateProject(key, patch, actor)`:

```js
  if (patch.office_key !== undefined) body.office_key = patch.office_key ? String(patch.office_key).trim() : null;
  if (patch.kind !== undefined) {
    if (!["project", "office"].includes(patch.kind)) { const e = new Error("kind must be project or office"); e.status = 400; throw e; }
    body.kind = patch.kind;
  }
```
and include `{ office_key: { from: proj.office_key ?? null, to: body.office_key }, kind: { from: proj.kind ?? "project", to: body.kind } }` in the audit's `new_value` when present.

- [ ] **Step 2: Routes and the resolver**

In `bcf-service.mjs` inside `if (p1 === "projects" && p2 && !p3)` before the PATCH call add the owner check:

```js
        if (req.method === "PATCH") {
          const b = await readBody(req);
          if (b?.kind !== undefined) { const m = await import("./members-store.mjs"); await m.requireMinRole(key, "owner"); }
          return send(res, 200, await cde.updateProject(key, b, b?.actor));
        }
```
and add a scope route right after that block:

```js
      if (p1 === "projects" && p2 && p3 === "scope" && req.method === "GET") return send(res, 200, await cde.projectScope(decodeURIComponent(p2)));
```

In `artefact-store.mjs` `wire()` replace `officeKeyOf: deps.officeKeyOf || (async () => null),` with `officeKeyOf: deps.officeKeyOf || (await import("./office-scope.mjs")).officeKeyOf,` (remove the "office entity lands with phase 2" comment).

- [ ] **Step 3: Test the resolver through the real default**

Add to `artefact-store.test.mjs` (deps without `officeKeyOf`, injecting `listProjectRows` is not possible through artefact-store's deps — so test with an injected `officeKeyOf` that reads rows through the real helper):

```js
  it("resolves the office through the real office helper when the project row carries office_key", async () => {
    const { officeKeyOf } = await import("./office-scope.mjs");
    const rows = [{ id: "1", key: "aster-office", name: "Aster", kind: "office", office_key: null }, { id: "2", key: "aster-tower", name: "Tower", kind: "project", office_key: "aster-office" }];
    const d = memDeps({ parentKey: null });
    d.officeKeyOf = (key) => officeKeyOf(key, { listProjectRows: async () => rows });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r.source).toBe("office");
    expect(r.ref).toBe("ids@1");
  });
```

- [ ] **Step 4: Run, smoke, commit**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs bridge/office-scope.test.mjs && npx vitest run bridge`
Expected: PASS.

Smoke on your own instance (`BCF_PORT=4199 node bridge/bcf-service.mjs`, bearer from `%AppData%\Sentinel\bcf-config.json` `serviceToken`): `GET /cde/projects` → rows carry `kind` and `office_key` (both defaulted if the migration is not applied), `GET /cde/projects/aster-tower/scope` → `{ key, kind: "project", office_key: null, keys: ["aster-tower"] }`. Stop the instance.

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs
git commit -m "feat(bridge): projects carry kind and office_key; scope route; the IDS resolver's office step is real

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 3: Readiness rollup — scope-aware `runCheck`

**Files:**
- Modify: `WebApp/bridge/check-registry.mjs:566-576` (`runCheck`)
- Test: `WebApp/bridge/office-checks.test.mjs` (append a `describe`)
- Read for reference: `WebApp/bridge/office-scope.mjs` (Task 1), `check-registry.mjs:17-19` (`result()`), `bimdocs-store.mjs:370-384` (the readiness runner calls `runCheck(id, key, params)` — no change needed there).

**Interfaces:**
- Consumes: `projectScope`, `rollupResults`, `ROLLUP_CHECK_IDS` (Task 1).
- Produces: `runCheck(id, key, params)` returns a rolled-up result for an office key and a rollup-eligible id; unchanged otherwise. Also exports `runCheckScoped(id, key, params, deps)` (the testable core with injected `projectScope`).

- [ ] **Step 1: Write the failing test**

Append to `WebApp/bridge/office-checks.test.mjs`:

```js
describe("runCheck over an office scope", () => {
  it("runs a rollup-eligible check per project and rolls it up; template items and plain projects run once", async () => {
    const { runCheckScoped } = await import("./check-registry.mjs");
    const calls = [];
    const def = { id: "office.roles", label: "Roles", run: async (key) => { calls.push(key); return { id: "office.roles", label: "Roles", status: key === "aster-tower" ? "violations" : "met", count: key === "aster-tower" ? 1 : 0, summary: `${key} roles`, evidence: key === "aster-tower" ? [{ label: "missing role", detail: "lead" }] : [] }; } };
    const scope = { projectScope: async (key) => key === "aster-office" ? { key, kind: "office", office_key: null, keys: ["aster-office", "aster-tower"] } : { key, kind: "project", office_key: null, keys: [key] } };
    const out = await runCheckScoped(def, "aster-office", {}, scope);
    expect(calls).toEqual(["aster-office", "aster-tower"]);
    expect(out.status).toBe("violations");
    expect(out.evidence).toContainEqual({ label: "[aster-tower] missing role", detail: "lead" });
    calls.length = 0;
    const single = await runCheckScoped(def, "aster-tower", {}, scope);
    expect(calls).toEqual(["aster-tower"]);
    expect(single.summary).toBe("aster-tower roles");
    calls.length = 0;
    const tpl = { id: "office.worksets", label: "Worksets", run: async (key) => { calls.push(key); return { id: "office.worksets", label: "Worksets", status: "met", count: 0, summary: "", evidence: [] }; } };
    await runCheckScoped(tpl, "aster-office", {}, scope);
    expect(calls).toEqual(["aster-office"]);              // template item: the office's own snapshot only
  });
  it("falls back to a single run when the scope cannot be resolved", async () => {
    const { runCheckScoped } = await import("./check-registry.mjs");
    const def = { id: "cde.states", label: "States", run: async () => ({ id: "cde.states", label: "States", status: "met", count: 0, summary: "one", evidence: [] }) };
    const out = await runCheckScoped(def, "ghost", {}, { projectScope: async () => { throw Object.assign(new Error("nope"), { status: 404 }); } });
    expect(out.summary).toBe("one");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/office-checks.test.mjs`
Expected: FAIL — `runCheckScoped` is not exported.

- [ ] **Step 3: Make `runCheck` scope-aware**

In `check-registry.mjs` replace the body of `runCheck` from `try {` to the end of the function with:

```js
  try {
    return await runCheckScoped(def, projectKey, params);
  } catch (e) {
    return result(id, def.label, "error", { summary: `Check failed: ${String(e?.message || e)}` });
  }
}

/** Run one check definition for a key. For an OFFICE key and a rollup-eligible check, run it for the
 *  office and each of its projects and roll the results up (worst wins, evidence per project). Template
 *  items and plain projects run once, exactly as before. A scope that cannot be resolved (unknown key,
 *  bridge without the office migration) degrades to the single run. */
export async function runCheckScoped(def, projectKey, params = {}, deps = {}) {
  const scope = await import("./office-scope.mjs");
  if (scope.ROLLUP_CHECK_IDS.has(def.id)) {
    let sc = null;
    try { sc = await (deps.projectScope || scope.projectScope)(projectKey); } catch { sc = null; }
    if (sc && sc.kind === "office") {
      const per = [];
      for (const k of sc.keys) {
        try { per.push({ key: k, result: await def.run(k, params) }); }
        catch (e) { per.push({ key: k, result: result(def.id, def.label, "error", { summary: `Check failed: ${String(e?.message || e)}` }) }); }
      }
      return scope.rollupResults(def.id, def.label, per);
    }
  }
  return def.run(projectKey, params);
}
```

- [ ] **Step 4: Run, commit**

Run: `cd WebApp && npx vitest run bridge/office-checks.test.mjs bridge/check-registry.test.mjs 2>/dev/null; npx vitest run bridge`
Expected: PASS.

```bash
git add WebApp/bridge/check-registry.mjs WebApp/bridge/office-checks.test.mjs
git commit -m "feat(readiness): an office's checks run per project and roll up with the project named on every evidence line

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Web — offices in the hub and the settings panel

**Files:**
- Modify: `WebApp/src/setups/projects-hub-panel.ts` (`ProjectRow` type at :16-24; the grid render at :66-100; the New project form at :146-175)
- Modify: `WebApp/src/setups/project-settings-panel.ts` (`ProjectRow` type at :16-17; `load()` at :196-236; `save()` at :247-262; the form markup where `ps-owner` is declared)
- Read for reference: the two files in full (they are ~200 and ~270 lines); `bfetch`, `pid()`, `status()`, `esc()`, `setVal`/`val` helpers exist in both.

**Interfaces:**
- Consumes: `GET /cde/projects` rows with `kind`, `office_key`, `office_name` (Task 2); `PATCH /cde/projects/:key { office_key }`; `POST /cde/projects { kind, office_key }`.
- Produces: UI only.

- [ ] **Step 1: Hub grouping**

Extend the `ProjectRow` type with `kind?: "project" | "office"; office_key?: string | null; office_name?: string | null;`. Where the grid is rendered (`el("ph-grid").innerHTML = ordered.map(...)`), build groups first and emit a header per group:

```ts
    type Group = { title: string; rows: ProjectRow[] };
    const offices = ordered.filter((p) => p.kind === "office");
    const groups: Group[] = offices.map((o) => ({ title: `${o.name} · office`, rows: [o, ...ordered.filter((p) => p.kind !== "office" && p.office_key === o.key)] }));
    const loose = ordered.filter((p) => p.kind !== "office" && !offices.some((o) => o.key === p.office_key));
    if (loose.length) groups.push({ title: offices.length ? "No office" : "", rows: loose });
    el("ph-grid").innerHTML = groups.map((g) =>
      (g.title ? `<div style="grid-column:1/-1;color:#9ca3af;font:600 11px system-ui;letter-spacing:.04em;text-transform:uppercase;padding:.6rem .2rem .1rem">${esc(g.title)}</div>` : "") +
      g.rows.map((p) => card(p)).join("")).join("");
```

where `card(p)` is the existing per-project card template extracted into a function (move the existing template literal into `const card = (p: ProjectRow) => ...` unchanged, adding one line inside it: `${p.kind === "office" ? '<span style="…badge…">office</span>' : p.office_name ? `<span style="color:#9ca3af;font-size:11px"> · ${esc(p.office_name)}</span>` : ""}` next to the project name).

- [ ] **Step 2: New project form — kind and office**

In the `ph-form` markup add, after the name input:

```ts
      '<select id="ph-kind" style="…same input style…"><option value="project">Project</option><option value="office">Office</option></select>' +
      '<select id="ph-office" style="…same input style…"><option value="">No office</option>' + rows.filter((p) => p.kind === "office").map((o) => `<option value="${esc(o.key)}">${esc(o.name)}</option>`).join("") + "</select>" +
```
(`rows` is the last loaded project list; keep it in a module variable if the form is built before the list — build the office options from the cached rows and refresh them when the list reloads.) In the create request body add `kind: (el("ph-kind") as HTMLSelectElement).value, office_key: (el("ph-office") as HTMLSelectElement).value || undefined`. When `ph-kind` is `office`, disable `ph-office` (an office has no office).

- [ ] **Step 3: Settings — office selector**

Add to the settings form, after the owner field: `<label>Office <select id="ps-office"><option value="">No office</option></select></label>` styled like the other inputs. In `load()`, after `rows` is read: fill `ps-office` with `rows.filter((p) => p.kind === "office" && p.key !== pid())` and set its value to `current.office_key ?? ""`; when `current.kind === "office"` disable the select and show `office` beside the key line (`status(...)` text: `… · this project is an office (${rows.filter((p) => p.office_key === pid()).length} project(s))`). Add `"ps-office"` to the read-only list below lead. In `save()` add `office_key: val("ps-office") || null`.

- [ ] **Step 4: Type-check, build, commit**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "projects-hub-panel|project-settings-panel"; npm run build`
Expected: no lines from the grep; build succeeds. (Live look only if the platform loads the app; the hub does not need the viewer.)

```bash
git add WebApp/src/setups/projects-hub-panel.ts WebApp/src/setups/project-settings-panel.ts
git commit -m "feat(web): projects grouped under their office in the hub; office selector on creation and in settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Revit — the office in the Project Setup picker

**Files:**
- Modify: `SentinelAddin/UI/SettingsDialog.xaml.cs:54-72` (`LoadWebProjects`)

**Interfaces:**
- Consumes: `GET /cde/projects` rows with `kind`, `office_name`.
- Produces: picker items `name (key) · office name` for projects with an office, `name (key) · office` for office rows.

- [ ] **Step 1: Read the two fields**

Replace the `keys` list element type and the loop body:

```csharp
            var keys = new System.Collections.Generic.List<(string Key, string Name, string? Office, bool IsOffice)>();
            using var jd = System.Text.Json.JsonDocument.Parse(json);
            if (jd.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                foreach (var p in jd.RootElement.EnumerateArray())
                {
                    var key = p.TryGetProperty("key", out var k) ? k.GetString() : null;
                    if (string.IsNullOrWhiteSpace(key)) continue;
                    var name = p.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var office = p.TryGetProperty("office_name", out var o) && o.ValueKind == System.Text.Json.JsonValueKind.String ? o.GetString() : null;
                    var isOffice = p.TryGetProperty("kind", out var kd) && kd.ValueKind == System.Text.Json.JsonValueKind.String && kd.GetString() == "office";
                    keys.Add((key!, name ?? key!, office, isOffice));
                }

            var typed = WebProjectBox.Text; // preserve what was loaded from settings
            foreach (var (key, name, office, isOffice) in keys)
            {
                var label = name == key ? key : $"{name} ({key})";
                if (isOffice) label += " · office";
                else if (!string.IsNullOrWhiteSpace(office)) label += " · " + office;
                WebProjectBox.Items.Add(new System.Windows.Controls.ComboBoxItem { Content = label, Tag = key });
            }
```

- [ ] **Step 2: Compile without deploying, commit**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded.`

```bash
git add SentinelAddin/UI/SettingsDialog.xaml.cs
git commit -m "feat(revit): Project Setup picker shows each project's office

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new Session B2 after Session B, before `## Session C`), `docs/handbook/05-capability-status.md` (row after `| Federation Gate …`), `demo/aster/README.md:44` (the bridge/add-in wiring bullet), `docs/handbook/04-core-workflows.md` (only if it describes the office readiness flow — then one sentence on rollup; otherwise skip and say so).

- [ ] **Step 1: Protocol**

```markdown
## Session B2 — The office and its projects

| Step | Pass criteria |
|---|---|
| Make an office | `PATCH /cde/projects/<office-key> {kind: "office"}` (owner) → the hub shows it with an "office" badge; the Revit picker lists it as `name (key) · office` |
| Attach a project | Settings → Office selector (lead) or `PATCH /cde/projects/<key> {office_key}` → audit row with old and new office; the hub nests it under the office; `GET /cde/projects/<office>/scope` lists it |
| Rollup | the office's READINESS report: `office.model_health` evidence carries `[<project>]` lines from the project's scan; `cde.states` / `naming.containers` count the project's containers under its key; template items read the office's snapshot only |
| Empty office | an office with no projects and no data → `not_checkable`, reason "no projects belong to this office" |
| Office IDS | install an IDS on the office only → `POST /cde/<project>/propose` returns `ids_source: "office"` and the `ids@n` ref |
```

- [ ] **Step 2: Capability row, kit, commit**

Row: `| Office entity (projects.kind + office_key; readiness rollup per project; office IDS inherited) | 🟩 Built | Migration 0029; `GET /cde/projects/:key/scope`; hub grouping, settings selector, Revit picker; moves to ✅ on the Session B2 drill |`.

Kit README line 44 becomes: `- In Revit: Project Setup → Web project = \`aster-office\` on the **template** (acts 1–2) and \`aster-tower\` on the **tower** from act 3 on. \`aster-office\` is an office (kind office) and \`aster-tower\` belongs to it, so the office readiness view rolls the tower's scans and containers up with the tower's key on every evidence line (F23 closed by cohesion phase 2).`

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md demo/aster/README.md docs/handbook/04-core-workflows.md
git commit -m "docs: office entity drill (Session B2), capability row, kit wiring note

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Migration, drill and merge (controller)

- [ ] **Step 1:** The founder applies `WebApp/db/migrations/0029_project_office.sql` to the live database (Supabase SQL editor or an approved MCP call). Confirm with `select key, kind, office_key from projects order by key`.
- [ ] **Step 2:** Restart the managed bridge; `PATCH /cde/projects/aster-office {kind: "office", actor: "drill"}`, `PATCH /cde/projects/aster-tower {office_key: "aster-office", actor: "drill"}`; `GET /cde/projects/aster-office/scope` → keys `[aster-office, aster-tower]`.
- [ ] **Step 3:** `GET /bimdocs/aster-office/<READINESS id>/readiness` → `office.model_health` with `[aster-tower]` evidence and `cde.states` counting the tower's containers.
- [ ] **Step 4:** Office IDS: on a fresh child project (or after removing the tower's own IDS is not possible — artefacts are immutable — use a new project `aster-villa` attached to the office): `POST /cde/aster-villa/propose {elements: []}` → `ids_source: "office"` when the office has an IDS and the child none.
- [ ] **Step 5:** Record in the run record; capability row ✅; `npm test`; merge `--no-ff` into master.

## Self-review notes

- Spec §1 → migration file (on the branch) + Task 7 step 1; §2 → Tasks 1–2; §3 → Task 3; §4 → Tasks 4–6; §5 → Tasks 2–3 (audit, evidence per project); Testing → Tasks 1–3 tests, Task 7 drill.
- Names: `listProjectRows`, `officeKeyOf`, `listOfficeProjects`, `projectScope`, `rollupResults`, `ROLLUP_CHECK_IDS` (T1/T2) · `runCheckScoped` (T3).
