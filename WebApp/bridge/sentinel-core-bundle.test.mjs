// MA-2a: the bridge runs the resolver from bridge/sentinel-core.mjs, a BUNDLE esbuild writes from src/sentinel-core/*.ts
// (`npm run build:bridge-core`). The bundle is committed, so a TS change without a rebuild ships a bridge that types by the old
// rules. This test resolves every shared fixture case through the bundle and through the TS source, and holds them equal: a
// stale bundle fails here, in the suite that runs on every commit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as bundle from "./sentinel-core.mjs";
import * as source from "../src/sentinel-core/guideline";
import * as lodSource from "../src/sentinel-core/lod-matrix";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FILES = [
  { cases: "../src/sentinel-core/fixtures/guideline-dd-cases.json", guideline: "../../demo/bds-pilot/bds-dd-elements-guideline.json" },
  { cases: "../src/sentinel-core/fixtures/guideline-layerfree-cases.json", guideline: "../../demo/bds-pilot/bds-dd-layerfree-guideline.json" },
];
const CATALOG = read("../../demo/bds-pilot/bds-type-catalog.json").types;
const pick = (r) => ({ family: r.family || null, type: r.type ?? null, source: r.source, confidence: r.confidence, available: r.available ?? null, matched: r.matched ?? null });

describe("bridge/sentinel-core.mjs is the build of src/sentinel-core (MA-2a)", () => {
  // SEC-5 (E-b): a requirement whose pattern does not compile is never a pass — in the bundle the bridge judges with, as in
  // the source the web judges with.
  it("an IDS pattern that does not compile fails its requirement, with words that say so", async () => {
    const ids = await import("../src/sentinel-core/ids");
    const spec = { title: "t", specifications: [{ name: "s", applicability: { entity: "IFCDOOR" }, requirements: { attributes: [], properties: [{ pset: "P", name: "FireRating", pattern: "EI(60", cardinality: "required" }] } }] };
    const el = { modelId: "m", localId: 1, identity: { Class: "IFCDOOR", GlobalId: "g" }, psets: [{ name: "P", rows: [{ name: "FireRating", value: "EI60" }] }], quantities: [] };
    for (const validate of [ids.validateElement, bundle.validateElement])
      expect(validate(spec, el)).toEqual({ inScope: true, pass: false, failures: [{ specification: "s", requirement: "P.FireRating", reason: "the requirement's pattern /EI(60/ does not compile — not a pass" }] });
  });

  it("exports the resolver and the BOS-5 category ids the bridge types with", () => {
    for (const name of ["resolveWithCatalog", "resolveType", "validateGuideline", "validateAgainstCatalog", "sameCategory", "CATEGORY_BIC"])
      expect(typeof bundle[name], name).toBe(typeof source[name]);
    expect(bundle.CATEGORY_BIC).toEqual(source.CATEGORY_BIC);
  });

  // MA-2b: the install check runs parseLodMatrix from the bundle — every shared case, the same answer and the same words.
  it("reads every lod_matrix case as the TS source does — rebuild the bundle when this fails", () => {
    const cases = read("./fixtures/lod-matrix/cases.json");
    expect(cases.length).toBe(26);
    const run = (f, body) => { try { return f(body); } catch (e) { return { error: e.message }; } };
    for (const c of cases) expect(run(bundle.parseLodMatrix, c.body), c.name).toEqual(run(lodSource.parseLodMatrix, c.body));
    expect(bundle.STAGES).toEqual(lodSource.STAGES);
  });

  for (const f of FILES) {
    it(`gives the fixture's answer on every case of ${f.cases.split("/").pop()} — rebuild the bundle when this fails`, () => {
      const G = read(f.guideline);
      const cases = read(f.cases);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        const cat = c.catalog ?? CATALOG;
        const g = c.guideline ?? G; // a case may carry the file reordered (the layer-free fixture's `available` case)
        const got = pick(bundle.resolveWithCatalog(g, c.input, cat));
        expect(got, JSON.stringify(c.input)).toEqual(pick(source.resolveWithCatalog(g, c.input, cat)));
        expect(got, JSON.stringify(c.input)).toMatchObject({ family: c.family, type: c.type, source: c.source, confidence: c.confidence, available: c.available });
        if ("matched" in c) expect(got.matched, JSON.stringify(c.input)).toEqual(c.matched); // the layer-free fixture carries it
      }
    });
  }
});
