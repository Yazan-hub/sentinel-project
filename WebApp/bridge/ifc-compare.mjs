// MA-8-2: compare the walls of two IFC files with the Federation Gate's FG-07 rule, no CDE and no container: node bridge/ifc-compare.mjs <a.ifc> <b.ifc>
// [tolerance_mm = 20] [--frame dx,dy,dz,rotation_deg]. --frame moves b into a's frame (the job's frame, survey-plan toModel) before comparing.
// Exit 0 within tolerance · 2 over it · 3 not checkable · 1 error. Local files only: a third-party IFC is never registered anywhere.
import { readFileSync } from "node:fs";
import { readIfcGeometry } from "./ifc-geometry.mjs";
import { manifestWalls } from "./manifest-store.mjs";
import { toModel } from "./survey-plan.mjs";
import { checkFederation } from "./sentinel-core.mjs";

/** FG-07 over two readIfcGeometry results; `frame` ({dx_mm, dy_mm, dz_mm, rotation_deg}) moves b first. Returns the FG-07 check. */
export function compareWalls(ra, rb, tolerance_mm, frame) {
  if (frame) {
    const M = toModel(frame);
    rb = { ...rb, walls: rb.walls.map((w) => ({ ...w, start: M.xy(w.start), end: M.xy(w.end), base_mm: M.z(w.base_mm) })) };
  }
  const man = (r) => ({ schema: r.schema, elements: [], levels: [], grids: [], site: null, ...manifestWalls(r) });
  const res = checkFederation([{ container: "a", version_id: "a", manifest: man(ra) }, { container: "b", version_id: "b", manifest: man(rb) }], { tolerance_mm });
  return res.checks.find((c) => c.id === "FG-07");
}

if (process.argv[1]?.endsWith("ifc-compare.mjs")) {
  const args = process.argv.slice(2), fi = args.indexOf("--frame");
  const fr = fi >= 0 ? (args.splice(fi, 2)[1] ?? "").split(",").map(Number) : null;
  const [a, b, tol] = args;
  if (!a || !b || (fr && (fr.length !== 4 || !fr.every(Number.isFinite)))) { console.error("Usage: node bridge/ifc-compare.mjs <a.ifc> <b.ifc> [tolerance_mm] [--frame dx,dy,dz,rotation_deg]"); process.exit(1); }
  const tolerance_mm = tol == null ? 20 : Number(tol);
  const c = compareWalls(await readIfcGeometry(readFileSync(a)), await readIfcGeometry(readFileSync(b)), tolerance_mm, fr && { dx_mm: fr[0], dy_mm: fr[1], dz_mm: fr[2], rotation_deg: fr[3] });
  console.log(`FG-07 ${c.status === "not_checkable" ? "NOT CHECKABLE" : c.status.toUpperCase()} at ${tolerance_mm} mm${c.reason ? " — " + c.reason : ""}`);
  for (const e of c.evidence.slice(0, 20)) console.log(`  ${JSON.stringify(e)}`);
  for (const w of c.warnings) console.log(`  ! ${w}`);
  process.exit(c.status === "pass" ? 0 : c.status === "fail" ? 2 : 3);
}
