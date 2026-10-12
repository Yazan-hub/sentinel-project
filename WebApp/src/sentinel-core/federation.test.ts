import { describe, it, expect } from "vitest";
import { checkFederation, nameShape, raisedFederationTitleKey, type FederationModel, type Manifest, type MapConversion } from "./federation";
import type { Rule } from "./types";

const site = (lat: number, lon: number, mc: Partial<MapConversion> | null = null) =>
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

describe("raisedFederationTitleKey — the dedup key of an already-raised topic title (H0 minor N33)", () => {
  it("strips the trailing (N) count, pinning today's output", () => {
    expect(raisedFederationTitleKey("Federation: FG-01 Duplicate GlobalId (2)")).toBe("Federation: FG-01 Duplicate GlobalId");
  });
  it("trims whitespace left before the suffix", () => {
    expect(raisedFederationTitleKey("Federation: FG-01 Duplicate GlobalId   (12)")).toBe("Federation: FG-01 Duplicate GlobalId");
  });
  it("leaves a title with no trailing count unchanged", () => {
    expect(raisedFederationTitleKey("Federation: FG-01 Duplicate GlobalId")).toBe("Federation: FG-01 Duplicate GlobalId");
  });
});

describe("checkFederation", () => {
  it("passes a consistent pair and reports every check", () => {
    const c = model("C-0103.ifc", manifest({ elements: [{ guid: "g-wall-9", class: "IFCWALL", type_name: "Wall 3", storey: "Level 1" }] }));
    const naming_ruleset = { title: "two fields", separator: "-", strip_extensions: [".ifc"], enforce: "reject" as const, fields: [{ key: "p", label: "P", pattern: "[A-Z]" }, { key: "n", label: "N", pattern: "\\d{4}" }] };
    const r = checkFederation([A(), c], { verdicts: okVerdicts, naming_ruleset });
    expect(r.verdict).toBe("pass");
    expect(r.checks.map((x) => x.id)).toEqual(["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06", "FG-07"]);
    expect(r.checks.filter((x) => x.id !== "FG-07").every((x) => x.status === "pass")).toBe(true);
    expect(check(r, "FG-07")).toMatchObject({ status: "not_checkable", reason: "the contract sets no tolerance_mm" }); // MA-8-2: and the verdict stays pass
    expect(check(r, "FG-02").reason).toMatch(/no type rule installed/);   // shape-only, said plainly
  });
  it("is not checkable with fewer than two manifests", () => {
    const r = checkFederation([A(), model("B-0102.ifc", null)], { verdicts: okVerdicts });
    expect(r.verdict).toBe("not_checkable");
    expect(r.models.find((m) => m.container === "B-0102.ifc")?.has_manifest).toBe(false);
  });
  describe("one model (the founder's option B, 2026-09-28)", () => {
    const clean = { duplicates: 0, examples: [], missing: 0, scope: "IfcProduct", counted: 40 };
    const naming_ruleset = { standard_key: "t", semver: "1.0.0", enforce: "reject", separator: "-", fields: [{ name: "ORIG", allowed: ["A"] }, { name: "NUM", pattern: "^\\d{4}$" }] } as never;
    const one = (audit: unknown, name = "A-0101.ifc") => model(name, manifest({ guid_audit: audit as never }));
    it("the whole live set is one clean, named, accepted model: PASS on FG-01 and FG-06; the cross-model checks say why they do not apply", () => {
      const r = checkFederation([one(clean)], { verdicts: okVerdicts, live_count: 1 });
      expect(r.one_model).toBe(true);
      expect(r.checks.map((c) => [c.id, c.status])).toEqual([["FG-01", "pass"], ["FG-02", "not_checkable"], ["FG-03", "not_checkable"], ["FG-04", "not_checkable"], ["FG-05", "not_checkable"], ["FG-06", expect.any(String)], ["FG-07", "not_checkable"]]);
      expect(check(r, "FG-03")).toMatchObject({ title: "Levels align by name and elevation", reason: "one model — a cross-model check; nothing to compare" });
      expect(check(r, "FG-01").title).toBe("No GlobalId appears twice in the model");
      expect(r.verdict).toBe("pass");
    });
    it("a duplicate GlobalId inside the model FAILS, naming it; a blank one is a warning", () => {
      const r = checkFederation([one({ duplicates: 200, examples: ["g-x", "g-y"], missing: 3, scope: "IfcProduct", counted: 900 })], { verdicts: okVerdicts, live_count: 1 });
      expect(check(r, "FG-01")).toMatchObject({ status: "fail", count: 200, reason: "200 duplicate GlobalId(s) in A-0101.ifc (900 IfcProduct(s) counted)", evidence: [{ guid: "g-x", models: ["A-0101.ifc"] }, { guid: "g-y", models: ["A-0101.ifc"] }] });
      expect(check(r, "FG-01").warnings).toEqual(["3 of 900 product(s) in A-0101.ifc carry no GlobalId"]);
      expect(r.verdict).toBe("fail");
    });
    it("a manifest captured before GlobalIds were counted is not checkable on FG-01, never a pass", () => {
      const r = checkFederation([one(null)], { verdicts: okVerdicts, live_count: 1 });
      expect(check(r, "FG-01").status).toBe("not_checkable");
      expect(check(r, "FG-01").reason).toMatch(/captured before GlobalIds were counted/);
    });
    it("nothing counted is nothing judged: an IFC with no product is not checkable on FG-01, and the gate does not pass on it", () => {
      const r = checkFederation([one({ duplicates: 0, examples: [], missing: 0, scope: "IfcProduct", counted: 0 })], { verdicts: okVerdicts, live_count: 1 });
      expect(check(r, "FG-01")).toMatchObject({ status: "not_checkable", reason: "A-0101.ifc carries no IFC product to judge — no GlobalId was counted" });
      expect(r.verdict).not.toBe("pass");
    });
    it("the one live model without a manifest is told to capture it, not to find a second model", () => {
      const r = checkFederation([model("A-0101.ifc", null)], { verdicts: okVerdicts, live_count: 1 });
      expect(r.verdict).toBe("not_checkable");
      expect(check(r, "FG-01").reason).toBe("the one live model (A-0101.ifc) carries no manifest — capture it (manifest backfill) and run the gate again");
      expect(checkFederation([], { live_count: 0 }).checks[0].reason).toBe("no live model — nothing to federate");
    });
    it("a misnamed container still FAILS FG-06 with one model", () => {
      const r = checkFederation([one(clean, "Aster Tower.ifc")], { verdicts: okVerdicts, naming_ruleset, live_count: 1 });
      expect(check(r, "FG-06").status).toBe("fail");
      expect(r.verdict).toBe("fail");
    });
    it("one model picked out of several (live_count 3) is NOT the one-model case: not checkable", () => {
      const r = checkFederation([one(clean)], { verdicts: okVerdicts, live_count: 3 });
      expect(r.one_model).toBeUndefined();
      expect(r.verdict).toBe("not_checkable");
      expect(check(r, "FG-01").title).toBe("No GlobalId appears in two models");
    });
  });

  it("two manifests that let nothing be checked are NOT CHECKABLE, not PASS", () => {
    const bare = (c: string) => model(c, manifest({ elements: [], levels: [], grids: [], site: null as unknown as Manifest["site"] }));
    const r = checkFederation([bare("A-0101.ifc"), bare("B-0102.ifc")], { verdicts: okVerdicts });
    expect(r.checks.every((c) => c.status === "not_checkable")).toBe(true);
    expect(r.verdict).toBe("not_checkable");
  });
  it("FG-01 and FG-02 are not_checkable, not pass, when one manifest carries no elements (empty MEP manifest)", () => {
    const empty = model("B-0102.ifc", manifest({ elements: [] }));
    const r = checkFederation([A(), empty], { verdicts: okVerdicts });
    expect(check(r, "FG-01").status).toBe("not_checkable");
    expect(check(r, "FG-01").reason).toMatch(/fewer than two manifests carry elements/);
    expect(check(r, "FG-02").status).toBe("not_checkable");
    expect(check(r, "FG-02").reason).toMatch(/no category appears in two or more models/);
  });
  it("FG-02 is not_checkable when the two models share no category and no type rule is installed", () => {
    const beam = model("B-0102.ifc", manifest({ elements: [{ guid: "g-beam-1", class: "IFCBEAM", type_name: "Beam 1", storey: "Level 1" }] }));
    const fg = check(checkFederation([A(), beam], { verdicts: okVerdicts }), "FG-02");
    expect(fg.status).toBe("not_checkable");
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
    const rule: Rule = { id: "TN-01", target: "family", mode: "monitor", tokens: ["ORG", "LOC", "MATERIAL", "SIZE"], token_defs: { ORG: "{org}", LOC: "EXT|INT", MATERIAL: "[A-Z0-9]+", SIZE: "\\d+ mm" }, separator: "_", message_en: "Type '{name}' does not match." };
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
    const deg = (d: number) => ({ x_axis_abscissa: Math.cos((d * Math.PI) / 180), x_axis_ordinate: Math.sin((d * Math.PI) / 180) });
    const straddleA = model("A-0101.ifc", manifest({ site: site(51.5, -0.1, deg(179.97)) }));
    const straddleB = model("B-0102.ifc", manifest({ site: site(51.5, -0.1, deg(-179.98)) }));
    expect(check(checkFederation([straddleA, straddleB], { verdicts: okVerdicts }), "FG-05").status).toBe("pass");
    const noneAtAll = checkFederation([model("A-0101.ifc", manifest({ site: null })), noGeo], { verdicts: okVerdicts });
    expect(check(noneAtAll, "FG-05").status).toBe("not_checkable");
  });
  it("FG-05 never passes a pair it could not compare: lat/lon-only against map-conversion-only", () => {
    const latOnly = model("A-0101.ifc", manifest({ site: { lat: 51.5, lon: -0.1, elevation_m: 0, map_conversion: null } }));
    const mcOnly = model("B-0102.ifc", manifest({ site: { lat: null, lon: null, elevation_m: null, map_conversion: { eastings: 500000, northings: 3500000, height: 0, x_axis_abscissa: 1, x_axis_ordinate: 0, scale: 1, crs_name: "EPSG:32636" } } }));
    const fg = check(checkFederation([latOnly, mcOnly], { verdicts: okVerdicts }), "FG-05");
    expect(fg.status).toBe("not_checkable");
    expect(fg.reason).toMatch(/cannot be compared/);
    expect(fg.evidence).toContainEqual(expect.objectContaining({ model_a: "A-0101.ifc", model_b: "B-0102.ifc", comparable: false }));
    const both = model("C-0103.ifc", manifest({ site: site(51.5, -0.1, {}) }));
    expect(check(checkFederation([both, mcOnly], { verdicts: okVerdicts }), "FG-05").status).toBe("pass");   // compared through the map conversion
    const mixed = checkFederation([latOnly, mcOnly, both], { verdicts: okVerdicts });
    expect(check(mixed, "FG-05").status).toBe("fail");                    // one comparable pair passed, one could not be compared
    expect(check(mixed, "FG-05").reason).toMatch(/could not be compared/);
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
  it("FG-06 treats a missing enforce as reject, and is not_checkable (naming the install route) with no naming installed", () => {
    const rs = { title: "two fields", separator: "-", strip_extensions: [".ifc"], fields: [{ key: "p", label: "P", pattern: "[A-Z]" }, { key: "n", label: "N", pattern: "\\d{4}" }] };
    const bad = model("Bad name.ifc", manifest({ elements: [{ guid: "g-b1", class: "IFCWALL", type_name: "Wall 9", storey: null }] }));
    const v = { "A-0101.ifc": "accepted", "Bad name.ifc": "accepted" } as const;
    expect(check(checkFederation([A(), bad], { naming_ruleset: rs as never, verdicts: v }), "FG-06").status).toBe("fail");
    const none = check(checkFederation([A(), bad], { verdicts: v }), "FG-06");
    expect(none.status).toBe("not_checkable");
    expect(none.reason).toMatch(/PUT \/cde\/:key\/artefacts\/naming/);
  });
});

// MA-8-2: FG-07 — walls two models share sit within the contract's tolerance.
describe("FG-07 wall tolerance", () => {
  type W = Manifest["walls"] extends (infer T)[] | null | undefined ? T : never;
  // x along: a wall from (x0, y) to (x1, y), thickness t, standing z 0..3000
  const wall = (g: string, y: number, t = 300, x0 = 0, x1 = 5000, z0 = 0, z1 = 3000): W => ({ g, s: [x0, y], e: [x1, y], t, z0, z1, storey: "Level 1" });
  const pair = (a: W[] | null, b: W[] | null, tol: number | null = 20, over: Partial<Manifest> = {}) =>
    check(checkFederation([model("A-0101.ifc", manifest({ walls: a })), model("B-0102.ifc", manifest({ walls: b, ...over }))], { verdicts: okVerdicts, tolerance_mm: tol }), "FG-07");
  it("equal walls 0 mm apart pass; 60 mm apart fail at 20 and pass at 60", () => {
    expect(pair([wall("a", 0)], [wall("b", 0)]).status).toBe("pass");
    const f = pair([wall("a", 0)], [wall("b", 60)]);
    expect(f).toMatchObject({ status: "fail", count: 1 });
    expect(f.evidence[0]).toMatchObject({ models: ["A-0101.ifc", "B-0102.ifc"], walls: ["a", "b"], storey: "Level 1", offset_mm: 60, centre_mm: 60, thickness_mm: [300, 300] });
    expect(pair([wall("a", 0)], [wall("b", 60)], 60).status).toBe("pass");
  });
  it("a 200 mm core centred in a 300 mm wall passes; moved 60 mm it fails by 10", () => {
    expect(pair([wall("a", 0, 300)], [wall("b", 0, 200)]).status).toBe("pass");
    const f = pair([wall("a", 0, 300)], [wall("b", 60, 200)], 5);
    expect(f.status).toBe("fail");
    expect(f.evidence[0]).toMatchObject({ offset_mm: 10 });
    expect(pair([wall("a", 0, 300)], [wall("b", 60, 200)], 10).status).toBe("pass");
  });
  it("walls that are not counterparts are not paired: non-parallel, under half the length, no height in common, bodies further apart than the thicknesses plus the tolerance", () => {
    const turned: W = { g: "t", s: [0, 0], e: [4999, 200], t: 300, z0: 0, z1: 3000, storey: null }; // ~2.3 deg
    for (const b of [turned, wall("b", 0, 300, 3000, 8000), wall("b", 0, 300, 0, 5000, 3000, 6000), wall("b", 400)])
      expect(pair([wall("a", 0)], [b]), JSON.stringify(b)).toMatchObject({ status: "not_checkable", reason: "no wall is modelled in two models — nothing to compare" });
  });
  it("a parallel wall within 1 degree still pairs", () => {
    expect(pair([wall("a", 0)], [{ g: "b", s: [0, 0], e: [5000, 40], t: 300, z0: 0, z1: 3000, storey: null }], 1000).status).toBe("pass");
  });
  it("is not checkable for: no tolerance, a failing FG-05, a model without walls, zero pairs", () => {
    expect(pair([wall("a", 0)], [wall("b", 0)], null)).toMatchObject({ status: "not_checkable", reason: "the contract sets no tolerance_mm" });
    const far = checkFederation([model("A-0101.ifc", manifest({ walls: [wall("a", 0)] })), model("B-0102.ifc", manifest({ walls: [wall("b", 0)], site: site(52.5, -0.1, { eastings: 900000 }) }))], { verdicts: okVerdicts, tolerance_mm: 20 });
    expect(check(far, "FG-05").status).toBe("fail");
    expect(check(far, "FG-07").reason).toMatch(/georeference disagrees \(FG-05\)/);
    const none = pair([wall("a", 0)], null, 20, { walls_why: "larger than the bridge reads (20 MB)" });
    expect(none.status).toBe("not_checkable");
    expect(none.reason).toMatch(/B-0102\.ifc: larger than the bridge reads/);
    expect(pair([wall("a", 0)], null).reason).toMatch(/captured before MA-8 — backfill its manifest/);
    expect(pair([wall("a", 0)], [wall("b", 9000)]).reason).toBe("no wall is modelled in two models — nothing to compare");
  });
  it("warns about unpaired walls, held walls and a stored cap; pairs judged are a warning, count is failing pairs; evidence is capped at 200", () => {
    const r = pair([wall("a", 0), wall("new", 9000)], [wall("b", 0)], 20, { walls_held: 3, walls_total: 9 });
    expect(r.status).toBe("pass");
    expect(r.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/^A-0101\.ifc: 1 wall has no matching wall in another model \(allowed: new design walls/),
      expect.stringMatching(/^B-0102\.ifc: 3 walls were not compared because the reader could not place them/),
      "B-0102.ifc: only the first 1 of 9 walls were stored",
      expect.stringMatching(/^1 wall pair judged at 20 mm/)]));
    // offsets 21..270 mm, listed mildest first: the 200 kept are the worst, worst first
    const many = Array.from({ length: 250 }, (_, i) => wall(`a${i}`, i * 5000, 1000, 0, 500));
    const manyB = Array.from({ length: 250 }, (_, i) => wall(`b${i}`, i * 5000 + 21 + i, 1000, 0, 500));
    const f = pair(many, manyB, 20);
    expect(f.count).toBe(250);
    expect(f.evidence).toHaveLength(200);
    const offs = f.evidence.map((e) => (e as { offset_mm: number }).offset_mm);
    expect(offs[0]).toBe(Math.max(...offs));
    expect(offs).toEqual([...offs].sort((p, q) => q - p));
    expect(offs[0]).toBe(270);
  });
  it("a wall split in one model is judged whichever model is listed first (60 mm off fails both ways)", () => {
    const whole = [wall("w", 0, 200, 0, 10000)], split = [wall("s1", 0, 200, 0, 5000), wall("s2", 60, 200, 5000, 10000)];
    expect(pair(whole, split, 20)).toMatchObject({ status: "fail", count: 1 });
    expect(pair(split, whole, 20)).toMatchObject({ status: "fail", count: 1 });
    expect(pair(whole, [wall("s1", 0, 200, 0, 5000), wall("s2", 0, 200, 5000, 10000)], 20).status).toBe("pass");
  });
  it("a wall moved further than its thickness still pairs, within the tolerance band; beyond that it is a new wall", () => {
    const a = [wall("a1", 0, 200), wall("a2", 3000, 200)];
    expect(pair(a, [wall("b1", 215, 200), wall("b2", 3000, 200)], 20)).toMatchObject({ status: "fail", count: 1 }); // 215 < 200 + 20
    const far = pair(a, [wall("b1", 250, 200), wall("b2", 3000, 200)], 20); // 250 > 200 + 20: reach is thickness + tolerance, and the output says so
    expect(far.status).toBe("pass");
    expect(far.warnings.join(" ")).toMatch(/moved further than its thickness plus the tolerance/);
  });
  it("a tolerance outside 1..1000 (an older contract, a typo) is not set and never passes", () => {
    for (const bad of [NaN, 0, -5, 5000])
      expect(pair([wall("a", 0)], [wall("b", 60)], bad)).toMatchObject({ status: "not_checkable", reason: "tolerance_mm is not a number from 1 to 1000 — not set" });
  });
  it("a stored wall with a null end is dropped, not a crash", () => {
    const broken = { g: "x", s: null, e: [1, 1], t: 200, z0: 0, z1: 1, storey: null } as unknown as W;
    expect(pair([wall("a", 0)], [wall("b", 0), broken]).status).toBe("pass");
  });
  it("one model lists FG-07 as not checkable", () => {
    const r = checkFederation([model("A-0101.ifc", manifest({ guid_audit: { duplicates: 0, examples: [], missing: 0, scope: "IfcProduct", counted: 4 } }))], { verdicts: okVerdicts, live_count: 1, tolerance_mm: 20 });
    expect(check(r, "FG-07")).toMatchObject({ status: "not_checkable", reason: "one model — a cross-model check; nothing to compare" });
  });
  it("a FAIL on FG-07 alone fails the verdict", () => {
    const r = checkFederation([model("A-0101.ifc", manifest({ walls: [wall("a", 0)], elements: [{ guid: "mine", class: "IFCWALL", type_name: "Wall 1", storey: "Level 1" }] })), model("B-0102.ifc", manifest({ walls: [wall("b", 80)], elements: [{ guid: "other", class: "IFCWALL", type_name: "Wall 1", storey: "Level 1" }] }))], { verdicts: okVerdicts, tolerance_mm: 20 });
    expect(r.verdict).toBe("fail");
    expect(r.checks.filter((c) => c.status === "fail").map((c) => c.id)).toEqual(["FG-07"]);
  });
});
