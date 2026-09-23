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
