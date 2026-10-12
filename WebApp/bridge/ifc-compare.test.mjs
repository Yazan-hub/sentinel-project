// MA-8-2: the FG-07 comparison CLI's core, on the repo fixtures (never a third-party IFC).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readIfcGeometry } from "./ifc-geometry.mjs";
import { compareWalls } from "./ifc-compare.mjs";

const bytes = readFileSync(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));

describe("ifc-compare", () => {
  it("a file against itself is within tolerance; moved 60 mm by the frame it fails; moved 25 m up it pairs nothing", async () => {
    const r = await readIfcGeometry(bytes);
    const same = compareWalls(r, r, 20);
    expect(same.status).toBe("pass");
    expect(same.warnings.some((w) => /pair\(s\) judged/.test(w))).toBe(true);
    const moved = compareWalls(r, r, 20, { dx_mm: 0, dy_mm: 60, dz_mm: 0, rotation_deg: 0 });
    expect(moved.status).toBe("fail");
    expect(moved.evidence[0]).toMatchObject({ offset_mm: expect.any(Number) });
    const apart = compareWalls(r, r, 20, { dx_mm: 0, dy_mm: 0, dz_mm: 25000, rotation_deg: 0 });
    expect(apart).toMatchObject({ status: "not_checkable", reason: "no wall is modelled in two models — nothing to compare" });
  });
});
