// MA-8-2: the FG-07 comparison CLI's core, on the repo fixtures (never a third-party IFC).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readIfcGeometry } from "./ifc-geometry.mjs";
import { compareWalls } from "./ifc-compare.mjs";
import { spawnSync } from "node:child_process";


const bytes = readFileSync(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));

describe("ifc-compare", () => {
  it("a file against itself is within tolerance; moved 60 mm by the frame it fails; moved 25 m up it pairs nothing", async () => {
    const r = await readIfcGeometry(bytes);
    const same = compareWalls(r, r, 20);
    expect(same.status).toBe("pass");
    expect(same.warnings.some((w) => /wall pairs? judged/.test(w))).toBe(true);
    const moved = compareWalls(r, r, 20, { dx_mm: 0, dy_mm: 60, dz_mm: 0, rotation_deg: 0 });
    expect(moved.status).toBe("fail");
    expect(moved.evidence[0]).toMatchObject({ offset_mm: expect.any(Number) });
    const apart = compareWalls(r, r, 20, { dx_mm: 0, dy_mm: 0, dz_mm: 25000, rotation_deg: 0 });
    expect(apart).toMatchObject({ status: "not_checkable", reason: "no wall is modelled in two models — nothing to compare" });
  });
  it("a frame with rotation 90 puts a rotated copy back: compares as equal", async () => {
    const r = await readIfcGeometry(bytes);
    const turned = { ...r, walls: r.walls.map((w) => ({ ...w, start: [-w.start[1], w.start[0]], end: [-w.end[1], w.end[0]] })) }; // rotate +90 about the origin
    const back = compareWalls(r, turned, 20, { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: -90 });
    const wrong = compareWalls(r, turned, 20, { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 90 });
    expect(back.status).toBe("pass");
    expect(wrong.status).not.toBe("pass"); // the other sign leaves it turned 180 degrees
  });
  it("the CLI: exit 0 / 2, and 1 with the usage line for a bad tolerance or a bad --frame", () => {
    const f = fileURLToPath(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));
    const run = (...a) => spawnSync(process.execPath, [fileURLToPath(new URL("./ifc-compare.mjs", import.meta.url)), ...a], { encoding: "utf8" });
    expect(run(f, f).status).toBe(0);
    expect(run(f, f, "--frame", "0,60,0,0").status).toBe(2);
    expect(run(f, f, "25", "--frame", "0,0,-497750,0").status).toBe(3); // a negative dz is read as a number, not a flag
    for (const args of [[f, f, "20mm"], [f, f, "0"], [f, f, "1001"], [f, f, "--frame", "0,0,0,0,0"], [f, f, "--frame", "a,b,c,d"]]) {
      const r = run(...args);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.stderr).toMatch(/^Usage: node bridge\/ifc-compare\.mjs/);
    }
  }, 30000); // seven node processes, three of them opening web-ifc: 4.1 s on a CI runner, near the 5 s default
});
