import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore — the bridge's own judge (plain .mjs, no types): every body a form writes must pass it.
import { validateArtefact } from "../../bridge/artefact-store.mjs";
import { STANDARD_FORMS, STANDARD_LINKS, IFC_SCHEMAS, LAYER_CATEGORIES, listOf, type Model, type Row } from "./standard-forms";

const repo = (p: string) => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8"));
const ctx = { projectKey: "std-f" };
const roundTrip = (kind: string, body: Record<string, unknown> | null) => {
  const f = STANDARD_FORMS[kind];
  return f.toBody(f.fromBody(body), body, ctx);
};
const r = (v: Record<string, string | boolean>): Row => ({ v, orig: {} });

describe("standard forms — a body in force, read and written back, still installs and keeps what the form does not show", () => {
  for (const [kind, file] of [
    ["naming", "demo/bds-pilot/bds-naming-ruleset.json"],
    ["naming", "config/base-standard/naming-ruleset.json"],
    ["contract", "demo/bds-pilot/delivery-contract.json"],
    ["contract", "config/base-standard/delivery-contract.json"],
    ["layers", "demo/bds-pilot/bds-layers.json"],
    ["layers", "config/base-standard/layers.json"],
  ] as const) {
    it(`${kind} ← ${file}`, () => {
      const body = repo(file);
      const out = roundTrip(kind, body);
      expect(validateArtefact(kind, out)).toBe(true);
      // Every key of the original survives (naming's semver moves on by one patch, by design).
      for (const k of Object.keys(body)) if (k !== "semver") expect(out[k], k).toEqual(body[k]);
    });
  }

  it("naming bumps semver by one patch and keeps standard_key", () => {
    const body = repo("demo/bds-pilot/bds-naming-ruleset.json");
    const out = roundTrip("naming", body);
    expect(out.semver).toBe("1.4.1");
    expect(out.standard_key).toBe("bds-iso19650-naming");
  });

  it("review, publish and roi round-trip exactly", () => {
    const review = { steps: [{ name: "Lead check", role: "lead", approvals: 1 }, { name: "Client sign-off", role: "owner", approvals: 2 }] };
    const roi = { currency: "EUR", hourly_rate: 65, minutes: { delivery_gate: 30, naming: 2 }, basis: "office timesheets 2026" };
    for (const [kind, body] of [["review", review], ["publish", { auto: true }], ["publish", { auto: false }], ["roi", roi], ["review", { steps: [] }]] as const) {
      const out = roundTrip(kind, body);
      expect(out).toEqual(body);
      expect(validateArtefact(kind, out)).toBe(true);
    }
  });
});

describe("standard forms — a new standard, filled in by hand, installs", () => {
  it("naming from nothing: key from the label, values as an enum, a pattern kept as typed", () => {
    const f = STANDARD_FORMS.naming;
    const m = f.fromBody(null);
    Object.assign(m, { title: "Our naming", separator: "-", strip_extensions: ".rvt, .ifc", fields: [
      r({ label: "Project code", values: "", pattern: "[A-Z0-9]{4}" }), r({ label: "Originator", values: "ABC, XYZ" }), r({ label: "Number", pattern: "[0-9]{4}" }),
    ] });
    const out = f.toBody(m, null, ctx);
    expect(validateArtefact("naming", out)).toBe(true);
    expect(out).toMatchObject({ standard_key: "std-f-naming", semver: "1.0.0", enforce: "reject", strip_extensions: [".rvt", ".ifc"] });
    expect((out.fields as Record<string, unknown>[]).map((x) => x.key)).toEqual(["project_code", "originator", "number"]);
    expect((out.fields as Record<string, unknown>[])[1]).toEqual({ key: "originator", label: "Originator", enum: ["ABC", "XYZ"] });
  });

  it("contract from nothing: classes upper-cased, shares in % become 0..1, blanks stay out", () => {
    const f = STANDARD_FORMS.contract;
    const m = f.fromBody(null);
    Object.assign(m, { contract_key: "client-eir-2026", ifc_schema: "IFC4", required_entities: [r({ entity: "ifcwall", min_count: "1" })],
      required_psets: "Pset_WallCommon", forbidden_entities: [r({ entity: "IfcBuildingElementProxy", max_count: "10", max_ratio: "5" })], min_coverage: "90" });
    const out = f.toBody(m, null, ctx);
    expect(validateArtefact("contract", out)).toBe(true);
    expect(out).toEqual({
      contract_key: "client-eir-2026", ifc_schema: "IFC4", required_entities: [{ entity: "IFCWALL", min_count: 1 }],
      required_psets: ["Pset_WallCommon"], required_properties: [],
      forbidden_entities: [{ entity: "IFCBUILDINGELEMENTPROXY", max_count: 10, max_ratio: 0.05 }], require_georeference: false, min_coverage: 0.9,
    });
  });

  it("layers from nothing, with and without a datum block", () => {
    const f = STANDARD_FORMS.layers;
    const m = f.fromBody(null);
    Object.assign(m, { standard: "Office layers", layers: [r({ layer: "A-WALL", category: "Walls", aliases: "WALLS, A-WALL-EXT" })], ignore: "*-TEXT" });
    let out = f.toBody(m, null, ctx);
    expect(validateArtefact("layers", out)).toBe(true);
    expect(out.datum).toBeUndefined();
    Object.assign(m, { datum_levels: "A-LEVL", datum_grids: "S-GRID", skip_letters: "i, o", grid_merge_mm: "50" });
    out = f.toBody(m, null, ctx);
    expect(validateArtefact("layers", out)).toBe(true);
    expect(out.datum).toEqual({ levels: ["A-LEVL"], grids: ["S-GRID"], skip_letters: ["I", "O"], grid_merge_mm: 50 });
  });

  it("every select value the forms offer is one the bridge installs", () => {
    for (const s of IFC_SCHEMAS) expect(validateArtefact("contract", { ...repo("config/base-standard/delivery-contract.json"), ifc_schema: s })).toBe(true);
    for (const c of LAYER_CATEGORIES) expect(validateArtefact("layers", { standard: "x", layers: [{ layer: "L", category: c }] })).toBe(true);
    for (const role of ["contributor", "lead", "owner"]) expect(validateArtefact("review", { steps: [{ name: "s", role, approvals: 1 }] })).toBe(true);
    for (const e of ["reject", "warn", "off"]) expect(validateArtefact("naming", { ...repo("demo/bds-pilot/bds-naming-ruleset.json"), enforce: e })).toBe(true);
  });
});

describe("standard forms — the common mistakes, said in plain words before anything is sent", () => {
  const fails = (kind: string, m: Model, words: RegExp) => expect(() => STANDARD_FORMS[kind].toBody(m, null, ctx)).toThrow(words);
  it("says what is wrong", () => {
    fails("review", { steps: [r({ name: "", role: "lead", approvals: "1" })] }, /Step 1 needs a name/);
    fails("review", { steps: [r({ name: "A", role: "lead", approvals: "9" })] }, /approvals must be a whole number from 1 to 5/);
    fails("roi", { currency: "euro", hourly_rate: "50", delivery_gate: "10" }, /three letters/);
    fails("roi", { currency: "EUR", hourly_rate: "50" }, /at least one of the minutes/);
    fails("naming", { title: "N", separator: "--", fields: [] }, /exactly one character/);
    fails("naming", { title: "N", separator: "-", fields: [r({ label: "Zone" })] }, /“Zone” needs its allowed values or a pattern/);
    fails("contract", { contract_key: "my contract", ifc_schema: "IFC4" }, /no spaces/);
    fails("contract", { contract_key: "c", ifc_schema: "IFC4", required_entities: [r({ entity: "wall" })] }, /“wall” is not an IFC class name — write it like IFCWALL/);
    fails("contract", { contract_key: "c", ifc_schema: "IFC4", min_coverage: "120" }, /0 to 100 %/);
    fails("layers", { standard: "L", layers: [r({ layer: "A", category: "Walls" })], skip_letters: "I" }, /levels or grids are drawn first/);
    fails("layers", { standard: "L", layers: [r({ layer: "A", category: "Walls" })], datum_grids: "G", skip_letters: "AB" }, /single letters A to Z/);
  });
});

describe("standard forms — the review and drill findings (STD-F)", () => {
  const contractWith = (forbidden: Row[]) => ({ contract_key: "c", ifc_schema: "IFC4", forbidden_entities: forbidden });
  it("a blank contract limit is no limit on that side, never 0 — and a new class with no limit at all is refused", () => {
    const f = STANDARD_FORMS.contract;
    const out = f.toBody(contractWith([r({ entity: "IFCBUILDINGELEMENTPROXY", max_ratio: "5" }), r({ entity: "IFCSPACE", max_count: "10" })]), null, ctx);
    expect(validateArtefact("contract", out)).toBe(true);
    expect(out.forbidden_entities).toEqual([
      { entity: "IFCBUILDINGELEMENTPROXY", max_count: 2147483647, max_ratio: 0.05 },
      { entity: "IFCSPACE", max_count: 10, max_ratio: 1 },
    ]);
    expect(() => f.toBody(contractWith([r({ entity: "IFCSPACE" })]), null, ctx)).toThrow(/give the most allowed — a count, a share in %, or both/);
    // The base contract's "no count limit" is shown blank and written back as it was.
    const base = repo("config/base-standard/delivery-contract.json");
    expect((f.fromBody(base).forbidden_entities as Row[])[0].v).toMatchObject({ max_count: "", max_ratio: "25" });
    const both = { ...base, forbidden_entities: [{ entity: "IFCSPACE", max_count: 2147483647, max_ratio: 1 }] };
    expect(roundTrip("contract", both).forbidden_entities).toEqual(both.forbidden_entities);
  });

  it("a thousands separator is refused, never read as a decimal comma; one decimal comma is read", () => {
    const roi = (hourly_rate: string) => STANDARD_FORMS.roi.toBody({ currency: "JPY", hourly_rate, delivery_gate: "30" }, null, ctx);
    expect(() => roi("1,250")).toThrow(/could be read two ways/);
    expect(() => roi("1.250,5")).toThrow(/could be read two ways/);
    expect(roi("65,5").hourly_rate).toBe(65.5);
    expect(roi("6500").hourly_rate).toBe(6500);
    expect(() => STANDARD_FORMS.contract.toBody({ contract_key: "c", ifc_schema: "IFC4", required_entities: [r({ entity: "IFCSPACE", min_count: "1,000" })] }, null, ctx)).toThrow(/could be read two ways/);
  });

  it("a naming pattern that does not compile is said by the part's name, before the bridge", () => {
    expect(() => STANDARD_FORMS.naming.toBody({ title: "N", separator: "-", fields: [r({ label: "Number", pattern: "[0-9" })] }, null, ctx))
      .toThrow(/Part “Number”: “\[0-9” is not a valid pattern/);
    expect(() => STANDARD_FORMS.naming.toBody({ title: "N", separator: "-", fields: [r({ label: "Code", pattern: "{org}-[0-9]{2}" })] }, null, ctx)).not.toThrow();
  });

  it("layers: an explicit 'skip no grid letter' survives an unchanged save, 'none' writes it, blank is the I/O default", () => {
    const body = { standard: "L", layers: [{ layer: "A", category: "Walls" }], datum: { grids: ["S-GRID"], skip_letters: [] } };
    expect(STANDARD_FORMS.layers.fromBody(body).skip_letters).toBe("none");
    expect(roundTrip("layers", body).datum).toEqual({ grids: ["S-GRID"], skip_letters: [] });
    const m = STANDARD_FORMS.layers.fromBody(body);
    m.skip_letters = "";
    expect(STANDARD_FORMS.layers.toBody(m, body, ctx).datum).toEqual({ grids: ["S-GRID"] });
  });

  it("layers: a name with more than 3 * is refused in words, as the bridge would refuse it", () => {
    expect(() => STANDARD_FORMS.layers.toBody({ standard: "L", layers: [r({ layer: "A", category: "Walls" })], ignore: "*-*-*-*" }, null, ctx)).toThrow(/at most 3 \*/);
  });
});

describe("standard forms — every kind in Standards in force has a form or a named place", () => {
  it("covers the bridge's kinds (evidence_pack and recipe have their own routes)", async () => {
    // @ts-ignore
    const { KINDS } = await import("../../bridge/artefact-store.mjs");
    const covered = new Set([...Object.keys(STANDARD_FORMS), ...Object.keys(STANDARD_LINKS), "evidence_pack", "recipe"]);
    expect((KINDS as string[]).filter((k) => !covered.has(k))).toEqual([]);
  });
  it("reads a list typed with commas or one per line", () => {
    expect(listOf("a, b\nc,,\n d ")).toEqual(["a", "b", "c", "d"]);
  });
});
