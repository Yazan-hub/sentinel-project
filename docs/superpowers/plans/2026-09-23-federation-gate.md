# Federation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cross-model data consistency gate over a project's federated set — duplicate GlobalIds, type-naming drift, level and grid alignment, georeference agreement, container naming and verdicts — recorded on the ledger, raised as BCF, shown where clash runs start, fed by model manifests captured on the bridge at publish time.

**Architecture:** A pure core (`sentinel-core/federation.ts`) judges an array of model manifests. Manifests are extracted from IFC bytes by `bridge/ifc-manifest.mjs` (web-ifc, identity only: no psets) and stored by `bridge/manifest-store.mjs` into the existing per-revision element tables plus one small document per version; capture is hooked into Governed Intake and the outbox watcher and never blocks a publish. `bridge/federation-store.mjs` resolves the set, runs the core, stores the latest result and writes the audit row; `bcf-service.mjs` exposes the routes and raises one BCF topic per failing check. A web banner, two CLIs and a Revit status line read the result.

**Tech Stack:** Node 20 ESM (`.mjs`), `web-ifc@0.0.77`, Supabase REST via `sb()`, vitest (`src/**/*.test.ts` and `bridge/**/*.test.mjs`), esbuild core bundle (`npm run build:bridge-core`), TypeScript panel code, C# add-in (Revit 2024, compile-only in this plan).

## Global Constraints

- Honesty rule: a check with nothing to judge is `not_checkable` with its reason, never a pass; the result verdict is `fail` if any check fails, `not_checkable` if fewer than two models carry a manifest, else `pass`; no percentage anywhere.
- Office code is data: no `BDS`/`AST` literal in code; fixtures use neutral names.
- No new dependency; `web-ifc` and `@thatopen/fragments` are already installed.
- Manifest capture never fails a publish: errors are logged with the version id and the model reads "no manifest".
- Every run writes its own audit row with `entity_type: "federation_gate"` and `entity_id: null`.
- Tolerances: levels 1 mm, georeference 0.5 m, rotation 0.1°.
- The Revit status line uses the document's project key (`SettingsManager.WebProjectKeyFor(doc)`), never the machine key.
- Branch `feature/federation-gate` from `master`; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Tests from `WebApp/`: `npx vitest run <file>`; `npm test` (738 tests today) must stay green. After changing `sentinel-core`, run `npm run build:bridge-core` and commit the rebuilt `bridge/sentinel-core.mjs`.
- Windows paths with spaces need quotes; the repo root is `C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project`.

## File structure

| File | Responsibility |
|---|---|
| `WebApp/src/sentinel-core/federation.ts` | Types + `checkFederation(models, opts)`: the six checks, pure. |
| `WebApp/src/sentinel-core/federation.test.ts` | Synthetic-manifest tests per check. |
| `WebApp/src/sentinel-core/index.ts`, `bridge-entry.ts` | Export the core; bundle rebuilt. |
| `WebApp/bridge/fixtures/fed-a.ifc`, `fed-b.ifc`, `fed-c.ifc` | Hand-written IFC4 models: a and b plant the S11 mismatch; a and c are consistent. |
| `WebApp/bridge/ifc-manifest.mjs` | `extractManifest(bytes)`: elements (guid, class, type name, storey), levels, grids, site. |
| `WebApp/bridge/manifest-store.mjs` | `captureManifest`, `getManifest`, `listManifests`; deps-injected. |
| `WebApp/bridge/federation-store.mjs` | `runFederation`, `getFederation`; deps-injected. |
| `WebApp/bridge/bcf-service.mjs` | Routes `/cde/:key/federation…`, `/cde/:key/manifests/:versionId`; intake capture hook; `raiseFederationTopics`. |
| `WebApp/bridge/watch-outbox.mjs` | Capture after registration. |
| `WebApp/bridge/cde-store.mjs` | `versionVerdicts(key, versionIds)`. |
| `WebApp/bridge/federation.mjs`, `WebApp/bridge/manifest.mjs` | CLIs. |
| `WebApp/src/setups/clash-panel.ts` | Banner + Run gate. |
| `SentinelAddin/Coordination/GovernedQuery.cs`, `SentinelAddin/Commands.ClashRegister.cs` (or the command that opens `ClashManagerDialog`), `SentinelAddin/UI/ClashManagerDialog.xaml.cs` | Status line. |
| Docs | `docs/TESTING_PROTOCOL.md` (Session D3), `docs/handbook/05-capability-status.md`, `docs/FEATURES_UPDATE_2026-09.md`. |

---

### Task 1: The core — six checks over manifests

**Files:**
- Create: `WebApp/src/sentinel-core/federation.ts`
- Test: `WebApp/src/sentinel-core/federation.test.ts`
- Modify: `WebApp/src/sentinel-core/index.ts` (add `export * from "./federation";` after line 74), `WebApp/src/sentinel-core/bridge-entry.ts` (add `export { checkFederation, nameShape } from "./federation";`)
- Read for reference: `WebApp/src/sentinel-core/rule-engine.ts:13-60` (`RuleEngine.checkName(rule, elementId, name)`), `types.ts:26-40` (`Rule`), `naming.ts:9-46` (`NamingRuleset`, `validateContainerName`).

**Interfaces:**
- Consumes: `RuleEngine`, `Rule`, `validateContainerName`, `NamingRuleset`.
- Produces:

```ts
export interface ManifestElement { guid: string; class: string; type_name: string | null; storey: string | null }
export interface ManifestLevel { name: string; elevation_mm: number }
export interface MapConversion { eastings: number; northings: number; height: number; x_axis_abscissa: number; x_axis_ordinate: number; scale: number; crs_name: string | null }
export interface ManifestSite { lat: number | null; lon: number | null; elevation_m: number | null; map_conversion: MapConversion | null }
export interface Manifest { schema: string; elements: ManifestElement[]; levels: ManifestLevel[]; grids: string[]; site: ManifestSite | null; counts?: { elements: number; skipped: number } }
export interface FederationModel { container: string; version_id: string; manifest: Manifest | null }
export type VerdictWord = "accepted" | "recorded" | "rejected";
export interface FederationOptions { type_rule?: Rule | null; org?: string | null; naming_ruleset?: NamingRuleset | null; verdicts?: Record<string, VerdictWord | null | undefined>; tolerance?: { level_mm?: number; georef_m?: number; angle_deg?: number } }
export type CheckStatus = "pass" | "fail" | "not_checkable";
export interface FederationCheck { id: string; title: string; status: CheckStatus; reason?: string; evidence: Record<string, unknown>[]; warnings: string[] }
export interface FederationResult { verdict: CheckStatus; models: { container: string; version_id: string; has_manifest: boolean }[]; checks: FederationCheck[] }
export function nameShape(name: string): string           // "space·2", "hyphen·3", "underscore·5", "none·1"
export function checkFederation(models: FederationModel[], opts?: FederationOptions): FederationResult
```

- [ ] **Step 1: Write the failing tests**

`WebApp/src/sentinel-core/federation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkFederation, nameShape, type FederationModel, type Manifest } from "./federation";
import type { Rule } from "./types";

const site = (lat: number, lon: number, mc: Partial<Manifest["site"] extends infer S ? (S extends { map_conversion: infer M } ? M : never) : never> | null = null) =>
  ({ lat, lon, elevation_m: 0, map_conversion: mc ? { eastings: 500000, northings: 3500000, height: 0, x_axis_abscissa: 1, x_axis_ordinate: 0, scale: 1, crs_name: "EPSG:32636", ...mc } : null });

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    schema: "IFC4",
    elements: [
      { guid: "g-wall-1", class: "IFCWALL", type_name: "Wall 1", storey: "Level 1" },
      { guid: "g-wall-2", class: "IFCWALL", type_name: "Wall 2", storey: "Level 1" },
    ],
    levels: [{ name: "Level 1", elevation_mm: 0 }, { name: "Level 2", elevation_mm: 3300 }],
    grids: ["A", "B"],
    site: site(51.5, -0.1, {}),
    ...over,
  };
}
const model = (container: string, m: Manifest | null, version_id = container): FederationModel => ({ container, version_id, manifest: m });
const A = () => model("A-0101.ifc", manifest());
const check = (r: ReturnType<typeof checkFederation>, id: string) => r.checks.find((c) => c.id === id)!;
const okVerdicts = { "A-0101.ifc": "accepted", "B-0102.ifc": "accepted", "C-0103.ifc": "recorded" } as const;

describe("nameShape", () => {
  it("names the separator and the token count", () => {
    expect(nameShape("Wall 1")).toBe("space·2");
    expect(nameShape("W-A1-Fin")).toBe("hyphen·3");
    expect(nameShape("ORG_EXT_ARC_CMU_200 mm")).toBe("underscore·5");
    expect(nameShape("Basic")).toBe("none·1");
  });
});

describe("checkFederation", () => {
  it("passes a consistent pair and reports every check", () => {
    const c = model("C-0103.ifc", manifest({ elements: [{ guid: "g-wall-9", class: "IFCWALL", type_name: "Wall 3", storey: "Level 1" }] }));
    const r = checkFederation([A(), c], { verdicts: okVerdicts });
    expect(r.verdict).toBe("pass");
    expect(r.checks.map((x) => x.id)).toEqual(["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]);
    expect(r.checks.every((x) => x.status === "pass" || (x.id === "FG-06" && x.status === "pass"))).toBe(true);
    expect(check(r, "FG-02").reason).toMatch(/no type rule installed/);   // shape-only, said plainly
  });
  it("is not checkable with fewer than two manifests", () => {
    const r = checkFederation([A(), model("B-0102.ifc", null)], { verdicts: okVerdicts });
    expect(r.verdict).toBe("not_checkable");
    expect(r.models.find((m) => m.container === "B-0102.ifc")?.has_manifest).toBe(false);
  });
  it("FG-01 fails a GlobalId shared by two models, naming both", () => {
    const b = model("B-0102.ifc", manifest({ elements: [{ guid: "g-wall-1", class: "IFCWALL", type_name: "Wall 1", storey: "Level 1" }] }));
    const fg = check(checkFederation([A(), b], { verdicts: okVerdicts }), "FG-01");
    expect(fg.status).toBe("fail");
    expect(fg.evidence).toEqual([{ guid: "g-wall-1", models: ["A-0101.ifc", "B-0102.ifc"] }]);
  });
  it("FG-02 fails the S11 case: Wall 1 against W-A1-Fin in the same category", () => {
    const b = model("B-0102.ifc", manifest({ elements: [{ guid: "g-b1", class: "IFCWALL", type_name: "W-A1-Fin", storey: "Level 1" }, { guid: "g-b2", class: "IFCWALL", type_name: "W-A2-Fin", storey: "Level 1" }] }));
    const fg = check(checkFederation([A(), b], { verdicts: okVerdicts }), "FG-02");
    expect(fg.status).toBe("fail");
    expect(fg.evidence).toContainEqual({ category: "IFCWALL", model: "A-0101.ifc", shape: "space·2", examples: ["Wall 1", "Wall 2"] });
    expect(fg.evidence).toContainEqual({ category: "IFCWALL", model: "B-0102.ifc", shape: "hyphen·3", examples: ["W-A1-Fin", "W-A2-Fin"] });
  });
  it("FG-02 applies an installed type rule with {org} resolved and names the offenders", () => {
    const rule: Rule = { id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "LOC", "MATERIAL", "SIZE"], token_defs: { ORG: "{org}", LOC: "EXT|INT", MATERIAL: "[A-Z0-9]+", SIZE: "\\d+ mm" }, separator: "_", message_en: "Type '{name}' does not match." };
    const good = model("A-0101.ifc", manifest({ elements: [{ guid: "g1", class: "IFCWALL", type_name: "ZZZ_EXT_CMU_200 mm", storey: null }] }));
    const bad = model("B-0102.ifc", manifest({ elements: [{ guid: "g2", class: "IFCWALL", type_name: "ZZZ_EXT_CMU_200 mm", storey: null }, { guid: "g3", class: "IFCWALL", type_name: "Wall 1", storey: null }] }));
    const fg = check(checkFederation([good, bad], { type_rule: rule, org: "ZZZ", verdicts: okVerdicts }), "FG-02");
    expect(fg.status).toBe("fail");
    expect(fg.evidence).toContainEqual({ model: "B-0102.ifc", type_name: "Wall 1", rule: "TN-01" });
  });
  it("FG-03 fails a level 20 mm off and passes 0.5 mm; missing levels are warnings", () => {
    const off = model("B-0102.ifc", manifest({ levels: [{ name: "Level 1", elevation_mm: 20 }] }));
    const r1 = check(checkFederation([A(), off], { verdicts: okVerdicts }), "FG-03");
    expect(r1.status).toBe("fail");
    expect(r1.evidence).toEqual([{ name: "Level 1", values: [{ model: "A-0101.ifc", elevation_mm: 0 }, { model: "B-0102.ifc", elevation_mm: 20 }] }]);
    expect(r1.warnings).toContain("Level 2: missing in B-0102.ifc");
    const near = model("B-0102.ifc", manifest({ levels: [{ name: "Level 1", elevation_mm: 0.5 }, { name: "Level 2", elevation_mm: 3300 }] }));
    expect(check(checkFederation([A(), near], { verdicts: okVerdicts }), "FG-03").status).toBe("pass");
  });
  it("FG-03 fails when models share no level name at all", () => {
    const other = model("B-0102.ifc", manifest({ levels: [{ name: "L01", elevation_mm: 0 }] }));
    const fg = check(checkFederation([A(), other], { verdicts: okVerdicts }), "FG-03");
    expect(fg.status).toBe("fail");
    expect(fg.reason).toMatch(/no level name is shared/);
  });
  it("FG-04 fails on different grid tag sets and names the difference", () => {
    const b = model("B-0102.ifc", manifest({ grids: ["A", "C"] }));
    const fg = check(checkFederation([A(), b], { verdicts: okVerdicts }), "FG-04");
    expect(fg.status).toBe("fail");
    expect(fg.evidence).toContainEqual({ model: "A-0101.ifc", missing: ["C"], extra: [] });
    expect(fg.evidence).toContainEqual({ model: "B-0102.ifc", missing: ["B"], extra: [] });
    const none = model("B-0102.ifc", manifest({ grids: [] }));
    expect(check(checkFederation([A(), none], { verdicts: okVerdicts }), "FG-04").status).toBe("not_checkable");
  });
  it("FG-05 fails a georeferenced model beside one without, and a 2 m offset; passes 10 cm", () => {
    const noGeo = model("B-0102.ifc", manifest({ site: { lat: null, lon: null, elevation_m: null, map_conversion: null } }));
    const r1 = check(checkFederation([A(), noGeo], { verdicts: okVerdicts }), "FG-05");
    expect(r1.status).toBe("fail");
    expect(r1.evidence).toContainEqual({ model: "B-0102.ifc", georeference: "none" });
    const far = model("B-0102.ifc", manifest({ site: site(51.5 + 2 / 111320, -0.1, {}) }));
    expect(check(checkFederation([A(), far], { verdicts: okVerdicts }), "FG-05").status).toBe("fail");
    const near = model("B-0102.ifc", manifest({ site: site(51.5 + 0.1 / 111320, -0.1, {}) }));
    expect(check(checkFederation([A(), near], { verdicts: okVerdicts }), "FG-05").status).toBe("pass");
    const rotated = model("B-0102.ifc", manifest({ site: site(51.5, -0.1, { x_axis_abscissa: Math.cos(Math.PI / 180), x_axis_ordinate: Math.sin(Math.PI / 180) }) }));
    const r4 = check(checkFederation([A(), rotated], { verdicts: okVerdicts }), "FG-05");
    expect(r4.status).toBe("fail");
    expect(r4.evidence[0]).toMatchObject({ model_a: "A-0101.ifc", model_b: "B-0102.ifc" });
    expect((r4.evidence[0] as { delta_deg: number }).delta_deg).toBeCloseTo(1, 3);
    const noneAtAll = checkFederation([model("A-0101.ifc", manifest({ site: null })), noGeo], { verdicts: okVerdicts });
    expect(check(noneAtAll, "FG-05").status).toBe("not_checkable");
  });
  it("FG-06 fails a rejected or missing verdict and a name the ruleset rejects; warns on a warn-level ruleset", () => {
    const rs = { title: "two fields", separator: "-", strip_extensions: [".ifc"], enforce: "reject" as const, fields: [{ key: "p", label: "P", pattern: "[A-Z]" }, { key: "n", label: "N", pattern: "\\d{4}" }] };
    const b = model("B-0102.ifc", manifest({ elements: [{ guid: "g-b1", class: "IFCWALL", type_name: "Wall 9", storey: null }] }));
    const r1 = check(checkFederation([A(), b], { naming_ruleset: rs, verdicts: { "A-0101.ifc": "accepted", "B-0102.ifc": "rejected" } }), "FG-06");
    expect(r1.status).toBe("fail");
    expect(r1.evidence).toContainEqual(expect.objectContaining({ model: "B-0102.ifc", verdict: "rejected" }));
    const bad = model("Bad name.ifc", manifest({ elements: [{ guid: "g-b1", class: "IFCWALL", type_name: "Wall 9", storey: null }] }));
    const r2 = check(checkFederation([A(), bad], { naming_ruleset: rs, verdicts: { "A-0101.ifc": "accepted", "Bad name.ifc": "accepted" } }), "FG-06");
    expect(r2.status).toBe("fail");
    expect(r2.evidence.find((e) => e.model === "Bad name.ifc")).toMatchObject({ naming: expect.objectContaining({ ok: false }) });
    const r3 = check(checkFederation([A(), bad], { naming_ruleset: { ...rs, enforce: "warn" }, verdicts: { "A-0101.ifc": "accepted", "Bad name.ifc": "accepted" } }), "FG-06");
    expect(r3.status).toBe("pass");
    expect(r3.warnings.some((w) => w.includes("Bad name.ifc"))).toBe(true);
    const r4 = check(checkFederation([A(), b], { naming_ruleset: rs, verdicts: { "A-0101.ifc": "accepted" } }), "FG-06");
    expect(r4.evidence).toContainEqual(expect.objectContaining({ model: "B-0102.ifc", verdict: null }));
    expect(r4.status).toBe("fail");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run src/sentinel-core/federation.test.ts`
Expected: FAIL — cannot resolve `./federation`.

- [ ] **Step 3: Write the core**

`WebApp/src/sentinel-core/federation.ts`:

```ts
// sentinel-core/federation — the Federation Gate: are these models one building? Six data checks over
// per-model manifests, run BEFORE any clash job (decision D-01: compete on data clash). Pure: no I/O,
// deterministic, every finding carries the models and values a coordinator needs. A check with nothing
// to judge is not_checkable with its reason — never a pass — and the verdict never blends into a score.
import { RuleEngine } from "./rule-engine";
import type { Rule } from "./types";
import { validateContainerName, type NamingRuleset, type NamingResult } from "./naming";

export interface ManifestElement { guid: string; class: string; type_name: string | null; storey: string | null }
export interface ManifestLevel { name: string; elevation_mm: number }
export interface MapConversion { eastings: number; northings: number; height: number; x_axis_abscissa: number; x_axis_ordinate: number; scale: number; crs_name: string | null }
export interface ManifestSite { lat: number | null; lon: number | null; elevation_m: number | null; map_conversion: MapConversion | null }
export interface Manifest { schema: string; elements: ManifestElement[]; levels: ManifestLevel[]; grids: string[]; site: ManifestSite | null; counts?: { elements: number; skipped: number } }
export interface FederationModel { container: string; version_id: string; manifest: Manifest | null }
export type VerdictWord = "accepted" | "recorded" | "rejected";
export interface FederationOptions {
  type_rule?: Rule | null;
  org?: string | null;
  naming_ruleset?: NamingRuleset | null;
  verdicts?: Record<string, VerdictWord | null | undefined>;
  tolerance?: { level_mm?: number; georef_m?: number; angle_deg?: number };
}
export type CheckStatus = "pass" | "fail" | "not_checkable";
export interface FederationCheck { id: string; title: string; status: CheckStatus; reason?: string; evidence: Record<string, unknown>[]; warnings: string[] }
export interface FederationResult { verdict: CheckStatus; models: { container: string; version_id: string; has_manifest: boolean }[]; checks: FederationCheck[] }

const SEPS: [string, string][] = [["_", "underscore"], ["-", "hyphen"], [" ", "space"], [".", "dot"]];

/** The naming shape of a type name: which separator dominates and how many tokens it yields. "Wall 1" is
 *  space·2, "W-A1-Fin" is hyphen·3 — the two conventions of the S11 case, made comparable. */
export function nameShape(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "none·0";
  let best: [string, string] | null = null, bestCount = 0;
  for (const sep of SEPS) {
    const n = s.split(sep[0]).length - 1;
    if (n > bestCount) { best = sep; bestCount = n; }
  }
  if (!best) return "none·1";
  return `${best[1]}·${s.split(best[0]).filter(Boolean).length}`;
}

const key = (s: string) => s.trim().toLowerCase();
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const dominant = (shapes: string[]): string => {
  const counts = new Map<string, number>();
  for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "none·0";
};
const mk = (id: string, title: string): FederationCheck => ({ id, title, status: "pass", evidence: [], warnings: [] });
const fail = (c: FederationCheck, reason?: string) => { c.status = "fail"; if (reason) c.reason = reason; return c; };
const nc = (c: FederationCheck, reason: string) => { c.status = "not_checkable"; c.reason = reason; return c; };

function fg01(ms: { container: string; m: Manifest }[]): FederationCheck {
  const c = mk("FG-01", "No GlobalId appears in two models");
  const seen = new Map<string, string[]>();
  for (const { container, m } of ms) for (const e of uniq(m.elements.map((x) => x.guid).filter(Boolean))) seen.set(e, [...(seen.get(e) ?? []), container]);
  for (const [guid, models] of seen) if (models.length > 1) c.evidence.push({ guid, models });
  return c.evidence.length ? fail(c, `${c.evidence.length} GlobalId(s) shared between models`) : c;
}

function resolveOrg(rule: Rule, org: string | null | undefined): Rule {
  const escaped = (org ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defs: Record<string, string> = {};
  for (const [k, v] of Object.entries(rule.token_defs ?? {})) defs[k] = v.replaceAll("{org}", escaped);
  return { ...rule, token_defs: defs };
}

function fg02(ms: { container: string; m: Manifest }[], opts: FederationOptions): FederationCheck {
  const c = mk("FG-02", "Type naming is one convention per category");
  // (a) shape drift per category across models
  const byCat = new Map<string, { container: string; names: string[] }[]>();
  for (const { container, m } of ms) {
    const per = new Map<string, string[]>();
    for (const e of m.elements) if (e.type_name) per.set(e.class, [...(per.get(e.class) ?? []), e.type_name]);
    for (const [cat, names] of per) byCat.set(cat, [...(byCat.get(cat) ?? []), { container, names: uniq(names) }]);
  }
  for (const [category, rows] of byCat) {
    if (rows.length < 2) continue;
    const shaped = rows.map((r) => ({ category, model: r.container, shape: dominant(r.names.map(nameShape)), examples: r.names.slice(0, 5) }));
    if (uniq(shaped.map((s) => s.shape)).length > 1) { c.evidence.push(...shaped); c.status = "fail"; }
  }
  // (b) the installed type rule, when there is one
  if (opts.type_rule) {
    const engine = new RuleEngine();
    const rule = resolveOrg(opts.type_rule, opts.org);
    for (const { container, m } of ms)
      for (const name of uniq(m.elements.map((e) => e.type_name).filter((x): x is string => !!x)))
        if (engine.checkName(rule, 0, name)) { c.evidence.push({ model: container, type_name: name, rule: rule.id }); c.status = "fail"; }
  } else {
    c.reason = "no type rule installed — naming shapes compared only";
  }
  if (c.status === "fail") c.reason = (c.reason ? c.reason + "; " : "") + "type naming differs between models";
  return c;
}

function fg03(ms: { container: string; m: Manifest }[], tolMm: number): FederationCheck {
  const c = mk("FG-03", "Levels align by name and elevation");
  const withLevels = ms.filter((x) => x.m.levels.length);
  if (withLevels.length < 2) return nc(c, "fewer than two models carry levels");
  const byName = new Map<string, { name: string; values: { model: string; elevation_mm: number }[] }>();
  for (const { container, m } of withLevels) for (const l of m.levels) {
    const k = key(l.name);
    const row = byName.get(k) ?? { name: l.name, values: [] };
    row.values.push({ model: container, elevation_mm: l.elevation_mm });
    byName.set(k, row);
  }
  let shared = 0;
  for (const row of byName.values()) {
    if (row.values.length === withLevels.length) shared++;
    if (row.values.length >= 2) {
      const el = row.values.map((v) => v.elevation_mm);
      if (Math.max(...el) - Math.min(...el) > tolMm) c.evidence.push({ name: row.name, values: row.values });
    }
    for (const { container } of withLevels) if (!row.values.some((v) => v.model === container)) c.warnings.push(`${row.name}: missing in ${container}`);
  }
  if (c.evidence.length) return fail(c, `${c.evidence.length} level(s) at different elevations`);
  if (shared === 0) return fail(c, "no level name is shared by every model that has levels");
  return c;
}

function fg04(ms: { container: string; m: Manifest }[]): FederationCheck {
  const c = mk("FG-04", "Grid tags match");
  const withGrids = ms.filter((x) => x.m.grids.length);
  if (withGrids.length < 2) return nc(c, "fewer than two models carry grids");
  const union = uniq(withGrids.flatMap((x) => x.m.grids)).sort();
  for (const { container, m } of withGrids) {
    const mine = new Set(m.grids);
    const missing = union.filter((g) => !mine.has(g));
    if (missing.length) c.evidence.push({ model: container, missing, extra: [] });
  }
  return c.evidence.length ? fail(c, "grid tag sets differ between models") : c;
}

function fg05(ms: { container: string; m: Manifest }[], georefM: number, angleDeg: number): FederationCheck {
  const c = mk("FG-05", "Georeference agrees");
  const has = (m: Manifest) => !!m.site && ((m.site.lat != null && m.site.lon != null) || !!m.site.map_conversion);
  const withGeo = ms.filter((x) => has(x.m));
  if (withGeo.length === 0) return nc(c, "no model carries a georeference");
  for (const { container, m } of ms) if (!has(m)) c.evidence.push({ model: container, georeference: "none" });
  const metres = (a: ManifestSite, b: ManifestSite) => {
    if (a.lat == null || b.lat == null || a.lon == null || b.lon == null) return null;
    const dy = (b.lat - a.lat) * 111320, dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  };
  const rot = (mc: MapConversion) => (Math.atan2(mc.x_axis_ordinate, mc.x_axis_abscissa) * 180) / Math.PI;
  for (let i = 0; i < withGeo.length; i++) for (let j = i + 1; j < withGeo.length; j++) {
    const a = withGeo[i], b = withGeo[j];
    const sa = a.m.site!, sb = b.m.site!;
    let deltaM = metres(sa, sb);
    let deltaDeg: number | null = null;
    if (sa.map_conversion && sb.map_conversion) {
      const ma = sa.map_conversion, mb = sb.map_conversion;
      deltaM = Math.max(deltaM ?? 0, Math.hypot(ma.eastings - mb.eastings, ma.northings - mb.northings, ma.height - mb.height));
      deltaDeg = Math.abs(rot(ma) - rot(mb));
    }
    if ((deltaM != null && deltaM > georefM) || (deltaDeg != null && deltaDeg > angleDeg))
      c.evidence.push({ model_a: a.container, model_b: b.container, delta_m: deltaM == null ? null : Number(deltaM.toFixed(3)), delta_deg: deltaDeg == null ? null : Number(deltaDeg.toFixed(4)) });
  }
  return c.evidence.length ? fail(c, "models are not placed together") : c;
}

function fg06(models: FederationModel[], opts: FederationOptions): FederationCheck {
  const c = mk("FG-06", "Every model is named to the rule and judged");
  const rs = opts.naming_ruleset;
  for (const m of models) {
    let naming: NamingResult | null = null;
    if (rs && rs.enforce !== "off") {
      naming = validateContainerName(m.container, rs);
      if (!naming.ok) {
        if (rs.enforce === "reject") { c.status = "fail"; c.evidence.push({ model: m.container, naming, verdict: opts.verdicts?.[m.version_id] ?? null }); continue; }
        c.warnings.push(`${m.container}: name does not meet '${rs.title}' (warn level)`);
      }
    }
    const verdict = opts.verdicts?.[m.version_id] ?? null;
    if (verdict !== "accepted" && verdict !== "recorded") { c.status = "fail"; c.evidence.push({ model: m.container, naming, verdict }); }
  }
  if (c.status === "fail") c.reason = "a model is misnamed, rejected or not judged";
  if (!rs) c.warnings.push("no naming ruleset installed — names not checked");
  return c;
}

export function checkFederation(models: FederationModel[], opts: FederationOptions = {}): FederationResult {
  const tol = { level_mm: 1, georef_m: 0.5, angle_deg: 0.1, ...(opts.tolerance ?? {}) };
  const withManifest = models.filter((m): m is FederationModel & { manifest: Manifest } => !!m.manifest).map((m) => ({ container: m.container, m: m.manifest }));
  const out: FederationResult = { verdict: "pass", models: models.map((m) => ({ container: m.container, version_id: m.version_id, has_manifest: !!m.manifest })), checks: [] };
  if (withManifest.length < 2) {
    out.verdict = "not_checkable";
    for (const id of ["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]) out.checks.push(nc(mk(id, ""), `fewer than two models carry a manifest (${withManifest.length} of ${models.length})`));
    return out;
  }
  out.checks = [fg01(withManifest), fg02(withManifest, opts), fg03(withManifest, tol.level_mm), fg04(withManifest), fg05(withManifest, tol.georef_m, tol.angle_deg), fg06(models, opts)];
  out.verdict = out.checks.some((c) => c.status === "fail") ? "fail" : "pass";
  return out;
}
```

- [ ] **Step 4: Export, run, rebuild the bundle**

Append `export * from "./federation";` to `WebApp/src/sentinel-core/index.ts` and `export { checkFederation, nameShape } from "./federation";` to `bridge-entry.ts`.

Run: `cd WebApp && npx vitest run src/sentinel-core/federation.test.ts`
Expected: PASS, 11 tests. Then `npm run build:bridge-core` (rewrites `bridge/sentinel-core.mjs`), then `npx vitest run bridge` to confirm the bundle still serves the existing bridge tests.

- [ ] **Step 5: Commit**

```bash
git add WebApp/src/sentinel-core/federation.ts WebApp/src/sentinel-core/federation.test.ts WebApp/src/sentinel-core/index.ts WebApp/src/sentinel-core/bridge-entry.ts WebApp/bridge/sentinel-core.mjs
git commit -m "feat(core): Federation Gate — six cross-model data checks over manifests, pure and evidence-first

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 2: Fixtures and the manifest extractor

**Files:**
- Create: `WebApp/bridge/fixtures/fed-a.ifc`, `WebApp/bridge/fixtures/fed-b.ifc`, `WebApp/bridge/fixtures/fed-c.ifc`
- Create: `WebApp/bridge/ifc-manifest.mjs`
- Test: `WebApp/bridge/ifc-manifest.test.mjs`
- Read for reference: `WebApp/bridge/ifc-extract.mjs` (web-ifc bootstrap, `val()`), `WebApp/bridge/fixtures/minimal.ifc` (fixture style).

**Interfaces:**
- Consumes: web-ifc (`IfcAPI`, `GetLineIDsWithType`, `GetLine`, `GetModelSchema`, `GetNameFromTypeCode`, constants `IFCSIUNIT`, `IFCCONVERSIONBASEDUNIT`, `IFCRELCONTAINEDINSPATIALSTRUCTURE`, `IFCRELDEFINESBYTYPE`, `IFCBUILDINGSTOREY`, `IFCGRIDAXIS`, `IFCSITE`, `IFCMAPCONVERSION` — all verified present at 0.0.77).
- Produces: `extractManifest(bytes) → Promise<Manifest>` with the Task 1 `Manifest` shape (`elements[{guid, class, type_name, storey}]`, `levels[{name, elevation_mm}]`, `grids[]` sorted unique, `site | null`, `schema`, `counts{elements, skipped}`); `MANIFEST_CLASSES`.

- [ ] **Step 1: Write the three fixtures**

`WebApp/bridge/fixtures/fed-a.ifc` (LF, no BOM). Facts the tests rely on: units millimetres; levels `Level 1` 0 / `Level 2` 3300; grids `A`, `B`, `1`; site 51°30' N, 0°06' W (= 51.5, −0.1), elevation 12 m; map conversion E 500000 N 3500000, CRS `EPSG:32636`; two walls typed `Wall 1` / `Wall 2` (ObjectType and IfcWallType name), each with `Pset_WallCommon.FireRating`; wall #20 carries GlobalId `7YvctVUKr0kugbFTf53O9L`.

```
ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('fed-a.ifc','2026-09-23T00:00:00',(''),(''),'Sentinel federation fixture A','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);
#4=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#5=IFCUNITASSIGNMENT((#4));
#10=IFCPROJECT('0FedA0000000000000000A',$,'Fed A',$,$,$,$,(#3),#5);
#11=IFCSITE('1FedA0000000000000000A',$,'Site',$,$,$,$,$,.ELEMENT.,(51,30,0,0),(0,-6,0,0),12000.,$,$);
#12=IFCBUILDING('2FedA0000000000000000A',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);
#13=IFCBUILDINGSTOREY('3FedA0000000000000000A',$,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#14=IFCBUILDINGSTOREY('4FedA0000000000000000A',$,'Level 2',$,$,$,$,$,.ELEMENT.,3300.);
#15=IFCRELAGGREGATES('5FedA0000000000000000A',$,$,$,#10,(#11));
#16=IFCRELAGGREGATES('6FedA0000000000000000A',$,$,$,#11,(#12));
#17=IFCRELAGGREGATES('7FedA0000000000000000A',$,$,$,#12,(#13,#14));
#20=IFCWALLSTANDARDCASE('7YvctVUKr0kugbFTf53O9L',$,'Wall-A1',$,'Wall 1',$,$,'A1',.STANDARD.);
#21=IFCWALLSTANDARDCASE('8FedA0000000000000000A',$,'Wall-A2',$,'Wall 2',$,$,'A2',.STANDARD.);
#24=IFCRELCONTAINEDINSPATIALSTRUCTURE('9FedA0000000000000000A',$,$,$,(#20,#21),#13);
#30=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('REI 60'),$);
#32=IFCPROPERTYSET('AFedA0000000000000000A',$,'Pset_WallCommon',$,(#30));
#33=IFCRELDEFINESBYPROPERTIES('BFedA0000000000000000A',$,$,$,(#20,#21),#32);
#40=IFCWALLTYPE('CFedA0000000000000000A',$,'Wall 1',$,$,$,$,$,$,.STANDARD.);
#41=IFCWALLTYPE('DFedA0000000000000000A',$,'Wall 2',$,$,$,$,$,$,.STANDARD.);
#42=IFCRELDEFINESBYTYPE('EFedA0000000000000000A',$,$,$,(#20),#40);
#43=IFCRELDEFINESBYTYPE('FFedA0000000000000000A',$,$,$,(#21),#41);
#50=IFCCARTESIANPOINT((0.,0.));
#51=IFCCARTESIANPOINT((0.,10000.));
#52=IFCCARTESIANPOINT((7500.,0.));
#53=IFCCARTESIANPOINT((7500.,10000.));
#54=IFCCARTESIANPOINT((10000.,0.));
#55=IFCPOLYLINE((#50,#51));
#56=IFCPOLYLINE((#52,#53));
#57=IFCPOLYLINE((#50,#54));
#60=IFCGRIDAXIS('A',#55,.T.);
#61=IFCGRIDAXIS('B',#56,.T.);
#62=IFCGRIDAXIS('1',#57,.T.);
#63=IFCGRID('GFedA0000000000000000A',$,'Grid',$,$,$,$,(#60,#61),(#62),$,$);
#64=IFCRELCONTAINEDINSPATIALSTRUCTURE('HFedA0000000000000000A',$,$,$,(#63),#13);
#90=IFCPROJECTEDCRS('EPSG:32636',$,$,$,$,$,$);
#91=IFCMAPCONVERSION(#3,#90,500000.,3500000.,0.,1.,0.,1.);
ENDSEC;
END-ISO-10303-21;
```

`fed-b.ifc` — the same file with these differences only (keep every other line): header name `fed-b.ifc` / `fixture B`; every GlobalId ending `…A` becomes `…B` (e.g. `0FedA0000000000000000B`) **except** wall #20, which keeps `7YvctVUKr0kugbFTf53O9L` (the planted duplicate); `#11=IFCSITE('1FedA0000000000000000B',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);` (no georeference); `#13` `Level 1` elevation `20.`; `#20` ObjectType `'W-A1-Fin'`, `#21` ObjectType `'W-A2-Fin'`; `#40` name `'W-A1-Fin'`, `#41` `'W-A2-Fin'`; grid axis `#61` tag `'C'`; delete lines `#90` and `#91`.

`fed-c.ifc` — the same as `fed-a.ifc` with: header name `fed-c.ifc` / `fixture C`; every GlobalId ending `…A` becomes `…C`; wall #20 GlobalId `CAvctVUKr0kugbFTf53O9L` (distinct); type names unchanged (`Wall 1` / `Wall 2`).

- [ ] **Step 2: Write the failing test**

`WebApp/bridge/ifc-manifest.test.mjs`:

```js
// A model's identity for federation, read straight from the IFC: elements by GlobalId with class, type
// name and storey; levels; grid tags; site and map conversion. The two fixtures plant the S11 mismatch.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { extractManifest, MANIFEST_CLASSES } from "./ifc-manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(resolve(here, `fixtures/${n}`));

describe("extractManifest", () => {
  it("reads fed-a: walls typed Wall 1 / Wall 2 on Level 1, two levels, three grid tags, a georeferenced site", async () => {
    const m = await extractManifest(fx("fed-a.ifc"));
    expect(m.schema).toBe("IFC4");
    expect(m.counts).toEqual({ elements: 2, skipped: 0 });
    expect(m.elements.map((e) => [e.guid, e.class, e.type_name, e.storey])).toEqual([
      ["7YvctVUKr0kugbFTf53O9L", "IFCWALLSTANDARDCASE", "Wall 1", "Level 1"],
      ["8FedA0000000000000000A", "IFCWALLSTANDARDCASE", "Wall 2", "Level 1"],
    ]);
    expect(m.levels).toEqual([{ name: "Level 1", elevation_mm: 0 }, { name: "Level 2", elevation_mm: 3300 }]);
    expect(m.grids).toEqual(["1", "A", "B"]);
    expect(m.site.lat).toBeCloseTo(51.5, 6);
    expect(m.site.lon).toBeCloseTo(-0.1, 6);
    expect(m.site.elevation_m).toBeCloseTo(12, 6);
    expect(m.site.map_conversion).toMatchObject({ eastings: 500000, northings: 3500000, height: 0, x_axis_abscissa: 1, x_axis_ordinate: 0, scale: 1, crs_name: "EPSG:32636" });
  });
  it("reads fed-b: the hyphenated convention, Level 1 at 20 mm, grid C, no georeference", async () => {
    const m = await extractManifest(fx("fed-b.ifc"));
    expect(m.elements.map((e) => e.type_name)).toEqual(["W-A1-Fin", "W-A2-Fin"]);
    expect(m.elements[0].guid).toBe("7YvctVUKr0kugbFTf53O9L");       // the planted duplicate
    expect(m.levels).toEqual([{ name: "Level 1", elevation_mm: 20 }, { name: "Level 2", elevation_mm: 3300 }]);
    expect(m.grids).toEqual(["1", "A", "C"]);
    expect(m.site).toEqual({ lat: null, lon: null, elevation_m: null, map_conversion: null });
  });
  it("falls back to the type's name when ObjectType is empty, and covers the extractor's classes", async () => {
    const text = fx("fed-a.ifc").toString("utf8").replace("'Wall-A1',$,'Wall 1',$", "'Wall-A1',$,$,$");
    const m = await extractManifest(Buffer.from(text, "utf8"));
    expect(m.elements[0].type_name).toBe("Wall 1");
    for (const c of ["IFCWALL", "IFCSLAB", "IFCDOOR", "IFCWINDOW", "IFCBEAM", "IFCCOLUMN", "IFCMEMBER", "IFCPLATE", "IFCSPACE"]) expect(MANIFEST_CLASSES).toContain(c);
  });
  it("converts metre-unit elevations to millimetres", async () => {
    const text = fx("fed-a.ifc").toString("utf8").replace("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)", "IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)").replace(".ELEMENT.,3300.)", ".ELEMENT.,3.3)");
    const m = await extractManifest(Buffer.from(text, "utf8"));
    expect(m.levels[1].elevation_mm).toBeCloseTo(3300, 6);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/ifc-manifest.test.mjs`
Expected: FAIL — cannot resolve `./ifc-manifest.mjs`.

- [ ] **Step 4: Write the extractor**

`WebApp/bridge/ifc-manifest.mjs`:

```js
// A model's identity for the Federation Gate, read straight from the IFC with web-ifc: elements by
// GlobalId (class, type name, storey), levels, grid tags, site position and map conversion. Identity
// only — no property sets — so it stays cheap on a 150 MB model. Never throws on one bad entity.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as WebIFC from "web-ifc";

const here = dirname(fileURLToPath(import.meta.url));
const WASM_DIR = resolve(here, "../node_modules/web-ifc") + "/";

/** The extractor's classes plus the members and plates the delivery gate counts as building elements. */
export const MANIFEST_CLASSES = [
  "IFCWALL", "IFCSLAB", "IFCROOF", "IFCCOVERING", "IFCDOOR", "IFCWINDOW", "IFCSTAIR", "IFCCOLUMN", "IFCBEAM",
  "IFCFOOTING", "IFCSPACE", "IFCCURTAINWALL", "IFCRAILING", "IFCMEMBER", "IFCPLATE",
];

const val = (o) => (o == null ? null : typeof o === "object" && !Array.isArray(o) && "value" in o ? o.value : o);
const num = (o) => { const v = val(o); if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const ref = (o) => (o && typeof o === "object" && "value" in o ? o.value : typeof o === "number" ? o : null);
const idsOf = (api, mid, type) => { const v = api.GetLineIDsWithType(mid, type, true); const out = []; for (let i = 0; i < v.size(); i++) out.push(v.get(i)); return out; };

/** Project length unit → millimetres per unit. IfcSIUnit METRE with prefix MILLI is 1; bare METRE 1000;
 *  conversion-based FOOT 304.8, INCH 25.4. Unknown → assume metres (the IFC default). */
function mmPerUnit(api, mid) {
  for (const id of idsOf(api, mid, WebIFC.IFCSIUNIT)) {
    const u = api.GetLine(mid, id);
    if (val(u.UnitType) !== "LENGTHUNIT") continue;
    const p = val(u.Prefix);
    if (p === "MILLI") return 1;
    if (p === "CENTI") return 10;
    if (p === "DECI") return 100;
    if (p === "KILO") return 1e6;
    if (p == null) return 1000;
  }
  for (const id of idsOf(api, mid, WebIFC.IFCCONVERSIONBASEDUNIT)) {
    const u = api.GetLine(mid, id);
    if (val(u.UnitType) !== "LENGTHUNIT") continue;
    const n = String(val(u.Name) || "").toUpperCase();
    if (n === "FOOT" || n === "FEET") return 304.8;
    if (n === "INCH") return 25.4;
  }
  return 1000;
}

/** IfcCompoundPlaneAngleMeasure (deg, min, sec[, millionths]) → decimal degrees; the sign is carried by
 *  the first non-zero component, as the IFC spec defines it. */
function compoundAngle(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const parts = list.map((x) => num(x) ?? 0);
  const first = parts.find((p) => p !== 0);
  const sign = first != null && first < 0 ? -1 : 1;
  const [d = 0, m = 0, s = 0, us = 0] = parts.map(Math.abs);
  return sign * (d + m / 60 + s / 3600 + us / 3.6e9);
}

export async function extractManifest(bytes) {
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(WASM_DIR, true);
  await api.Init();
  const mid = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const out = { schema: "", elements: [], levels: [], grids: [], site: null, counts: { elements: 0, skipped: 0 } };
  try {
    try { out.schema = String(api.GetModelSchema(mid) || "").toUpperCase(); } catch { out.schema = ""; }
    const mm = mmPerUnit(api, mid);

    const storeyOf = new Map();
    for (const id of idsOf(api, mid, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      try {
        const r = api.GetLine(mid, id);
        const name = val(api.GetLine(mid, ref(r.RelatingStructure))?.Name) ?? null;
        for (const e of r.RelatedElements || []) storeyOf.set(ref(e), name);
      } catch { out.counts.skipped++; }
    }
    const typeOf = new Map();
    for (const id of idsOf(api, mid, WebIFC.IFCRELDEFINESBYTYPE)) {
      try {
        const r = api.GetLine(mid, id);
        const name = val(api.GetLine(mid, ref(r.RelatingType))?.Name) ?? null;
        for (const e of r.RelatedObjects || []) typeOf.set(ref(e), name);
      } catch { out.counts.skipped++; }
    }

    const seen = new Set();
    for (const cls of MANIFEST_CLASSES) {
      const code = WebIFC[cls];
      if (typeof code !== "number") continue;
      for (const id of idsOf(api, mid, code)) {
        if (seen.has(id)) continue;
        seen.add(id);
        try {
          const line = api.GetLine(mid, id);
          const objectType = val(line.ObjectType);
          out.elements.push({
            guid: val(line.GlobalId) ?? String(id),
            class: String(api.GetNameFromTypeCode(line.type) || cls).toUpperCase(),
            type_name: (objectType != null && objectType !== "") ? String(objectType) : (typeOf.get(id) ?? null),
            storey: storeyOf.get(id) ?? null,
          });
          out.counts.elements++;
        } catch { out.counts.skipped++; }
      }
    }

    for (const id of idsOf(api, mid, WebIFC.IFCBUILDINGSTOREY)) {
      try {
        const s = api.GetLine(mid, id);
        const e = num(s.Elevation);
        out.levels.push({ name: String(val(s.Name) ?? `#${id}`), elevation_mm: e == null ? 0 : Math.round(e * mm * 1000) / 1000 });
      } catch { out.counts.skipped++; }
    }
    out.levels.sort((a, b) => a.elevation_mm - b.elevation_mm);

    const tags = new Set();
    for (const id of idsOf(api, mid, WebIFC.IFCGRIDAXIS)) {
      try { const t = val(api.GetLine(mid, id).AxisTag); if (t != null && String(t) !== "") tags.add(String(t)); } catch { out.counts.skipped++; }
    }
    out.grids = [...tags].sort();

    const siteIds = idsOf(api, mid, WebIFC.IFCSITE);
    if (siteIds.length) {
      const s = api.GetLine(mid, siteIds[0]);
      const el = num(s.RefElevation);
      const site = { lat: compoundAngle(s.RefLatitude), lon: compoundAngle(s.RefLongitude), elevation_m: el == null ? null : (el * mm) / 1000, map_conversion: null };
      const mcIds = idsOf(api, mid, WebIFC.IFCMAPCONVERSION);
      if (mcIds.length) {
        const mc = api.GetLine(mid, mcIds[0]);
        let crs = null;
        try { crs = val(api.GetLine(mid, ref(mc.TargetCRS))?.Name) ?? null; } catch { crs = null; }
        site.map_conversion = { eastings: num(mc.Eastings) ?? 0, northings: num(mc.Northings) ?? 0, height: num(mc.OrthogonalHeight) ?? 0, x_axis_abscissa: num(mc.XAxisAbscissa) ?? 1, x_axis_ordinate: num(mc.XAxisOrdinate) ?? 0, scale: num(mc.Scale) ?? 1, crs_name: crs == null ? null : String(crs) };
      }
      out.site = site;
    }
  } finally {
    api.CloseModel(mid);
  }
  return out;
}
```

If web-ifc returns `RefLatitude` entries as plain numbers rather than `{value}` objects, `num()` already handles both. If `GetLine(mid, id)` on an `IFCRELCONTAINEDINSPATIALSTRUCTURE` returns `RelatedElements` as `{type, value}` handles, `ref()` unwraps them.

- [ ] **Step 5: Run the test, then commit**

Run: `cd WebApp && npx vitest run bridge/ifc-manifest.test.mjs`
Expected: PASS, 4 tests.

```bash
git add WebApp/bridge/fixtures/fed-a.ifc WebApp/bridge/fixtures/fed-b.ifc WebApp/bridge/fixtures/fed-c.ifc WebApp/bridge/ifc-manifest.mjs WebApp/bridge/ifc-manifest.test.mjs
git commit -m "feat(bridge): model manifests from IFC — elements by GlobalId, levels, grids, site and map conversion; three federation fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Manifest store, capture on publish, backfill

**Files:**
- Create: `WebApp/bridge/manifest-store.mjs`
- Test: `WebApp/bridge/manifest-store.test.mjs`
- Create: `WebApp/bridge/manifest.mjs` (backfill CLI)
- Modify: `WebApp/bridge/bcf-service.mjs` (intake route after `runIntake`, about line 1008; new `manifests` routes after the `intake` route), `WebApp/bridge/watch-outbox.mjs:45-60` (`registerVersion` returns its result; capture after it), `WebApp/bridge/cli-args.mjs` (reuse).
- Read for reference: `cde-store.mjs:598-637` (`createRevision(key, { container_version_id, rev_code, uploaded_by, snapshots })` → `{ revision_id, element_count }`), `:709-720` (`getRevisionSnapshots(revisionId)` → rows `{ guid, category, type_name, … }`), `:371-384` (`listFiles(key)` → `[{ id, iso_name, container_type, live_version_id, versions[] }]`), `:960-1000` (`docGet`, `docUpsert`).

**Interfaces:**
- Consumes: Task 2 `extractManifest`.
- Produces: `captureManifest(key, versionId, bytes, { actor, source, rev_code }, deps?) → { revision_id, elements, skipped, levels, grids, has_site }`; `getManifest(key, versionId, deps?) → Manifest & { captured_at, sha256 } | null`; `liveModelVersions(key, deps?) → [{ container, container_id, version_id, revision }]`; `listManifests(key, deps?) → [{ container, container_id, version_id, revision, has_manifest, captured_at }]`; routes `GET /cde/:key/manifests`, `POST /cde/:key/manifests/:versionId` (body = IFC bytes, `?actor=&revision=`); CLI `node bridge/manifest.mjs <file.ifc> --project <key> --version <id> [--actor cli]`.

- [ ] **Step 1: Write the failing test**

`WebApp/bridge/manifest-store.test.mjs`:

```js
// Manifests per container version: elements into the revision tables, datum + site into one document.
import { describe, it, expect } from "vitest";
import { captureManifest, getManifest, listManifests } from "./manifest-store.mjs";

const manifestA = { schema: "IFC4", elements: [{ guid: "g1", class: "IFCWALL", type_name: "Wall 1", storey: "Level 1" }, { guid: "g2", class: "IFCSLAB", type_name: null, storey: "Level 1" }], levels: [{ name: "Level 1", elevation_mm: 0 }], grids: ["A"], site: { lat: 51.5, lon: -0.1, elevation_m: 12, map_conversion: null }, counts: { elements: 2, skipped: 0 } };

function memDeps() {
  const docs = new Map(), revisions = new Map(), calls = [];
  const k = (s, p, d) => `${s}|${p}|${d}`;
  return {
    docs, revisions, calls,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    extractManifest: async () => manifestA,
    createRevision: async (key, b) => { calls.push(["createRevision", key, b]); const id = `rev-${revisions.size + 1}`; revisions.set(id, b.snapshots); return { revision_id: id, element_count: b.snapshots.length }; },
    getRevisionSnapshots: async (rid) => revisions.get(rid) ?? [],
    docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
    docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
    listFiles: async () => [
      { id: "c-1", iso_name: "A-0101.ifc", container_type: "model", live_version_id: "v-1", versions: [{ id: "v-1", revision: "P01", is_live: true }] },
      { id: "c-2", iso_name: "B-0102.ifc", container_type: "model", live_version_id: "v-2", versions: [{ id: "v-2", revision: "P01", is_live: true }] },
      { id: "c-3", iso_name: "programme.csv", container_type: "document", live_version_id: "v-3", versions: [] },
      { id: "c-4", iso_name: "old.ifc", container_type: "model", live_version_id: null, versions: [] },
    ],
  };
}

describe("manifest store", () => {
  it("captures: a revision of element rows linked to the version, one document with datum and site, a sha", async () => {
    const d = memDeps();
    const r = await captureManifest("p", "v-1", Buffer.from("ISO-10303-21;"), { actor: "cli", source: "intake", rev_code: "P01" }, d);
    expect(r).toEqual({ revision_id: "rev-1", elements: 2, skipped: 0, levels: 1, grids: 1, has_site: true });
    const [, key, body] = d.calls[0];
    expect(key).toBe("p");
    expect(body).toMatchObject({ container_version_id: "v-1", rev_code: "P01", uploaded_by: "cli" });
    expect(body.snapshots).toEqual([{ guid: "g1", category: "IFCWALL", type_name: "Wall 1" }, { guid: "g2", category: "IFCSLAB", type_name: null }]);
    const doc = d.docs.get("manifest|uuid-p|v-1");
    expect(doc).toMatchObject({ version_id: "v-1", revision_id: "rev-1", schema: "IFC4", levels: manifestA.levels, grids: ["A"], site: manifestA.site, source: "intake" });
    expect(doc.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof doc.captured_at).toBe("string");
  });
  it("reads back a manifest the core can judge, and null when none was captured", async () => {
    const d = memDeps();
    await captureManifest("p", "v-1", Buffer.from("x"), { actor: "cli" }, d);
    const m = await getManifest("p", "v-1", d);
    expect(m.elements).toEqual([{ guid: "g1", class: "IFCWALL", type_name: "Wall 1", storey: null }, { guid: "g2", class: "IFCSLAB", type_name: null, storey: null }]);
    expect(m.levels).toEqual(manifestA.levels);
    expect(m.site.lat).toBe(51.5);
    expect(await getManifest("p", "v-9", d)).toBeNull();
  });
  it("lists live model versions with their manifest state, ignoring documents and containers without a live version", async () => {
    const d = memDeps();
    await captureManifest("p", "v-1", Buffer.from("x"), { actor: "cli" }, d);
    const l = await listManifests("p", d);
    expect(l).toEqual([
      { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: true, captured_at: expect.any(String) },
      { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: false, captured_at: null },
    ]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/manifest-store.test.mjs`
Expected: FAIL — cannot resolve `./manifest-store.mjs`.

- [ ] **Step 3: Write the store**

`WebApp/bridge/manifest-store.mjs`:

```js
// Manifests per container version, for the Federation Gate. Element rows go into the revision tables
// (model_revisions + element_snapshots, migration 0005) linked to the version — the same rows revision
// diff and the element graph read — and the datum + site go into one small document keyed by the
// version id. Capture is called after a publish is registered and must never fail that publish: the
// callers log an error and the model reads "no manifest" in the gate.
import { createHash } from "node:crypto";

export const STORE = "manifest";

async function wire(deps = {}) {
  const need = ["ensureProject", "createRevision", "getRevisionSnapshots", "docGet", "docUpsert", "listFiles"];
  const cde = need.every((n) => deps[n]) ? null : await import("./cde-store.mjs");
  return {
    ensureProject: deps.ensureProject || cde.ensureProject,
    createRevision: deps.createRevision || cde.createRevision,
    getRevisionSnapshots: deps.getRevisionSnapshots || cde.getRevisionSnapshots,
    docGet: deps.docGet || cde.docGet,
    docUpsert: deps.docUpsert || cde.docUpsert,
    listFiles: deps.listFiles || cde.listFiles,
    extractManifest: deps.extractManifest || (await import("./ifc-manifest.mjs")).extractManifest,
  };
}

export async function captureManifest(key, versionId, bytes, { actor = "bridge", source = "intake", rev_code = null } = {}, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const m = await d.extractManifest(bytes);
  const rev = await d.createRevision(key, {
    container_version_id: versionId, rev_code, uploaded_by: actor,
    snapshots: m.elements.map((e) => ({ guid: e.guid, category: e.class, type_name: e.type_name ?? null })),
  });
  const doc = {
    version_id: versionId, revision_id: rev.revision_id, schema: m.schema,
    levels: m.levels, grids: m.grids, site: m.site, counts: m.counts,
    sha256: createHash("sha256").update(bytes).digest("hex"), captured_at: new Date().toISOString(), source,
  };
  await d.docUpsert(STORE, proj.id, versionId, doc);
  return { revision_id: rev.revision_id, elements: m.counts.elements, skipped: m.counts.skipped, levels: m.levels.length, grids: m.grids.length, has_site: !!(m.site && (m.site.lat != null || m.site.map_conversion)) };
}

export async function getManifest(key, versionId, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const doc = await d.docGet(STORE, proj.id, versionId);
  if (!doc) return null;
  const rows = await d.getRevisionSnapshots(doc.revision_id);
  return {
    schema: doc.schema, levels: doc.levels || [], grids: doc.grids || [], site: doc.site ?? null, counts: doc.counts,
    elements: rows.map((r) => ({ guid: r.guid, class: r.category, type_name: r.type_name ?? null, storey: null })),
    captured_at: doc.captured_at, sha256: doc.sha256,
  };
}

/** The federated set as the CDE sees it: every model container with a live version. */
export async function liveModelVersions(key, deps) {
  const d = await wire(deps);
  const files = await d.listFiles(key);
  return files
    .filter((f) => f.container_type === "model" && f.live_version_id)
    .map((f) => ({ container: f.iso_name, container_id: f.id, version_id: f.live_version_id, revision: (f.versions || []).find((v) => v.id === f.live_version_id)?.revision ?? null }));
}

export async function listManifests(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const out = [];
  for (const m of await liveModelVersions(key, deps)) {
    const doc = await d.docGet(STORE, proj.id, m.version_id);
    out.push({ ...m, has_manifest: !!doc, captured_at: doc?.captured_at ?? null });
  }
  return out;
}
```

- [ ] **Step 4: Hook capture into intake and the watcher; add the routes and the CLI**

In `bcf-service.mjs`, in the intake route, replace `return send(res, 200, result);` (after `const result = await runIntake(...)`) with:

```js
        // A published version gets its manifest for the Federation Gate. Never fails the publish.
        if (result.version?.version_id) {
          try {
            const { captureManifest } = await import("./manifest-store.mjs");
            result.manifest = await captureManifest(p1, result.version.version_id, bytes, { actor: q("actor") || q("source"), source: "intake", rev_code: result.version.revision });
          } catch (e) {
            console.warn(`[intake] manifest capture failed for version ${result.version.version_id}: ${e?.message || e}`);
            result.manifest = { error: String(e?.message || e) };
          }
        }
        return send(res, 200, result);
```

After the `intake` route add:

```js
      // Manifests (Federation Gate inputs): GET /cde/:key/manifests · POST /cde/:key/manifests/:versionId (body = IFC bytes, backfill)
      if (p2 === "manifests") {
        const ms = await import("./manifest-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await ms.listManifests(p1));
        if (p3 && req.method === "POST") {
          if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) return send(res, 413, { message: `File too large (> ${Math.round(MAX_UPLOAD / 1048576)} MB).` });
          const bytes = await readRaw(req);
          if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
          return send(res, 201, await ms.captureManifest(p1, p3, bytes, { actor: url.searchParams.get("actor") || "cli", source: "backfill", rev_code: url.searchParams.get("revision") || null }));
        }
      }
```

In `watch-outbox.mjs`, make `registerVersion` return `{ key, ...result }` (`const r = await cde.registerFileVersion(...); … return { key, ...r };`, and `return null` on the early exits), then in `handle()` after each of the two `await registerVersion(...)` calls (assign to `const reg`) add:

```js
      if (reg?.version?.id) {
        try {
          const { captureManifest } = await import("./manifest-store.mjs");
          const mf = await captureManifest(reg.key, reg.version.id, await readFile(p), { actor: "outbox", source: "outbox", rev_code: reg.version.revision });
          console.log(`  🧭 manifest: ${mf.elements} element(s), ${mf.levels} level(s), ${mf.grids} grid(s)${mf.has_site ? ", georeferenced" : ""}`);
        } catch (e) { console.error(`  ⚠ manifest capture failed for ${name} (version ${reg.version.id}): ${e?.message || e}`); }
      }
```
(`readFile` is already imported from `node:fs/promises` in that file.)

`WebApp/bridge/manifest.mjs`:

```js
// Backfill a manifest for a version published before manifests existed:
//   node bridge/manifest.mjs <file.ifc> --project <key> --version <container_version_id> [--actor cli] [--revision P01]
import { readFile } from "node:fs/promises";
import { loadEnv } from "./load-env.mjs";
import { parseCliArgs } from "./cli-args.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const { file, flag } = parseCliArgs(process.argv.slice(2));
const project = flag("project"), version = flag("version");
if (!file || !project || !version) { console.error("Usage: node bridge/manifest.mjs <file.ifc> --project <key> --version <id> [--actor cli] [--revision P01]"); process.exit(1); }
const q = new URLSearchParams({ actor: flag("actor", "cli") });
if (flag("revision")) q.set("revision", flag("revision"));
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/manifests/${encodeURIComponent(version)}?${q}`, {
  method: "POST", headers: { "Content-Type": "application/octet-stream", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: await readFile(file),
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }
console.log(`Manifest captured for version ${version}: ${r.elements} element(s), ${r.levels} level(s), ${r.grids} grid(s)${r.has_site ? ", georeferenced" : ""} (revision ${r.revision_id})`);
```

Check `bridge/cli-args.mjs` exports `parseCliArgs(argv) → { file, flag(name, def), has(name) }` (created by the Governed Intake work); use its actual export name if it differs.

- [ ] **Step 5: Run the tests, smoke the backfill route, commit**

Run: `cd WebApp && npx vitest run bridge/manifest-store.test.mjs && npx vitest run bridge`
Expected: PASS.

Smoke (your own bridge instance): from `WebApp`, run `BCF_PORT=4199 node bridge/bcf-service.mjs` in the background; with `TOKEN` from `%AppData%\Sentinel\bcf-config.json` (`serviceToken`): `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4199/cde/aster-office/manifests` → an array with `has_manifest` per live model. Stop the instance.

```bash
git add WebApp/bridge/manifest-store.mjs WebApp/bridge/manifest-store.test.mjs WebApp/bridge/manifest.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/watch-outbox.mjs
git commit -m "feat(bridge): manifests captured on every publish (intake + outbox), backfill route and CLI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The gate on the bridge — store, verdict lookup, routes, BCF, CLI

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (add `versionVerdicts` after `recordVersionVerdict`)
- Create: `WebApp/bridge/federation-store.mjs`
- Test: `WebApp/bridge/federation-store.test.mjs`
- Modify: `WebApp/bridge/bcf-service.mjs` (routes after `manifests`; `raiseFederationTopics` next to `raiseGovernedFailureTopics` at line 293)
- Create: `WebApp/bridge/federation.mjs` (CLI)
- Read for reference: `bcf-service.mjs:293-330` (topic building, `cde.newTopicObject`, `cde.bcfCreateTopic`, `broadcast`), `cde-store.mjs:775-782` (`projectNamingRuleset(key)` → `{ ruleset }`), `artefact-store.mjs` (`getArtefact(key, kind)`), `cde-store.mjs:155-163` (`proj.metadata`).

**Interfaces:**
- Consumes: Task 1 `checkFederation` from `./sentinel-core.mjs`; Task 3 `listManifests`, `getManifest`.
- Produces: `versionVerdicts(key, versionIds) → Record<id, "accepted"|"recorded"|"rejected"|null>`; `runFederation(key, { versions? }, { actor }, deps?) → FederationRun = { result, set[], at, actor, type_rule, naming_ruleset, bcf? }`; `getFederation(key, deps?) → { latest: FederationRun | null, stale, live_set }`; routes `GET /cde/:key/federation`, `POST /cde/:key/federation/run { versions?, raise_bcf? }` (`?actor=`); CLI exit codes 0 pass, 2 fail, 3 not checkable.

- [ ] **Step 1: The verdict lookup**

Add to `cde-store.mjs` after `recordVersionVerdict`:

```js
/** Latest governed verdict per version id (from the "verdict:<v>" rows recordVersionVerdict writes);
 *  null when a version was never judged — the Federation Gate treats that as not judged, never as a pass. */
export async function versionVerdicts(key, versionIds = []) {
  const out = {};
  for (const id of versionIds) out[id] = null;
  const ids = versionIds.filter(isUuid);
  if (!ids.length) return out;
  const proj = await ensureProject(key);
  const rows = await sb(`audit_log?project_id=eq.${proj.id}&entity_type=eq.file_version&action=like.verdict:*&entity_id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,entity_id,action&order=id.desc`);
  for (const r of rows || []) if (out[r.entity_id] === null) out[r.entity_id] = String(r.action).replace(/^verdict:/, "");
  return out;
}
```

- [ ] **Step 2: Write the failing store test**

`WebApp/bridge/federation-store.test.mjs`:

```js
// The gate on the bridge: resolve the set, load manifests and verdicts, judge, store, audit.
import { describe, it, expect } from "vitest";
import { runFederation, getFederation } from "./federation-store.mjs";

const mA = { schema: "IFC4", elements: [{ guid: "g1", class: "IFCWALL", type_name: "Wall 1", storey: null }], levels: [{ name: "Level 1", elevation_mm: 0 }], grids: ["A"], site: { lat: 51.5, lon: -0.1, elevation_m: 0, map_conversion: null } };
const mB = { ...mA, elements: [{ guid: "g1", class: "IFCWALL", type_name: "W-A1-Fin", storey: null }] };

function memDeps({ manifests = { "v-1": mA, "v-2": mB }, verdicts = { "v-1": "accepted", "v-2": "accepted" }, live = null } = {}) {
  const docs = new Map(), audits = [];
  const liveSet = live ?? [
    { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: !!manifests["v-1"], captured_at: null },
    { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: !!manifests["v-2"], captured_at: null },
  ];
  return {
    docs, audits,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key, metadata: {} }),
    docGet: async (s, p, d) => docs.get(`${s}|${p}|${d}`) ?? null,
    docUpsert: async (s, p, d, data) => { docs.set(`${s}|${p}|${d}`, data); },
    audit: async (pid, et, eid, action, actor, oldv, newv) => { audits.push({ pid, et, eid, action, actor, newv }); },
    listManifests: async () => liveSet,
    getManifest: async (key, vid) => manifests[vid] ?? null,
    versionVerdicts: async () => verdicts,
    projectNamingRuleset: async () => ({ ruleset: null }),
    getArtefact: async () => null,
  };
}

describe("runFederation", () => {
  it("fails the S11 pair, stores the latest run and writes one audit row with entity_id null", async () => {
    const d = memDeps();
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.result.verdict).toBe("fail");
    expect(run.result.checks.find((c) => c.id === "FG-01").status).toBe("fail");
    expect(run.result.checks.find((c) => c.id === "FG-02").status).toBe("fail");
    expect(run.set.map((s) => s.version_id)).toEqual(["v-1", "v-2"]);
    expect(d.docs.get("federation|uuid-p|latest").result.verdict).toBe("fail");
    expect(d.audits).toHaveLength(1);
    expect(d.audits[0]).toMatchObject({ et: "federation_gate", eid: null, action: "Federation gate FAIL: 2 model(s)", actor: "cli" });
    expect(d.audits[0].newv.checks.map((c) => c.id)).toEqual(["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]);
  });
  it("is not checkable when only one live model carries a manifest, and says which lacks one", async () => {
    const d = memDeps({ manifests: { "v-1": mA } });
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.result.verdict).toBe("not_checkable");
    expect(run.result.models.find((m) => m.version_id === "v-2").has_manifest).toBe(false);
    expect(d.audits[0].action).toBe("Federation gate NOT CHECKABLE: 2 model(s)");
  });
  it("honours an explicit versions list", async () => {
    const d = memDeps();
    const run = await runFederation("p", { versions: ["v-1"] }, { actor: "cli" }, d);
    expect(run.set.map((s) => s.version_id)).toEqual(["v-1"]);
    expect(run.result.verdict).toBe("not_checkable");
  });
  it("uses the project's type rule from the ruleset artefact when installed", async () => {
    const d = memDeps({ manifests: { "v-1": { ...mA, elements: [{ guid: "g1", class: "IFCWALL", type_name: "ZZZ_EXT_CMU_200 mm", storey: null }] }, "v-2": { ...mA, elements: [{ guid: "g2", class: "IFCWALL", type_name: "Wall 1", storey: null }] } } });
    d.getArtefact = async (key, kind) => kind === "ruleset" ? { body: { org: "ZZZ", rules: [{ id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "LOC", "MATERIAL", "SIZE"], token_defs: { ORG: "{org}", LOC: "EXT|INT", MATERIAL: "[A-Z0-9]+", SIZE: "\\d+ mm" }, separator: "_", message_en: "x" }] } } : null;
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.type_rule).toBe("TN-01");
    expect(run.result.checks.find((c) => c.id === "FG-02").evidence).toContainEqual({ model: "B-0102.ifc", type_name: "Wall 1", rule: "TN-01" });
  });
});

describe("getFederation", () => {
  it("returns the latest run, flags it stale when the live set changed, and null before any run", async () => {
    const d = memDeps();
    expect(await getFederation("p", d)).toMatchObject({ latest: null, stale: false });
    await runFederation("p", {}, { actor: "cli" }, d);
    expect((await getFederation("p", d)).stale).toBe(false);
    d.listManifests = async () => [{ container: "A-0101.ifc", container_id: "c-1", version_id: "v-9", revision: "P02", has_manifest: false, captured_at: null }];
    const f = await getFederation("p", d);
    expect(f.stale).toBe(true);
    expect(f.live_set[0].version_id).toBe("v-9");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd WebApp && npx vitest run bridge/federation-store.test.mjs`
Expected: FAIL — cannot resolve `./federation-store.mjs`.

- [ ] **Step 4: Write the store**

`WebApp/bridge/federation-store.mjs`:

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

export async function runFederation(key, { versions } = {}, { actor = "web" } = {}, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  let set = await d.listManifests(key);
  if (Array.isArray(versions) && versions.length) set = set.filter((m) => versions.includes(m.version_id));
  const models = [];
  for (const m of set) models.push({ container: m.container, version_id: m.version_id, manifest: m.has_manifest ? await d.getManifest(key, m.version_id) : null });
  const verdicts = await d.versionVerdicts(key, models.map((m) => m.version_id));
  const naming = (await d.projectNamingRuleset(key))?.ruleset ?? null;
  const { rule, org } = await typeRuleFor(key, d);
  const result = d.checkFederation(models, { type_rule: rule, org, naming_ruleset: naming, verdicts });
  const run = {
    result, set: set.map((m) => ({ container: m.container, version_id: m.version_id, revision: m.revision ?? null, has_manifest: m.has_manifest })),
    at: new Date().toISOString(), actor, type_rule: rule?.id ?? null, naming_ruleset: naming?.title ?? null,
  };
  await d.docUpsert(STORE, proj.id, "latest", run);
  const word = result.verdict === "pass" ? "PASS" : result.verdict === "fail" ? "FAIL" : "NOT CHECKABLE";
  await d.audit(proj.id, "federation_gate", null, `Federation gate ${word}: ${models.length} model(s)`, actor, null, {
    verdict: result.verdict, models: run.set,
    checks: result.checks.map((c) => ({ id: c.id, status: c.status, reason: c.reason ?? null, evidence: c.evidence.length })),
  });
  return run;
}

export async function getFederation(key, deps) {
  const d = await wire(deps);
  const proj = await d.ensureProject(key);
  const latest = (await d.docGet(STORE, proj.id, "latest")) ?? null;
  const live = await d.listManifests(key);
  const ids = (xs) => xs.map((x) => x.version_id).sort().join(",");
  return { latest, stale: !!latest && ids(latest.set) !== ids(live), live_set: live };
}
```

- [ ] **Step 5: Routes, BCF, CLI**

In `bcf-service.mjs`, after `raiseGovernedFailureTopics` add:

```js
/** One BCF topic per failing Federation Gate check, de-duplicated by title against open ones. The
 *  description quotes the evidence rows — the coordinator gets the models and values, not a summary. */
async function raiseFederationTopics(cde, pid, run, opts = {}) {
  const author = resolveActor(opts.author, "Federation Gate");
  let existing = [];
  try { existing = await cde.bcfListTopics(pid, { status: "all" }); } catch { /* offline — raise anyway */ }
  const open = new Set((existing || [])
    .filter((t) => /^Federation:/.test(t?.title || "") && t?.topic_status !== "Closed" && t?.topic_status !== "Resolved")
    .map((t) => String(t.title).replace(/\s*\(\d+\)\s*$/, "")));
  const failing = run.result.checks.filter((c) => c.status === "fail");
  const now = new Date().toISOString();
  const raised = [];
  for (const c of failing) {
    const base = `Federation: ${c.id} ${c.title}`;
    if (open.has(base)) continue;
    const topic = cde.newTopicObject(pid, {
      title: `${base} (${c.evidence.length})`, topic_type: "Issue", priority: "High", creation_author: author,
      description: `${c.reason || c.title}. Models: ${run.set.map((s) => s.container).join(", ")}.\n` + c.evidence.slice(0, 20).map((e) => JSON.stringify(e)).join("\n"),
    }, now);
    await cde.bcfCreateTopic(topic);
    broadcast(pid, { type: "topic", action: "created", guid: topic.guid, title: topic.title });
    raised.push(topic.guid);
  }
  return { raised: raised.length, skipped: failing.length - raised.length, topics: raised };
}
```

After the `manifests` route add:

```js
      // Federation Gate: GET /cde/:key/federation · POST /cde/:key/federation/run { versions?, raise_bcf? }
      if (p2 === "federation") {
        const fed = await import("./federation-store.mjs");
        if (!p3 && req.method === "GET") return send(res, 200, await fed.getFederation(p1));
        if (p3 === "run" && !p4 && req.method === "POST") {
          const body = (await readBody(req)) || {};
          const actor = url.searchParams.get("actor") || body.actor || "web";
          const run = await fed.runFederation(p1, { versions: body.versions }, { actor });
          if (run.result.verdict === "fail" && body.raise_bcf !== false) {
            try { run.bcf = await raiseFederationTopics(cde, p1, run, { author: actor }); }
            catch (e) { run.bcf = { raised: 0, error: String(e?.message || e) }; }
          }
          return send(res, 200, run);
        }
      }
```

`WebApp/bridge/federation.mjs`:

```js
// Run the Federation Gate from the command line: node bridge/federation.mjs --project <key> [--versions id,id] [--actor cli] [--no-bcf]
// Exit 0 pass · 2 fail · 3 not checkable · 1 error.
import { loadEnv } from "./load-env.mjs";
import { parseCliArgs } from "./cli-args.mjs";

const env = { ...process.env, ...loadEnv() };
const BASE = (env.BCF_BASE || "http://127.0.0.1:4100").replace(/\/$/, "");
const TOKEN = env.BCF_TOKEN || "";
const { flag, has } = parseCliArgs(process.argv.slice(2));
const project = flag("project");
if (!project) { console.error("Usage: node bridge/federation.mjs --project <key> [--versions id,id] [--actor cli] [--no-bcf]"); process.exit(1); }
const body = { actor: flag("actor", "cli"), raise_bcf: !has("no-bcf") };
if (flag("versions")) body.versions = flag("versions").split(",").map((s) => s.trim()).filter(Boolean);
const res = await fetch(`${BASE}/cde/${encodeURIComponent(project)}/federation/run`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }, body: JSON.stringify(body),
});
const r = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`HTTP ${res.status}: ${r.message || JSON.stringify(r)}`); process.exit(1); }
const v = r.result.verdict;
console.log(`Federation Gate: ${v === "not_checkable" ? "NOT CHECKABLE" : v.toUpperCase()} · ${r.set.length} model(s) · rule ${r.type_rule ?? "none"} · naming ${r.naming_ruleset ?? "none"}`);
for (const m of r.result.models) console.log(`  ${m.has_manifest ? "●" : "○"} ${m.container} (${m.version_id.slice(0, 8)})${m.has_manifest ? "" : " — no manifest: republish or node bridge/manifest.mjs"}`);
for (const c of r.result.checks) {
  console.log(`${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "–"} ${c.id} ${c.title}${c.reason ? " — " + c.reason : ""}`);
  for (const e of c.evidence.slice(0, 10)) console.log(`      ${JSON.stringify(e)}`);
  for (const w of c.warnings.slice(0, 10)) console.log(`      ! ${w}`);
}
if (r.bcf) console.log(`bcf: ${r.bcf.raised} topic(s) raised, ${r.bcf.skipped ?? 0} already open${r.bcf.error ? " — " + r.bcf.error : ""}`);
process.exit(v === "pass" ? 0 : v === "fail" ? 2 : 3);
```

- [ ] **Step 6: Run, smoke, commit**

Run: `cd WebApp && npx vitest run bridge/federation-store.test.mjs && npm test`
Expected: PASS (738 + the new tests).

Smoke on your own instance (`BCF_PORT=4199`): `GET /cde/aster-office/federation` → `{ latest: null | {...}, stale, live_set }`.

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/federation-store.mjs WebApp/bridge/federation-store.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/federation.mjs
git commit -m "feat(bridge): Federation Gate — run over the live set, latest result, audit row, one BCF topic per failing check, CLI

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```


---

### Task 5: Web — the banner on the clash panel

**Files:**
- Modify: `WebApp/src/setups/clash-panel.ts:70-88` (header markup) and the setup body after `const status = …` (line 88).
- Read for reference: `clash-panel.ts:1-10` (imports: `bfetch`, `activePid`), `:22` (`base`), `:53-61` (the existing `/clash/:pid` fetch idiom).

**Interfaces:**
- Consumes: `GET /cde/:key/federation`, `POST /cde/:key/federation/run` (Task 4).
- Produces: a banner row with ids `cl-fed`, `cl-fed-text`, `cl-fed-run`.

- [ ] **Step 1: Add the banner row and its logic**

In `root.innerHTML`, directly after the first header `</div>` (the one that ends with the `cl-run` button) insert:

```ts
    '<div id="cl-fed" style="display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;border-bottom:1px solid #2a2a30;font-size:11px;color:#9ca3af">' +
    '<span id="cl-fed-text">Federation Gate: …</span><span style="flex:1"></span>' +
    `<button id="cl-fed-run" style="${btn};padding:.2rem .45rem;font-size:11px" title="Cross-model data check before any clash run: GlobalIds, type naming, levels, grids, georeference, container names and verdicts">Run gate</button>` +
    "</div>" +
```

After `const status = (t: string) => (el("cl-status").textContent = t);` add:

```ts
  // Federation Gate banner (decision D-01): the data checks a clash run should not start without. A
  // warning, not a lock — the lock is the review-workflow item. Reads the latest run; Run gate posts one.
  type FedCheck = { id: string; title: string; status: string };
  type FedState = { latest: { at: string; set: unknown[]; result: { verdict: string; checks: FedCheck[] } } | null; stale: boolean; live_set: { has_manifest: boolean }[] };
  const fedColour: Record<string, string> = { pass: "#22c55e", fail: "#f87171", not_checkable: "#eab308" };
  async function loadFederation() {
    const text = el("cl-fed-text");
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/federation`);
      if (!r.ok) { text.style.color = "#9ca3af"; text.textContent = "Federation Gate: not available on this bridge"; return; }
      const f = (await r.json()) as FedState;
      if (!f.latest) {
        text.style.color = fedColour.not_checkable;
        text.textContent = `Federation Gate: NOT RUN · ${f.live_set.length} live model(s), ${f.live_set.filter((m) => m.has_manifest).length} with a manifest`;
        return;
      }
      const v = f.latest.result.verdict;
      const failing = f.latest.result.checks.filter((c) => c.status === "fail").map((c) => c.id);
      text.style.color = f.stale ? fedColour.not_checkable : (fedColour[v] ?? "#9ca3af");
      text.textContent = `Federation Gate: ${v === "not_checkable" ? "NOT CHECKABLE" : v.toUpperCase()}` +
        (failing.length ? ` · ${failing.join(", ")} — see Issues` : "") +
        ` · ${f.latest.set.length} model(s) · ${String(f.latest.at).slice(0, 10)}` + (f.stale ? " · STALE — a live version changed" : "");
    } catch { el("cl-fed-text").textContent = "Federation Gate: bridge unreachable"; }
  }
  el("cl-fed-run").onclick = async () => {
    const b = el("cl-fed-run") as HTMLButtonElement;
    b.disabled = true; b.textContent = "Running…";
    try { await bfetch(`${base}/cde/${encodeURIComponent(pid())}/federation/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); }
    catch { /* the reload below reports the state */ }
    await loadFederation();
    b.disabled = false; b.textContent = "Run gate";
  };
  void loadFederation();
```

`pid()` is the panel's existing project-key accessor (it wraps `activePid`); if the panel names it differently, use that name.

- [ ] **Step 2: Type-check, build, commit**

Run: `cd WebApp && npx tsc --noEmit -p . 2>&1 | grep -E "clash-panel" ; npm run build`
Expected: no lines from the grep (no new type errors); build succeeds. The banner cannot be seen live while the platform viewer is blocked (F49); say so in the report.

```bash
git add WebApp/src/setups/clash-panel.ts
git commit -m "feat(web): Federation Gate banner and Run gate on the clash panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Revit — the same status line in the Clash Manager

**Files:**
- Modify: `SentinelAddin/Coordination/GovernedQuery.cs` (new method after `LiveVersion`), `SentinelAddin/UI/ClashManagerDialog.xaml.cs:11-19` (constructor), `SentinelAddin/Commands.Phase2.cs:173` (the call site).
- Read for reference: `GovernedQuery.cs:24-32` (`GetString(url, token)`), `:46-52` (key resolution idiom), `SentinelAddin/Engine/SettingsManager.cs:142-146` (`WebProjectKeyFor(doc)`).

**Interfaces:**
- Consumes: `GET /cde/:key/federation` (Task 4).
- Produces: `GovernedQuery.FederationStatus(string? projectKey) → string?` (null when unreachable); `ClashManagerDialog(List<ClashManager.ClashItem> clashes, string? federationLine = null)`.

- [ ] **Step 1: The query**

Add to `GovernedQuery.cs` after `LiveVersion`:

```csharp
        /// <summary>
        /// One line for the Clash Manager header: the project's Federation Gate status from the web
        /// (PASS / FAIL with the failing checks / NOT CHECKABLE / NOT RUN, STALE when a live version changed).
        /// Blocking, ~4 s cap; null when the bridge is unreachable. The project key is the DOCUMENT's
        /// (SettingsManager.WebProjectKeyFor), never the machine default — the cohesion review's D5.
        /// </summary>
        public static string? FederationStatus(string? projectKey)
        {
            try
            {
                var cfg = BcfConfig.Load();
                var key = string.IsNullOrWhiteSpace(projectKey) ? cfg.ProjectId : projectKey!.Trim();
                var json = GetString(cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(key) + "/federation", cfg.ServiceToken);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (!root.TryGetProperty("latest", out var latest) || latest.ValueKind != JsonValueKind.Object)
                {
                    int live = root.TryGetProperty("live_set", out var ls) && ls.ValueKind == JsonValueKind.Array ? ls.GetArrayLength() : 0;
                    return $"Federation Gate: NOT RUN — {live} live model(s) on '{key}'; run it on the web before clashing.";
                }
                var result = latest.GetProperty("result");
                var verdict = result.GetProperty("verdict").GetString() ?? "";
                var failing = new List<string>();
                foreach (var c in result.GetProperty("checks").EnumerateArray())
                    if (c.GetProperty("status").GetString() == "fail") failing.Add(c.GetProperty("id").GetString() ?? "");
                bool stale = root.TryGetProperty("stale", out var st) && st.ValueKind == JsonValueKind.True;
                var word = verdict == "pass" ? "PASS" : verdict == "fail" ? "FAIL" : "NOT CHECKABLE";
                return $"Federation Gate: {word}" + (failing.Count > 0 ? " (" + string.Join(", ", failing) + " — see the web Issues)" : "")
                     + (stale ? " — STALE, a live version changed" : "") + $" on '{key}'";
            }
            catch { return null; }
        }
```

- [ ] **Step 2: The dialog and its call site**

In `ClashManagerDialog.xaml.cs` change the constructor signature to `public ClashManagerDialog(List<ClashManager.ClashItem> clashes, string? federationLine = null)` and, after the `SubHeader.Text = …;` statement, add:

```csharp
        if (!string.IsNullOrWhiteSpace(federationLine)) SubHeader.Text += "   ·   " + federationLine;
```

In `Commands.Phase2.cs:173` replace `var win = new Sentinel.UI.ClashManagerDialog(clashes);` with:

```csharp
        // The data gate first (D-01): the same status the web clash panel shows, read for this document's key.
        var fedLine = Sentinel.Coordination.GovernedQuery.FederationStatus(Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc))
                      ?? "Federation Gate: bridge unreachable";
        var win = new Sentinel.UI.ClashManagerDialog(clashes, fedLine);
```

`doc` is the active document variable in that command (check the surrounding lines; if it is named `document` or comes from `uiapp.ActiveUIDocument.Document`, use that expression).

- [ ] **Step 3: Compile without deploying, commit**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E " error |Build succeeded"`
Expected: `Build succeeded.` (Revit may be open; the deploy happens at the next Revit close, outside this plan.)

```bash
git add SentinelAddin/Coordination/GovernedQuery.cs SentinelAddin/UI/ClashManagerDialog.xaml.cs SentinelAddin/Commands.Phase2.cs
git commit -m "feat(revit): Clash Manager shows the project's Federation Gate status before a run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/TESTING_PROTOCOL.md` (new Session D3 after Session D2, before `## Session E`), `docs/handbook/05-capability-status.md` (row after `| Governed Intake …`), `docs/FEATURES_UPDATE_2026-09.md` (row `**3.0**`), `docs/handbook/04-core-workflows.md` (one paragraph if a clash workflow is described there; otherwise skip and say so).

- [ ] **Step 1: Protocol drill**

Insert after the Session D2 table:

```markdown
## Session D3 — Federation Gate (data clash before geometric clash)

| Step | Pass criteria |
|---|---|
| Manifests | Every model published through Governed Intake or the outbox watcher shows `has_manifest: true` in `GET /cde/:key/manifests`; an older version is backfilled with `node bridge/manifest.mjs <file.ifc> --project <key> --version <id>` |
| Fail path FIRST | Two models planted with the S11 mismatch (a shared GlobalId, `Wall 1` against `W-A1-Fin`, a level 20 mm off, a grid tag missing, one model without a georeference) → `node bridge/federation.mjs --project <key> --versions <a>,<b>` prints **FAIL** with FG-01, FG-02, FG-03, FG-04 and FG-05 each naming the models and values; one BCF topic per failing check on the web Issues panel; audit row `Federation gate FAIL: 2 model(s)` |
| Pass path | Two consistent models → **PASS**, every check `✓`, FG-02 says "no type rule installed — naming shapes compared only" when none is; audit row `Federation gate PASS` |
| Not checkable | One manifest only → **NOT CHECKABLE** with the reason and the model that lacks a manifest named |
| Surfaces | The web clash panel banner shows the same verdict and goes STALE after a new version is published; the Revit Clash Manager header shows the same line for the document's project |
```

- [ ] **Step 2: Capability row and backlog row**

After the `| Governed Intake …` row in `05-capability-status.md` add:

```markdown
| Federation Gate (six cross-model data checks before any clash run) | 🟩 Built | Manifests captured on publish; `POST /cde/:key/federation/run`, CLI `bridge/federation.mjs`, clash-panel banner, Revit Clash Manager status line; moves to ✅ on the Session D3 drill |
```

In `FEATURES_UPDATE_2026-09.md`, row `**3.0**`, append to the Value cell: ` — **built 2026-09-23** (branch `feature/federation-gate`), drill D3 pending`.

- [ ] **Step 3: Commit**

```bash
git add docs/TESTING_PROTOCOL.md docs/handbook/05-capability-status.md docs/FEATURES_UPDATE_2026-09.md
git commit -m "docs: Federation Gate drill (Session D3), capability row, backlog row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Live drill and merge (controller)

**Files:**
- Modify: `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` (drill section), `docs/handbook/05-capability-status.md` (✅ on evidence), `docs/FEATURES_UPDATE_2026-09.md` (drill passed).

- [ ] **Step 1: Restart the managed bridge** so it runs the branch, then intake the three fixtures on `aster-office` (its naming pack and drill IDS accept them): `node bridge/intake.mjs bridge/fixtures/fed-a.ifc --project aster-office --name ASTR26-AST-ZZ-XX-M3-A-0101.ifc --source cli --revision P01`, then `fed-b.ifc` as `…-0102.ifc`, then `fed-c.ifc` as `…-0103.ifc`. Each must return `ACCEPTED (published)` with a `manifest` block. Record the three version ids from `GET /cde/aster-office/manifests`.
- [ ] **Step 2: Fail path first**: `node bridge/federation.mjs --project aster-office --versions <a>,<b>` → FAIL with FG-01 (`7YvctVUKr0kugbFTf53O9L` in both), FG-02 (`space·2` vs `hyphen·3`), FG-03 (`Level 1` 0 vs 20), FG-04 (`B` vs `C`), FG-05 (`…-0102.ifc` georeference none); FG-06 pass; BCF topics raised; exit 2.
- [ ] **Step 3: Pass path**: `--versions <a>,<c>` → PASS, exit 0; FG-02 reason "no type rule installed". Then run once more with the same pair: `bcf: 0 raised, 0 already open` and `GET /cde/aster-office/federation` shows `stale: false`.
- [ ] **Step 4: Not checkable**: `--versions <a>` alone → NOT CHECKABLE, exit 3.
- [ ] **Step 5: Record and merge**: append the drill to the run record with audit ids; capability row → ✅ only if steps 2–4 matched; `npm test` green; `git checkout master && git merge --no-ff feature/federation-gate -m "Merge feature/federation-gate — Federation Gate (Features Update 3.0)"` with the Co-Authored-By line.

## Self-review notes

- Spec coverage: §The set → Task 3 `liveModelVersions` + Task 4 explicit list; §1 manifest → Task 2; §2 capture → Task 3; §3 core → Task 1; §4 bridge → Task 4; §5 surfaces → Tasks 4 (CLI), 5 (web), 6 (Revit); §6 honesty → Tasks 1 and 4 (`not_checkable`, audit per run); Testing → Tasks 1–4 and the drill in Task 8; Out of scope untouched.
- Names used across tasks: `checkFederation`, `nameShape`, `Manifest`, `FederationModel` (T1) · `extractManifest`, `MANIFEST_CLASSES` (T2) · `captureManifest`, `getManifest`, `liveModelVersions`, `listManifests` (T3) · `versionVerdicts`, `runFederation`, `getFederation`, `raiseFederationTopics` (T4) · `FederationStatus` (T6).
