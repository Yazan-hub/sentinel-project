// MA-6-8 — the pure half of proposing from an IFC job: the 6-7 fixture and the Revit 2024 CV2 export read by the real runIfc, typed by the real
// typer over the BDS survey guideline (Location rules, floors keyed on Function) and catalogue.
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as core from "./sentinel-core.mjs";
import { makeTyper } from "./changesets-typing.mjs";
import { validateChangeset } from "./changesets-logic.mjs";
import { planIfc, PLANNER } from "./ifc-plan.mjs";
import { runIfc } from "./ifc-geometry.mjs";
import { fileURLToPath } from "node:url";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const type = makeTyper({
  guideline: { body: read("../../demo/bds-pilot/bds-dd-survey-guideline.json"), label: "guideline@4 · project · 0123456789ab…", sha256: "ab".repeat(32) },
  catalog: { body: read("../../demo/bds-pilot/bds-type-catalog.json"), label: "type_catalog@1 · project · fedcba987654…", sha256: "cd".repeat(32) } }, core);
const JOB = { id: "job-0007", ledger: { id: 3301, hash: "13".repeat(32) }, reader: "sentinel-ifc", version: "0.1.0" };
const ZERO = { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
const run = async (name) => {
  const path = fileURLToPath(new URL(`./fixtures/ifc-geometry/${name}.ifc`, import.meta.url)), bytes = readFileSync(path);
  const r = await runIfc({ job_id: JOB.id, items: [{ id: "ev-0001", kind: "model", path, sha256: createHash("sha256").update(bytes).digest("hex") }], params: {}, seed: 1 });
  expect(r.status).toBe("done");
  return { candidates: r.result.candidates, notRead: r.result.receipt.not_read };
};
const plan = (r, over = {}) => planIfc({ job: JOB, candidates: r.candidates, notRead: r.notRead, frame: ZERO, type, ...over });
const filedAs = (s) => validateChangeset(s.body, { member: true, type, job: { record: { id: JOB.id, ledger_id: 3301, ledger_hash: "13".repeat(32), result_sha256: "ab".repeat(32), reader: "sentinel-ifc 0.1.0", planner: "ifc-planner 0.1.0", frame: ZERO, storey: s.storey, evidence: [], overlaps: [] }, byCid: s.byCid } });
const types = (s) => filedAs(s).elements.filter((e) => e.kind !== "level").map((e) => [e.kind, e.cid.slice(-6), e.place.TypeName ?? null]);
let concept, cv2;
beforeAll(async () => { concept = await run("concept-2storey"); cv2 = await run("revit2024-concept-cv2"); });

describe("planIfc — a concept IFC becomes one changeset per storey", () => {
  it("the 6-7 fixture: levels created as `IFC <cid> <job>`, nothing pre-ticked, inferred from the IFC", () => {
    const p = plan(concept);
    expect(PLANNER).toBe("ifc-planner");
    expect(p.storeys.map((s) => [s.storey.cid, s.storey.level, s.storey.how])).toEqual([["L00", "IFC L00 job-0007", "created"], ["L01", "IFC L01 job-0007", "created"]]);
    const s0 = p.storeys[0];
    expect(s0.body).toMatchObject({ name: "IFC job-0007 · IFC L00 job-0007", contract: 2, source: "sentinel-ifc 0.1.0" });
    expect(s0.body.elements[0]).toMatchObject({ op: "create", kind: "level", place: { BaseElevation: 0, Name: "IFC L00 job-0007" } });
    for (const t of s0.byCid.values()) expect(t).toMatchObject({ pretick: false, accuracy: { status: "inferred", basis: "ifc", from_job: "job-0007" } });
  });

  it("the Revit CV2 export: 300 + IsExternal is the 300 external CMU, 150 not external the 150 internal; a floor 300 is the structural slab", () => {
    const p = plan(cv2);
    const s = p.storeys.find((x) => x.storey.cid === "L02");
    const t = types(s);
    expect(t.filter((x) => x[0] === "wall" && x[2] === "BDS_EXT_ARC_CMU_300 mm")).toHaveLength(4);
    expect(t.filter((x) => x[0] === "wall" && x[2] === "BDS_INT_ARC_CMU_150 mm")).toHaveLength(1);
    expect(t.filter((x) => x[0] === "floor").map((x) => x[2])).toEqual(["BDS_INT_STR_CONC_300 mm"]);
    const w = s.body.elements.find((e) => e.kind === "wall" && e.facts.thickness_mm === 300);
    expect(w.reason).toMatch(/^IFC wall \w{22} "Basic Wall:BDS_EXT_ARC_CMU_300 mm:\d+": 300 mm thick \(material layers\), 3500 mm high, \d+ mm long as modelled · Location Exterior \(IsExternal\) · job-0007 \(ledger #3301\)$/);
    expect(w.validate.identity).toMatchObject({ Class: "IFCWALL", Name: w.cid });
    expect(w.pretick).toBeUndefined();
  });

  it("a storey's body validates as the bridge files it (the real validateChangeset, with the job's trust)", () => {
    expect(filedAs(plan(cv2).storeys.find((x) => x.storey.cid === "L02")).elements.every((e) => e.pretick === false)).toBe(true);
  });

  it("no IsExternal: inside or outside is read from the storey's own walls (D7)", () => {
    const c = structuredClone(cv2.candidates);
    for (const x of c) if (x.kind === "wall") x.geometry.is_external = null;
    const t = types(plan({ ...cv2, candidates: c }).storeys.find((x) => x.storey.cid === "L02")).filter((x) => x[0] === "wall").map((x) => x[2]).sort();
    expect(t).toEqual(["BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_INT_ARC_CMU_150 mm"]);
  });

  it("not read: the column and door are one exception each on their storey, the roof on its own (no changeset there)", () => {
    const p = plan(cv2);
    const ex = p.storeys.find((x) => x.storey.cid === "L02").exceptions;
    expect(ex.map((e) => e.name.split(" ")[0])).toEqual(expect.arrayContaining(["IfcColumn", "IfcDoor"]));
    const roof = p.storeys.find((x) => x.storey.cid === "L07");
    expect(roof.body).toBe(null);
    expect(roof.exceptions.map((e) => e.name)).toEqual([expect.stringMatching(/^IfcRoof /)]);
  });

  it("not_read is one exception a class: 312 pieces of furniture are one row, the first GlobalIds named", () => {
    const many = Array.from({ length: 312 }, (_, i) => ({ global_id: `F${String(i).padStart(21, "0")}`, ifc_class: "IFCFURNISHINGELEMENT", storey: "L00", why: "an IfcFurnishingElement — the IFC planner reads walls and floors (MA-6); a person places it" }));
    const ex = plan({ ...concept, notRead: many }).storeys[0].exceptions.filter((e) => e.unique_id.startsWith("IFCFURNISHINGELEMENT"));
    expect(ex).toHaveLength(1);
    expect(ex[0].name).toBe("IfcFurnishingElement × 312");
    expect(ex[0].reason.length).toBeLessThanOrEqual(300);
    expect(ex[0].reason).toContain("F000000000000000000000");
  });

  it("a floor 275 mm thick has no type: a gap group, an exception, nothing filed for it", () => {
    const c = structuredClone(cv2.candidates);
    const f = c.find((x) => x.kind === "floor" && x.geometry.storey === "L02");
    f.measured.thickness_mm = 275;
    const p = plan({ ...cv2, candidates: c });
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0]).toMatchObject({ category: "Floors", elements: 1 });
    const s = p.storeys.find((x) => x.storey.cid === "L02");
    expect(s.exceptions.find((e) => e.name === `floor ${f.cid}`).reason).toMatch(/^type gap — BDS_INT_STR_CONC_275 mm is not in the type catalogue/);
    expect(s.body.elements.some((e) => e.kind === "floor")).toBe(false);
  });

  it("the lead's frame moves every line (D5: the IFC's own position is never applied)", () => {
    const a = plan(cv2).storeys.find((x) => x.storey.cid === "L02"), b = plan(cv2, { frame: { ...ZERO, dx_mm: 1000 } }).storeys.find((x) => x.storey.cid === "L02");
    const w = (s) => s.body.elements.filter((e) => e.kind === "wall").map((e) => e.place.LocationCurve.start[0]);
    expect(w(b)).toEqual(w(a).map((x) => x + 1000));
  });

  it("a base 50 mm off its storey is held for a person, not filed", () => {
    const c = structuredClone(cv2.candidates);
    const w = c.find((x) => x.kind === "wall" && x.geometry.storey === "L02");
    w.geometry.BaseElevation = 50;
    const s = plan({ ...cv2, candidates: c }).storeys.find((x) => x.storey.cid === "L02");
    expect(s.exceptions.find((e) => e.name === `wall ${w.cid}`).reason).toBe("its base sits 50 mm off IFC L02 job-0007 — a person decides");
    expect(s.body.elements.filter((e) => e.kind === "wall")).toHaveLength(4);
  });

  it("a cid filed already is not proposed again (decision 19)", () => {
    const w = cv2.candidates.find((x) => x.kind === "wall" && x.geometry.storey === "L02");
    const p = plan(cv2, { filed: { cids: new Set([w.cid]), storeys: new Map() } });
    expect(p.already_filed).toBe(1);
    expect(p.storeys.find((x) => x.storey.cid === "L02").body.elements.some((e) => e.cid === w.cid)).toBe(false);
  });
});
