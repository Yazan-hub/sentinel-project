// R3 Task 2: a BEP's LOIN rows compile to IDS beside the EIR and the generated specifications.
import { describe, it, expect } from "vitest";
import { loinToIds, eirToIds, compileIds } from "./ids-compile.mjs";
import { loinIds, putArtefact, validateArtefact } from "./artefact-store.mjs";

const row = (o) => ({ id: "r", element: "Walls", milestone: "Stage 3", property: "Pset_WallCommon.FireRating", value: "REI 60", used_by: "", why: "Fire strategy", ...o });

describe("loinToIds", () => {
  it("words with a dot are not read as a property set", () => {
    const r = loinToIds([row({ property: "e.g. fire rating" })]);
    expect(r.ids.specifications).toEqual([]);
    expect(r.unmatched[0]).toMatchObject({ row: 1 });
    expect(r.unmatched[0].reason).toMatch(/No standard property set holds "e.g. fire rating"/);
  });
  it("maps a category and a qualified property, with its value, milestone name and source sentence", () => {
    const r = loinToIds([row()]);
    expect(r.added).toBe(1);
    expect(r.unmatched).toEqual([]);
    expect(r.ids.specifications[0]).toMatchObject({
      name: "Walls at Stage 3", origin: "loin", source_sentence: "Fire strategy", applicability: { entity: "IFCWALL" },
      requirements: { properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required", value: "REI 60" }] },
    });
    expect(() => validateArtefact("ids", r.ids)).not.toThrow();
  });
  it("maps an IFC class and a bare property through the standard set", () => {
    const s = loinToIds([row({ element: "IfcDoor", property: "FireRating", value: "" })]).ids.specifications[0];
    expect(s.applicability.entity).toBe("IFCDOOR");
    expect(s.requirements.properties[0]).toEqual({ pset: "Pset_DoorCommon", name: "FireRating", cardinality: "required" });
  });
  it("names each row it cannot map, with its reason", () => {
    const r = loinToIds([row({ element: "Widgets" }), row({ element: "" }), row({ property: "" }), row({ element: "Walls", property: "Sparkle" })]);
    expect(r.added).toBe(0);
    expect(r.unmatched.map((u) => u.row)).toEqual([1, 2, 3, 4]);
    expect(r.unmatched[0].reason).toBe('No IFC class is known for "Widgets".');
    expect(r.unmatched[3].reason).toMatch(/No standard property set holds "Sparkle"/);
  });
  it("keeps the EIR's and the generated specifications and replaces an older LOIN one", () => {
    const eir = eirToIds(compileIds("Every door shall have Pset_DoorCommon.FireRating."), { current: null }).ids;
    const gen = { name: "Walls · contract x", origin: "contract", applicability: { entity: "IFCWALL" }, requirements: { properties: [], attributes: [] } };
    const old = { name: "Old", origin: "loin", applicability: { entity: "IFCSLAB" }, requirements: { properties: [], attributes: [] } };
    const current = { ...eir, enforce: "reject", specifications: [...eir.specifications, gen, old] };
    const r = loinToIds([row()], { current });
    const names = r.ids.specifications.map((s) => s.name);
    expect(names).not.toContain("Old");
    expect(names).toContain("Walls · contract x");
    expect(names).toContain("Walls at Stage 3");
    expect(r.ids.specifications.filter((s) => s.origin === "eir").length).toBe(eir.specifications.length);
    expect(r.ids.enforce).toBe("reject");
    expect(r.kept).toBe(eir.specifications.length + 1);
    // the EIR compile in turn keeps the LOIN ones
    expect(eirToIds(compileIds("Every door shall have Pset_DoorCommon.FireRating."), { current: r.ids }).ids.specifications.map((s) => s.name)).toContain("Walls at Stage 3");
  });
});

describe("loinIds — POST /cde/:key/artefacts/ids/loin", () => {
  const mem = () => {
    const docs = new Map(), k = (s, p, d) => `${s}|${p}|${d}`;
    return {
      ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
      docGet: async (s, p, d) => docs.get(k(s, p, d)) ?? null,
      docInsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      docUpsert: async (s, p, d, data) => { docs.set(k(s, p, d), data); },
      audit: async () => {}, requireMinRole: async () => {}, officeKeyOf: async () => null, officeArtefact: async () => null,
    };
  };
  it("is a proposal: installs nothing, answers like the EIR route", async () => {
    const d = mem();
    const r = await loinIds("l1", { rows: [row()], title: "LOIN" }, d);
    expect([r.added, r.kept, r.unmatched.length]).toEqual([1, 0, 0]);
    expect(r.xml).toContain("<ids xmlns=");
    expect(await d.docGet("artefact", "uuid-l1", "ids")).toBeNull();
    await putArtefact("l1", "ids", r.ids, { actor: "lead" }, d);
    expect((await loinIds("l1", { rows: [row({ element: "Slabs", property: "Pset_SlabCommon.LoadBearing" })] }, d)).kept).toBe(0); // its own replaced
  });
});
