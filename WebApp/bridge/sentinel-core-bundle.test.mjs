// MA-2a: the bridge runs the resolver from bridge/sentinel-core.mjs, a BUNDLE esbuild writes from src/sentinel-core/*.ts
// (`npm run build:bridge-core`). The bundle is committed, so a TS change without a rebuild ships a bridge that types by the old
// rules. This test resolves every shared fixture case through the bundle and through the TS source, and holds them equal: a
// stale bundle fails here, in the suite that runs on every commit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as bundle from "./sentinel-core.mjs";
import * as source from "../src/sentinel-core/guideline";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const FILES = [
  { cases: "../src/sentinel-core/fixtures/guideline-dd-cases.json", guideline: "../../demo/bds-pilot/bds-dd-elements-guideline.json" },
  { cases: "../src/sentinel-core/fixtures/guideline-layerfree-cases.json", guideline: "../../demo/bds-pilot/bds-dd-layerfree-guideline.json" },
];
const CATALOG = read("../../demo/bds-pilot/bds-type-catalog.json").types;
const pick = (r) => ({ family: r.family || null, type: r.type ?? null, source: r.source, confidence: r.confidence, available: r.available ?? null, matched: r.matched ?? null });

describe("bridge/sentinel-core.mjs is the build of src/sentinel-core (MA-2a)", () => {
  it("exports the resolver and the BOS-5 category ids the bridge types with", () => {
    for (const name of ["resolveWithCatalog", "resolveType", "validateGuideline", "validateAgainstCatalog", "sameCategory", "CATEGORY_BIC"])
      expect(typeof bundle[name], name).toBe(typeof source[name]);
    expect(bundle.CATEGORY_BIC).toEqual(source.CATEGORY_BIC);
  });

  for (const f of FILES) {
    it(`gives the fixture's answer on every case of ${f.cases.split("/").pop()} — rebuild the bundle when this fails`, () => {
      const G = read(f.guideline);
      const cases = read(f.cases);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        const cat = c.catalog ?? CATALOG;
        const got = pick(bundle.resolveWithCatalog(G, c.input, cat));
        expect(got, JSON.stringify(c.input)).toEqual(pick(source.resolveWithCatalog(G, c.input, cat)));
        expect(got, JSON.stringify(c.input)).toMatchObject({ family: c.family, type: c.type, source: c.source, confidence: c.confidence, available: c.available });
        if ("matched" in c) expect(got.matched, JSON.stringify(c.input)).toEqual(c.matched); // the layer-free fixture carries it
      }
    });
  }
});
