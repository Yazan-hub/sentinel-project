import { describe, it, expect } from "vitest";
import { checkFederation, nameShape, type FederationModel, type Manifest, type MapConversion } from "./federation";
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

describe("checkFederation", () => {
  it("passes a consistent pair and reports every check", () => {
    const c = model("C-0103.ifc", manifest({ elements: [{ guid: "g-wall-9", class: "IFCWALL", type_name: "Wall 3", storey: "Level 1" }] }));
    const r = checkFederation([A(), c], { verdicts: okVerdicts });
    expect(r.verdict).toBe("pass");
    expect(r.checks.map((x) => x.id)).toEqual(["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]);
    expect(r.checks.every((x) => x.status === "pass")).toBe(true);
    expect(check(r, "FG-02").reason).toMatch(/no type rule installed/);   // shape-only, said plainly
  });
  it("is not checkable with fewer than two manifests", () => {
    const r = checkFederation([A(), model("B-0102.ifc", null)], { verdicts: okVerdicts });
    expect(r.verdict).toBe("not_checkable");
    expect(r.models.find((m) => m.container === "B-0102.ifc")?.has_manifest).toBe(false);
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
});
