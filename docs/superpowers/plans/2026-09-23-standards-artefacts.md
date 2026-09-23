# Standards as Artefacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The scan ruleset and the container-naming pack become versioned, hashed artefacts on the project (resolved project → office → none); every bridge and web judge reads through one resolver; the bundled web ruleset and the bridge naming file are deleted.

**Architecture:** Two real kinds (`ruleset`, `naming`) on the phase 1 artefact store with validators and a generic `resolveArtefact`; bridge judges (naming check, proposal, federation, grounding, readiness, snapshot) and web scan panels read through it and report `not_checkable` naming the install route when none; `metadata.active_ruleset` is split into the two kinds by a one-shot import and retired from the write path; IDS topics record their IDS version and are marked superseded on a newer install; a document-sourced naming candidate installs whole after a field diff.

**Tech Stack:** Node 20+ zero-dep bridge (`WebApp/bridge/*.mjs`, vitest), TypeScript web app on That Open (`WebApp/src`, vite, `npx tsc --noEmit -p .`), Supabase via PostgREST (`bridge_docs` store `artefact`).

Spec: `docs/superpowers/specs/2026-09-23-standards-artefacts-design.md`. Branch: `feature/standards-artefacts` from master.

## Global Constraints

- Honesty rule: statuses are `met | violations | not_checkable | error`; a judge with `source: none` is `not_checkable` (or, for "is a standard installed at all" items, `violations`) with the install route in the reason — never a pass, never a scan by shipped data. Every judge names `ref · source · sha` via `refLabel`.
- Office code is data: no BDS/AST literal in code; the two seed packs are JSON files under `WebApp/packs/`; the pilot's naming file leaves the bridge (`demo/bds-pilot/`).
- Rule `mode` vocabulary is the real enum `monitor | warn | request | block` (types.ts `EnforcementMode`); rule `target` includes `type`.
- A naming artefact requires `standard_key` and `semver`; a missing `enforce` is treated as `reject` by judges and filled in by the split.
- `refLabel` is defined once in `bridge/artefact-store.mjs` and once, identically, in `src/setups/active-ruleset.ts` (the browser cannot import node:crypto); it tolerates `sha256: null` by omitting the sha segment.
- The GET `/cde/:key/artefacts/:kind` answer is `{kind, version, body, source, ref, sha256, pointer_sha_mismatch}`; inherited artefacts show no installer/date in the settings block (accepted).
- Execution order: **Tasks 1, 2, 6, 3, 4, 5, 7, 8, 9, 10** — Task 3 (write-path retirement, `PUT /projects/:key` 400 on `active_ruleset`) must land after Task 6 (web pack install writes artefacts). Task 9 rewrites the docs-panel install lines Task 7 leaves alone.
- Tests from `WebApp/`: `npx vitest run <file>`; `npm test` (779 today) must stay green; `npx tsc --noEmit -p .` — only new errors in touched files count (master has 34 pre-existing).
- Commit messages end with a `Co-Authored-By` trailer naming the model that wrote it (the controller normalises the name before merge — not a review criterion).
- Windows: the repo path has spaces, quote it. Bash (Git Bash) is available.

---

### Task 1: Artefact store — `ruleset` and `naming` validators, `resolveArtefact`, `refLabel`

**Files:**
- Modify: `WebApp/bridge/artefact-store.mjs:43-55` (`validateArtefact`), `:99-125` (`resolveIdsSpec` → `resolveArtefact` + `refLabel` + `resolveIdsSpec`)
- Modify: `WebApp/bridge/bcf-service.mjs:994-1003` (`GET /cde/:key/artefacts/:kind` resolves project → office → 404)
- Test: `WebApp/bridge/artefact-store.test.mjs` (import line 5; three `describe` blocks appended)
- Read for reference: `WebApp/src/sentinel-core/types.ts:9-45` (`EnforcementMode`, `RuleTarget`, `Ruleset`), `SentinelAddin/Engine/RuleModels.cs:7` (`EnforcementMode { Monitor, Warn, Request, Block }`), `WebApp/src/sentinel-core/naming.ts:9-26` (`NamingField`, `NamingRuleset`), `WebApp/src/setups/visibility-panel.ts:156-159` (reads `a.body` and `a.version` from the GET route; the route keeps both).

**Interfaces:**
- Consumes: the existing `wire(deps)` (`getArtefact`, `officeKeyOf`, `officeArtefact` = `officeArtefactAsService`).
- Produces:
  - `KINDS = ["ids","ruleset","naming","contract","guideline","layers","type_catalog"]` (unchanged).
  - `validateArtefact(kind, body) → true`, or throws `{ status: 400, message: "<kind>: <path> <what is wanted>" }`.
    - `ruleset`: `standard_key`, `semver` (x.y.z), optional `org` string, a non-empty `rules[]` in which every rule has `rules[i].id`, `rules[i].target` ∈ `workset | view | parameter | sheet | family | type | level | grid` and `rules[i].mode` ∈ `monitor | warn | request | block`.
    - `naming`: `standard_key`, `semver`, `title`, `separator` (one character), a non-empty `fields[]` in which every field has `fields[i].key`, `fields[i].label` and either `pattern` or a non-empty `enum[]`; optional `enforce` ∈ `reject | warn | off`; optional `strip_extensions: string[]`.
    - Extra fields (`org`, `doc_refs`, `schema_version`, `_note`, `placeholders`, `tokens`…) are kept, not rejected.
  - `resolveArtefact(key, kind, deps?) → Promise<{ body: object | null, source: "project" | "office" | "none", ref: "kind@n" | null, sha256: string | null, pointer_sha_mismatch: boolean }>`. An unknown kind is a 404 (through `getArtefact`). `sha256` is computed from the body that judges.
  - `refLabel({ ref, source, sha256 }) → string`: `"naming@2 · office · 3f0737600a1b…"` (12 sha chars), `"none"` for source none, `"client · abcdef012345…"` for a client IDS. It is defined here ONCE; every other group imports it from `./artefact-store.mjs`.
  - `resolveIdsSpec(key, body, deps?)`: the signature and return shape are unchanged. It now calls `resolveArtefact(key, "ids")` for its project and office steps.
  - `GET /cde/:key/artefacts/:kind` → 200 `{ kind, version, body, source, ref, sha256, pointer_sha_mismatch }` from the project or the office; 404 `{ message }` naming the install route when source is none.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/artefact-store.test.mjs` replace line 5:

```js
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, KINDS } from "./artefact-store.mjs";
```

with:

```js
import { putArtefact, getArtefact, getArtefactVersion, listArtefacts, resolveIdsSpec, resolveArtefact, refLabel, validateArtefact, KINDS } from "./artefact-store.mjs";
```

and append at the end of the file (after the closing `});` of `describe("resolveIdsSpec", …)`):

```js
const ruleset = { standard_key: "ast-std-001", semver: "1.0.0", org: "AST", rules: [
  { id: "WS-01", target: "workset", mode: "warn", message_en: "Workset '{name}' is not in the {org} whitelist." },
  { id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "SIZE"], token_defs: { ORG: "{org}", SIZE: "\d+ mm" }, message_en: "Type '{name}' does not match." },
] };
const naming = { standard_key: "ast-std-001", semver: "1.0.0", title: "Aster 2-field", separator: "-", enforce: "reject", strip_extensions: [".ifc"], fields: [
  { key: "project", label: "Project", pattern: "[A-Z0-9]{3,}" },
  { key: "role", label: "Role", enum: ["A", "S"] },
] };
const fails = (kind, body) => { try { validateArtefact(kind, body); } catch (e) { return e; } return null; };
const withRule = (over) => ({ ...ruleset, rules: [ruleset.rules[0], { ...ruleset.rules[1], ...over }] });
const withField = (over) => ({ ...naming, fields: [naming.fields[0], { ...naming.fields[1], ...over }] });

describe("validateArtefact — ruleset and naming", () => {
  it("accepts a well-formed scan ruleset and naming pack, extra fields included", () => {
    expect(validateArtefact("ruleset", { ...ruleset, doc_refs: { rtg: "{org}-STD-001" }, schema_version: 1 })).toBe(true);
    expect(validateArtefact("naming", naming)).toBe(true);
    const { enforce, strip_extensions, ...bare } = naming;                     // both optional
    expect(validateArtefact("naming", bare)).toBe(true);
  });
  it.each([
    ["standard_key", { ...ruleset, standard_key: " " }],
    ["semver", { ...ruleset, semver: "1.0" }],
    ["org", { ...ruleset, org: 7 }],
    ["rules", { ...ruleset, rules: [] }],
    ["rules[1]", { ...ruleset, rules: [ruleset.rules[0], null] }],
    ["rules[1].id", withRule({ id: "" })],
    ["rules[1].target", withRule({ target: "room" })],
    ["rules[1].mode", withRule({ mode: "reject" })],
  ])("ruleset: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("ruleset", body)).toMatchObject({ status: 400, message: expect.stringContaining(`ruleset: ${path} `) });
  });
  it.each([
    ["standard_key", { ...naming, standard_key: undefined }],
    ["semver", { ...naming, semver: "v1" }],
    ["title", { ...naming, title: "" }],
    ["separator", { ...naming, separator: "--" }],
    ["fields", { ...naming, fields: [] }],
    ["fields[1].key", withField({ key: "" })],
    ["fields[1].label", withField({ label: undefined })],
    ["fields[1]", withField({ enum: [] })],
    ["enforce", { ...naming, enforce: "block" }],
    ["strip_extensions", { ...naming, strip_extensions: ".ifc" }],
  ])("naming: a bad %s is a 400 naming that path", (path, body) => {
    expect(fails("naming", body)).toMatchObject({ status: 400, message: expect.stringContaining(`naming: ${path} `) });
  });
  it("refuses an invalid ruleset at install, before anything is written", async () => {
    const d = memDeps();
    await expect(putArtefact("p", "ruleset", withRule({ mode: "reject" }), { actor: "x" }, d)).rejects.toMatchObject({ status: 400 });
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });
});

describe("resolveArtefact", () => {
  const shaOf = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
  it("resolves none → office → project, naming which judged and the sha of the body", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    expect(await resolveArtefact("aster-villa", "naming", d)).toEqual({ body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false });
    await putArtefact("aster-office", "naming", naming, { actor: "x" }, d);
    const o = await resolveArtefact("aster-villa", "naming", d);
    expect(o).toEqual({ body: naming, source: "office", ref: "naming@1", sha256: shaOf(naming), pointer_sha_mismatch: false });
    await putArtefact("aster-villa", "naming", { ...naming, title: "Villa" }, { actor: "x" }, d);
    const p = await resolveArtefact("aster-villa", "naming", d);
    expect(p).toMatchObject({ source: "project", ref: "naming@1" });
    expect(p.body.title).toBe("Villa");
    expect((await resolveArtefact("aster-villa", "ruleset", d)).source).toBe("none");   // kinds resolve independently
  });
  it("flags a document rewritten behind the pointer, and refuses an unknown kind", async () => {
    const d = memDeps();
    await putArtefact("p", "ruleset", ruleset, { actor: "x" }, d);
    d.docs.get("artefact|uuid-p|ruleset@1").body = { ...ruleset, rules: [ruleset.rules[0]] };
    expect((await resolveArtefact("p", "ruleset", d)).pointer_sha_mismatch).toBe(true);
    await expect(resolveArtefact("p", "recipes", d)).rejects.toMatchObject({ status: 404 });
  });
  it("agrees with resolveIdsSpec on the IDS (resolveIdsSpec calls it)", async () => {
    const d = memDeps({ parentKey: "aster-office" });
    await putArtefact("aster-office", "ids", spec, { actor: "x" }, d);
    const a = await resolveArtefact("aster-tower", "ids", d);
    const r = await resolveIdsSpec("aster-tower", {}, d);
    expect(r).toMatchObject({ spec: a.body, source: a.source, ref: a.ref, sha256: a.sha256, pointer_sha_mismatch: false, client_ids_ignored: false });
  });
});

describe("refLabel", () => {
  it("names ref · source · 12 sha chars, and says none when nothing judged", () => {
    expect(refLabel({ ref: "naming@2", source: "office", sha256: "3f0737600a1bc2d4e5f6" })).toBe("naming@2 · office · 3f0737600a1b…");
    expect(refLabel({ ref: null, source: "none", sha256: null })).toBe("none");
    expect(refLabel({ ref: null, source: "client", sha256: "abcdef0123456789" })).toBe("client · abcdef012345…");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: FAIL with `Tests  23 failed | 11 passed (34)`. These tests fail:
- every ruleset and naming path case (no 400 is thrown, so `fails()` returns null);
- the install refusal (the doc gets written);
- `resolveArtefact` and `refLabel` (`is not a function`).

The 10 existing tests and "accepts a well-formed scan ruleset…" pass.

- [ ] **Step 3: The two validators**

In `WebApp/bridge/artefact-store.mjs` replace lines 43-55:

```js
/** Kind-specific validation. Only `ids` has a real check today; other kinds accept any object. */
export function validateArtefact(kind, body) {
  if (!KINDS.includes(kind)) throw err(400, `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "artefact body must be a JSON object");
  if (kind === "ids") {
    // A zero-spec compile installs as a silent pass-everything IDS (adjudicate() has nothing to check),
    // which reports "accepted" for every model — a gate-only pass dressed as an IDS pass (the honesty
    // rule). Reject it here so an empty compile can never become an artefact.
    if (!Array.isArray(body.specifications) || body.specifications.length === 0) throw err(400, "an IDS artefact needs at least one specification in `specifications: [...]` (the JSON spec shape; raw .ids XML is not accepted server-side)");
    if (body.enforce !== undefined && !["reject", "warn", "off"].includes(body.enforce)) throw err(400, "ids.enforce must be reject | warn | off");
  }
  return true;
}
```

with:

```js
// The scan ruleset's vocabulary: the targets the web adapter and the add-in scan (`type` is FG-02's type
// rule) and the enforcement ladder of sentinel-core/types.ts and Engine/RuleModels.cs.
const RULE_TARGETS = ["workset", "view", "parameter", "sheet", "family", "type", "level", "grid"];
const RULE_MODES = ["monitor", "warn", "request", "block"];
const ENFORCE = ["reject", "warn", "off"];
const filled = (v) => typeof v === "string" && v.trim() !== "";
const bad = (kind, path, want) => err(400, `${kind}: ${path} ${want}`);

function standardHead(kind, body) {
  if (!filled(body.standard_key)) throw bad(kind, "standard_key", "must be a non-empty string");
  if (typeof body.semver !== "string" || !/^\d+\.\d+\.\d+$/.test(body.semver)) throw bad(kind, "semver", "must be x.y.z");
}

/** Kind-specific validation: `ids`, `ruleset` and `naming` have real checks; the other kinds accept any
 *  object until they get a judge. A failure is a 400 naming the path (`rules[3].mode`). */
export function validateArtefact(kind, body) {
  if (!KINDS.includes(kind)) throw err(400, `unknown artefact kind '${kind}' (expected one of ${KINDS.join(", ")})`);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw err(400, "artefact body must be a JSON object");
  if (kind === "ids") {
    // A zero-spec compile installs as a silent pass-everything IDS (adjudicate() has nothing to check),
    // which reports "accepted" for every model — a gate-only pass dressed as an IDS pass (the honesty
    // rule). Reject it here so an empty compile can never become an artefact.
    if (!Array.isArray(body.specifications) || body.specifications.length === 0) throw err(400, "an IDS artefact needs at least one specification in `specifications: [...]` (the JSON spec shape; raw .ids XML is not accepted server-side)");
    if (body.enforce !== undefined && !ENFORCE.includes(body.enforce)) throw err(400, "ids.enforce must be reject | warn | off");
  }
  if (kind === "ruleset") {
    standardHead(kind, body);
    if (body.org !== undefined && typeof body.org !== "string") throw bad(kind, "org", "must be a string");
    if (!Array.isArray(body.rules) || !body.rules.length) throw bad(kind, "rules", "must be a non-empty array");
    body.rules.forEach((r, i) => {
      const at = `rules[${i}]`;
      if (!r || typeof r !== "object") throw bad(kind, at, "must be an object");
      if (!filled(r.id)) throw bad(kind, `${at}.id`, "must be a non-empty string");
      if (!RULE_TARGETS.includes(r.target)) throw bad(kind, `${at}.target`, `must be ${RULE_TARGETS.join(" | ")}`);
      if (!RULE_MODES.includes(r.mode)) throw bad(kind, `${at}.mode`, `must be ${RULE_MODES.join(" | ")}`);
    });
  }
  if (kind === "naming") {
    standardHead(kind, body);
    if (!filled(body.title)) throw bad(kind, "title", "must be a non-empty string");
    if (typeof body.separator !== "string" || body.separator.length !== 1) throw bad(kind, "separator", "must be one character");
    if (!Array.isArray(body.fields) || !body.fields.length) throw bad(kind, "fields", "must be a non-empty array");
    body.fields.forEach((f, i) => {
      const at = `fields[${i}]`;
      if (!f || typeof f !== "object") throw bad(kind, at, "must be an object");
      if (!filled(f.key)) throw bad(kind, `${at}.key`, "must be a non-empty string");
      if (!filled(f.label)) throw bad(kind, `${at}.label`, "must be a non-empty string");
      if (!filled(f.pattern) && !(Array.isArray(f.enum) && f.enum.length)) throw bad(kind, at, "needs a pattern or a non-empty enum[]");
    });
    if (body.enforce !== undefined && !ENFORCE.includes(body.enforce)) throw bad(kind, "enforce", "must be reject | warn | off");
    if (body.strip_extensions !== undefined && !(Array.isArray(body.strip_extensions) && body.strip_extensions.every((e) => typeof e === "string")))
      throw bad(kind, "strip_extensions", "must be an array of strings");
  }
  return true;
}
```

- [ ] **Step 4: `resolveArtefact`, `refLabel`, and `resolveIdsSpec` through it**

Replace lines 99-125 (from the `resolveIdsSpec` doc comment to the end of the file):

```js
/**
 * The IDS a judge must use for `key`: project → office → client → none. Returns the spec and its
 * provenance; `client_ids_ignored` is true when a client sent one but an installed artefact outranked it.
 */
export async function resolveIdsSpec(key, body = {}, deps) {
  const d = await wire(deps);
  const clientSent = body.ids !== undefined && body.ids !== null;
  // The sha the ledger records is computed from the BODY that judges, not copied from the pointer:
  // bridge_docs is member-writable through PostgREST (migration 0028), so a rewritten document must
  // show up as a different hash on every later verdict, and a pointer that disagrees is flagged.
  const stamp = (doc, source) => {
    const bodySha = sha256(doc.body);
    return { spec: doc.body, source, ref: `ids@${doc.version}`, sha256: bodySha, pointer_sha_mismatch: bodySha !== doc.sha256, client_ids_ignored: clientSent };
  };
  const own = await getArtefact(key, "ids", deps);
  if (own) return stamp(own, "project");
  const officeKey = await d.officeKeyOf(key);
  if (officeKey) {
    const office = await d.officeArtefact(officeKey, "ids");
    if (office) return stamp(office, "office");
  }
  if (clientSent) {
    if (typeof body.ids === "string") throw err(400, "Submit the IDS as a JSON spec {title, specifications:[…]} — raw .ids XML is parsed browser-side only.");
    return { spec: body.ids, source: "client", ref: null, sha256: sha256(body.ids), client_ids_ignored: false };
  }
  return { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false };
}
```

with:

```js
/**
 * The artefact of `kind` that judges `key`: the project's own → its office's → none. The answer names
 * which one judged (`source`, `ref`) and the sha of the BODY that judges, not the pointer's copy:
 * bridge_docs is member-writable through PostgREST (migration 0028), so a rewritten document must show
 * up as a different hash on every later verdict, and a pointer that disagrees is flagged.
 */
export async function resolveArtefact(key, kind, deps) {
  const d = await wire(deps);
  const stamp = (doc, source) => {
    const bodySha = sha256(doc.body);
    return { body: doc.body, source, ref: `${kind}@${doc.version}`, sha256: bodySha, pointer_sha_mismatch: bodySha !== doc.sha256 };
  };
  const own = await getArtefact(key, kind, deps);
  if (own) return stamp(own, "project");
  const officeKey = await d.officeKeyOf(key);
  if (officeKey) {
    const office = await d.officeArtefact(officeKey, kind);
    if (office) return stamp(office, "office");
  }
  return { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };
}

/** What judged, in one line for a verdict row, evidence line, scan header or CLI: "naming@2 · office · 3f0737600a1b…"; "none" when nothing is installed. */
export const refLabel = ({ ref, source, sha256: sha } = {}) => [ref, source, sha && `${sha.slice(0, 12)}…`].filter(Boolean).join(" · ") || "none";

/**
 * The IDS a judge must use for `key`: project → office (resolveArtefact) → client → none. Returns the spec
 * and its provenance; `client_ids_ignored` is true when a client sent one but an installed artefact outranked it.
 */
export async function resolveIdsSpec(key, body = {}, deps) {
  const clientSent = body.ids !== undefined && body.ids !== null;
  const a = await resolveArtefact(key, "ids", deps);
  if (a.source !== "none") return { spec: a.body, source: a.source, ref: a.ref, sha256: a.sha256, pointer_sha_mismatch: a.pointer_sha_mismatch, client_ids_ignored: clientSent };
  if (clientSent) {
    if (typeof body.ids === "string") throw err(400, "Submit the IDS as a JSON spec {title, specifications:[…]} — raw .ids XML is parsed browser-side only.");
    return { spec: body.ids, source: "client", ref: null, sha256: sha256(body.ids), client_ids_ignored: false };
  }
  return { spec: null, source: "none", ref: null, sha256: null, client_ids_ignored: false };
}
```

- [ ] **Step 5: The GET route resolves project → office → 404**

Today `GET /cde/:key/artefacts/:kind` reads only the project's own pointer, even though its 404 message says "or its office". In `WebApp/bridge/bcf-service.mjs` replace lines 994-1003:

```js
      // Project artefacts (standards in force): the store every judge reads through (cohesion phase 1).
      //   GET /cde/:key/artefacts · GET /cde/:key/artefacts/:kind · GET /cde/:key/artefacts/:kind/:version
      //   PUT /cde/:key/artefacts/:kind  body = the artefact JSON (ids: {title, specifications, enforce?})
      if (p2 === "artefacts") {
        const art = await import("./artefact-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
        if (p3 && !p4 && req.method === "GET") {
          const a = await art.getArtefact(p1, p3);
          return a ? send(res, 200, a) : send(res, 404, { message: `no ${p3} artefact installed for ${p1} or its office` });
        }
```

with:

```js
      // Project artefacts (standards in force): the store every judge reads through (cohesion phases 1 and 3).
      //   GET /cde/:key/artefacts (this project's own pointers) · GET /cde/:key/artefacts/:kind (project → office → 404;
      //   the answer names source, ref and sha) · GET /cde/:key/artefacts/:kind/:version
      //   PUT /cde/:key/artefacts/:kind  body = the artefact JSON (ids: {title, specifications, enforce?};
      //   ruleset: {standard_key, semver, rules}; naming: {standard_key, semver, title, separator, fields})
      if (p2 === "artefacts") {
        const art = await import("./artefact-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
        if (p3 && !p4 && req.method === "GET") {
          const a = await art.resolveArtefact(p1, p3);
          if (a.source === "none") return send(res, 404, { message: `no ${p3} artefact installed for ${p1} or its office (PUT /cde/${p1}/artefacts/${p3})` });
          return send(res, 200, { kind: p3, version: Number(a.ref.split("@")[1]), ...a });
        }
```

The response keeps `version` and `body`, because `visibility-panel.ts:158` reads both. `installed_by` and `installed_at` are no longer on this route. The list route `GET /cde/:key/artefacts` still returns the pointers with them.

- [ ] **Step 6: Run, commit**

Run: `cd WebApp && npx vitest run bridge/artefact-store.test.mjs`
Expected: PASS with `Tests  34 passed (34)`.

Run: `cd WebApp && npx vitest run bridge`
Expected: PASS. The other bridge tests either mock `getArtefact` / `resolveIdsSpec` or never write a `ruleset` or `naming` artefact. `changesets-store` and `/propose` reach `resolveIdsSpec`, and its return shape is unchanged.

```bash
git add WebApp/bridge/artefact-store.mjs WebApp/bridge/artefact-store.test.mjs WebApp/bridge/bcf-service.mjs
git commit -m "feat(artefacts): ruleset and naming validators naming the bad path; resolveArtefact (project → office → none) and refLabel; the IDS resolver and the GET route go through it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Retire `metadata.active_ruleset`: split, import CLI, whitelist

**Files:**
- Create: `WebApp/bridge/artefact-split.mjs` (pure split + validate)
- Test: `WebApp/bridge/artefact-split.test.mjs`
- Modify: `WebApp/bridge/artefact-import.mjs`. The whole file is replaced (23 lines today): it gains `--from-metadata [--key k] [--dry-run]` and moves to `cli-args.mjs`.
- Modify: `WebApp/bridge/cde-store.mjs:116` (the `mergeMeta` whitelist, which `PUT /projects/:key` goes through via `patchProjectMeta`), `WebApp/bridge/cde-store.test.mjs:35-38`
- Read for reference:
  - `WebApp/bridge/cli-args.mjs` (`parseCliArgs(argv) → { file, flag, has }`).
  - `WebApp/bridge/bcf-service.mjs:646-653`: `GET /projects` → `listProjectMeta()` rows `{ project_id, name, ...metadata }`, so `active_ruleset` is on the row.
  - `bcf-service.mjs:1008-1013`: the PUT route lifts `source` out of the body into the pointer, and `putArtefact` audits the pointer.
  - `demo/aster/ruleset-AST.json`: carries `org`, `doc_refs` and `schema_version`. `{org}` appears in messages and in `token_defs`, and `SentinelAddin/Engine/RuleModels.cs` reads `doc_refs`.

**Interfaces:**
- Consumes: `validateArtefact` and `refLabel` (Task 1); `GET /projects`; `GET /cde/:key/artefacts` → `{ [kind]: pointer | null }`; `PUT /cde/:key/artefacts/:kind?actor=import` with `source` in the body.
- Produces:
  - `splitActiveRulesets(rows: [{ key, active_ruleset?, installed?: { [kind]: pointer | null } }]) → { installs: [{ key, kind: "ruleset" | "naming", body }], skipped: [{ key, kind: "ruleset" | "naming" | null, reason: string }] }`.
    - The ruleset body is `{ standard_key, semver, org?, doc_refs?, schema_version?, rules }`.
    - The naming body is `{ standard_key, semver, title, separator, fields, enforce (default "reject"), strip_extensions? }`.
    - A kind the project already has is skipped, never overwritten.
    - An empty slot is neither installed nor listed.
  - CLI: `node bridge/artefact-import.mjs --from-metadata [--key <key>] [--dry-run]`.
    - It installs with actor `import` and pointer `source: { slot: "projects.metadata.active_ruleset", imported_at }`, so the `artefact_installed` audit row names the slot.
    - It prints one line per install (`Installed on <key>: ruleset@1 · project · <12 sha>… · by import`), one line per skipped row with its reason, and a totals line.
    - It exits 0, or 1 when any install failed.
  - `mergeMeta` no longer accepts `active_ruleset`. The stored value stays in place.

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/artefact-split.test.mjs`:

```js
// The one-shot import of projects.metadata.active_ruleset: split, validate, skip with a reason — over an
// in-memory project list (the CLI supplies the real one from GET /projects).
import { describe, it, expect } from "vitest";
import { splitActiveRulesets } from "./artefact-split.mjs";

const rules = [{ id: "WS-01", target: "workset", mode: "warn", whitelist: ["ARC_Walls"], message_en: "Workset '{name}' is not in the {org} whitelist." }];
const fields = [{ key: "project", label: "Project", pattern: "[A-Z0-9]{3,}" }, { key: "role", label: "Role", enum: ["A", "S"] }];
const head = { standard_key: "ast-std-001", semver: "1.0.0" };
const rows = [
  { key: "aster-office", active_ruleset: { schema_version: 1, ...head, org: "AST", doc_refs: { rtg: "{org}-STD-001" }, rules,
    title: "Aster naming", separator: "-", strip_extensions: [".ifc"], enforce: "warn", fields, _note: "merged by hand" } },
  { key: "pilot", active_ruleset: { standard_key: "house", semver: "1.4.1", rules } },
  { key: "demo" },                                                                                   // nothing in the slot
  { key: "broken", active_ruleset: { ...head, semver: "1.0", rules } },
  { key: "half", active_ruleset: { ...head, rules, title: "Half", separator: "--", fields } },
  { key: "odd", active_ruleset: { ...head } },
  { key: "done", active_ruleset: { ...head, rules }, installed: { ruleset: { kind: "ruleset", version: 2 }, naming: null } },
  { key: "names-only", active_ruleset: { ...head, title: "Names", separator: "-", fields } },
];

describe("splitActiveRulesets", () => {
  const { installs, skipped } = splitActiveRulesets(rows);
  it("splits the merged slot into ruleset and naming, each keeping only its own fields", () => {
    expect(installs.map((i) => `${i.key}:${i.kind}`)).toEqual(["aster-office:ruleset", "aster-office:naming", "pilot:ruleset", "half:ruleset", "names-only:naming"]);
    expect(installs[0].body).toEqual({ ...head, org: "AST", doc_refs: { rtg: "{org}-STD-001" }, schema_version: 1, rules });
    expect(installs[1].body).toEqual({ ...head, title: "Aster naming", separator: "-", fields, enforce: "warn", strip_extensions: [".ifc"] });
  });
  it("defaults a naming pack without enforce to reject", () => {
    expect(installs.find((i) => i.key === "names-only").body.enforce).toBe("reject");
  });
  it("lists every row it will not install, with the reason, and says nothing about an empty slot", () => {
    expect(skipped).toEqual([
      { key: "broken", kind: "ruleset", reason: expect.stringContaining("semver") },
      { key: "half", kind: "naming", reason: expect.stringContaining("separator") },
      { key: "odd", kind: null, reason: "active_ruleset has neither rules[] nor fields[]" },
      { key: "done", kind: "ruleset", reason: "already installed on this project (ruleset@2); not overwritten" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/artefact-split.test.mjs`
Expected: FAIL with `Failed to load url ./artefact-split.mjs`.

- [ ] **Step 3: Write the module**

`WebApp/bridge/artefact-split.mjs`:

```js
// Retiring projects.metadata.active_ruleset (cohesion phase 3, spec §4). The slot held two shapes: the
// scan ruleset and — on the Aster row, merged in by hand — the container-naming pack. Pure: split each
// project's slot into the artefacts it contains, validated with the store's own validator, or say why not.
// The CLI (artefact-import.mjs --from-metadata) does the I/O.
import { validateArtefact } from "./artefact-store.mjs";

// org / doc_refs / schema_version ride with the rules: messages and token_defs carry {org}, and the
// add-in's RuleModels reads doc_refs.
const RULESET_KEYS = ["standard_key", "semver", "org", "doc_refs", "schema_version", "rules"];
const NAMING_KEYS = ["standard_key", "semver", "title", "separator", "fields", "enforce", "strip_extensions"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/**
 * rows: [{ key, active_ruleset?, installed?: { [kind]: pointer | null } }] (installed = GET /cde/:key/artefacts)
 * → { installs: [{ key, kind, body }], skipped: [{ key, kind: string | null, reason }] }.
 * A row with nothing in the slot is neither; a kind the project already has installed is skipped, not overwritten.
 */
export function splitActiveRulesets(rows) {
  const installs = [], skipped = [];
  for (const { key, active_ruleset: rs, installed } of rows) {
    if (!rs || typeof rs !== "object") continue;
    const parts = [];
    if (Array.isArray(rs.rules)) parts.push(["ruleset", pick(rs, RULESET_KEYS)]);
    if (Array.isArray(rs.fields)) parts.push(["naming", { enforce: "reject", ...pick(rs, NAMING_KEYS) }]);   // absent enforce means reject (spec §1)
    if (!parts.length) { skipped.push({ key, kind: null, reason: "active_ruleset has neither rules[] nor fields[]" }); continue; }
    for (const [kind, body] of parts) {
      const have = installed?.[kind];
      if (have) { skipped.push({ key, kind, reason: `already installed on this project (${kind}@${have.version}); not overwritten` }); continue; }
      try { validateArtefact(kind, body); installs.push({ key, kind, body }); }
      catch (e) { skipped.push({ key, kind, reason: e.message }); }
    }
  }
  return { installs, skipped };
}
```

- [ ] **Step 4: Run the test**

Run: `cd WebApp && npx vitest run bridge/artefact-split.test.mjs`
Expected: PASS with `Tests  3 passed (3)`.

- [ ] **Step 5: The CLI**

Replace the whole of `WebApp/bridge/artefact-import.mjs` with the code below. Today's file is the file-only CLI, with its own inline `flag()` at line 12 and `process.exit` calls.

```js
// Install standards as project artefacts.
//   node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]
//     one file → one artefact (the pilot's and Aster's existing ids.json files, so no project starts empty).
//   node bridge/artefact-import.mjs --from-metadata [--key <key>] [--dry-run]
//     one-shot retirement of projects.metadata.active_ruleset (cohesion phase 3): every project row's slot is
//     split into ruleset@n and naming@n, validated, installed with actor "import" and the slot named in the
//     pointer's source (so the install audit row names it). Rows that fail validation are listed, not installed.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadEnv } from "./load-env.mjs";
import { parseCliArgs } from "./cli-args.mjs";
import { refLabel } from "./artefact-store.mjs";
import { splitActiveRulesets } from "./artefact-split.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const headers = { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
const { file, flag, has } = parseCliArgs(process.argv.slice(2));

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`);
  return r;
}
// The PUT route lifts `source` out of the body into the pointer's provenance.
const install = (project, kind, body, actor, source) =>
  call("PUT", `/cde/${encodeURIComponent(project)}/artefacts/${encodeURIComponent(kind)}?actor=${encodeURIComponent(actor)}`, { ...body, source });
const installed = (r, project) => `Installed on ${project}: ${refLabel({ ref: `${r.kind}@${r.version}`, source: "project", sha256: r.sha256 })} · by ${r.installed_by}`;

// Exit through process.exitCode, not process.exit(): exiting while fetch's sockets close trips a libuv
// assertion on Windows (UV_HANDLE_CLOSING).
async function fromMetadata() {
  const only = flag("key"), dry = has("dry-run");
  const projects = (await call("GET", "/projects")).filter((p) => !only || p.project_id === only);
  if (only && !projects.length) { console.error(`No project "${only}".`); return 1; }
  const rows = [];
  for (const p of projects) {
    if (!p.active_ruleset) continue;
    rows.push({ key: p.project_id, active_ruleset: p.active_ruleset, installed: await call("GET", `/cde/${encodeURIComponent(p.project_id)}/artefacts`) });
  }
  const { installs, skipped } = splitActiveRulesets(rows);
  const source = { slot: "projects.metadata.active_ruleset", imported_at: new Date().toISOString() };
  let failed = 0;
  for (const i of installs) {
    if (dry) { console.log(`would install ${i.kind} on ${i.key} (${i.body.standard_key} ${i.body.semver})`); continue; }
    try { console.log(installed(await install(i.key, i.kind, i.body, "import", source), i.key)); }
    catch (e) { failed++; console.error(`FAILED ${i.key} ${i.kind}: ${e.message}`); }
  }
  for (const s of skipped) console.log(`skipped ${s.key}${s.kind ? ` ${s.kind}` : ""}: ${s.reason}`);
  console.log(`${dry ? `dry run, nothing written · ${installs.length} to install` : `${installs.length - failed} installed`} · ${skipped.length} skipped · ${failed} failed · ${projects.length - rows.length} project(s) with no active_ruleset`);
  return failed ? 1 : 0;
}

async function fromFile() {
  const project = flag("project"), kind = flag("kind", "ids");
  if (!file || !project) {
    console.error("Usage: node bridge/artefact-import.mjs <file.json> --project <key> --kind ids [--actor <who>]");
    console.error("       node bridge/artefact-import.mjs --from-metadata [--key <key>] [--dry-run]");
    return 1;
  }
  const body = JSON.parse(await readFile(file, "utf8"));
  console.log(installed(await install(project, kind, body, flag("actor", "cli"), { file: basename(file), imported_at: new Date().toISOString() }), project));
  return 0;
}

try { process.exitCode = await (has("from-metadata") ? fromMetadata() : fromFile()); }
catch (e) { console.error(e.message); process.exitCode = 1; }
```

The file mode keeps its arguments and behaviour. The body's `source` still becomes the pointer's provenance: it is now passed beside the body instead of being written into it, and the PUT route treats both the same way. Exits go through `process.exitCode`, because `process.exit()` right after `fetch` sometimes aborts on Windows with a libuv `UV_HANDLE_CLOSING` assertion (seen while drafting this CLI).

- [ ] **Step 6: Check and smoke, commit**

Run: `cd WebApp && node --check bridge/artefact-import.mjs && node bridge/artefact-import.mjs; echo "exit $?"`
Expected: the two usage lines, then `exit 1`.

Smoke on your own instance:
- Start it with `BCF_PORT=4199 node bridge/bcf-service.mjs`, and set `BCF_BASE=http://127.0.0.1:4199` and `BCF_TOKEN` = `serviceToken` from `%AppData%\Sentinel\bcf-config.json`.
- Run `node bridge/artefact-import.mjs --from-metadata --dry-run`. Expect one `would install ruleset|naming on <key>` line per split, `skipped …` lines with reasons, and a totals line starting `dry run, nothing written`.
- Do NOT run it without `--dry-run` here. The real import is the controller's drill step (`--key aster-office`).
- Stop the instance.

```bash
git add WebApp/bridge/artefact-split.mjs WebApp/bridge/artefact-split.test.mjs WebApp/bridge/artefact-import.mjs
git commit -m "feat(artefacts): artefact-import --from-metadata splits active_ruleset into ruleset@n and naming@n, validated, actor import, slot named; skipped rows listed with reasons

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: (moved)** The write-path retirement (`mergeMeta` whitelist, `PUT /projects/:key` 400) is done in Task 3, which lands after the web pack install (Task 6) so nothing is silently dropped in between.

### Task 3: Container naming judges by the `naming` artefact — bridge file and env var deleted, `active_ruleset` retired from writes

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (imports lines 11–12; `mergeMeta` line 116; `patchProjectMeta` line 145; lines 786–825 naming default and `projectNamingRuleset`; `/propose` naming block lines 894–905, audit line 920, verdict call line 928, response line 930–931; `recordVersionVerdict` line 949)
- Modify: `WebApp/bridge/check-registry.mjs` (import line 11; `classifyNaming` lines 41–54; `naming.containers` run lines 416–419)
- Move: `WebApp/bridge/naming-ruleset.json` → `demo/bds-pilot/bds-naming-ruleset.json` (`git mv`; the bridge no longer ships a naming file — the pilot's pack becomes pilot data beside `bds-ids.json`, installable with `artefact-import.mjs --kind naming`)
- Modify: `config/base-standard/naming-ruleset.json` (add `standard_key`, `semver` so it passes the Task 1 `naming` validator)
- Modify: `WebApp/src/sentinel-core/base-standard.test.ts:13,43` (fixture path), `WebApp/src/sentinel-core/naming.test.ts:4` (comment), `SentinelAddin/Resources/bds-guideline.json:12` (reference path)
- Modify docs: `config/base-standard/README.md:9-10,25`, `docs/BDS_GATE_CONFIG.md:32,35,115,117,119`
- Test: `WebApp/bridge/cde-store.test.mjs`, `WebApp/bridge/check-registry.test.mjs`
- Read for reference: `WebApp/bridge/artefact-store.mjs` (`resolveArtefact`, `refLabel`, `validateArtefact` from Task 1), `WebApp/bridge/bcf-service.mjs:655-668` (`PUT /projects/:key` → `patchProjectMeta`; the route's catch sends `e.status`).

**Interfaces:**
- Consumes: `resolveArtefact(key, kind, deps) → { body, source: "project"|"office"|"none", ref: "kind@n"|null, sha256: string|null, pointer_sha_mismatch }`; `refLabel({ ref, source, sha256 }) → "naming@2 · office · 3f07376abcde…"`; `validateArtefact("naming", body)` (all Task 1, `artefact-store.mjs`).
- Produces: `projectNamingRuleset(key, deps?) → Promise<{ ruleset: object|null, source: "project"|"office"|"none", ref: string|null, sha256: string|null }>` (`deps.resolveArtefact` is the test seam); `NO_NAMING_REASON` (exported string const, `cde-store.mjs`); `classifyNaming(files, named, validate?)` where `named` is the `projectNamingRuleset` result; `/propose` response, proposal audit row and version verdict row carry `naming_ref: "naming@n" | "client" | null` (plus `naming_source`, `naming_sha256`, and `naming_reason` when a name was sent but nothing is installed); `PUT /projects/:key` with `active_ruleset` → 400.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/cde-store.test.mjs` replace the first two lines

```js
import { describe, it, expect } from "vitest";
import { mergeMetaForTest, selectFailures } from "./cde-store.mjs";
```

with

```js
import { describe, it, expect, vi } from "vitest";
import { mergeMetaForTest, selectFailures, projectNamingRuleset, NO_NAMING_REASON } from "./cde-store.mjs";

const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };

describe("projectNamingRuleset — the naming artefact, never a shipped file", () => {
  it("is source none with no ruleset when nothing is installed on the project or its office", async () => {
    const resolveArtefact = vi.fn(async () => NONE);
    expect(await projectNamingRuleset("aster-villa", { resolveArtefact })).toEqual({ ruleset: null, source: "none", ref: null, sha256: null });
    expect(resolveArtefact).toHaveBeenCalledWith("aster-villa", "naming");
  });
  it("returns the office's naming body with its ref and sha", async () => {
    const body = { standard_key: "x", semver: "1.0.0", title: "T", separator: "-", fields: [{ key: "p", label: "P", pattern: "[A-Z]+" }] };
    const resolveArtefact = async () => ({ body, source: "office", ref: "naming@1", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false });
    expect(await projectNamingRuleset("aster-villa", { resolveArtefact })).toEqual({ ruleset: body, source: "office", ref: "naming@1", sha256: "3f07376abcdef0123456789" });
  });
  it("names the install route in the not-installed reason", () => {
    expect(NO_NAMING_REASON).toBe("no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)");
  });
});
```

In the same file replace the `mergeMeta` test

```js
  it("persists active_ruleset (regression: it was silently dropped)", () => {
    const out = mergeMetaForTest(base, { active_ruleset: { standard_key: "bds-rtg-001", semver: "1.4.1", rules: [] } });
    expect(out.active_ruleset).toEqual({ standard_key: "bds-rtg-001", semver: "1.4.1", rules: [] });
  });
```

with

```js
  it("no longer writes active_ruleset (retired: standards are artefacts)", () => {
    const out = mergeMetaForTest(base, { active_ruleset: { standard_key: "k", semver: "1.0.0", rules: [] } });
    expect(out.active_ruleset).toBeUndefined();
  });
```

(`"leaves active_ruleset untouched when the patch omits it"` stays as is: the column value is left in place.)

In `WebApp/bridge/check-registry.test.mjs` replace

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
```

with

```js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { refLabel, validateArtefact } from "./artefact-store.mjs";
```

and after the `RULESET` const add

```js
const NAMED = { ruleset: RULESET, source: "office", ref: "naming@2", sha256: "3f07376abcdef0123456789" };
const NOTHING = { ruleset: null, source: "none", ref: null, sha256: null };
```

Replace the whole `describe("classifyNaming", …)` block (from `describe("classifyNaming", () => {` down to the `});` that closes it, just before `describe("classifyStates"`) with

```js
describe("classifyNaming", () => {
  it("reports met when every container name passes", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }], NAMED);
    expect(r.status).toBe("met");
    expect(r.count).toBe(0);
  });

  it("reports violations with per-container evidence naming the failing field", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }, { iso_name: "PRJ-XXX" }], NAMED);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("PRJ-XXX");
    expect(r.evidence[0].detail).toContain("disc");
  });

  it("is not_checkable naming the install route when no naming standard is installed", () => {
    const r = classifyNaming([{ iso_name: "anything" }], NOTHING);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)");
  });

  it("is not_checkable when the project has no containers yet", () => {
    const r = classifyNaming([], NAMED);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no containers/i);
  });

  it("names the artefact that judged — ref · source · sha — in the summary", () => {
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], NAMED).summary).toContain(refLabel(NAMED));
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], NAMED).summary).toContain("naming@2 · office");
    expect(classifyNaming([{ iso_name: "PRJ-XXX" }], NAMED).summary).toContain("naming@2 · office");
  });

  describe("against the real validator and the pilot's naming pack (demo data, not a bridge default)", () => {
    const realRuleset = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../demo/bds-pilot/bds-naming-ruleset.json", import.meta.url)), "utf8")
    );
    const real = { ruleset: realRuleset, source: "project", ref: "naming@1", sha256: "0".repeat(64) };

    it("both shipped naming packs are installable as naming artefacts", () => {
      const base = JSON.parse(readFileSync(fileURLToPath(new URL("../../config/base-standard/naming-ruleset.json", import.meta.url)), "utf8"));
      expect(() => validateArtefact("naming", realRuleset)).not.toThrow();
      expect(() => validateArtefact("naming", base)).not.toThrow();
    });

    it("passes a correctly formed container name", () => {
      const r = classifyNaming([{ iso_name: "BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03" }], real, validateContainerName);
      expect(r.status).toBe("met");
      expect(r.count).toBe(0);
    });

    it("flags a malformed container name with the real failing field", () => {
      const r = classifyNaming([{ iso_name: "BDS20268-BDS-M3-IFC4-XYZ-ZZ-XX-XX-M001-S2-P03" }], real, validateContainerName);
      expect(r.status).toBe("violations");
      expect(r.count).toBe(1);
      expect(r.evidence[0].detail).toContain("discipline");
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/cde-store.test.mjs bridge/check-registry.test.mjs`
Expected: FAIL — `NO_NAMING_REASON` is undefined; `projectNamingRuleset` ignores the injected resolver and returns `source: "default"` with the bridge file's ruleset; `mergeMeta` still writes `active_ruleset`; `classifyNaming` treats `NAMED` as a ruleset (no `separator`) and its summary says "the project's ruleset"; `ENOENT … demo/bds-pilot/bds-naming-ruleset.json`.

- [ ] **Step 3: `cde-store.mjs` — the resolver replaces the file, `active_ruleset` refused**

Remove the two imports that only the file loader used (lines 11–12):

```js
import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
```

In `mergeMeta` (line 116) replace

```js
  for (const k of ["stage", "standards_pack", "active_ruleset", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
```

with

```js
  // active_ruleset is retired (cohesion phase 3): the scan ruleset and the naming pack are artefacts
  // (PUT /cde/:key/artefacts/:kind). A value already in the column is left in place and read by nothing.
  for (const k of ["stage", "standards_pack", "rate_pack", "boq_baseline", "carbon_baseline"]) if (patch[k] !== undefined) out[k] = patch[k];
```

In `patchProjectMeta` (line 145, the backing of `PUT /projects/:key`) replace

```js
export async function patchProjectMeta(key, patch = {}) {
  const proj = await ensureProject(key);
```

with

```js
export async function patchProjectMeta(key, patch = {}) {
  // Refuse rather than silently drop: a stale client that still "installs" a pack this way must see it failed.
  if (patch.active_ruleset !== undefined) throw Object.assign(new Error("active_ruleset is retired — install the scan ruleset with PUT /cde/:key/artefacts/ruleset and the naming pack with PUT /cde/:key/artefacts/naming"), { status: 400 });
  const proj = await ensureProject(key);
```

Replace lines 786–825 (from `// Repo root (WebApp/bridge is two levels below it:` through the closing `}` of `projectNamingRuleset`):

```js
// Repo root (WebApp/bridge is two levels below it: WebApp/bridge → WebApp → root). The bridge runs with cwd
// WebApp/ (see server.mjs), so a repo-relative operator path like "config/base-standard/naming-ruleset.json"
// resolves wrong against cwd — anchor non-absolute SENTINEL_* paths here instead.
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const resolveConfigPath = (p) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));

// Swappable container-naming ruleset (bridge/naming-ruleset.json) — the office's ISO 19650 naming convention
// as DATA, not code. Cached; missing/invalid → null (naming gate simply off). A caller may also pass an inline
// ruleset in the propose body to override per-request.
let _naming; // undefined = not yet loaded, null = absent/invalid
function defaultNamingRuleset() {
  if (_naming !== undefined) return _naming;
  // NOTE: `URL` is shadowed in this module (const URL = SUPABASE_URL), so use import.meta.dirname, not new URL().
  const raw = env.SENTINEL_NAMING_RULESET || `${import.meta.dirname}/naming-ruleset.json`;
  const p = env.SENTINEL_NAMING_RULESET ? resolveConfigPath(raw) : raw;
  try {
    const rs = JSON.parse(readFileSync(p, "utf8"));
    _naming = Array.isArray(rs?.fields) && rs.separator ? rs : null;
    if (_naming) console.error("[naming] ruleset:", _naming.title, "| enforce:", _naming.enforce);
  } catch (e) { _naming = null; }
  if (_naming === null)
    console.warn(`[bridge] WARNING: naming ruleset invalid or unreadable (resolved path: ${p}) — naming gate is OFF`);
  return _naming;
}
const resolveNamingRuleset = (inline) =>
  (inline && typeof inline === "object" && Array.isArray(inline.fields)) ? inline : defaultNamingRuleset();

/**
 * The naming ruleset a PROJECT is actually governed by: its installed standards pack's ruleset when
 * one survived (see mergeMeta), else the bridge default. `source` lets a caller report which was used
 * rather than implying the project chose it.
 */
export async function projectNamingRuleset(key) {
  try {
    const meta = await getProjectMeta(key);
    const rs = meta?.active_ruleset;
    if (rs && Array.isArray(rs.fields) && rs.separator) return { ruleset: rs, source: "project" };
  } catch { /* fall through to the bridge default */ }
  return { ruleset: defaultNamingRuleset(), source: "default" };
}
```

with

```js
/** The one sentence every naming judge gives when nothing is installed — the install route included. */
export const NO_NAMING_REASON = "no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)";

/**
 * The naming ruleset a PROJECT is governed by: its `naming` artefact, else its office's, else none.
 * There is no bridge default and no env-var file (cohesion phase 3): `none` is an answer the judges
 * report as not_checkable, never a pilot's pack. `ref`/`sha256` say exactly which version judged.
 * Errors propagate — a resolver failure is an `error`, not a silent "none" (runCheck reports it).
 */
export async function projectNamingRuleset(key, deps = {}) {
  const resolveArtefact = deps.resolveArtefact || (await import("./artefact-store.mjs")).resolveArtefact;
  const r = await resolveArtefact(key, "naming");
  return { ruleset: r.body ?? null, source: r.source, ref: r.ref, sha256: r.sha256 };
}
```

In `adjudicateProposal` replace the naming block (lines 894–905)

```js
  let naming = null;
  if (b.container_name) {
    // The PROJECT's ruleset (its installed standards pack) governs the name — the same source the
    // naming.containers check reads — unless the caller sends one inline. Found live: Governed Publish
    // judged an office's model by the bridge default while its documents were judged by the office's pack.
    const rs = (b.naming && typeof b.naming === "object" && Array.isArray(b.naming.fields)) ? b.naming : (await projectNamingRuleset(key)).ruleset;
    if (rs && rs.enforce !== "off") {
      naming = c.validateContainerName(b.container_name, rs);
      naming.enforce = rs.enforce;
      if (!naming.ok && rs.enforce === "reject") verdict = "rejected";
    }
  }
```

with

```js
  let naming = null, namingProv = { naming_ref: null };
  if (b.container_name) {
    // The project's naming artefact (project → office) governs the name — the same source naming.containers
    // reads. A client-sent ruleset is still honoured (it is the model's own name check) and recorded as
    // "client". Nothing installed → the name is not judged and the verdict row says so (naming_ref null).
    const client = b.naming && typeof b.naming === "object" && Array.isArray(b.naming.fields);
    const named = client ? { ruleset: b.naming, source: "client", ref: "client", sha256: null } : await projectNamingRuleset(key);
    namingProv = { naming_ref: named.ref ?? null, naming_source: named.source, naming_sha256: named.sha256 ?? null, ...(named.ruleset ? {} : { naming_reason: NO_NAMING_REASON }) };
    const rs = named.ruleset;
    if (rs && rs.enforce !== "off") {
      naming = c.validateContainerName(b.container_name, rs);
      naming.enforce = rs.enforce;
      if (!naming.ok && rs.enforce === "reject") verdict = "rejected";
    }
  }
```

In the proposal audit row (line 920) replace

```js
      new_value: { source: b.source ?? null, verdict, summary, note: b.note ?? null, failures: failures.slice(0, 50), naming, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, ...(agent ? { agent } : {}), ...(clientIdsIgnored ? { client_ids_ignored: true } : {}) },
```

with

```js
      new_value: { source: b.source ?? null, verdict, summary, note: b.note ?? null, failures: failures.slice(0, 50), naming, ...namingProv, ids_source: idsSource, ids_ref: resolved.ref, ids_sha256: resolved.sha256, ...(agent ? { agent } : {}), ...(clientIdsIgnored ? { client_ids_ignored: true } : {}) },
```

Replace the version-verdict call (line 928)

```js
  if (b.version_id) await recordVersionVerdict(key, b.version_id, { verdict, summary, failures, naming, warned, agent, ids_ref: resolved.ref }, trustedActor);
```

with

```js
  if (b.version_id) await recordVersionVerdict(key, b.version_id, { verdict, summary, failures, naming, warned, agent, ids_ref: resolved.ref, naming_ref: namingProv.naming_ref }, trustedActor);
```

In the returned object (line 930) replace

```js
    verdict, summary, ...selectFailures(failures, b.failures_requirement), naming, warned,
```

with

```js
    verdict, summary, ...selectFailures(failures, b.failures_requirement), naming, ...namingProv, warned,
```

In `recordVersionVerdict` (line 949) replace

```js
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, ...(r.agent ? { agent: r.agent } : {}) },
```

with

```js
      new_value: { ids: r.summary?.ids, summary: r.summary, failures: (r.failures || []).slice(0, 20), naming: r.naming ?? null, warned: !!r.warned, ids_ref: r.ids_ref ?? null, naming_ref: r.naming_ref ?? null, ...(r.agent ? { agent: r.agent } : {}) },
```

- [ ] **Step 4: `check-registry.mjs` — `naming.containers` names the artefact, none is not_checkable**

Replace the import (line 11)

```js
import { listFiles, getProjectMeta, listAudit, projectNamingRuleset, listTransmittals } from "./cde-store.mjs";
```

with

```js
import { listFiles, getProjectMeta, listAudit, projectNamingRuleset, listTransmittals, NO_NAMING_REASON } from "./cde-store.mjs";
import { refLabel } from "./artefact-store.mjs";
```

(`artefact-store.mjs` has only `node:crypto` as a static import, so this adds no cycle.)

Replace `classifyNaming` (lines 41–54)

```js
export function classifyNaming(files, ruleset, source, validate = defaultValidateContainerName) {
  const id = "naming.containers", label = "Container naming";
  if (!ruleset) return result(id, label, "not_checkable", { reason: "No naming ruleset is configured for this bridge or project, so container names cannot be checked." });
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const which = source === "project" ? "the project's ruleset" : "the bridge default ruleset";
```

with

```js
/** `named` is projectNamingRuleset's answer: { ruleset, source, ref, sha256 }. */
export function classifyNaming(files, named, validate = defaultValidateContainerName) {
  const id = "naming.containers", label = "Container naming";
  const ruleset = named?.ruleset ?? null;
  if (!ruleset) return result(id, label, "not_checkable", { reason: NO_NAMING_REASON });
  if (!files.length) return result(id, label, "not_checkable", { reason: "This project has no containers yet — nothing to check." });
  const which = refLabel(named);
```

(the two summary lines below it are unchanged: they already print `` `… fail ${which} (“${ruleset.title}”).` `` and `` `… satisfy ${which} (“${ruleset.title}”).` ``, so the summary becomes `… satisfy naming@2 · office · 3f07376abcde… (“Title”).`)

Replace the `naming.containers` run (lines 416–419)

```js
    async run(key) {
      const [files, { ruleset, source }, c] = await Promise.all([listFiles(key), projectNamingRuleset(key), core()]);
      return classifyNaming(files, ruleset, source, c.validateContainerName);
    },
```

with

```js
    async run(key) {
      const [files, named, c] = await Promise.all([listFiles(key), projectNamingRuleset(key), core()]);
      return classifyNaming(files, named, c.validateContainerName);
    },
```

and its description line `description: "Every information container's name satisfies the project's ISO 19650 naming ruleset.",` with `description: "Every information container's name satisfies the naming standard installed on the project or its office.",`.

- [ ] **Step 5: The bridge file leaves the bridge; data made installable; references follow it**

```bash
git mv WebApp/bridge/naming-ruleset.json demo/bds-pilot/bds-naming-ruleset.json
```

In `demo/bds-pilot/bds-naming-ruleset.json` replace

```json
{
  "title": "BDS ISO 19650 container naming (V1.4, 11-field)",
```

with

```json
{
  "standard_key": "bds-iso19650-naming",
  "semver": "1.4.0",
  "title": "BDS ISO 19650 container naming (V1.4, 11-field)",
```

In `config/base-standard/naming-ruleset.json` replace

```json
{
  "title": "Base ISO 19650 container naming (generic)",
```

with

```json
{
  "standard_key": "base-iso19650-naming",
  "semver": "1.0.0",
  "title": "Base ISO 19650 container naming (generic)",
```

In `WebApp/src/sentinel-core/base-standard.test.ts` replace

```ts
const bdsNaming: NamingRuleset = JSON.parse(readFileSync(resolve(root, "WebApp/bridge/naming-ruleset.json"), "utf8"));
```

with

```ts
const bdsNaming: NamingRuleset = JSON.parse(readFileSync(resolve(root, "demo/bds-pilot/bds-naming-ruleset.json"), "utf8"));
```

and

```ts
  it("real bridge naming-ruleset.json is well-formed (regression net for silent gate-off)", () => {
```

with

```ts
  it("the pilot's naming pack (demo data) is well-formed", () => {
```

In `WebApp/src/sentinel-core/naming.test.ts` (line 4) replace

```ts
// A compact BDS-style 11-field ruleset (mirrors bridge/naming-ruleset.json) for unit tests.
```

with

```ts
// A compact BDS-style 11-field ruleset (mirrors demo/bds-pilot/bds-naming-ruleset.json) for unit tests.
```

In `SentinelAddin/Resources/bds-guideline.json` replace

```json
    "naming": "WebApp/bridge/naming-ruleset.json"
```

with

```json
    "naming": "demo/bds-pilot/bds-naming-ruleset.json"
```

In `config/base-standard/README.md` replace

```md
- **naming-ruleset.json** — container naming fields, read by the bridge
  (`SENTINEL_NAMING_RULESET`) to validate delivered file names.
```

with

```md
- **naming-ruleset.json** — container naming fields, installed as the project's
  (or office's) `naming` artefact; every naming judge reads it from there.
```

and

```md
4. For the naming ruleset, point the bridge: `SENTINEL_NAMING_RULESET=config/<office>-standard/naming-ruleset.json` in `config/.env`.
```

with

```md
4. Install the naming ruleset on the office (its projects inherit it) or on a project: `node bridge/artefact-import.mjs config/<office>-standard/naming-ruleset.json --project <key> --kind naming`. With nothing installed, naming checks report not checkable — there is no bridge default.
```

In `docs/BDS_GATE_CONFIG.md` replace

```md
**Active config file:** `WebApp/bridge/naming-ruleset.json` (the BDS pilot ruleset, bundled with the bridge)
```

with

```md
**Source:** the project's `naming` artefact, else its office's (`GET /cde/:key/artefacts/naming`); none installed → the naming checks are not checkable. The pilot's pack is data at `demo/bds-pilot/bds-naming-ruleset.json`.
```

```md
**To use a different ruleset:** set `SENTINEL_NAMING_RULESET=/path/to/ruleset.json` in `config/.env`; restart the bridge. Example: to use the Base template, point to `config/base-standard/naming-ruleset.json`.
```

with

```md
**To use a different ruleset:** install it: `node bridge/artefact-import.mjs <naming.json> --project <key> --kind naming` (a new `naming@n`; no restart). Example: the Base template is `config/base-standard/naming-ruleset.json`.
```

```md
| **Swap naming ruleset to Base template** | set `SENTINEL_NAMING_RULESET=config/base-standard/naming-ruleset.json` in `config/.env`; restart the bridge |
```

with

```md
| **Swap naming ruleset to Base template** | `node bridge/artefact-import.mjs config/base-standard/naming-ruleset.json --project <key> --kind naming` |
```

```md
| **Loosen naming to advisory** | set `"enforce": "warn"` (or `"off"`) in `WebApp/bridge/naming-ruleset.json` (or the env-var-pointed file), restart |
```

with

```md
| **Loosen naming to advisory** | set `"enforce": "warn"` (or `"off"`) in the naming JSON and install it again (`--kind naming`) |
```

and in the "Override a spec per-request" row replace `a caller may pass an inline \`naming\` ruleset in the propose body to override the on-disk default for that request only.` with `a caller may pass an inline \`naming\` ruleset in the propose body; it judges that request and the verdict records \`naming_ref: "client"\`.`

- [ ] **Step 6: Run the tests and the leftovers check**

Run: `cd WebApp && npx vitest run bridge/cde-store.test.mjs bridge/check-registry.test.mjs src/sentinel-core/base-standard.test.ts`
Expected: PASS.

Run: `grep -rn "naming-ruleset.json\|SENTINEL_NAMING_RULESET\|defaultNamingRuleset\|resolveNamingRuleset" WebApp/bridge WebApp/src --include=*.mjs --include=*.ts`
Expected: only the `config/base-standard/naming-ruleset.json` reads in `check-registry.test.mjs` and `base-standard.test.ts`, and the data-as-config remark in `src/sentinel-core/naming.ts:5` (no bridge file path, no env var).

Run: `cd WebApp && npm test`
Expected: PASS (federation-store and bimdocs-ai tests still inject the old `projectNamingRuleset` shape and still pass; Task 4 moves them).

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/cde-store.test.mjs WebApp/bridge/check-registry.mjs WebApp/bridge/check-registry.test.mjs demo/bds-pilot/bds-naming-ruleset.json config/base-standard/naming-ruleset.json config/base-standard/README.md WebApp/src/sentinel-core/base-standard.test.ts WebApp/src/sentinel-core/naming.test.ts SentinelAddin/Resources/bds-guideline.json docs/BDS_GATE_CONFIG.md
git commit -m "feat(bridge): container naming judges by the naming artefact — bridge naming file and SENTINEL_NAMING_RULESET gone, none is not checkable, /propose records naming_ref, active_ruleset refused on PUT /projects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Federation FG-02 and the bimdocs grounding read through the resolver and name what judged

**Files:**
- Modify: `WebApp/bridge/federation-store.mjs` (lines 1–39 wiring and `typeRuleFor`; lines 54–59 and 69 in `runFederation`)
- Modify: `WebApp/bridge/bimdocs-ai.mjs` (imports line 10; `assembleGrounding` line 38)
- Modify: `WebApp/bridge/bimdocs-ai-logic.mjs:20` (field keys in the naming fact — real naming fields are objects)
- Test: `WebApp/bridge/federation-store.test.mjs`, `WebApp/bridge/bimdocs-ai.test.mjs`
- Read for reference: `WebApp/src/sentinel-core/federation.ts:70-99` (FG-02: `reason = "no type rule installed — naming shapes compared only"` when no type rule), `:184-200` (FG-06 uses `naming_ruleset`).

**Interfaces:**
- Consumes: `resolveArtefact(key, kind, deps)`, `refLabel(r)` (Task 1); `projectNamingRuleset(key)` (Task 3).
- Produces: `runFederation` deps take `resolveArtefact` (the `getArtefact` and `projectNamingRuleset` deps are gone); the stored run carries `ruleset_ref`, `naming_ref` (`refLabel` string or `null`); the `FG-02` check carries `refs: { ruleset, naming }` and, per missing kind, a warning `no <kind> installed for this project or its office (PUT /cde/:key/artefacts/<kind>) — …`; the federation audit row carries `ruleset_ref`, `naming_ref`. `buildGrounding` receives `rulesetSource` = `refLabel(named)` | `"none"` | `"unknown"` (resolver threw).

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/federation-store.test.mjs` replace

```js
import { runFederation, getFederation } from "./federation-store.mjs";
```

with

```js
import { runFederation, getFederation } from "./federation-store.mjs";
import { refLabel } from "./artefact-store.mjs";

const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };
```

In `memDeps` replace

```js
    projectNamingRuleset: async () => ({ ruleset: null }),
    getArtefact: async () => null,
```

with

```js
    resolveArtefact: async () => NONE,
```

Replace the test `"uses the project's type rule from the ruleset artefact when installed"` with

```js
  it("uses the type rule from the resolved ruleset artefact and names it on the run, FG-02 and the audit row", async () => {
    const d = memDeps({ manifests: { "v-1": { ...mA, elements: [{ guid: "g1", class: "IFCWALL", type_name: "ZZZ_EXT_CMU_200 mm", storey: null }] }, "v-2": { ...mA, elements: [{ guid: "g2", class: "IFCWALL", type_name: "Wall 1", storey: null }] } } });
    const rs = { body: { standard_key: "k", semver: "1.0.0", org: "ZZZ", rules: [{ id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "LOC", "MATERIAL", "SIZE"], token_defs: { ORG: "{org}", LOC: "EXT|INT", MATERIAL: "[A-Z0-9]+", SIZE: "\\d+ mm" }, separator: "_", message_en: "x" }] }, source: "office", ref: "ruleset@2", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false };
    d.resolveArtefact = async (key, kind) => kind === "ruleset" ? rs : NONE;
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.type_rule).toBe("TN-01");
    expect(run.ruleset_ref).toBe(refLabel(rs));
    expect(run.ruleset_ref).toContain("ruleset@2 · office · 3f07376abcde");
    expect(run.naming_ref).toBeNull();
    const fg02 = run.result.checks.find((c) => c.id === "FG-02");
    expect(fg02.evidence).toContainEqual({ model: "B-0102.ifc", type_name: "Wall 1", rule: "TN-01" });
    expect(fg02.refs).toEqual({ ruleset: run.ruleset_ref, naming: null });
    expect(d.audits[0].newv).toMatchObject({ ruleset_ref: run.ruleset_ref, naming_ref: null });
  });
  it("with nothing installed FG-02 names neither ref and says how to install each", async () => {
    const d = memDeps();
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    const fg02 = run.result.checks.find((c) => c.id === "FG-02");
    expect(run).toMatchObject({ ruleset_ref: null, naming_ref: null, type_rule: null });
    expect(fg02.refs).toEqual({ ruleset: null, naming: null });
    expect(fg02.reason).toContain("naming shapes compared only");
    expect(fg02.warnings.join(" ")).toContain("no ruleset installed for this project or its office (PUT /cde/:key/artefacts/ruleset)");
    expect(fg02.warnings.join(" ")).toContain("no naming installed for this project or its office (PUT /cde/:key/artefacts/naming)");
  });
  it("judges container names by the resolved naming artefact and names it", async () => {
    const d = memDeps();
    const nm = { body: { standard_key: "k", semver: "1.0.0", title: "Two-part", separator: "-", enforce: "reject", strip_extensions: [".ifc"], fields: [{ key: "disc", label: "Discipline", enum: ["A"] }, { key: "num", label: "Number", pattern: "[0-9]{4}" }] }, source: "project", ref: "naming@1", sha256: "a1b2c3d4e5f60718293a4b5c", pointer_sha_mismatch: false };
    d.resolveArtefact = async (key, kind) => kind === "naming" ? nm : NONE;
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.naming_ruleset).toBe("Two-part");
    expect(run.naming_ref).toContain("naming@1 · project · a1b2c3d4e5f6");
    const fg06 = run.result.checks.find((c) => c.id === "FG-06");
    expect(fg06.status).toBe("fail");
    expect(fg06.evidence.map((e) => e.model)).toEqual(["B-0102.ifc"]);
  });
```

In `WebApp/bridge/bimdocs-ai.test.mjs` replace

```js
import { draftSection, integrityReport, MAX_INTEGRITY_CHARS } from "./bimdocs-ai.mjs";
```

with

```js
import { draftSection, integrityReport, MAX_INTEGRITY_CHARS } from "./bimdocs-ai.mjs";
import { refLabel } from "./artefact-store.mjs";
```

and add inside `describe("draftSection", …)` after the `"passes provider/model through to chat"` test

```js
  it("grounds the naming fact on the artefact that is in force — ref · source · sha — and its field keys", async () => {
    const chat = vi.fn(async () => ({ text: '{"body":"x"}', provider: "local", model: "m" }));
    const deps = baseDeps(chat);
    const named = { ruleset: { title: "T", separator: "-", fields: [{ key: "project", label: "Project" }, { key: "originator", label: "Originator" }] }, source: "office", ref: "naming@2", sha256: "3f07376abcdef0123456789" };
    deps.projectNamingRuleset = vi.fn(async () => named);
    await draftSection("demo", "d1", "s2", {}, deps);
    const prompt = chat.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain(`The active naming ruleset (${refLabel(named)})`);
    expect(prompt).toContain("naming@2 · office");
    expect(prompt).toContain("fields: project-originator");
  });

  it("states no naming fact when none is installed", async () => {
    const chat = vi.fn(async () => ({ text: '{"body":"x"}', provider: "local", model: "m" }));
    const deps = baseDeps(chat);
    deps.projectNamingRuleset = vi.fn(async () => ({ ruleset: null, source: "none", ref: null, sha256: null }));
    await draftSection("demo", "d1", "s2", {}, deps);
    expect(chat.mock.calls[0][0].messages[0].content).not.toMatch(/naming ruleset/i);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/federation-store.test.mjs bridge/bimdocs-ai.test.mjs`
Expected: FAIL — `runFederation` still wires `projectNamingRuleset`/`getArtefact` (no `resolveArtefact` dep: it imports the real `cde-store` and calls the missing dep → `d.projectNamingRuleset is not a function` or a network error), `run.ruleset_ref` is undefined; the grounding prompt says `(office)` and `fields: [object Object]-[object Object]`.

- [ ] **Step 3: `federation-store.mjs` — both standards through the resolver**

Replace lines 1–39 (from the header comment through the closing `}` of `typeRuleFor`)

```js
// The Federation Gate on the bridge: resolve the project's federated set (live model versions), load
// each manifest and verdict, judge with the pure core, keep the latest run, write the audit row. BCF
// topics are the route's job (they need the SSE broadcast). Deps-injected like changesets-store.
export const STORE = "federation";

async function wire(deps = {}) {
  const need = ["ensureProject", "docGet", "docUpsert", "audit", "versionVerdicts", "projectNamingRuleset"];
  const cde = need.every((n) => deps[n]) ? null : await import("./cde-store.mjs");
  const ms = deps.listManifests && deps.getManifest ? null : await import("./manifest-store.mjs");
  const art = deps.getArtefact ? null : await import("./artefact-store.mjs");
  const core = deps.checkFederation ? null : await import("./sentinel-core.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    docUpsert: deps.docUpsert || cde.docUpsert,
    audit: deps.audit || cde.audit,
    versionVerdicts: deps.versionVerdicts || cde.versionVerdicts,
    projectNamingRuleset: deps.projectNamingRuleset || cde.projectNamingRuleset,
    listManifests: deps.listManifests || ms.listManifests,
    getManifest: deps.getManifest || ms.getManifest,
    getArtefact: deps.getArtefact || art.getArtefact,
    checkFederation: deps.checkFederation || core.checkFederation,
  };
}

/** The project's type-naming rule: the ruleset artefact when installed, else the pack in
 *  projects.metadata.active_ruleset, else none (FG-02 then compares naming shapes only). */
async function typeRuleFor(key, d) {
  let rules = null, org = null;
  const a = await d.getArtefact(key, "ruleset").catch(() => null);
  if (a?.body && Array.isArray(a.body.rules)) { rules = a.body.rules; org = a.body.org ?? null; }
  else {
    const proj = await d.ensureProject(key);
    const rs = proj?.metadata?.active_ruleset;
    if (rs && Array.isArray(rs.rules)) { rules = rs.rules; org = rs.org ?? null; }
  }
  const rule = (rules || []).find((r) => r && r.target === "type" && Array.isArray(r.tokens) && r.tokens.length) || null;
  return { rule, org };
}
```

with

```js
// The Federation Gate on the bridge: resolve the project's federated set (live model versions), load
// each manifest and verdict, judge with the pure core, keep the latest run, write the audit row. BCF
// topics are the route's job (they need the SSE broadcast). Deps-injected like changesets-store.
import { refLabel } from "./artefact-store.mjs";

export const STORE = "federation";

async function wire(deps = {}) {
  const need = ["ensureProject", "docGet", "docUpsert", "audit", "versionVerdicts"];
  const cde = need.every((n) => deps[n]) ? null : await import("./cde-store.mjs");
  const ms = deps.listManifests && deps.getManifest ? null : await import("./manifest-store.mjs");
  const art = deps.resolveArtefact ? null : await import("./artefact-store.mjs");
  const core = deps.checkFederation ? null : await import("./sentinel-core.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    docGet: deps.docGet || cde.docGet,
    docUpsert: deps.docUpsert || cde.docUpsert,
    audit: deps.audit || cde.audit,
    versionVerdicts: deps.versionVerdicts || cde.versionVerdicts,
    listManifests: deps.listManifests || ms.listManifests,
    getManifest: deps.getManifest || ms.getManifest,
    resolveArtefact: deps.resolveArtefact || art.resolveArtefact,
    checkFederation: deps.checkFederation || core.checkFederation,
  };
}

/** What judged, as the one display string every judge uses; null when nothing is installed. */
const labelOf = (r) => (r && r.source !== "none" && r.body ? refLabel(r) : null);
const notInstalled = (kind, effect) => `no ${kind} installed for this project or its office (PUT /cde/:key/artefacts/${kind}) — ${effect}`;
```

In `runFederation` replace (lines 54–55)

```js
  const naming = (await d.projectNamingRuleset(key))?.ruleset ?? null;
  const { rule, org } = await typeRuleFor(key, d);
  const result = d.checkFederation(models, { type_rule: rule, org, naming_ruleset: naming, verdicts });
```

with

```js
  // Both standards come through the artefact resolver (project → office → none), never a metadata slot:
  // the type rule (target "type", the TN family) from `ruleset`, the container-name shape from `naming`.
  const [rs, nm] = await Promise.all([d.resolveArtefact(key, "ruleset"), d.resolveArtefact(key, "naming")]);
  const naming = nm?.body ?? null;
  const rule = (Array.isArray(rs?.body?.rules) ? rs.body.rules : []).find((r) => r && r.target === "type" && Array.isArray(r.tokens) && r.tokens.length) || null;
  const org = rs?.body?.org ?? null;
  const result = d.checkFederation(models, { type_rule: rule, org, naming_ruleset: naming, verdicts });
  const refs = { ruleset: labelOf(rs), naming: labelOf(nm) };
  const fg02 = result.checks.find((c) => c.id === "FG-02");
  if (fg02) {
    fg02.refs = refs;
    if (!refs.ruleset) fg02.warnings.push(notInstalled("ruleset", "no type rule applied, naming shapes compared only"));
    if (!refs.naming) fg02.warnings.push(notInstalled("naming", "container names not judged (FG-06)"));
  }
```

Replace (line 59)

```js
    at: new Date().toISOString(), actor, type_rule: rule?.id ?? null, naming_ruleset: naming?.title ?? null,
```

with

```js
    at: new Date().toISOString(), actor, type_rule: rule?.id ?? null, naming_ruleset: naming?.title ?? null,
    ruleset_ref: refs.ruleset, naming_ref: refs.naming,
```

Replace in the audit call (line 69)

```js
    verdict: result.verdict, models: run.set,
```

with

```js
    verdict: result.verdict, models: run.set, ruleset_ref: refs.ruleset, naming_ref: refs.naming,
```

- [ ] **Step 4: bimdocs grounding names the ref**

In `WebApp/bridge/bimdocs-ai.mjs` replace

```js
import { buildGrounding, buildDraftPrompt, buildIntegrityPrompt, parseDraft, parseFindings } from "./bimdocs-ai-logic.mjs";
```

with

```js
import { buildGrounding, buildDraftPrompt, buildIntegrityPrompt, parseDraft, parseFindings } from "./bimdocs-ai-logic.mjs";
import { refLabel } from "./artefact-store.mjs";
```

and in `assembleGrounding` replace

```js
    ruleset: naming.ruleset, rulesetSource: naming.source,
```

with

```js
    // The fact names the version in force (naming@2 · office · sha…); "none" / "unknown" add no fact.
    ruleset: naming.ruleset, rulesetSource: naming.ruleset ? refLabel(naming) : naming.source === "unknown" ? "unknown" : "none",
```

In `WebApp/bridge/bimdocs-ai-logic.mjs` (line 20) replace

```js
    const fields = Array.isArray(ruleset.fields) ? ruleset.fields.join("-") : null;
```

with

```js
    // Real naming fields are objects ({ key, label, … }); the logic tests use bare strings — accept both.
    const fields = Array.isArray(ruleset.fields) ? ruleset.fields.map((f) => f?.key ?? f).join("-") : null;
```

- [ ] **Step 5: Run the tests**

Run: `cd WebApp && npx vitest run bridge/federation-store.test.mjs bridge/bimdocs-ai.test.mjs bridge/bimdocs-ai-logic.test.mjs`
Expected: PASS.

Run: `grep -n "active_ruleset\|getArtefact\|projectNamingRuleset" WebApp/bridge/federation-store.mjs`
Expected: no output.

Run: `cd WebApp && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/federation-store.mjs WebApp/bridge/federation-store.test.mjs WebApp/bridge/bimdocs-ai.mjs WebApp/bridge/bimdocs-ai.test.mjs WebApp/bridge/bimdocs-ai-logic.mjs
git commit -m "feat(federation): FG-02 reads the ruleset and naming artefacts through the resolver and names both refs; none says how to install; bimdocs grounding names the naming ref

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Readiness judges the standard by the artefact — `office.naming_standard`, `project.standards_pack`, the snapshot's ruleset ref

**Files:**
- Modify: `WebApp/bridge/check-registry.mjs` (import added in Task 3; `classifyPack` lines 119–124; `project.standards_pack` entry lines 459–465)
- Modify: `WebApp/bridge/office-checks.mjs` (imports lines 5; `office.naming_standard` lines 176–177)
- Modify: `WebApp/bridge/office-store.mjs` (`validateSnapshot` lines 61–65; `saveSnapshot` audit line 115)
- Modify: `WebApp/bridge/bimdocs-store.mjs:394` (readiness evidence carries the snapshot's ruleset identity)
- Modify: `WebApp/bridge/readiness-logic.mjs:100-102` (the "Office snapshot" evidence line)
- Test: `WebApp/bridge/check-registry.test.mjs`, `WebApp/bridge/office-checks.test.mjs`, `WebApp/bridge/office-store.test.mjs`, `WebApp/bridge/readiness-logic.test.mjs`

**Interfaces:**
- Consumes: `resolveArtefact(key, kind)`, `refLabel({ ref, source, sha256 })` (Task 1) — `refLabel` is called with `sha256: null` for a snapshot that sent a ref without a sha, so it must omit the sha segment then.
- Produces: `classifyStandard(resolved, kind, id, label, displayName?) → result` (exported from `check-registry.mjs`): met with `summary` `"<displayName>: <refLabel>."` and `evidence: [{ label: kind, detail: refLabel(resolved) }]`; nothing installed → `violations` with `evidence: [{ label: kind, detail: "not installed — PUT /cde/:key/artefacts/<kind>" }]`. `classifyPack(resolved, displayName) = classifyStandard(resolved, "ruleset", "project.standards_pack", "Standards pack selected", displayName)` (signature changes from `classifyPack(packId)`). Snapshot `ruleset` block: `{ org, rules, standard_key?, semver?, ref?, sha256? }` (the optional four stored only when sent). Readiness evidence `snapshot.ruleset: { standard_key, semver, ref, sha256 } | null`.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/check-registry.test.mjs` add `classifyStandard` to the import list:

```js
  classifyGate, classifyPack, classifyVerdicts, classifyDeliverables,
```

becomes

```js
  classifyGate, classifyPack, classifyStandard, classifyVerdicts, classifyDeliverables,
```

and replace the `describe("classifyPack", …)` block

```js
describe("classifyPack", () => {
  it("met when a pack is selected", () => {
    const r = classifyPack("bds-house@1.4.1");
    expect(r.status).toBe("met");
    expect(r.summary).toContain("bds-house@1.4.1");
  });

  it("violations when none is selected", () => {
    expect(classifyPack("").status).toBe("violations");
    expect(classifyPack(undefined).status).toBe("violations");
  });
});
```

with

```js
describe("classifyPack — judged by the ruleset artefact; the metadata name is a display name only", () => {
  const office = { body: { standard_key: "k", semver: "1.0.0", rules: [{ id: "R1", target: "type", mode: "warn" }] }, source: "office", ref: "ruleset@1", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false };
  const none = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };

  it("met naming ref · source · sha as evidence, with the display name in the summary", () => {
    const r = classifyPack(office, "house-pack@1.4.1");
    expect(r).toMatchObject({ id: "project.standards_pack", label: "Standards pack selected", status: "met" });
    expect(r.summary).toContain("house-pack@1.4.1");
    expect(r.evidence).toEqual([{ label: "ruleset", detail: refLabel(office) }]);
    expect(r.evidence[0].detail).toContain("ruleset@1 · office · 3f07376abcde");
  });

  it("a display name alone is not a standard: nothing installed → violations naming the install route", () => {
    const r = classifyPack(none, "house-pack@1.4.1");
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toBe("not installed — PUT /cde/:key/artefacts/ruleset");
  });

  it("classifyStandard keeps the caller's id and label", () => {
    const r = classifyStandard(none, "naming", "office.naming_standard", "Container naming standard installed");
    expect(r).toMatchObject({ id: "office.naming_standard", label: "Container naming standard installed", status: "violations" });
  });
});
```

In `WebApp/bridge/office-checks.test.mjs` replace

```js
vi.mock("./office-store.mjs", () => ({ getSnapshot: vi.fn(async () => null), getScan: vi.fn(async () => null) }));
```

with

```js
vi.mock("./office-store.mjs", () => ({ getSnapshot: vi.fn(async () => null), getScan: vi.fn(async () => null) }));
const { resolveArtefact } = vi.hoisted(() => ({ resolveArtefact: vi.fn() }));
vi.mock("./artefact-store.mjs", async (importOriginal) => ({ ...(await importOriginal()), resolveArtefact }));
```

and add before `describe("runCheck over an office scope", …)`

```js
describe("office.naming_standard — judged by the naming artefact (project → office)", () => {
  const check = () => OFFICE_CHECKS.find((c) => c.id === "office.naming_standard");
  it("met with evidence naming@n · source · sha when the office has one", async () => {
    resolveArtefact.mockResolvedValueOnce({ body: { title: "T" }, source: "office", ref: "naming@1", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false });
    const r = await check().run("aster-villa");
    expect(resolveArtefact).toHaveBeenCalledWith("aster-villa", "naming");
    expect(r).toMatchObject({ id: "office.naming_standard", label: "Container naming standard installed", status: "met" });
    expect(r.evidence[0].detail).toContain("naming@1 · office · 3f07376abcde");
  });
  it("violations naming the install route when nothing is installed", async () => {
    resolveArtefact.mockResolvedValueOnce({ body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false });
    const r = await check().run("aster-villa");
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toBe("not installed — PUT /cde/:key/artefacts/naming");
  });
});
```

In `WebApp/bridge/office-store.test.mjs` add inside `describe("validateSnapshot — names the field, stores nothing partial", …)` after the `"accepts a good snapshot and normalises counts"` test

```js
  it("keeps the ruleset's standard_key/semver and the artefact ref/sha256 when the add-in sends them, and only then", () => {
    const s = goodSnapshot();
    Object.assign(s.ruleset, { standard_key: "house-std", semver: "1.4.1", ref: "ruleset@3", sha256: "3f07376abcdef0123456789" });
    expect(validateSnapshot(s).ruleset).toMatchObject({ org: "XXX", standard_key: "house-std", semver: "1.4.1", ref: "ruleset@3", sha256: "3f07376abcdef0123456789" });
    const bare = validateSnapshot(goodSnapshot()).ruleset;
    expect(Object.keys(bare).sort()).toEqual(["org", "rules"]);
    const bad = goodSnapshot(); bad.ruleset.ref = 3;
    expect(() => validateSnapshot(bad)).toThrow(/ruleset\.ref/);
  });
```

In `WebApp/bridge/readiness-logic.test.mjs` add inside `describe("readinessMarkdown — the report a consultant hands over, three numbers never blended", …)` after its first `it`

```js
  it("names the snapshot's ruleset and the artefact it was taken against on the evidence line", () => {
    const r = report();
    r.evidence.snapshot.ruleset = { standard_key: "house-std", semver: "1.4.1", ref: "ruleset@3", sha256: "3f07376abcdef0123456789" };
    expect(readinessMarkdown(r)).toContain("ruleset house-std 1.4.1 · ruleset@3 · snapshot · 3f07376abcde");
    const plain = readinessMarkdown(report());
    expect(plain).not.toContain("ruleset ");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd WebApp && npx vitest run bridge/check-registry.test.mjs bridge/office-checks.test.mjs bridge/office-store.test.mjs bridge/readiness-logic.test.mjs`
Expected: FAIL — `classifyStandard` is not exported; `classifyPack(office, …)` is `met` with summary `Standards pack: [object Object].` and no evidence; `office.naming_standard` calls `getProjectMeta` (never `resolveArtefact`); the snapshot drops `standard_key`/`semver`/`ref`/`sha256`; the readiness line has no ruleset.

- [ ] **Step 3: `check-registry.mjs` — the standards pack is the ruleset artefact**

Replace the import added in Task 3

```js
import { refLabel } from "./artefact-store.mjs";
```

with

```js
import { refLabel, resolveArtefact } from "./artefact-store.mjs";
```

Replace `classifyPack` (lines 119–124)

```js
export function classifyPack(packId) {
  const id = "project.standards_pack", label = "Standards pack selected";
  return packId
    ? result(id, label, "met", { summary: `Standards pack: ${packId}.` })
    : result(id, label, "violations", { count: 1, summary: "No standards pack is selected for this project.", evidence: [{ label: "standards_pack", detail: "not set" }] });
}
```

with

```js
/** Is a standard of `kind` in force for the project? Judged by the artefact resolver (project → office),
 *  never by a metadata display name. Met names ref · source · sha; nothing installed is a violation that
 *  names the install route (the question is "is one installed", so its absence is measured, not unknown). */
export function classifyStandard(resolved, kind, id, label, displayName = "") {
  if (!resolved || resolved.source === "none" || !resolved.body)
    return result(id, label, "violations", { count: 1, summary: `No ${kind} standard is installed for this project or its office.`, evidence: [{ label: kind, detail: `not installed — PUT /cde/:key/artefacts/${kind}` }] });
  const ref = refLabel(resolved);
  return result(id, label, "met", { summary: `${displayName ? `${displayName}: ` : ""}${ref}.`, evidence: [{ label: kind, detail: ref }] });
}

/** project.standards_pack: the scan ruleset artefact; metadata.standards_pack is shown as its name only. */
export const classifyPack = (resolved, displayName) => classifyStandard(resolved, "ruleset", "project.standards_pack", "Standards pack selected", displayName);
```

Replace the `project.standards_pack` entry (lines 459–465, `{` through `},`)

```js
  {
    id: "project.standards_pack",
    label: "Standards pack selected",
    description: "The project has an installed standards pack driving its rules.",
    params_schema: {},
    async run(key) { return classifyPack((await getProjectMeta(key)).standards_pack); },
  },
```

with

```js
  {
    id: "project.standards_pack",
    label: "Standards pack selected",
    description: "A scan ruleset artefact is in force for the project or its office.",
    params_schema: {},
    async run(key) {
      const [resolved, meta] = await Promise.all([resolveArtefact(key, "ruleset"), getProjectMeta(key)]);
      return classifyPack(resolved, meta.standards_pack);
    },
  },
```

- [ ] **Step 4: `office-checks.mjs` — `office.naming_standard` by the naming artefact**

Replace (line 5)

```js
import { getProjectMeta, sb, ensureProject } from "./cde-store.mjs";
```

with

```js
import { sb, ensureProject } from "./cde-store.mjs";
import { resolveArtefact } from "./artefact-store.mjs";
```

Replace (lines 176–177)

```js
  { id: "office.naming_standard", label: "Container naming standard installed", description: "A standards pack is selected for the project (delegates to project.standards_pack).", params_schema: {},
    async run(key) { const reg = await import("./check-registry.mjs"); const r = reg.classifyPack((await getProjectMeta(key)).standards_pack); return { ...r, id: "office.naming_standard", label: "Container naming standard installed" }; } },
```

with

```js
  { id: "office.naming_standard", label: "Container naming standard installed", description: "A container naming standard (the naming artefact) is in force for the project or its office.", params_schema: {},
    async run(key) { const reg = await import("./check-registry.mjs"); return reg.classifyStandard(await resolveArtefact(key, "naming"), "naming", "office.naming_standard", "Container naming standard installed"); } },
```

- [ ] **Step 5: The snapshot keeps its ruleset identity; the readiness line names it**

In `WebApp/bridge/office-store.mjs` replace (lines 62–65)

```js
  if (b.ruleset !== undefined && b.ruleset !== null) {
    const r = obj(b.ruleset, "ruleset");
    ruleset = { org: str(r.org, "ruleset.org", { optional: true }), rules: arr(r.rules ?? [], "ruleset.rules").map((x, i) => obj(x, `ruleset.rules[${i}]`)) };
  }
```

with

```js
  if (b.ruleset !== undefined && b.ruleset !== null) {
    const r = obj(b.ruleset, "ruleset");
    ruleset = { org: str(r.org, "ruleset.org", { optional: true }), rules: arr(r.rules ?? [], "ruleset.rules").map((x, i) => obj(x, `ruleset.rules[${i}]`)) };
    // Which standard the template was checked against (F13): the pack name/version, and — when the add-in
    // pulled it as an artefact — its ref and sha. Stored only when sent; phase 4 makes the artefact the rule.
    for (const f of ["standard_key", "semver", "ref", "sha256"]) { const v = str(r[f], `ruleset.${f}`, { optional: true, max: 100 }); if (v) ruleset[f] = v; }
  }
```

In `saveSnapshot` (line 115) replace

```js
    { source: stored.source, worksets: stored.pack.worksets.length, shared_parameters: stored.pack.shared_parameters.length, types: stored.catalog.count, org: stored.ruleset?.org ?? null, at: stored.at });
```

with

```js
    { source: stored.source, worksets: stored.pack.worksets.length, shared_parameters: stored.pack.shared_parameters.length, types: stored.catalog.count, org: stored.ruleset?.org ?? null, ruleset_ref: stored.ruleset?.ref ?? null, at: stored.at });
```

In `WebApp/bridge/bimdocs-store.mjs` (line 394) replace

```js
      snapshot: snap ? { source: snap.source, at: snap.at, received_at: snap.received_at } : null,
```

with

```js
      snapshot: snap ? { source: snap.source, at: snap.at, received_at: snap.received_at,
        ruleset: snap.ruleset ? { standard_key: snap.ruleset.standard_key ?? null, semver: snap.ruleset.semver ?? null, ref: snap.ruleset.ref ?? null, sha256: snap.ruleset.sha256 ?? null } : null } : null,
```

In `WebApp/bridge/readiness-logic.mjs` add after the header comment (before `export const PILLARS`)

```js
import { refLabel } from "./artefact-store.mjs";

/** ", ruleset <key> <semver> · <ref · snapshot · sha>" for the snapshot line; empty when the snapshot named none. */
const snapshotRuleset = (rs) => {
  if (!rs || (!rs.standard_key && !rs.ref)) return "";
  const name = [rs.standard_key, rs.semver].filter(Boolean).join(" ");
  const ref = rs.ref ? refLabel({ ref: rs.ref, source: "snapshot", sha256: rs.sha256 ?? null }) : "";
  return `, ruleset ${[name, ref].filter(Boolean).join(" · ")}`;
};
```

and replace (lines 100–102)

```js
  lines.push(evidence?.snapshot
    ? `- Office snapshot: ${evidence.snapshot.source?.title || evidence.snapshot.source?.kind} taken ${String(evidence.snapshot.at).slice(0, 10)}, received ${String(evidence.snapshot.received_at).slice(0, 10)}.`
    : "- Office snapshot: none received.");
```

with

```js
  lines.push(evidence?.snapshot
    ? `- Office snapshot: ${evidence.snapshot.source?.title || evidence.snapshot.source?.kind} taken ${String(evidence.snapshot.at).slice(0, 10)}, received ${String(evidence.snapshot.received_at).slice(0, 10)}${snapshotRuleset(evidence.snapshot.ruleset)}.`
    : "- Office snapshot: none received.");
```

- [ ] **Step 6: Run the tests**

Run: `cd WebApp && npx vitest run bridge/check-registry.test.mjs bridge/office-checks.test.mjs bridge/office-store.test.mjs bridge/readiness-logic.test.mjs`
Expected: PASS.

Run: `grep -n "getProjectMeta\|classifyPack(" WebApp/bridge/office-checks.mjs`
Expected: no output.

Run: `cd WebApp && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add WebApp/bridge/check-registry.mjs WebApp/bridge/check-registry.test.mjs WebApp/bridge/office-checks.mjs WebApp/bridge/office-checks.test.mjs WebApp/bridge/office-store.mjs WebApp/bridge/office-store.test.mjs WebApp/bridge/bimdocs-store.mjs WebApp/bridge/readiness-logic.mjs WebApp/bridge/readiness-logic.test.mjs
git commit -m "feat(readiness): office.naming_standard and project.standards_pack judge by the naming/ruleset artefact with ref · source · sha as evidence; the snapshot keeps its ruleset identity and the readiness line names it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Web — the ruleset is read from the bridge, the bundle is deleted, seed packs are data, a pack install writes artefacts

**Files:**
- Create: `WebApp/src/setups/active-ruleset.test.ts`, `WebApp/bridge/seed-packs.test.mjs`, `WebApp/packs/bds-house.json`, `WebApp/packs/iso-19650-lite.json` (both generated in Step 3 from the files as they stand at `836ec53`)
- Modify: `WebApp/src/setups/active-ruleset.ts` (whole file, 22 lines), `WebApp/src/setups/qa-panel.ts` (:12, :31, :39-41, :71-88, :181-183, :199-200, :273-275), `WebApp/src/setups/project-shell.ts` (:9, :88-100, :124), `WebApp/src/setups/copilot-panel.ts` (:9, :100-107, :117), `WebApp/src/setups/copilot/engine.ts` (:9-11, :26-29, :78, :166-213, :244-246), `WebApp/src/setups/packs-panel.ts` (:5-14, :18-21, :30-31, :54-68, :73, :82, :92-103, :111, :134-141), `WebApp/bridge/bcf-service.mjs` (:139-142 pack store, :739-751 `/packs` GET and publish), `WebApp/src/sentinel-core/index.ts` (:68-72), `WebApp/src/sentinel-core/self-check.ts` (:6-11), `WebApp/bridge/sentinel-core.mjs` (rebuilt, not hand-edited)
- Delete: `WebApp/src/sentinel-core/ruleset.json`
- Read for reference: `WebApp/bridge/artefact-store.mjs` after Task 1 (`validateArtefact`, `refLabel`, and the `GET /cde/:key/artefacts/:kind` answer `{ kind, version, body, source, ref, sha256, pointer_sha_mismatch }`, 404 when none); `WebApp/src/setups/docs-panel.ts:1179-1195` (the existing artefact install and its `?actor=`); `WebApp/package.json` (`build:bridge-core` = esbuild of `src/sentinel-core/bridge-entry.ts`, which does `export * from "./index"`, so the committed bundle carries `bdsRuleset` today at `bridge/sentinel-core.mjs:746` and `:1378`).

**Interfaces:**
- Consumes: `GET /cde/:key/artefacts/:kind` → 200 `{ kind, version, body, source: "project" | "office", ref: "kind@n", sha256, pointer_sha_mismatch }` or 404 (Task 1); `PUT /cde/:key/artefacts/:kind?actor=` → 201 pointer `{ kind, version, sha256, installed_by, installed_at, source }`, 400 naming the bad path, 403 below lead (Task 1 validators, existing route); `validateArtefact(kind, body)` (Task 1).
- Produces, in `WebApp/src/setups/active-ruleset.ts`:
  - `NO_RULESET = "No ruleset installed for this project — install one from Packs"`
  - `interface InForce<T> { body: T; ref: string; source: string; sha256: string | null; installed_by?: string; installed_at?: string }`
  - `refLabel({ ref, source, sha256 }) → string`: the same expression as the bridge's `refLabel` (Task 1), duplicated because the browser cannot import `artefact-store.mjs` (it imports `node:crypto`)
  - `artefactInForce<T>(base, key, kind) → Promise<InForce<T> | null>`: null on 404; throws on any other failure
  - `installArtefact(base, key, kind, body, actor) → Promise<{ kind, version, sha256 }>`: throws with the bridge's message
  - `activeRuleset(base) → Promise<{ ruleset: Ruleset; ref: string; source: string; sha256: string | null } | null>`. This is the shared shape plus `sha256`, so the scan header can name `ref · source · sha`.
- Produces on the bridge: `/packs` GET seeds an empty registry from `WebApp/packs/*.json`, and pack records carry `naming` (publish and seed). `Grounding.ruleset: Ruleset | null` and `Grounding.rulesetRef: string | null` in `copilot/engine.ts`.

- [ ] **Step 1: Write the failing web test**

`WebApp/src/setups/active-ruleset.test.ts`:

```ts
// The web reads the ruleset in force through the bridge; nothing installed is null, never a bundled fallback.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./active-project", () => ({ activePid: () => "aster-villa" }));

import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const rs = { standard_key: "house", semver: "1.0.0", rules: [{ id: "SN-01", target: "sheet", mode: "request" }] };

describe("activeRuleset", () => {
  beforeEach(() => bfetch.mockReset());

  it("reads the artefact the bridge resolved and names ref, source and sha", async () => {
    bfetch.mockResolvedValue(res(200, { body: rs, source: "office", ref: "ruleset@1", sha256: "3f07376a1b2c3d4e5f60", pointer_sha_mismatch: false }));
    const a = await activeRuleset("http://b/");
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/artefacts/ruleset");
    expect(a).toEqual({ ruleset: rs, ref: "ruleset@1", source: "office", sha256: "3f07376a1b2c3d4e5f60" });
    expect(refLabel(a!)).toBe("ruleset@1 · office · 3f07376a1b2c…");
  });

  it("accepts the stored-document shape: the ref comes from the version, the source is the project", async () => {
    bfetch.mockResolvedValue(res(200, { kind: "ruleset", version: 2, sha256: "ab", body: rs, installed_by: "lead@x", installed_at: "2026-09-23T00:00:00Z", source: null }));
    expect(await activeRuleset("http://b")).toEqual({ ruleset: rs, ref: "ruleset@2", source: "project", sha256: "ab" });
  });

  it("is null on 404 — nothing installed on the project or its office", async () => {
    bfetch.mockResolvedValue(res(404, { message: "no ruleset artefact installed for aster-villa or its office" }));
    expect(await activeRuleset("http://b")).toBeNull();
    expect(NO_RULESET).toBe("No ruleset installed for this project — install one from Packs");
  });

  it("throws on a bridge failure instead of reading it as nothing installed", async () => {
    bfetch.mockResolvedValue(res(500, { message: "boom" }));
    await expect(activeRuleset("http://b")).rejects.toThrow("boom");
  });
});

describe("installArtefact", () => {
  beforeEach(() => bfetch.mockReset());

  it("PUTs the body to the kind's route with the actor and returns the pointer", async () => {
    bfetch.mockResolvedValue(res(201, { kind: "naming", version: 3, sha256: "cd" }));
    expect(await installArtefact("http://b", "aster-villa", "naming", { title: "t" }, "lead@x")).toEqual({ kind: "naming", version: 3, sha256: "cd" });
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-villa/artefacts/naming?actor=lead%40x", expect.objectContaining({ method: "PUT", body: JSON.stringify({ title: "t" }) }));
  });

  it("throws the bridge's refusal (validation or role)", async () => {
    bfetch.mockResolvedValue(res(400, { message: "rules[3].mode must be warn | request | monitor | reject" }));
    await expect(installArtefact("http://b", "k", "ruleset", {}, "web")).rejects.toThrow("rules[3].mode");
  });
});
```

Run: `cd WebApp && npx vitest run src/setups/active-ruleset.test.ts`
Expected: FAIL. Either `installArtefact` / `refLabel` / `NO_RULESET` are not exported, or the old module does not load under node, because it imports `../app` for an unused `getAppManager`.

- [ ] **Step 2: `active-ruleset.ts` reads through the bridge and has no fallback**

Replace the whole of `WebApp/src/setups/active-ruleset.ts`, which today is:

```ts
import { bdsRuleset, type Ruleset } from "../sentinel-core";
import { activePid } from "./active-project";
import { getAppManager } from "../app";
import { bfetch } from "./bridge-fetch";

/**
 * Resolves the ruleset the QA scan / gates should enforce for the CURRENT project: the standards pack
 * installed from the marketplace (project.active_ruleset), else the bundled BDS ruleset. This is what
 * makes "install a pack → the platform enforces it" real — every scan-consuming panel calls this.
 */
export async function activeRuleset(baseUrl: string): Promise<Ruleset> {
  const pid = activePid();
  try {
    const p = await (await bfetch(`${baseUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(pid)}`)).json();
    if (p?.active_ruleset?.rules?.length) return p.active_ruleset as Ruleset;
  } catch { /* offline → bundled */ }
  return bdsRuleset;
}
```

(keep `paramNamesOf` as it is), with:

```ts
import type { Ruleset } from "../sentinel-core";
import { activePid } from "./active-project";
import { bfetch } from "./bridge-fetch";

/**
 * The project's standards as the bridge resolves them (artefact store: project → office → none). Every
 * scan-consuming panel calls `activeRuleset`; there is no bundled fallback — nothing installed is said
 * as such and the scan is skipped (honesty rule, cohesion phase 3).
 */

/** What every scan surface says when no ruleset is installed on the project or its office. */
export const NO_RULESET = "No ruleset installed for this project — install one from Packs";

/** One artefact kind in force, as the bridge resolved it. */
export interface InForce<T = unknown> {
  body: T; ref: string; source: string; sha256: string | null;
  installed_by?: string; installed_at?: string;
}

/** "naming@2 · office · 3f0737600a1b…" — the same expression as the bridge's refLabel (artefact-store.mjs),
 *  which the browser cannot import (that module pulls node:crypto). Keep the two identical. */
export const refLabel = ({ ref, source, sha256: sha }: { ref: string | null; source: string; sha256?: string | null }): string =>
  [ref, source, sha && `${sha.slice(0, 12)}…`].filter(Boolean).join(" · ") || "none";

/** GET /cde/:key/artefacts/:kind. 404 → null (nothing installed); any other failure throws — an
 *  unreachable bridge is not "nothing installed". Accepts the resolved shape ({body, source, ref, sha256})
 *  and the stored-document shape ({version, sha256, body, installed_by, installed_at}). */
export async function artefactInForce<T = unknown>(baseUrl: string, key: string, kind: string): Promise<InForce<T> | null> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/artefacts/${kind}`);
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return {
    body: j.body as T,
    ref: j.ref ?? `${kind}@${j.version}`,
    source: typeof j.source === "string" ? j.source : "project",
    sha256: j.sha256 ?? null,
    installed_by: j.installed_by,
    installed_at: j.installed_at,
  };
}

/** PUT /cde/:key/artefacts/:kind — installs `kind@n+1` (lead/owner; the bridge refuses anyone else and
 *  validates the body). Returns the new pointer; throws with the bridge's message. */
export async function installArtefact(baseUrl: string, key: string, kind: string, body: object, actor: string): Promise<{ kind: string; version: number; sha256: string }> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/artefacts/${kind}?actor=${encodeURIComponent(actor)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return j;
}

/** The scan ruleset in force for the ACTIVE project, or null when none is installed there or on its office. */
export async function activeRuleset(baseUrl: string): Promise<{ ruleset: Ruleset; ref: string; source: string; sha256: string | null } | null> {
  const a = await artefactInForce<Ruleset>(baseUrl, activePid(), "ruleset");
  return a ? { ruleset: a.body, ref: a.ref, source: a.source, sha256: a.sha256 } : null;
}
```

Run: `cd WebApp && npx vitest run src/setups/active-ruleset.test.ts`
Expected: PASS, `Tests  6 passed (6)`.

- [ ] **Step 3: Seed packs become data; the bridge seeds the registry**

Write the failing test first. `WebApp/bridge/seed-packs.test.mjs`:

```js
// The seed packs are data the marketplace offers on first run; each must install as-is through the
// artefact validators (a pack the bridge would refuse is a broken offer).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateArtefact } from "./artefact-store.mjs";

const dir = fileURLToPath(new URL("../packs/", import.meta.url));
const packs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(dir + f, "utf8")));

describe("seed packs (WebApp/packs/*.json)", () => {
  it("ships two packs, each with the registry fields the bridge seeds from", () => {
    expect(packs).toHaveLength(2);
    for (const p of packs) for (const k of ["key", "version", "name", "ruleset"]) expect(p[k], `${p.key}.${k}`).toBeTruthy();
  });
  it("every ruleset and every naming passes the artefact validators", () => {
    for (const p of packs) {
      expect(() => validateArtefact("ruleset", p.ruleset), p.key).not.toThrow();
      if (p.naming) expect(() => validateArtefact("naming", p.naming), p.key).not.toThrow();
    }
    expect(packs.filter((p) => p.naming)).toHaveLength(1);   // the house pack carries its container naming
  });
  it("the ISO lite pack is SN-01 alone", () => {
    expect(packs.find((p) => p.key === "iso-19650-lite").ruleset.rules.map((r) => r.id)).toEqual(["SN-01"]);
  });
});
```

Run: `cd WebApp && npx vitest run bridge/seed-packs.test.mjs`
Expected: FAIL with `ENOENT … WebApp/packs/`.

Generate the two files from the commit that still has both sources. The script reads them with `git show`, so it works whether or not the bundled `ruleset.json` (this task) or the bridge `naming-ruleset.json` (Task 3) has already been removed from the working tree. The pack text is carried over word for word from the old `packs-panel.ts:65-67` seed. The naming block gets the `standard_key` and `semver` that the Task 1 `naming` validator requires, and drops the stale `_note`:

```bash
cd WebApp && node - <<'EOF'
// Seed packs become data: the bundled ruleset and the bridge naming file, as they stand at 836ec53.
const { execSync } = require("node:child_process");
const { writeFileSync, mkdirSync } = require("node:fs");
const at = (p) => JSON.parse(execSync(`git show 836ec53:WebApp/${p}`, { encoding: "utf8" }));
const ruleset = at("src/sentinel-core/ruleset.json");
const { _note, ...naming } = at("bridge/naming-ruleset.json");
const dir = "packs";
mkdirSync(dir, { recursive: true });
const write = (f, o) => writeFileSync(`${dir}/${f}`, JSON.stringify(o, null, 2) + "\n");
write("bds-house.json", {
  key: "bds-house", version: ruleset.semver, name: "BDS House Standard",
  description: "Badran Design Studio Revit standard — naming, worksets, parameters, sheets (ISO 19650).",
  author: "BDS", tags: ["KSA", "Architecture"],
  ruleset,
  naming: { standard_key: ruleset.standard_key, semver: ruleset.semver, ...naming },
});
write("iso-19650-lite.json", {
  key: "iso-19650-lite", version: "1.0.0", name: "ISO 19650 Sheet Naming (lite)",
  description: "Minimal ISO 19650 container/sheet-number baseline — a clean starting point to fork.",
  author: "Sentinel", tags: ["ISO", "Global"],
  ruleset: { standard_key: "iso-19650-lite", semver: "1.0.0", rules: ruleset.rules.filter((r) => r.id === "SN-01") },
});
EOF
node -e "for (const f of ['bds-house','iso-19650-lite']) { const p=require('./packs/'+f+'.json'); console.log(f, p.version, p.ruleset.rules.map(r=>r.id).join(','), p.naming ? p.naming.fields.length + ' naming fields' : 'no naming'); }"
```

Expected output:
```
bds-house 1.4.1 WS-01,VN-01,VP-01,SN-01,FN-01,LV-01,GR-01 11 naming fields
iso-19650-lite 1.0.0 SN-01 no naming
```

In `WebApp/bridge/bcf-service.mjs`, replace:

```js
let pkdb = loadJson(PACK_STORE, { packs: [] });
const persistPack = () => writeJsonAtomic(PACK_STORE, pkdb);
```

with:

```js
let pkdb = loadJson(PACK_STORE, { packs: [] });
const persistPack = () => writeJsonAtomic(PACK_STORE, pkdb);
/** A registry record from a publish body (or a seed file). `naming` rides along so an install can put it on the project. */
const packRecord = (b, existing, author) => ({
  id: `${b.key}@${b.version}`, key: b.key, version: b.version, name: b.name || b.key, description: b.description || "",
  author, tags: b.tags || [], ruleset: b.ruleset || { rules: [] }, naming: b.naming || null,
  installs: existing?.installs || 0, forks: existing?.forks || 0,
  forked_from: b.forked_from || existing?.forked_from || null, created_at: existing?.created_at || new Date().toISOString(),
});
/** Seed packs are data (WebApp/packs/*.json): offered in an empty marketplace, enforced only once installed. */
const SEED_PACK_DIR = join(import.meta.dirname, "..", "packs");
const readSeedPacks = () => {
  try { return readdirSync(SEED_PACK_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(SEED_PACK_DIR, f), "utf8"))); }
  catch (e) { console.warn(`[packs] no seed packs read from ${SEED_PACK_DIR}: ${e?.message || e}`); return []; }
};
```

(`readdirSync`, `readFileSync` and `join` are already imported at `bcf-service.mjs:16-17`.) Then, in the `/packs` block, replace:

```js
      if (req.method === "GET" && !kid) return send(res, 200, packs);
      if (req.method === "POST" && !kid) { // publish (create or update)
        const b = await readBody(req); const now = new Date().toISOString();
        const id = `${b.key}@${b.version}`;
        const existing = packs.find((p) => p.id === id);
        const pack = {
          id, key: b.key, version: b.version, name: b.name || b.key, description: b.description || "",
          author: resolveActor(b.author, "anon"), tags: b.tags || [], ruleset: b.ruleset || { rules: [] },
          installs: existing?.installs || 0, forks: existing?.forks || 0,
          forked_from: b.forked_from || existing?.forked_from || null, created_at: existing?.created_at || now,
        };
```

with:

```js
      if (req.method === "GET" && !kid) {
        if (!packs.length) { // first run: seed from the data files (was the panel's job, with the pilot's ruleset in code)
          for (const b of readSeedPacks()) {
            const pk = packRecord(b, null, b.author || "seed");
            if (useCde) { await cde.docUpsert("pack", "", pk.id, pk); packs.push(pk); } else pkdb.packs.push(pk);
          }
          if (!useCde) persistPack();
        }
        return send(res, 200, packs);
      }
      if (req.method === "POST" && !kid) { // publish (create or update)
        const b = await readBody(req);
        const id = `${b.key}@${b.version}`;
        const existing = packs.find((p) => p.id === id);
        const pack = packRecord(b, existing, resolveActor(b.author, "anon"));
```

(The fork route already copies `...pack`, so a fork carries `naming` with no change.)

Run: `cd WebApp && npx vitest run bridge/seed-packs.test.mjs`
Expected: PASS, `Tests  3 passed (3)`. Before Task 1 lands, the validators accept any object for these kinds, so the test only means something with Task 1 in place. Run it after Task 1.

Smoke the seed against a scratch registry. The file store is used when no Supabase env is loaded, so the live registry is never touched:

```bash
cd WebApp && SENTINEL_PACK_STORE="$TEMP/pack-smoke.json" BCF_PORT=4198 timeout 12 node bridge/bcf-service.mjs & 
sleep 3; curl -s http://127.0.0.1:4198/packs | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).map(p=>[p.id,p.ruleset.rules.length,!!p.naming].join(' '))))"
```

Expected: `[ 'bds-house@1.4.1 7 true', 'iso-19650-lite@1.0.0 1 false' ]`. Delete `$TEMP/pack-smoke.json` afterwards. If `config/.env` has Supabase keys, the bridge uses the live `pack` store instead. That store is already seeded, so the seed branch does not run and the list comes back unchanged. Say so in the report and do not delete anything.

- [ ] **Step 4: Every caller renders "No ruleset installed…" and skips the scan**

`WebApp/src/setups/qa-panel.ts`. Replace:

```ts
import { activeRuleset, paramNamesOf } from "./active-ruleset";
```
with:
```ts
import { activeRuleset, paramNamesOf, refLabel, NO_RULESET } from "./active-ruleset";
```

Replace `type Status = "idle" | "scanning" | "done" | "empty";` with `type Status = "idle" | "scanning" | "done" | "empty" | "blocked";`.

Replace:
```ts
  /** the ruleset last used for a scan (marketplace pack, or bundled default). */
  ruleset: Ruleset | null;
}
```
with:
```ts
  /** the ruleset last used for a scan — the artefact in force, never a bundle. */
  ruleset: Ruleset | null;
  /** `ruleset@n · source · sha` of that ruleset (the scan header names what judged). */
  rulesetRef: string | null;
  /** why a scan did not run: nothing installed, or the bridge could not say. */
  notice: string | null;
}
```

Replace:
```ts
    update({ status: "scanning" });
    try {
      // Use the standards pack installed for this project (marketplace), else the bundled BDS ruleset.
      const ruleset = await activeRuleset(base);
      const facts = await extractFacts(fragments, {
```
with:
```ts
    update({ status: "scanning", notice: null });
    try {
      // The ruleset installed on this project or its office. Nothing installed → no scan (never a bundle).
      const active = await activeRuleset(base);
      if (!active) {
        update({ status: "blocked", report: null, scorecard: null, ruleset: null, rulesetRef: null, notice: NO_RULESET });
        return;
      }
      const ruleset = active.ruleset;
      const facts = await extractFacts(fragments, {
```

Replace:
```ts
      update({ status: "done", report, scorecard, ruleset });
    } catch (err) {
      console.error("[Sentinel] scan failed", err);
      update({ status: "empty", report: null, scorecard: null });
    }
```
with:
```ts
      update({ status: "done", report, scorecard, ruleset, rulesetRef: refLabel(active) });
    } catch (err) {
      console.error("[Sentinel] scan failed", err);
      update({ status: "blocked", report: null, scorecard: null, notice: `Scan did not run: ${(err as Error)?.message ?? String(err)}` });
    }
```

Replace:
```ts
      const rulesetLabel = state.ruleset
        ? `${state.ruleset.standard_key} ${state.ruleset.semver}`
        : "the active standard";
```
with:
```ts
      const rulesetLabel = state.ruleset
        ? `${state.ruleset.standard_key} ${state.ruleset.semver} · ${state.rulesetRef}`
        : "the ruleset installed for this project";
```

Replace:
```ts
        if (state.status === "empty")
          return BUI.html`<div class="qa-empty">No model loaded. Add one from the Assets panel first.</div>`;
```
with:
```ts
        if (state.status === "empty")
          return BUI.html`<div class="qa-empty">No model loaded. Add one from the Assets panel first.</div>`;
        if (state.status === "blocked")
          return BUI.html`<div class="qa-empty">${state.notice}</div>`;
```

Replace (the initial state):
```ts
      domainFilter: null,
      ruleset: null,
    },
```
with:
```ts
      domainFilter: null,
      ruleset: null,
      rulesetRef: null,
      notice: null,
    },
```

`WebApp/src/setups/project-shell.ts`. Replace `import { activeRuleset, paramNamesOf } from "./active-ruleset";` with `import { activeRuleset, paramNamesOf, NO_RULESET } from "./active-ruleset";`. Replace:

```ts
    msg("Aggregating health, issues and cost…");
    gateRole = await myRole(base, pid());
    // QA health + compliance (only if a model is loaded)
    if (fragments.list.size > 0) {
      try {
        const ruleset = await activeRuleset(base); // installed standards pack, else bundled
        const facts = await extractFacts(fragments, { parameterNames: paramNamesOf(ruleset) });
        const report = scan(facts, ruleset, { doc_title: "project", now: new Date().toISOString() });
        kpis.health = buildScorecard(report).score;
        kpis.compliance = report.score;
        kpis.blockOpen = report.violations.filter((v) => v.mode === "block").length;
      } catch { kpis.health = null; kpis.compliance = null; }
```
with:
```ts
    msg("Aggregating health, issues and cost…");
    gateRole = await myRole(base, pid());
    let noRuleset = false;
    // QA health + compliance (only if a model is loaded, and only against an installed ruleset)
    if (fragments.list.size > 0) {
      try {
        const active = await activeRuleset(base); // project → office; null = nothing installed, no scan
        if (!active) { noRuleset = true; kpis.health = null; kpis.compliance = null; kpis.blockOpen = 0; }
        else {
          const facts = await extractFacts(fragments, { parameterNames: paramNamesOf(active.ruleset) });
          const report = scan(facts, active.ruleset, { doc_title: "project", now: new Date().toISOString() });
          kpis.health = buildScorecard(report).score;
          kpis.compliance = report.score;
          kpis.blockOpen = report.violations.filter((v) => v.mode === "block").length;
        }
      } catch { kpis.health = null; kpis.compliance = null; }
```
and replace:
```ts
    msg(fragments.list.size === 0 ? "No model loaded — load one for health & cost. Issues shown from the service." : "KPIs up to date.");
```
with:
```ts
    msg(fragments.list.size === 0 ? "No model loaded — load one for health & cost. Issues shown from the service."
      : noRuleset ? `${NO_RULESET}. Health and compliance are not scored; issues and cost are up to date.` : "KPIs up to date.",
      noRuleset ? "#eab308" : undefined);
```

`WebApp/src/setups/copilot-panel.ts`. Replace `import { activeRuleset, paramNamesOf } from "./active-ruleset";` with `import { activeRuleset, paramNamesOf, refLabel } from "./active-ruleset";`. Replace:

```ts
    const hasModel = fragments.list.size > 0;
    const ruleset = await activeRuleset(base); // installed standards pack, else bundled
    let facts: Grounding["facts"] = [], report: Grounding["report"] = null, scorecard: Grounding["scorecard"] = null, boq: Grounding["boq"] = null, carbon: Grounding["carbon"] = null;
    if (hasModel) {
      facts = await extractFacts(fragments, { parameterNames: paramNamesOf(ruleset) });
      report = scan(facts, ruleset, { doc_title: "project", now: new Date().toISOString() });
      scorecard = buildScorecard(report);
```
with:
```ts
    const hasModel = fragments.list.size > 0;
    const active = await activeRuleset(base); // project → office; null = nothing installed → no scan, the engine says so
    let facts: Grounding["facts"] = [], report: Grounding["report"] = null, scorecard: Grounding["scorecard"] = null, boq: Grounding["boq"] = null, carbon: Grounding["carbon"] = null;
    if (hasModel) {
      facts = await extractFacts(fragments, { parameterNames: active ? paramNamesOf(active.ruleset) : [] });
      if (active) {
        report = scan(facts, active.ruleset, { doc_title: "project", now: new Date().toISOString() });
        scorecard = buildScorecard(report);
      }
```
and replace:
```ts
    return { facts, report, scorecard, boq, carbon, issues, ruleset, hasModel };
```
with:
```ts
    return { facts, report, scorecard, boq, carbon, issues, ruleset: active?.ruleset ?? null, rulesetRef: active ? refLabel(active) : null, hasModel };
```

(A bridge failure in `activeRuleset` now reaches the Ask flow's existing `catch` at `copilot-panel.ts:231` and is shown there. It is not turned into "no ruleset".)

`WebApp/src/setups/copilot/engine.ts`. Replace:
```ts
import type {
  ElementFacts, ScanReport, Scorecard, Ruleset, Violation, BoQ, CarbonReport,
} from "../../sentinel-core";
```
with:
```ts
import type {
  ElementFacts, ScanReport, Scorecard, Ruleset, Violation, BoQ, CarbonReport,
} from "../../sentinel-core";
import { NO_RULESET } from "../active-ruleset";
```

Replace:
```ts
  issues: CopilotIssue[];
  ruleset: Ruleset;
  hasModel: boolean;
}
```
with:
```ts
  issues: CopilotIssue[];
  /** the ruleset artefact in force; null = none installed on the project or its office (no scan ran). */
  ruleset: Ruleset | null;
  /** `ruleset@n · source · sha` — cited with every scan answer. */
  rulesetRef: string | null;
  hasModel: boolean;
}
```

Replace `const catIn = (q: string) => CATS.find((c) => q.includes(c.kw));` with:
```ts
const catIn = (q: string) => CATS.find((c) => q.includes(c.kw));
const noRuleset: Answer = { text: `${NO_RULESET} — there is no scan or health score to report.`, sources: [] };
/** What judged: the standard and its artefact ref, cited on every scan answer. */
const std = (g: Grounding) => (g.ruleset ? `${g.ruleset.standard_key} · ${g.rulesetRef}` : "no ruleset");
```

In `ruleM` replace `  if (!g.report) return null;` (the first line of `ruleM`) with `  if (!g.report || !g.ruleset) return null;`, and replace:
```ts
  if (!vs.length) return { text: `No open violations for "${label}".`, sources: [`scan · ${g.ruleset.standard_key}`] };
  const rules = [...new Set(vs.map((v) => v.rule_id))];
  return {
    text: `${vs.length} element(s) fail "${label}" (rule ${rules.join(", ")}). e.g. ${vs[0].message_en}`,
    sources: [`scan · ${vs[0].doc_ref ?? g.ruleset.standard_key}`], elements: mapFromViolations(vs), count: vs.length,
```
with:
```ts
  if (!vs.length) return { text: `No open violations for "${label}".`, sources: [`scan · ${std(g)}`] };
  const rules = [...new Set(vs.map((v) => v.rule_id))];
  return {
    text: `${vs.length} element(s) fail "${label}" (rule ${rules.join(", ")}). e.g. ${vs[0].message_en}`,
    sources: [`scan · ${vs[0].doc_ref ?? g.ruleset.standard_key} · ${g.rulesetRef}`], elements: mapFromViolations(vs), count: vs.length,
```

In `failM` replace:
```ts
  if (!/\b(fail|failing|violation|problem|wrong|non.?conform|what.?s wrong|comply)\b/.test(q)) return null;
  if (!g.report) return needModel();
  const vs = g.report.violations.filter((v) => v.mode !== "monitor");
  if (!vs.length) return { text: `No blocking issues — all ${g.report.elements_checked} checked elements conform to ${g.ruleset.standard_key}.`, sources: ["scan report"] };
```
with:
```ts
  if (!/\b(fail|failing|violation|problem|wrong|non.?conform|what.?s wrong|comply)\b/.test(q)) return null;
  if (!g.ruleset) return noRuleset;
  if (!g.report) return needModel();
  const vs = g.report.violations.filter((v) => v.mode !== "monitor");
  if (!vs.length) return { text: `No blocking issues — all ${g.report.elements_checked} checked elements conform to ${g.ruleset.standard_key}.`, sources: [`scan report · ${std(g)}`] };
```
and replace:
```ts
    text: `${vs.length} element(s) fail the standard. Top rules: ${top.map(([r, n]) => `${r} (${n})`).join(", ")}.`,
    sources: [`scan · ${g.ruleset.standard_key}`], elements: mapFromViolations(vs), count: vs.length,
```
with:
```ts
    text: `${vs.length} element(s) fail the standard. Top rules: ${top.map(([r, n]) => `${r} (${n})`).join(", ")}.`,
    sources: [`scan · ${std(g)}`], elements: mapFromViolations(vs), count: vs.length,
```

In `healthM` replace:
```ts
  if (!/\b(health|score|grade|quality|how good|overall|state of)\b/.test(q)) return null;
  if (!g.scorecard) return needModel();
```
with:
```ts
  if (!/\b(health|score|grade|quality|how good|overall|state of)\b/.test(q)) return null;
  if (!g.ruleset) return noRuleset;
  if (!g.scorecard) return needModel();
```
and replace `    sources: [\`scorecard · ${g.ruleset.standard_key}\`],` with `    sources: [\`scorecard · ${std(g)}\`],`.

In `summarize` replace:
```ts
  const parts: string[] = [];
  if (g.scorecard) parts.push(
```
with:
```ts
  const parts: string[] = [];
  if (!g.ruleset) parts.push(`${NO_RULESET} — no scan, no health score.`);
  if (g.scorecard) parts.push(
```

`WebApp/src/setups/packs-panel.ts`. Replace:
```ts
import { bdsRuleset, type Ruleset } from "../sentinel-core";
import { activeRuleset } from "./active-ruleset";
import { getAppManager } from "../app";

/**
 * Standards-pack marketplace — Phase 4 (the moat). Office/regional standards become forkable, versioned,
 * shareable packages. INSTALL a pack → it's written to the project as the active_ruleset, so the QA scan,
 * the Copilot, and every stage gate immediately enforce THAT standard (see active-ruleset.ts). Publish
 * your current standard; fork someone else's to adapt it. Talks to the service's /packs registry.
```
with:
```ts
import type { Ruleset } from "../sentinel-core";
import { activeRuleset, installArtefact, refLabel, NO_RULESET } from "./active-ruleset";
import { currentUser } from "./auth";
import { getAppManager } from "../app";

/**
 * Standards-pack marketplace — Phase 4 (the moat). Office/regional standards become forkable, versioned,
 * shareable packages. INSTALL a pack → its ruleset (and naming, when the pack carries one) become the
 * project's artefacts `ruleset@n` / `naming@n`, so the QA scan, the Copilot, the stage gates and the
 * bridge's naming judges enforce THAT standard (see active-ruleset.ts). Publish the ruleset in force;
 * fork someone else's to adapt it. Talks to the service's /packs registry, which seeds itself from
 * WebApp/packs/*.json on first run.
```

Replace:
```ts
  author: string; tags: string[]; ruleset: Ruleset; installs: number; forks: number; forked_from?: string | null;
}
```
with:
```ts
  author: string; tags: string[]; ruleset: Ruleset; naming?: Record<string, unknown> | null;
  installs: number; forks: number; forked_from?: string | null;
}
```

Replace:
```ts
  let installedId = "";
  let forkFrom: Pack | null = null;
```
with:
```ts
  let installedId = "";
  let inForce = "";   // `in force: ruleset@n · source · sha`, or NO_RULESET
  let forkFrom: Pack | null = null;
```

Replace:
```ts
      packs = await (await bfetch(`${base}/packs`)).json();
      if (!packs.length) { await seed(); packs = await (await bfetch(`${base}/packs`)).json(); }
      try { const proj = await (await bfetch(`${base}/projects/${encodeURIComponent(pid())}`)).json(); installedId = proj.standards_pack ?? ""; } catch { /* */ }
      renderBrowse();
```
with:
```ts
      packs = await (await bfetch(`${base}/packs`)).json();   // the bridge seeds an empty registry from WebApp/packs/*.json
      try { const proj = await (await bfetch(`${base}/projects/${encodeURIComponent(pid())}`)).json(); installedId = proj.standards_pack ?? ""; } catch { /* */ }
      try { const a = await activeRuleset(base); inForce = a ? `in force: ${refLabel(a)}` : NO_RULESET; } catch (e) { inForce = `ruleset in force unknown: ${(e as Error).message}`; }
      renderBrowse();
```

Delete the seed function, all of:
```ts

  // Seed the registry with the BDS house standard + an ISO 19650 baseline on first run.
  const seed = async () => {
    await publishPack({ key: "bds-house", version: bdsRuleset.semver || "1.4.1", name: "BDS House Standard", description: "Badran Design Studio Revit standard — naming, worksets, parameters, sheets (ISO 19650).", author: "BDS", tags: ["KSA", "Architecture"], ruleset: bdsRuleset });
    const iso: Ruleset = { standard_key: "iso-19650-lite", semver: "1.0.0", rules: bdsRuleset.rules.filter((r) => r.id === "SN-01") };
    await publishPack({ key: "iso-19650-lite", version: "1.0.0", name: "ISO 19650 Sheet Naming (lite)", description: "Minimal ISO 19650 container/sheet-number baseline — a clean starting point to fork.", author: "Sentinel", tags: ["ISO", "Global"], ruleset: iso });
  };
```

Replace `    el("pk-count").textContent = \`(${packs.length})\`;` with `    el("pk-count").textContent = \`(${packs.length}) · ${inForce}\`;`.

Replace:
```ts
        `<span style="font-size:10px;color:#6b7280">${rules} rule(s) · ${p.installs || 0} install(s) · ${esc(p.author)}${p.forked_from ? " · forked" : ""}</span></div>` +
```
with:
```ts
        `<span style="font-size:10px;color:#6b7280">${rules} rule(s)${p.naming ? " · naming" : ""} · ${p.installs || 0} install(s) · ${esc(p.author)}${p.forked_from ? " · forked" : ""}</span></div>` +
```

Replace the install handler:
```ts
  // ── install → make it the project's active ruleset ───────────────────────────
  const install = async (id: string) => {
    const pack = packs.find((p) => p.id === id); if (!pack) return;
    msg(`Installing ${pack.name}…`);
    try {
      await bfetch(`${base}/packs/${encodeURIComponent(id)}/install`, { method: "POST" });
      await bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standards_pack: id, active_ruleset: pack.ruleset }) });
      installedId = id;
      msg(`Installed ${pack.name}. QA, the Copilot and the stage gates now enforce it — re-run a Scan to see it apply.`, "#22c55e");
      await load();
    } catch (e) { msg("Install failed: " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
  };
```
with:
```ts
  // ── install → the pack's ruleset (and naming) become the project's artefacts ───
  const install = async (id: string) => {
    const pack = packs.find((p) => p.id === id); if (!pack) return;
    msg(`Installing ${pack.name}…`);
    const refs: string[] = [];
    try {
      const who = await currentUser().then((u) => u?.email || "web", () => "web");
      // The artefacts are the install: the bridge validates each body and refuses below lead.
      refs.push(`ruleset@${(await installArtefact(base, pid(), "ruleset", pack.ruleset, who)).version}`);
      if (pack.naming) refs.push(`naming@${(await installArtefact(base, pid(), "naming", pack.naming, who)).version}`);
      await bfetch(`${base}/packs/${encodeURIComponent(id)}/install`, { method: "POST" });   // marketplace counter
      await bfetch(`${base}/projects/${encodeURIComponent(pid())}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standards_pack: id }) }); // display name only
      installedId = id;
      msg(`Installed ${pack.name} as ${refs.join(" + ")} on ${pid()}. QA, the Copilot and the stage gates now enforce it — re-run a Scan to see it apply.`, "#22c55e");
      await load();
    } catch (e) { msg("Install failed: " + ((e as Error)?.message ?? String(e)) + (refs.length ? ` — ${refs.join(" + ")} did install` : ""), "#ef4444"); }
  };
```

Replace:
```ts
    const rules = src ? src.ruleset?.rules?.length ?? 0 : (await activeRuleset(base)).rules.length;
```
with:
```ts
    const rules = src ? src.ruleset?.rules?.length ?? 0 : (await activeRuleset(base).catch(() => null))?.ruleset.rules.length ?? 0;
```

Replace:
```ts
      } else {
        // Publish = the project's current active ruleset, packaged.
        await publishPack({
          key, version, name: val("pk-name").trim() || key, description: val("pk-desc").trim(),
          author: getAppManager().projectData?.name ?? "you",
          tags: val("pk-tags").split(",").map((s) => s.trim()).filter(Boolean),
          ruleset: await activeRuleset(base), forked_from: null,
        });
      }
```
with:
```ts
      } else {
        // Publish = the ruleset in force on this project, packaged. Nothing installed → nothing to publish.
        const active = await activeRuleset(base);
        if (!active) { msg(NO_RULESET, "#eab308"); return; }
        await publishPack({
          key, version, name: val("pk-name").trim() || key, description: val("pk-desc").trim(),
          author: getAppManager().projectData?.name ?? "you",
          tags: val("pk-tags").split(",").map((s) => s.trim()).filter(Boolean),
          ruleset: active.ruleset, forked_from: null,
        });
      }
```

- [ ] **Step 5: Delete the bundle from the core and rebuild the bridge bundle**

In `WebApp/src/sentinel-core/index.ts` replace:
```ts

import rulesetJson from "./ruleset.json";
import type { Ruleset } from "./types";

/** The bundled BDS V1.4 ruleset (copied verbatim from the Revit plugin). */
export const bdsRuleset = rulesetJson as Ruleset;
export * from "./guideline";
```
with:
```ts
export * from "./guideline";
```

`WebApp/src/sentinel-core/self-check.ts` is the hand-run worked-example check (`npx tsx src/sentinel-core/self-check.ts`). It imports `bdsRuleset` and would stop compiling. Replace:
```ts
import { RuleEngine } from "./rule-engine";
import { bdsRuleset } from "./index";
import type { Rule } from "./types";

const engine = new RuleEngine();
const ruleById = (id: string): Rule => {
  const r = bdsRuleset.rules.find((x) => x.id === id);
```
with:
```ts
import { RuleEngine } from "./rule-engine";
import type { Rule, Ruleset } from "./types";
// The worked examples belong to the house pack, which is data now (WebApp/packs), not a core export.
import housePack from "../../packs/bds-house.json";

const houseRuleset = housePack.ruleset as Ruleset;
const engine = new RuleEngine();
const ruleById = (id: string): Rule => {
  const r = houseRuleset.rules.find((x) => x.id === id);
```

Then:

```bash
cd WebApp && git rm src/sentinel-core/ruleset.json && npm run build:bridge-core
grep -rn "bdsRuleset\|sentinel-core/ruleset.json\|ruleset_default" src bridge --include=*.ts --include=*.mjs
```

Expected: esbuild prints `bridge\sentinel-core.mjs  58.0kb` and `Done`. The grep prints nothing: the rebuilt bundle no longer carries `ruleset_default`/`bdsRuleset`, and no bridge module imported them. `self-check.ts` is covered by the Step 6 type-check. `tsx` is not installed in `WebApp/node_modules`, so do not `npx` it, which would download it.

- [ ] **Step 6: Type-check, build, tests, commit**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "active-ruleset|qa-panel|project-shell|copilot|packs-panel|sentinel-core/index|self-check"`
Expected: exactly one line, `src/setups/packs-panel.ts(…): error TS2339: Property 'name' does not exist on type 'ProjectData'`. It is pre-existing (`packs-panel.ts:138` on master) and unrelated to this task. Nothing else. The total error count stays 34, as on master.

Run: `cd WebApp && npm run build && grep -c "bds-rtg-001" dist/bundle.js`
Expected: `✓ built`, then `0`. The web bundle no longer ships the pilot's ruleset.

Run: `cd WebApp && npx vitest run src/setups/active-ruleset.test.ts bridge/seed-packs.test.mjs && npm test`
Expected: PASS. Nine new tests. The suite count rises by nine over the pre-task count, with no failures.

Live look, if the platform loads the app: on a project with no `ruleset` artefact, the QA panel's Scan shows "No ruleset installed for this project — install one from Packs", and the Project tab's footer says the same in amber. The Standards tab shows `(2) · No ruleset installed…`. Install "BDS House Standard". The message reads `Installed BDS House Standard as ruleset@1 + naming@1 on <key>`. Scan again: the panel header reads `QA / QC — bds-rtg-001 1.4.1 · ruleset@1 · project · <12 sha chars>…`. If the platform does not load, `PUT /cde/<key>/artefacts/ruleset` with `packs/bds-house.json`'s `ruleset` stands in, and `GET /cde/<key>/artefacts/ruleset` must name it.

```bash
git add WebApp/src/setups/active-ruleset.ts WebApp/src/setups/active-ruleset.test.ts WebApp/src/setups/qa-panel.ts WebApp/src/setups/project-shell.ts WebApp/src/setups/copilot-panel.ts WebApp/src/setups/copilot/engine.ts WebApp/src/setups/packs-panel.ts WebApp/src/sentinel-core/index.ts WebApp/src/sentinel-core/self-check.ts WebApp/bridge/sentinel-core.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/seed-packs.test.mjs WebApp/packs/bds-house.json WebApp/packs/iso-19650-lite.json
git commit -m "feat(web): the scan reads the ruleset artefact through the bridge — no bundle, no fallback; seed packs are data the bridge offers; a pack install writes ruleset@n and naming@n

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Web — "Standards in force" in settings; the Documents install handler

**Files:**
- Modify: `WebApp/src/setups/project-settings-panel.ts` (imports :1-4; markup :61; `load()` :200-203)
- Read for reference: `WebApp/src/setups/active-ruleset.ts` (Task 6: `artefactInForce`, `refLabel`, `InForce`); `WebApp/bridge/artefact-store.mjs:91-97` (`listArtefacts` → `{ [kind]: pointer | null }` for the project's own pointers only, the pointer being `{ kind, version, sha256, installed_by, installed_at, source }`).

**Interfaces:**
- Consumes: `GET /cde/:key/artefacts` → `{ ids|ruleset|naming|contract|guideline|layers|type_catalog: pointer | null }`; `artefactInForce(base, key, kind)` for each kind the project lacks (Task 1's route resolves project → office → 404; its answer has no `installed_by`/`installed_at`, so an inherited row shows `—` for those two).
- Produces: UI only, a read-only block listing each kind as `kind · ref · source · sha · installed_by · date` or "none installed".

- [ ] **Step 1: Standards in force — read-only block**

In `WebApp/src/setups/project-settings-panel.ts` replace:
```ts
import { myRole, canGovernRole } from "./my-role";
```
with:
```ts
import { myRole, canGovernRole } from "./my-role";
import { artefactInForce, refLabel, type InForce } from "./active-ruleset";
```

Replace:
```ts
    '<div id="ps-members" style="margin-top:1.2rem"></div>' +
```
with:
```ts
    '<div id="ps-standards" style="margin-top:1.2rem"></div>' +
    '<div id="ps-members" style="margin-top:1.2rem"></div>' +
```

Replace:
```ts
  async function load() {
    status("Loading…");
    el("pset-key").textContent = pid();
    void loadMembers();
```
with:
```ts
  // ── Standards in force (read-only): each artefact kind's ref · source · sha · installer · date. The list
  // route answers the project's own pointers; a kind it lacks is asked of the resolving route, which falls
  // back to the office — so an inherited standard shows as `· office`, and "none" means none anywhere.
  async function loadStandards() {
    const host = el("ps-standards");
    host.innerHTML = '<div style="color:#a1a1aa;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem">Standards in force</div>';
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string })?.message || `HTTP ${r.status}`);
      const pointers = j as Record<string, { version: number; sha256: string; installed_by?: string; installed_at?: string } | null>;
      const rows = await Promise.all(Object.entries(pointers).map(async ([kind, p]): Promise<[string, InForce | null]> =>
        [kind, p ? { body: null, ref: `${kind}@${p.version}`, source: "project", sha256: p.sha256, installed_by: p.installed_by, installed_at: p.installed_at }
                 : await artefactInForce(base, pid(), kind)]));
      host.innerHTML += rows.map(([kind, a]) =>
        `<div style="display:flex;gap:.6rem;padding:.25rem 0;font-size:12px;border-bottom:1px solid #2a2a30">` +
        `<span style="width:6.5rem;color:#9ca3af">${esc(kind)}</span>` +
        (a ? `<span style="flex:1;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;font-size:11px">${esc(refLabel(a))}</span>` +
             `<span style="color:#71717a;font-size:11px">${esc(a.installed_by ?? "—")} · ${esc((a.installed_at ?? "").slice(0, 10) || "—")}</span>`
           : `<span style="flex:1;color:#71717a">none installed</span>`) +
        "</div>").join("");
    } catch (e) {
      host.innerHTML += `<div style="color:#fca5a5;font-size:11px">Standards in force couldn't load: ${esc((e as Error)?.message ?? String(e))}</div>`;
    }
  }

  async function load() {
    status("Loading…");
    el("pset-key").textContent = pid();
    void loadMembers();
    void loadStandards();
```

The block has no controls, so it is the same for every role; installs happen in Packs and Documents. `esc` is the panel's own (:28), and it escapes `"` as well.

- [ ] **Step 2: The Documents panel install handler, with kind as a parameter**

No code in this task. Task 9, Step 4 (spec §5) replaces the same lines, `docs-panel.ts:1179-1195` (the Compile-to-IDS install), with one handler that takes the kind as a parameter, and adds the naming candidate that uses it. That candidate is the only naming producer the Documents panel will have. A second edit to those lines here would conflict with that one. The single change Task 9's helper needs is to delegate to the tested client instead of repeating the PUT. Its body becomes:

```ts
  const installArtefact = async (kind: "ids" | "naming", payload: Record<string, unknown>): Promise<{ version: number; sha256: string }> =>
    putArtefactFor(base, pid(), kind, payload, await actor());
```

with `import { installArtefact as putArtefactFor } from "./active-ruleset";` added to the imports. The alias is needed because Task 9's local `const installArtefact` would otherwise shadow the import.

- [ ] **Step 3: Type-check, build, commit**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "project-settings-panel"`
Expected: no lines.

Run: `cd WebApp && npm run build`
Expected: `✓ built`.

Live look (the settings panel does not need the viewer): on `aster-villa` with `ruleset@1` and `naming@1` installed on `aster-office` only, the block shows `ruleset  ruleset@1 · office · <sha12>…  — · —` and the same for `naming`. The `ids` row shows the project's own pointer with installer and date. Every other kind shows "none installed". Install a pack on `aster-villa` itself and reload: the `ruleset` row reads `ruleset@1 · project · … · <email> · <date>`.

```bash
git add WebApp/src/setups/project-settings-panel.ts
git commit -m "feat(web): project settings show the standards in force — each kind's ref, source, sha, installer and date, inherited office artefacts included

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 8: Superseded IDS topics (spec §6, F51)

**Files:**
- Create: `WebApp/bridge/ids-supersede.mjs` (pure: which topics a new IDS supersedes, which are closable)
- Test: `WebApp/bridge/ids-supersede.test.mjs`
- Modify: `WebApp/bridge/bcf-service.mjs` — `raiseGovernedFailureTopics` (:293-332; the spec's "raiseIdsTopics" is this function), two new helpers beside it, the artefacts block (:997-1017: PUT marks, new POST close route)
- Modify: `WebApp/src/setups/issue-panel.ts` (`Topic` :29-36, `renderList` :170-181, `showDetail` :183-198, `fetchAll` :200-207, imports :1-7)
- Read for reference: `cde-store.mjs:1030-1087` (`bcfListTopics`, `bcfSaveTopic`, `newTopicObject` — topics are whole JSONB documents, so extra fields persist exactly like `resolved_by_version` at `bcf-service.mjs:1457`); `cde-store.mjs:597` (`recordAudit(key, b)`); `members-store.mjs:129` (`requireMinRole`); `cde-store.mjs:929-931` (`adjudicateProposal` returns `ids_ref`, `ids_source`); `src/setups/my-role.ts` (`myRole`, `canGovernRole`).

**Where the ref lives:** BCF topics have no custom-field slot; each topic is one JSONB document (`bcf_topics.data`) that the bridge reads and writes whole, and the web panel reads it as-is. The ref is stored as two top-level topic fields, `ids_ref` (`"ids@n"` or `null`) and `ids_source` (`"project" | "office" | "client" | "none"`), plus `superseded_by` when marked. The description also names the ref in words so Revit's `BcfSyncManager` (which shows the description) carries it. `ids_source` is needed because project and office numberings are separate counters: an office `ids@4` is not newer than a project `ids@2`.

**Interfaces:**
- Consumes: `adjudicateProposal(...)` result fields `ids_ref`, `ids_source` (existing); `putArtefact(key, kind, body, { actor, source })` → pointer `{ kind, version, sha256, installed_by, installed_at, source }` (existing, unchanged by this task); `cde.bcfListTopics(pid, { status: "all" })`, `cde.bcfSaveTopic(topic)`, `cde.recordAudit(key, { entity_type, actor, action, new_value })`, `requireMinRole(key, "lead")`.
- Produces: `isOpenIdsTopic(topic) → boolean`; `supersededBy(topics, newRef: "ids@n") → topic[]` (throws `{status: 400}` on a non-IDS ref); `closableSuperseded(topics) → topic[]`. Topic fields `ids_ref`, `ids_source`, `superseded_by`. `PUT /cde/:key/artefacts/ids` response = the pointer plus `superseded_topics: string[]` (guids marked) or `superseded_error: string`. New `POST /cde/:key/artefacts/ids/close-superseded` (lead) → `{ closed: number, topics: [{ guid, superseded_by }] }`. Audit rows: `IDS topics superseded by ids@n` (`new_value: { superseded_by, topics: guid[] }`), `Superseded IDS topics closed (n)` (`new_value: { closed: [{ guid, superseded_by }] }`), and the existing `Issue raised: …` row gains `ids_ref`, `ids_source`.

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/ids-supersede.test.mjs`:

```js
// F51: an IDS install marks the open IDS topics raised under an older or different IDS; nothing auto-closes.
import { describe, it, expect } from "vitest";
import { supersededBy, closableSuperseded, isOpenIdsTopic } from "./ids-supersede.mjs";

const t = (guid, over = {}) => ({ guid, title: "IDS: IFCDOOR — FireRating (3 failing)", topic_status: "Open", ...over });
const topics = [
  t("old", { ids_ref: "ids@1", ids_source: "project" }),
  t("same", { ids_ref: "ids@2", ids_source: "project" }),
  t("office", { ids_ref: "ids@4", ids_source: "office" }),          // another counter: never "newer" than the project's
  t("client", { ids_ref: null, ids_source: "client" }),
  t("legacy"),                                                        // raised before topics carried a ref
  t("remark", { superseded_by: "ids@1" }),                            // marked by an earlier install, re-marked
  t("already", { ids_ref: "ids@1", ids_source: "project", superseded_by: "ids@2" }),
  t("closed", { ids_ref: "ids@1", ids_source: "project", topic_status: "Closed" }),
  t("resolved", { topic_status: "Resolved" }),
  t("fed", { title: "Federation: FG-01 Duplicate GlobalId (2)" }),
];

describe("superseded IDS topics", () => {
  it("marks open IDS topics from an older project version, another source, or no ref; leaves current, closed and non-IDS ones", () => {
    expect(supersededBy(topics, "ids@2").map((x) => x.guid)).toEqual(["old", "office", "client", "legacy", "remark"]);
    expect(isOpenIdsTopic(topics[9])).toBe(false);
  });
  it("refuses a ref that is not ids@n", () => {
    expect(() => supersededBy(topics, "naming@2")).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("closes only open IDS topics that carry a superseded_by mark", () => {
    const withClosedMark = [...topics, t("closed-sup", { superseded_by: "ids@2", topic_status: "Closed" })];
    expect(closableSuperseded(withClosedMark).map((x) => x.guid)).toEqual(["remark", "already"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/ids-supersede.test.mjs`
Expected: FAIL — cannot resolve `./ids-supersede.mjs`.

- [ ] **Step 3: Write the module**

`WebApp/bridge/ids-supersede.mjs`:

```js
// Which open IDS topics a newly installed IDS supersedes (cohesion phase 3 §6, F51). Pure — the bridge
// route does the IO. A topic carries the ref of the IDS that raised it (ids_ref + ids_source, written by
// raiseGovernedFailureTopics). Superseded is a MARK, never a close: a superseded topic may still be a real
// defect, so closing them is a separate, lead-only, audited step.

/** An IDS-raised topic that is still open (the same test the fail→BCF dedup uses). */
export const isOpenIdsTopic = (t) => /^IDS:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved";
const versionOf = (ref) => { const m = /^ids@(\d+)$/.exec(ref || ""); return m ? Number(m[1]) : null; };

/** The open IDS topics that installing `newRef` (ids@n on THIS project) supersedes: raised by an older
 *  version of the project's own IDS, by another source (office or client — their numbering is not this
 *  project's), or before topics carried a ref. Topics already marked with `newRef` are left alone. */
export function supersededBy(topics, newRef) {
  const n = versionOf(newRef);
  if (n === null) throw Object.assign(new Error(`not an IDS ref: ${newRef}`), { status: 400 });
  return (topics || []).filter((t) => {
    if (!isOpenIdsTopic(t) || t.superseded_by === newRef) return false;
    const v = versionOf(t.ids_ref);
    return v === null || t.ids_source !== "project" || v < n;
  });
}

/** What "close all as superseded" closes: open IDS topics carrying a superseded_by mark. */
export const closableSuperseded = (topics) => (topics || []).filter((t) => isOpenIdsTopic(t) && !!t.superseded_by);
```

Run: `cd WebApp && npx vitest run bridge/ids-supersede.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 4: Raised topics carry the ref**

In `bcf-service.mjs` `raiseGovernedFailureTopics`, replace:

```js
  const openReqs = (existing || [])
    .filter((t) => /^IDS:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved")
```

with (a superseded topic no longer de-duplicates a failure the NEW IDS still finds — the new IDS raises its own topic with its own ref, and the lead closes the old one):

```js
  const openReqs = (existing || [])
    .filter((t) => /^IDS:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved" && !t?.superseded_by)
```

Replace:

```js
      description: `IDS “${idsTitle}” — ${g.count} element(s) fail: ${g.key}.` +
        (g.guids.length ? ` Sample GUIDs: ${g.guids.slice(0, 10).join(", ")}` : ""),
    }, now);
```

with:

```js
      description: `IDS “${idsTitle}” — ${g.count} element(s) fail: ${g.key}.` +
        (result.ids_ref ? ` Judged by ${result.ids_ref} (${result.ids_source}).` : "") +
        (g.guids.length ? ` Sample GUIDs: ${g.guids.slice(0, 10).join(", ")}` : ""),
    }, now);
    // F51: which IDS raised this topic, so a later install can mark it superseded. ids_source matters:
    // project and office versions are separate counters.
    topic.ids_ref = result.ids_ref ?? null;
    topic.ids_source = result.ids_source ?? null;
```

Replace:

```js
        new_value: { spec: idsTitle, requirement: g.key, failing: g.count, bcf_guid: topic.guid },
```

with:

```js
        new_value: { spec: idsTitle, requirement: g.key, failing: g.count, bcf_guid: topic.guid, ids_ref: topic.ids_ref, ids_source: topic.ids_source },
```

- [ ] **Step 5: Mark on install, close on request**

In `bcf-service.mjs`, directly after the closing `}` of `raiseGovernedFailureTopics` (before the `/** One BCF topic per failing Federation Gate check` comment), add:

```js
/** F51: installing ids@n MARKS the open IDS topics it supersedes (superseded_by = the new ref) and never
 *  closes them — a superseded topic may still be a real defect. One audit row lists the guids. */
async function markSupersededIdsTopics(cde, pid, newRef, actor) {
  const { supersededBy } = await import("./ids-supersede.mjs");
  const hits = supersededBy(await cde.bcfListTopics(pid, { status: "all" }), newRef);
  if (!hits.length) return [];
  const now = new Date().toISOString();
  for (const t of hits) {
    t.superseded_by = newRef;
    t.history = t.history || [];
    t.history.push({ date: now, author: actor, action: `Superseded by ${newRef}` });
    t.modified_date = now;
    await cde.bcfSaveTopic(t);
    broadcast(pid, { type: "topic", action: "updated", guid: t.guid, status: t.topic_status });
  }
  const guids = hits.map((t) => t.guid);
  await cde.recordAudit(pid, { entity_type: "ids_validation", actor, action: `IDS topics superseded by ${newRef}`, new_value: { superseded_by: newRef, topics: guids } });
  return guids;
}

/** The lead's one-click "close all as superseded": every open IDS topic carrying a superseded_by mark is
 *  closed with a history line naming the IDS that superseded it; one audit row lists them. */
async function closeSupersededIdsTopics(cde, pid, actor) {
  const { closableSuperseded } = await import("./ids-supersede.mjs");
  const hits = closableSuperseded(await cde.bcfListTopics(pid, { status: "all" }));
  const now = new Date().toISOString();
  for (const t of hits) {
    t.history = t.history || [];
    t.history.push({ date: now, author: actor, action: `Status: ${t.topic_status || "—"} → Closed (superseded by ${t.superseded_by})` });
    t.topic_status = "Closed";
    t.modified_date = now;
    await cde.bcfSaveTopic(t);
    broadcast(pid, { type: "topic", action: "updated", guid: t.guid, status: t.topic_status });
  }
  const closed = hits.map((t) => ({ guid: t.guid, superseded_by: t.superseded_by }));
  if (closed.length) await cde.recordAudit(pid, { entity_type: "ids_validation", actor, action: `Superseded IDS topics closed (${closed.length})`, new_value: { closed } });
  return { closed: closed.length, topics: closed };
}
```

In the artefacts block, replace:

```js
      if (p2 === "artefacts") {
        const art = await import("./artefact-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
```

with:

```js
      if (p2 === "artefacts") {
        const art = await import("./artefact-store.mjs");
        // POST /cde/:key/artefacts/ids/close-superseded — lead only, audited (F51). Before the GET routes so
        // the p4 segment is never read as a version.
        if (p3 === "ids" && p4 === "close-superseded" && req.method === "POST") {
          const { requireMinRole } = await import("./members-store.mjs");
          await requireMinRole(p1, "lead");
          const b = await readBody(req);
          return send(res, 200, await closeSupersededIdsTopics(cde, p1, resolveActor(b?.actor || url.searchParams.get("actor"), "web")));
        }
        if (!p3 && req.method === "GET") return send(res, 200, await art.listArtefacts(p1));
```

and replace:

```js
          return send(res, 201, await art.putArtefact(p1, p3, artefact, { actor, source }));
```

with:

```js
          const pointer = await art.putArtefact(p1, p3, artefact, { actor, source });
          // F51: a new IDS marks the open IDS topics it supersedes. Best-effort — the install already stands.
          if (p3 === "ids") {
            try { pointer.superseded_topics = await markSupersededIdsTopics(cde, p1, `ids@${pointer.version}`, resolveActor(actor, "web")); }
            catch (e) { pointer.superseded_error = String(e?.message || e); }
          }
          return send(res, 201, pointer);
```

(If group A's task has already rewritten this PUT line, apply the same wrap around whatever `putArtefact` call it leaves; the pointer shape is unchanged.)

- [ ] **Step 6: Issues panel — the superseded group**

In `issue-panel.ts` add to the imports after `import { activePid } from "./active-project";`:

```ts
import { myRole, canGovernRole } from "./my-role";
```

Replace the `Topic` interface:

```ts
interface Topic {
  guid: string; title: string; topic_type: string; topic_status: string;
  priority?: string; assigned_to?: string; due_date?: string; description?: string;
  creation_author?: string; creation_date?: string; labels?: string[];
  comments?: { author: string; comment: string }[];
  history?: { date: string; author: string; action: string }[];
  viewpoints?: { components?: { selection?: { ifc_guid: string }[] } }[];
}
```

with:

```ts
interface Topic {
  guid: string; title: string; topic_type: string; topic_status: string;
  priority?: string; assigned_to?: string; due_date?: string; description?: string;
  creation_author?: string; creation_date?: string; labels?: string[];
  comments?: { author: string; comment: string }[];
  history?: { date: string; author: string; action: string }[];
  viewpoints?: { components?: { selection?: { ifc_guid: string }[] } }[];
  ids_ref?: string | null; ids_source?: string | null; superseded_by?: string;   // IDS-raised topics (F51)
}
```

Replace `  let topics: Topic[] = [];` with:

```ts
  let topics: Topic[] = [];
  let role = "viewer";   // fail closed; fetchAll asks the bridge each load
```

Replace the whole `renderList` (from `  const renderList = () => {` through its closing `  };`) with:

```ts
  const rowHtml = (t: Topic) => {
    const links = (t.viewpoints || []).reduce((n, v) => n + (v.components?.selection?.length || 0), 0);
    return `<div class="ip-row" data-guid="${t.guid}" style="padding:.4rem;border:1px solid #2a2a30;border-radius:.3rem;margin-bottom:.3rem;cursor:pointer">` +
      `<div style="display:flex;align-items:center;gap:.4rem"><span style="width:.6rem;height:.6rem;border-radius:50%;background:${STATUS_COLOR[t.topic_status] || "#6528d7"};flex:none"></span>` +
      `<span style="flex:1;font-weight:600">${esc(t.title)}</span><span style="font-size:11px;color:#9ca3af">${esc(t.topic_type)}</span></div>` +
      `<div style="font-size:11px;color:#9ca3af;margin-top:.15rem">${esc(t.topic_status)} · ${esc(t.priority || "—")} · ${links} el · ${esc(t.assigned_to || "unassigned")}` +
      `${t.ids_ref ? ` · ${esc(t.ids_ref)}` : ""}${t.superseded_by ? ` · superseded by ${esc(t.superseded_by)}` : ""}</div></div>`;
  };

  const closeSuperseded = async () => {
    const b = el("ip-close-sup") as HTMLButtonElement; b.disabled = true; msg("Closing superseded IDS issues…");
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(projectId())}/artefacts/ids/close-superseded`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      msg(`✅ ${j.closed} superseded issue(s) closed — recorded in the audit log.`, "#22c55e");
      await fetchAll();
    } catch (e) { msg("❌ " + ((e as Error)?.message ?? String(e)), "#ef4444"); b.disabled = false; }
  };

  const renderList = () => {
    const list = filtered();
    // F51: open IDS topics a newer IDS superseded get their own group — still listed (a superseded topic may
    // be a real defect), closable in one audited step by a lead. Nothing closes them automatically.
    const isSup = (t: Topic) => !!t.superseded_by && t.topic_status !== "Closed" && t.topic_status !== "Resolved";
    const current = list.filter((t) => !isSup(t)), sup = list.filter(isSup);
    el("ip-count").textContent = `(${list.length})`;
    let h = current.map(rowHtml).join("") || (sup.length ? "" : '<div style="color:#9ca3af;font-size:12px;padding:.4rem">No issues match the filters.</div>');
    if (sup.length) {
      h += '<div style="display:flex;align-items:center;gap:.4rem;margin:.6rem 0 .3rem;padding-top:.4rem;border-top:1px solid #2a2a30">' +
        `<span style="flex:1;color:#eab308;font:600 12px system-ui">Raised by a superseded IDS (${sup.length})</span>` +
        (canGovernRole(role) ? `<button id="ip-close-sup" style="${btn};background:#2a2a30;color:#eee">Close all as superseded</button>` : "") +
        "</div>" + sup.map(rowHtml).join("");
    }
    el("ip-list").innerHTML = h;
    root.querySelectorAll<HTMLElement>(".ip-row").forEach((r) => r.addEventListener("click", () => showDetail(r.dataset.guid as string)));
    root.querySelector("#ip-close-sup")?.addEventListener("click", () => void closeSuperseded());
  };
```

(`fetchAll` is a `const` declared further down; `closeSuperseded` only calls it on a click, after the panel has finished building, so the order is safe.)

In `showDetail`, replace:

```ts
    if (t.labels?.length) h += row("Labels", t.labels.join(", "));
```

with:

```ts
    if (t.labels?.length) h += row("Labels", t.labels.join(", "));
    if (/^IDS:/.test(t.title)) h += row("Raised by", `${t.ids_ref ? `${t.ids_ref} (${t.ids_source || "?"})` : "an IDS without a ref (before refs were recorded)"}${t.superseded_by ? ` · superseded by ${t.superseded_by}` : ""}`);
```

In `fetchAll`, replace:

```ts
      topics = await r.json();
      renderList();
```

with:

```ts
      topics = await r.json();
      role = await myRole(base, projectId());
      renderList();
```

- [ ] **Step 7: Tests, type-check, build, smoke**

Run: `cd WebApp && npx vitest run bridge/ids-supersede.test.mjs && npx vitest run bridge`
Expected: PASS.

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "issue-panel"; npm run build`
Expected: no lines from the grep; build succeeds.

Smoke on your own instance (`cd WebApp && BCF_PORT=4199 node bridge/bcf-service.mjs`, bearer = `serviceToken` from `%AppData%\Sentinel\bcf-config.json`), on a scratch key `sa-smoke` (create it with `POST /cde/projects {key: "sa-smoke", name: "SA smoke"}` if absent):
1. `POST /bcf/3.0/projects/sa-smoke/topics {title: "IDS: IFCDOOR — FireRating (1 failing)"}` → a legacy topic with no ref.
2. `PUT /cde/sa-smoke/artefacts/ids?actor=smoke` with a one-spec IDS → 201, `superseded_topics` contains the step-1 guid; `GET /bcf/3.0/projects/sa-smoke/topics?status=all` shows `superseded_by: "ids@<n>"` and a `Superseded by ids@<n>` history line; `GET /cde/sa-smoke/audit` has `IDS topics superseded by ids@<n>`.
3. `POST /cde/sa-smoke/propose {elements: [{guid:"x", entity:"IFCDOOR", psets:{}}]}` → the raised topic carries `ids_ref: "ids@<n>"`, `ids_source: "project"`, and was not de-duplicated against the superseded one.
4. `POST /cde/sa-smoke/artefacts/ids/close-superseded` → `{ closed: 1, … }`; the step-1 topic is `Closed` with the history line; audit row `Superseded IDS topics closed (1)`. Stop the instance.

- [ ] **Step 8: Commit**

```bash
git add WebApp/bridge/ids-supersede.mjs WebApp/bridge/ids-supersede.test.mjs WebApp/bridge/bcf-service.mjs WebApp/src/setups/issue-panel.ts
git commit -m "feat(ids): topics carry the IDS ref that raised them; a new IDS marks older ones superseded; lead closes them in one audited step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Document-sourced naming candidate (spec §5, F15)

**Files:**
- Create: `WebApp/src/sentinel-core/naming-diff.ts` (pure: `diffNaming`, `findNamingCandidate`)
- Test: `WebApp/src/sentinel-core/naming-diff.test.ts`
- Modify: `WebApp/src/setups/docs-panel.ts` (imports :1-7; one install helper after `actor` at :168; the IDS install handler at :1179-1195; `showDocView` bar at :1139-1145)
- Read for reference: `src/sentinel-core/naming.ts:9-26` (`NamingField`, `NamingRuleset`); `bridge/templates/bep-template.json:10` (BEP section "6. Container naming and standards" — "binds to Sentinel's naming ruleset in a later release"); `docs-panel.ts:1139-1200` (the Compile-to-IDS box whose install pattern this reuses).

**What "the standards extraction" is here:** no bimdocs extraction produces a naming ruleset today (`bimdocs-ai.mjs` only *reads* one for grounding; `/bimdocs/compile-ids` compiles IDS only; nothing in `bimdocs-store.mjs` or `docs-panel.ts` extracts naming). The smallest honest source is deterministic: a document section that carries the naming standard as a fenced ```` ```json ```` block (the BEP template's section 6 is its intended home). The extractor reads that block and nothing else — no prose inference, no model call. A prose-to-naming compiler is out of this task (see gaps).

**Interfaces:**
- Consumes: `GET /cde/:key/artefacts/naming` → the doc in force `{ kind, version, sha256, body, installed_by, installed_at, … }` resolved project → office, 404 when none (group A); `GET /cde/:key/artefacts` → `{ naming: pointer | null, … }` (this project's own pointers, for the next version number); `PUT /cde/:key/artefacts/naming?actor=` with the ruleset body plus `source` (the route moves `source` into the pointer's provenance, `bcf-service.mjs:1011-1014`); `validateArtefact("naming", body)` on the bridge (group A) judges the shape and answers 400 naming the path.
- Produces: `diffNaming(current: NamingRuleset | null, candidate: NamingRuleset) → { added: {key,label}[], removed: {key,label}[], changed: {key,label,changes: string[]}[], header: string[] }` (`header` carries separator/enforce changes); `findNamingCandidate(sections: {id, heading, body?}[]) → { ruleset, section_id, heading } | null`. Pointer provenance `source: { document_id, section }` (`section` = the section id). Docs-panel `installArtefact(kind: "ids" | "naming", payload) → Promise<{ version, sha256 }>` (one handler, kind as a parameter, spec §3).

- [ ] **Step 1: Write the failing test**

`WebApp/src/sentinel-core/naming-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffNaming, findNamingCandidate } from "./naming-diff";
import type { NamingRuleset } from "./naming";

const inForce: NamingRuleset = {
  title: "Office naming", separator: "-", enforce: "reject",
  fields: [
    { key: "project", label: "Project", pattern: "[A-Z0-9]{3,6}" },
    { key: "originator", label: "Originator", enum: ["ORG", "STR"] },
    { key: "number", label: "Number", pattern: "\\d{4}" },
  ],
};

describe("diffNaming", () => {
  it("with nothing in force, every candidate field is added", () => {
    expect(diffNaming(null, inForce)).toEqual({
      added: [{ key: "project", label: "Project" }, { key: "originator", label: "Originator" }, { key: "number", label: "Number" }],
      removed: [], changed: [], header: [],
    });
  });
  it("names added, removed and changed pattern/enum fields by key", () => {
    const cand: NamingRuleset = { ...inForce, fields: [
      { key: "project", label: "Project", pattern: "[A-Z0-9]{4}" },
      { key: "originator", label: "Originator", enum: ["ORG", "MEP"] },
      { key: "role", label: "Role", enum: ["A", "S"] },
    ] };
    const d = diffNaming(inForce, cand);
    expect(d.added).toEqual([{ key: "role", label: "Role" }]);
    expect(d.removed).toEqual([{ key: "number", label: "Number" }]);
    expect(d.changed).toEqual([
      { key: "project", label: "Project", changes: ["pattern [A-Z0-9]{3,6} → [A-Z0-9]{4}"] },
      { key: "originator", label: "Originator", changes: ["enum +MEP -STR"] },
    ]);
    expect(d.header).toEqual([]);
  });
  it("reports separator, enforce and position changes — they re-shape every name", () => {
    const moved = diffNaming(inForce, { ...inForce, separator: "_", enforce: "warn", fields: [inForce.fields[1], inForce.fields[0], inForce.fields[2]] });
    expect(moved.header).toEqual(["separator '-' → '_'", "enforce reject → warn"]);
    expect(moved.changed.map((c) => c.changes)).toEqual([["position 2 → 1"], ["position 1 → 2"]]);
  });
  it("an identical candidate has an empty diff", () => {
    expect(diffNaming(inForce, inForce)).toEqual({ added: [], removed: [], changed: [], header: [] });
  });
});

describe("findNamingCandidate", () => {
  it("takes the first json block shaped like a naming ruleset, skipping prose, bad JSON and other objects", () => {
    const sections = [
      { id: "s1", heading: "1. Introduction", body: "Prose only." },
      { id: "s5", heading: "5. Codes", body: "```json\n{ not json }\n```\n```json\n{\"codes\": [\"A\"]}\n```" },
      { id: "s6", heading: "6. Container naming and standards", body: "Names follow:\n```json\n" + JSON.stringify({ ...inForce, standard_key: "office-naming", semver: "1.0.0" }) + "\n```\nEnd." },
    ];
    const c = findNamingCandidate(sections);
    expect(c?.section_id).toBe("s6");
    expect(c?.heading).toBe("6. Container naming and standards");
    expect(c?.ruleset.standard_key).toBe("office-naming");
    expect(findNamingCandidate(sections.slice(0, 2))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run src/sentinel-core/naming-diff.test.ts`
Expected: FAIL — cannot resolve `./naming-diff`.

- [ ] **Step 3: Write the module**

`WebApp/src/sentinel-core/naming-diff.ts`:

```ts
// sentinel-core/naming-diff — what a document's candidate naming standard changes against the one in force
// (cohesion phase 3 §5, F15). PURE. The Documents panel shows this before a lead installs the candidate
// WHOLE as the next naming@n: there is no merge, and a candidate that drops fields says so first.
import type { NamingField, NamingRuleset } from "./naming";

export interface NamingFieldRef { key: string; label: string }
export interface NamingFieldChange extends NamingFieldRef { changes: string[] }
export interface NamingDiff {
  added: NamingFieldRef[];
  removed: NamingFieldRef[];
  changed: NamingFieldChange[];
  /** separator / enforce changes — they re-shape or re-gate every name, so the panel shows them first. */
  header: string[];
}

const joined = (a?: string[]) => (a ?? []).join(", ") || "—";

function fieldChanges(a: NamingField, b: NamingField, ia: number, ib: number): string[] {
  const out: string[] = [];
  if (ia !== ib) out.push(`position ${ia + 1} → ${ib + 1}`);
  if (a.label !== b.label) out.push(`label ${a.label} → ${b.label}`);
  if ((a.pattern ?? "") !== (b.pattern ?? "")) out.push(`pattern ${a.pattern ?? "—"} → ${b.pattern ?? "—"}`);
  const ea = new Set(a.enum ?? []), eb = new Set(b.enum ?? []);
  const plus = [...eb].filter((v) => !ea.has(v)).map((v) => `+${v}`);
  const minus = [...ea].filter((v) => !eb.has(v)).map((v) => `-${v}`);
  if (plus.length || minus.length) out.push(`enum ${[...plus, ...minus].join(" ")}`);
  if (joined(a.placeholders) !== joined(b.placeholders)) out.push(`placeholders ${joined(a.placeholders)} → ${joined(b.placeholders)}`);
  return out;
}

/** Field-by-field diff, matched by field key. `current` null = nothing in force: every field is added. */
export function diffNaming(current: NamingRuleset | null, candidate: NamingRuleset): NamingDiff {
  const cur = current?.fields ?? [];
  const was = new Map(cur.map((f, i) => [f.key, { f, i }] as const));
  const candKeys = new Set(candidate.fields.map((f) => f.key));
  const added: NamingFieldRef[] = [], changed: NamingFieldChange[] = [];
  candidate.fields.forEach((f, i) => {
    const w = was.get(f.key);
    if (!w) { added.push({ key: f.key, label: f.label }); return; }
    const changes = fieldChanges(w.f, f, w.i, i);
    if (changes.length) changed.push({ key: f.key, label: f.label, changes });
  });
  const removed = cur.filter((f) => !candKeys.has(f.key)).map((f) => ({ key: f.key, label: f.label }));
  const header: string[] = [];
  if (current) {
    if (current.separator !== candidate.separator) header.push(`separator '${current.separator}' → '${candidate.separator}'`);
    const ec = current.enforce ?? "reject", en = candidate.enforce ?? "reject";
    if (ec !== en) header.push(`enforce ${ec} → ${en}`);
  }
  return { added, removed, changed, header };
}

/** A naming standard written into a document section as a fenced ```json block (the BEP template's
 *  "Container naming and standards" section is the intended home). Returns the first block that parses to
 *  an object with a string `separator` and a `fields` array, with the section it came from; null when no
 *  section carries one. The full shape is judged by the bridge on install (validateArtefact "naming"). */
export function findNamingCandidate(sections: { id: string; heading: string; body?: string }[]):
  { ruleset: NamingRuleset & Record<string, unknown>; section_id: string; heading: string } | null {
  for (const s of sections) {
    for (const m of (s.body ?? "").matchAll(/```json\s*([\s\S]*?)```/g)) {
      try {
        const j = JSON.parse(m[1]);
        if (j && typeof j === "object" && !Array.isArray(j) && typeof j.separator === "string" && Array.isArray(j.fields))
          return { ruleset: j, section_id: s.id, heading: s.heading };
      } catch { /* not JSON — keep looking */ }
    }
  }
  return null;
}
```

Run: `cd WebApp && npx vitest run src/sentinel-core/naming-diff.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 4: One install handler, kind as a parameter**

In `docs-panel.ts` add after `import { activePid, onActiveProjectChange } from "./active-project";`:

```ts
import { diffNaming, findNamingCandidate } from "../sentinel-core/naming-diff";
import type { NamingRuleset } from "../sentinel-core/naming";
```

Replace:

```ts
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };
```

with:

```ts
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };
  /** The one install path for every artefact a document offers (ids from the EIR compile, naming from a
   *  section): PUT /cde/:key/artefacts/:kind — lead/owner only on the bridge, which also validates the body. */
  const installArtefact = async (kind: "ids" | "naming", payload: Record<string, unknown>): Promise<{ version: number; sha256: string }> => {
    const who = await actor();
    const res = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts/${kind}?actor=${encodeURIComponent(who)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const p = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(p.message || `HTTP ${res.status}`);
    return p;
  };
```

In the Compile-to-IDS install handler replace:

```ts
            const who = await actor();
            const res = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/artefacts/ids?actor=${encodeURIComponent(who)}`, {
              method: "PUT", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: r.title, specifications: r.specifications, source: { document_id: doc.id, compiled_at: new Date().toISOString() } }),
            });
            const p = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(p.message || `HTTP ${res.status}`);
            install.textContent = `Installed ids@${p.version}`;
```

with:

```ts
            const p = await installArtefact("ids", { title: r.title, specifications: r.specifications, source: { document_id: doc.id, compiled_at: new Date().toISOString() } });
            install.textContent = `Installed ids@${p.version}`;
```

- [ ] **Step 5: The naming candidate in the document view**

In `showDocView` replace:

```ts
    const compileBtn = doc.doc_type === "EIR" ? btn("Compile to IDS") : null;
    if (compileBtn) bar.append(compileBtn);
```

with:

```ts
    const compileBtn = doc.doc_type === "EIR" ? btn("Compile to IDS") : null;
    if (compileBtn) bar.append(compileBtn);
    // F15: a section carrying the naming standard as a ```json block is offered as the next naming@n —
    // diffed field by field against the one in force, installed whole or not at all (no merge).
    const namingCand = findNamingCandidate(doc.sections);
    const namingBtn = namingCand ? btn("Naming candidate") : null;
    if (namingBtn) bar.append(namingBtn);
```

Then, directly before `    integrityBtn.onclick = async () => {`, add:

```ts
    if (namingBtn && namingCand) namingBtn.onclick = async () => {
      namingBtn.disabled = true; integrityOut.replaceChildren();
      const box = document.createElement("div");
      box.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;padding:.6rem;margin:.4rem 0;background:#141418;color:#c9cfda;font:12px system-ui";
      const line = (text: string, color = "#c9cfda") => { const d = document.createElement("div"); d.textContent = text; d.style.cssText = `padding:.15rem 0;color:${color}`; box.append(d); };
      try {
        const key = encodeURIComponent(pid());
        // In force = what judges this project today (project → office). The install lands on THIS project,
        // so the candidate's number is this project's own next version, not the office's.
        const curRes = await bfetch(`${base}/cde/${key}/artefacts/naming`);
        if (!curRes.ok && curRes.status !== 404) throw new Error(`HTTP ${curRes.status}`);
        const cur: { version: number; sha256: string; body: NamingRuleset } | null = curRes.ok ? await curRes.json() : null;
        const ownRes = await bfetch(`${base}/cde/${key}/artefacts`);
        const own: { naming?: { version: number } | null } = ownRes.ok ? await ownRes.json() : {};
        const next = (own.naming?.version || 0) + 1;
        const d = diffNaming(cur?.body ?? null, namingCand.ruleset);
        const h = document.createElement("div"); h.style.cssText = "font:600 12px system-ui;color:#eee;margin-bottom:.3rem";
        h.textContent = `Candidate naming@${next} from “${namingCand.heading}” — against ${cur ? `naming@${cur.version} (sha ${String(cur.sha256).slice(0, 12)}…)` : "no naming standard in force"}`;
        box.append(h);
        if (d.removed.length) line(`Removes ${d.removed.length} field(s): ${d.removed.map((f) => f.label).join(", ")} — names built with them will stop conforming.`, "#f87171");
        for (const x of d.header) line(x, "#eab308");
        for (const f of d.added) line(`+ ${f.label} (${f.key})`, "#22c55e");
        for (const f of d.changed) line(`~ ${f.label}: ${f.changes.join("; ")}`, "#eab308");
        const same = !!cur && !d.added.length && !d.removed.length && !d.changed.length && !d.header.length;
        if (same) line("Identical to the version in force — nothing to install.", "#9ca3af");
        if (canGovern() && !same) {
          const install = btn(`Install naming@${next} on this project`, true);
          install.style.marginTop = ".5rem";
          install.onclick = async () => {
            install.disabled = true; install.textContent = "Installing…";
            try {
              const p = await installArtefact("naming", { ...namingCand.ruleset, source: { document_id: doc.id, section: namingCand.section_id } });
              install.textContent = `Installed naming@${p.version}`;
              msg(`✓ naming@${p.version} installed on ${pid()} (sha ${String(p.sha256).slice(0, 12)}…) — the naming gate, readiness and federation now judge by it.`);
            } catch (e) {
              install.disabled = false; install.textContent = `Install naming@${next} on this project`;
              msg(`Install failed: ${(e as Error).message}`, true);
            }
          };
          box.append(install);
        }
        integrityOut.append(box);
      } catch (e) {
        const d = document.createElement("div"); d.textContent = `Naming candidate failed: ${(e as Error).message}`;
        d.style.cssText = "padding:.4rem .6rem;border-radius:.35rem;background:#3b1113;color:#fca5a5;margin:.4rem 0"; integrityOut.append(d);
      } finally { namingBtn.disabled = false; }
    };
```

- [ ] **Step 6: Tests, type-check, build**

Run: `cd WebApp && npx vitest run src/sentinel-core/naming-diff.test.ts && npm test`
Expected: PASS (the new 5 tests plus the suite).

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "docs-panel|naming-diff"; npm run build`
Expected: no lines from the grep; build succeeds.

Live look (only if the platform loads the app): a BEP whose section 6 holds the kit's naming ruleset as a ```` ```json ```` block (with `standard_key` and `semver`, Task 10 step 3) → **Naming candidate** shows the diff against `naming@1` from the office; **Install** answers `naming@1` on the project; `GET /cde/<key>/artefacts` → `naming.source = { document_id, section }`. Otherwise the same with `PUT /cde/<key>/artefacts/naming` and a body carrying `source`.

- [ ] **Step 7: Commit**

```bash
git add WebApp/src/sentinel-core/naming-diff.ts WebApp/src/sentinel-core/naming-diff.test.ts WebApp/src/setups/docs-panel.ts
git commit -m "feat(docs): a document's naming standard is offered as the next naming@n — field-by-field diff, installed whole with its document and section as provenance

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentation

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new Session B3 after Session B2, before `## Session C`, i.e. after line 61)
- Modify: `docs/handbook/05-capability-status.md` (row 15 "Naming gate", new row after row 12 "Office entity")
- Modify: `docs/handbook/04-core-workflows.md:33` (the naming gate bullet names the deleted file)
- Modify: `demo/aster/README.md` (row 16 `aster-naming-ruleset.json`; the wiring list after line 44)
- Modify: `demo/aster/aster-naming-ruleset.json` (add `standard_key`, `semver` so the kit file installs as-is under the `naming` validator)

- [ ] **Step 1: Protocol — Session B3**

Insert after the Session B2 table (after the `| Office IDS | … |` row, before `## Session C`):

```markdown
## Session B3 — Standards as artefacts

| Step | Pass criteria |
|---|---|
| Nothing installed | On `aster-villa` (no own ruleset/naming, office has none yet): readiness `naming.containers` → `not_checkable`, reason names `PUT /cde/:key/artefacts/naming`; the web QA scan shows "No ruleset installed for this project — install one from Packs" and does not scan; no bundled ruleset or bridge file is used anywhere |
| Import to the office | `node bridge/artefact-import.mjs --from-metadata --key aster-office` → `ruleset@1` and `naming@1` installed on `aster-office` with actor `import`; audit rows name the source slot; a row that fails validation is listed, not installed |
| Inherit | `GET /cde/aster-villa/artefacts/naming` → the office's `naming@1`; `aster-villa` readiness evidence for `office.naming_standard` and `naming.containers` names `naming@1 · office · <sha 12>` |
| Project install | Packs → install on `aster-villa` from the web (if the platform loads the app) or `PUT /cde/aster-villa/artefacts/ruleset` → `ruleset@1` on the project; the scan header names `ruleset@1 · project` |
| Superseded IDS | With open `IDS:` topics on a project, install a new `ids@n` → the PUT answers `superseded_topics`; Issues shows them under "Raised by a superseded IDS"; a lead's **Close all as superseded** closes them with one audit row; a viewer sees no button; new failures under `ids@n` raise their own topics carrying `ids_ref` |
| Document naming | A BEP whose section 6 carries a naming ruleset as a ```` ```json ```` block → **Naming candidate** lists added/removed/changed fields against the version in force and warns before a field is removed; **Install** writes the candidate whole and the pointer's `source` names the document and section |
```

- [ ] **Step 2: Capability rows and the workflow line**

Replace row 15 of `05-capability-status.md`:

```markdown
| Naming gate (Phase A, ISO 19650, enforce=reject) | 🟩 Built | Active: `WebApp/bridge/naming-ruleset.json` (BDS pilot); swap via `SENTINEL_NAMING_RULESET` env var |
```

with:

```markdown
| Naming gate (Phase A, ISO 19650, enforce=reject) | 🟩 Built | The project's installed naming artefact (`PUT /cde/:key/artefacts/naming`, Packs, or a document's naming candidate); resolution project → office → none, named in every verdict as `naming@n`. Nothing installed = not checkable, never the pilot's file (the bundled `naming-ruleset.json` and `SENTINEL_NAMING_RULESET` were removed in cohesion phase 3) |
```

Add after the `| Office entity … |` row:

```markdown
| Standards as artefacts (scan ruleset + container naming as `ruleset@n` / `naming@n`; superseded IDS topics; document naming candidate) | 🟩 Built | Resolver project → office → none, every judge names `ref · source · sha`; bundled web ruleset and bridge naming file deleted; `artefact-import.mjs --from-metadata` retires `metadata.active_ruleset`; IDS topics carry `ids_ref` and a new IDS marks older ones superseded (lead closes them, audited). Moves to ✅ on the Session B3 drill |
```

Replace line 33 of `04-core-workflows.md`:

```markdown
- **Naming gate (Phase A)** — `bridge/naming-ruleset.json`, the BDS 11-field ISO 19650 form. Default enforcement: **reject** (a bad name blocks the publish). 🟩 Built.
```

with:

```markdown
- **Naming gate (Phase A)** — the project's `naming@n` artefact (its own, else its office's); nothing installed is "not checkable", never a shipped default. Default enforcement: **reject** (a bad name blocks the publish). 🟩 Built.
```

- [ ] **Step 3: Kit README and the kit naming file**

In `demo/aster/README.md` replace row 16:

```markdown
| `aster-naming-ruleset.json` | The container naming ruleset of `AST-STD-001`, same shape as `WebApp/bridge/naming-ruleset.json` (7 fields, enforce `reject`). | all 12 MIDP names pass; `Aster_Tower_final_v2` is rejected | 2.7 |
```

with:

```markdown
| `aster-naming-ruleset.json` | The container naming ruleset of `AST-STD-001` as a `naming` artefact body (`standard_key`, `semver`, 7 fields, enforce `reject`). Install with `PUT /cde/aster-office/artefacts/naming`, or paste it as a ```` ```json ```` block into BEP section 6 and use **Naming candidate**. | all 12 MIDP names pass; `Aster_Tower_final_v2` is rejected | 2.7 |
```

Add after the line-44 bullet (`- In Revit: Project Setup → Web project = …`):

```markdown
- The office's scan ruleset and container naming are **artefacts** on `aster-office` (`ruleset@n`, `naming@n`), inherited by `aster-tower` and `aster-villa` unless a project installs its own; nothing is read from a bridge file or a bundled web ruleset. After cohesion phase 3, run `node bridge/artefact-import.mjs --from-metadata --key aster-office` once to move the hand-merged `active_ruleset` into them; `GET /cde/aster-office/artefacts` shows what is in force.
```

In `demo/aster/aster-naming-ruleset.json` replace:

```json
{
  "title": "Aster Studio container naming (AST-STD-001, 7-field)",
```

with:

```json
{
  "standard_key": "AST-STD-001",
  "semver": "1.0.0",
  "title": "Aster Studio container naming (AST-STD-001, 7-field)",
```

Check: `node -e "const j=require('./demo/aster/aster-naming-ruleset.json');console.log(j.standard_key,j.semver,j.fields.length)"` → `AST-STD-001 1.0.0 7`.

- [ ] **Step 4: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/handbook/04-core-workflows.md demo/aster/README.md demo/aster/aster-naming-ruleset.json
git commit -m "docs: standards-as-artefacts drill (Session B3), capability rows, kit notes; kit naming file carries standard_key and semver

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 11: Drill and merge (controller)

- [ ] **Step 1:** Restart the managed bridge on the branch. `GET /cde/aster-villa/artefacts/naming` → 404 naming the PUT route; `GET /bimdocs/aster-villa/<READINESS>/readiness` (create one if none) → `naming.containers` `not_checkable` with the reason; the web QA scan on a project with nothing installed shows "No ruleset installed…" (browser, if the platform loads; else the `activeRuleset` unit test stands).
- [ ] **Step 2:** `node bridge/artefact-import.mjs --from-metadata --key aster-office --dry-run` then without `--dry-run` → `ruleset@1` and `naming@1` on the office; `GET /cde/aster-villa/artefacts/naming` → `source: office`, `ref: naming@1`.
- [ ] **Step 3:** `aster-villa` readiness → `naming.containers` summary names `naming@1 · office · <sha>`; federation on `aster-office` → FG-02 names `ruleset@1`; `POST /cde/aster-villa/propose` verdict carries `naming_ref`.
- [ ] **Step 4:** Install a second IDS on `aster-office` (`PUT …/artefacts/ids`) → response lists `superseded_topics`; `POST /cde/aster-office/artefacts/ids/close-superseded` closes them with an audit row.
- [ ] **Step 5:** Record in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` (Session B3), capability row ✅, `npm test`, normalise trailers, merge `--no-ff` into master, ledger and memory.
