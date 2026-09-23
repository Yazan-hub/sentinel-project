// The Node extractor must produce exactly what the referee core adjudicates: the ElementProperties
// shape of sentinel-core/adapter/element-properties.ts. The fixture has one wall with an instance pset
// AND a typed pset carrying the same property — the instance value must win (fix e2c9c54 precedence).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { extractElements, DEFAULT_CLASSES } from "./ifc-extract.mjs";
import { adjudicate } from "./sentinel-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ifc = readFileSync(resolve(here, "fixtures/minimal.ifc"));
const row = (el, pset, name) => el.psets.find((g) => g.name === pset)?.rows.find((r) => r.name === name)?.value;

describe("extractElements", () => {
  it("reads the three building elements with identity, psets and quantities", async () => {
    const { elements, schema, counts } = await extractElements(ifc);
    expect(schema).toBe("IFC4");
    expect(counts.elements).toBe(3); // wall, slab, door — the fixture's proxy is outside DEFAULT_CLASSES (Revit parity, GovernedElementExtractor.CategoryToIfc never exports proxy in bulk)
    expect(counts.skipped).toBe(0);
    const wall = elements.find((e) => e.identity.Class === "IFCWALLSTANDARDCASE");
    expect(wall.identity).toMatchObject({ GlobalId: "7YvctVUKr0kugbFTf53O9L", Name: "Wall-1", ObjectType: "AST_EXT_ARC_CMU_200 mm", Tag: "W1", PredefinedType: "STANDARD" });
    expect(row(wall, "Pset_WallCommon", "FireRating")).toBe("REI 60");      // instance wins over the type's REI 30
    expect(row(wall, "Pset_WallCommon", "IsExternal")).toBe("true");
    expect(row(wall, "Pset_WallCommon", "LoadBearing")).toBe("false");      // only on the type — still present
    expect(wall.quantities.find((g) => g.name === "Qto_WallBaseQuantities").rows).toEqual([{ name: "Length", value: "3500" }]);
    const door = elements.find((e) => e.identity.Class === "IFCDOOR");
    expect(row(door, "Pset_DoorCommon", "Reference")).toBe("D-01");
    expect(elements.every((e) => typeof e.localId === "number" && e.modelId)).toBe(true);
  });
  it("honours a class filter and reports counts by class", async () => {
    const { elements, counts } = await extractElements(ifc, { classes: ["IFCDOOR"] });
    expect(elements.map((e) => e.identity.Class)).toEqual(["IFCDOOR"]);
    expect(counts.by_class).toEqual({ IFCDOOR: 1 });
  });
  it("covers the Revit extractor's classes plus spaces, walls including standard cases", () => {
    for (const c of ["IFCWALL", "IFCSLAB", "IFCDOOR", "IFCWINDOW", "IFCSPACE", "IFCCOLUMN", "IFCBEAM", "IFCFOOTING"]) expect(DEFAULT_CLASSES).toContain(c);
  });
  it("feeds the referee end to end: a FireRating requirement passes on the wall and fails on the slab", async () => {
    const { elements } = await extractElements(ifc);
    const spec = { title: "t", specifications: [
      { name: "WALL — FireRating", applicability: { entity: "IFCWALL" }, requirements: { properties: [{ pset: "Pset_WallCommon", name: "FireRating", cardinality: "required" }] } },
      { name: "SLAB — FireRating", applicability: { entity: "IFCSLAB" }, requirements: { properties: [{ pset: "Pset_SlabCommon", name: "FireRating", cardinality: "required" }] } },
    ] };
    const adj = adjudicate(spec, elements);
    expect(adj.verdict).toBe("rejected");
    expect(adj.failures.some((f) => f.element === "8YvctVUKr0kugbFTf53O9L")).toBe(true);   // the slab
    expect(adj.failures.some((f) => f.element === "7YvctVUKr0kugbFTf53O9L")).toBe(false);  // the wall passes
  });
});
