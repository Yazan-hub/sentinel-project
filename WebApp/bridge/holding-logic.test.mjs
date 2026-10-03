// The held list, derived (phase 6a, spec 2026-09-27 Decision 7): pure over the hold rows, the dismissal rows and the
// registered versions — open, repeats collapsed, cleared by a later registration (one not accepted is listed with its
// label), cleared by a dismissal, a naming hold that says why the corrected file does not clear it.
import { describe, it, expect } from "vitest";
import { heldItems, clearedRecent, clearedLabel, NAMING_NOTE, typeGapId, typeGapGroups, catalogMatch } from "./holding-logic.mjs";

const at = (min) => `2026-09-27T10:${String(min).padStart(2, "0")}:00+00:00`;
const hash = (id) => String(id).padStart(64, "0");
const refusal = (id, min, stage, name = "Tower.ifc", over = {}) => ({
  id, at: at(min), hash: hash(id), actor: "Revit", action: `hold:${stage} ${name}`,
  new_value: { container_name: name, stage, verdict: "rejected", failures: [{ requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" }], failures_total: 1, source: "revit", ...over },
});
const dismissal = (id, min, name = "Tower.ifc") => ({ id, at: at(min), hash: hash(id), actor: "lead@example.test", action: `hold:dismissed ${name}`, new_value: { container_name: name, reason: "superseded by the split model" } });
const version = (id, min, verdict) => ({ id, created_at: at(min), verdict });

describe("heldItems — one item per container name whose newest refusal is newer than its newest registration and dismissal", () => {
  it("a refusal nothing followed is held: its stage, failures, source, actor, time and ledger row", () => {
    expect(heldItems([refusal(901, 1, "ids")], [], {})).toEqual([{
      container_name: "Tower.ifc", stage: "ids", verdict: "rejected", failures: [{ requirement: "Pset_DoorCommon.FireRating", detail: "d1: REQUIRED but missing" }], failures_total: 1,
      source: "revit", actor: "Revit", at: at(1), ledger: { id: 901, hash: hash(901) }, refusals: 1,
    }]);
  });

  it("repeats (auto-publish) collapse into one item: the newest refusal shown, the refusals since it opened counted", () => {
    const rows = [refusal(901, 1, "gate", "Tower.ifc", { source: "auto-publish" }), refusal(905, 5, "ids", "Tower.ifc", { source: "auto-publish" }), refusal(909, 9, "ids", "Tower.ifc", { source: "auto-publish" })];
    expect(heldItems(rows, [], {})).toMatchObject([{ stage: "ids", source: "auto-publish", ledger: { id: 909 }, refusals: 3 }]);
  });

  it("a later registration clears it, whatever its verdict; an earlier one does not; a refusal after a clearance opens a new item counted from 1", () => {
    expect(heldItems([refusal(901, 1, "ids")], [], { "Tower.ifc": [version("v2", 2, "accepted")] })).toEqual([]);
    expect(heldItems([refusal(901, 1, "ids")], [], { "Tower.ifc": [version("v2", 2, "recorded")] })).toEqual([]);
    expect(heldItems([refusal(901, 1, "ids")], [], { "Tower.ifc": [version("v2", 2, null)] })).toEqual([]);
    expect(heldItems([refusal(905, 5, "ids")], [], { "Tower.ifc": [version("v1", 1, "accepted")] })).toMatchObject([{ refusals: 1 }]);
    const rows = [refusal(901, 1, "ids"), refusal(902, 2, "ids"), refusal(906, 6, "gate")];
    expect(heldItems(rows, [], { "Tower.ifc": [version("v3", 3, "accepted")] })).toMatchObject([{ stage: "gate", ledger: { id: 906 }, refusals: 1 }]);
  });

  it("a lead's dismissal clears it; a refusal after the dismissal opens a new item", () => {
    expect(heldItems([refusal(901, 1, "ids")], [dismissal(902, 2)], {})).toEqual([]);
    expect(heldItems([refusal(901, 1, "ids"), refusal(903, 3, "ids")], [dismissal(902, 2)], {})).toMatchObject([{ ledger: { id: 903 }, refusals: 1 }]);
  });

  it("a naming-stage item says the corrected file carries a new name — a lead dismisses it", () => {
    const [item] = heldItems([refusal(901, 1, "naming", "tower final.ifc")], [], { "ASTR26-AST.ifc": [version("v1", 2, "accepted")] });
    expect(item).toMatchObject({ container_name: "tower final.ifc", stage: "naming", naming_note: NAMING_NOTE });
    expect(NAMING_NOTE).toBe("the corrected file carries a new name — a lead dismisses this entry once it is registered");
  });

  it("names are separate, newest refusal first; other rows are ignored, so the whole hold list may be passed twice; an old row's stage comes from its action", () => {
    const all = [refusal(901, 1, "ids", "A.ifc"), refusal(902, 2, "gate", "B.ifc"), dismissal(903, 3, "C.ifc"), { id: 904, at: at(4), hash: hash(904), actor: "x", action: "hold:ids D.ifc", new_value: { container_name: "D.ifc" } }];
    expect(heldItems(all, all, {}).map((i) => [i.container_name, i.stage, i.failures_total])).toEqual([["D.ifc", "ids", 0], ["B.ifc", "gate", 1], ["A.ifc", "ids", 1]]);
  });
});

describe("clearedRecent — a clearance by a registration that was not accepted is listed and labelled", () => {
  it("recorded and verdict-less registrations that cleared an item are listed, newest first, with their label; accepted ones and dismissals are not", () => {
    const rows = [refusal(901, 1, "ids", "A.ifc"), refusal(902, 1, "ids", "B.ifc"), refusal(903, 1, "ids", "C.ifc"), refusal(904, 1, "ids", "D.ifc")];
    const versions = { "A.ifc": [version("va", 2, "recorded")], "B.ifc": [version("vb", 3, null)], "C.ifc": [version("vc", 4, "accepted")] };
    expect(clearedRecent(rows, [dismissal(905, 5, "D.ifc")], versions)).toEqual([
      { container_name: "B.ifc", by: "unjudged", version_id: "vb", at: at(3), label: "cleared by a registration with no verdict (registered outside the referee)" },
      { container_name: "A.ifc", by: "recorded", version_id: "va", at: at(2), label: "cleared by a registration that was not judged (recorded)" },
    ]);
    expect(clearedLabel("rejected")).toBe("cleared by a registration whose verdict is rejected");
  });

  it("a registration that cleared nothing is not listed; the list keeps the last 20", () => {
    expect(clearedRecent([refusal(901, 5, "ids")], [], { "Tower.ifc": [version("v1", 1, "recorded")] })).toEqual([]);
    const rows = Array.from({ length: 25 }, (_, i) => refusal(900 + i, 0, "ids", `F${i}.ifc`));
    const versions = Object.fromEntries(rows.map((_, i) => [`F${i}.ifc`, [version(`v${i}`, i + 1, "recorded")]]));
    const list = clearedRecent(rows, [], versions);
    expect(list).toHaveLength(20);
    expect(list[0]).toMatchObject({ container_name: "F24.ifc" });
  });
});

// MA-2c (design §6.4): a Promote run's type gaps, derived from its type_gap rows — open until a lead dismisses a group or the
// catalogue in force holds the type it wants; a later run that does not report a group does not close it, and one that reports
// nothing beyond what a dismissal saw does not reopen it (review amendment C5).
describe("typeGapGroups — the Holding Area's type gaps", () => {
  const WALL = { category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2, labels: ["GR-FFL · W 2051449", "GR-FFL · W 2051450"], nearest: ["BDS_EXT_ARC_CMU_100 mm"] };
  const DOOR = { category: "Doors", want: null, size: "915 x 2134 mm", key: "HostFunction Interior, Size W915 x H2134 mm", elements: 1, labels: ["GR-FFL · D 2069758"], nearest: [] };
  const run = (id, min, groups, actor = "lead@example.test") => ({ id, at: at(min), hash: hash(id), actor, action: `type_gap:run · ${groups.length} group(s)`, new_value: { groups: groups.map((g) => ({ id: typeGapId(g), ...g })), claimed: true } });
  // C5: a dismissal records what it saw — the group's element count and labels (dismissTypeGap writes both).
  const dismiss = (id, min, g, reason = "a template sample, not a design wall") => ({ id, at: at(min), hash: hash(id), actor: "lead@example.test", action: `hold:type_gap_dismissed ${typeGapId(g)}`,
    new_value: { group: typeGapId(g), reason, elements: g.elements, labels: g.labels } });
  const NO_CATALOG = { types: null, label: "none — not installed for ma2c or its office" };
  const same = (r, cat) => r.category === cat;

  it("a group's id is its category and the type it wants, else its size: the same gap on every run is one id", () => {
    expect(typeGapId(WALL)).toMatch(/^[0-9a-f]{12}$/);
    expect(typeGapId({ ...WALL, elements: 9, key: "Location Exterior" })).toBe(typeGapId(WALL));
    expect(typeGapId({ ...WALL, category: " walls ", want: "bds_ext_arc_cmu_125 MM" })).toBe(typeGapId(WALL));
    expect(typeGapId(DOOR)).not.toBe(typeGapId({ ...DOOR, size: "915 x 2032 mm" }));
  });

  it("every group a run reported is open, from its newest run — counted, with its runs; a later run without it does not close it", () => {
    const g = typeGapGroups([run(901, 1, [WALL, DOOR]), run(905, 5, [{ ...WALL, elements: 3 }])], [], NO_CATALOG, same);
    expect(g.open.map((x) => [x.category, x.elements, x.runs, x.ledger.id])).toEqual([["Walls", 3, 2, 905], ["Doors", 1, 1, 901]]);
    // C10: the newest run's source and claim ride with the group (counted in Revit, not by the bridge).
    expect(g.open[0]).toMatchObject({ id: typeGapId(WALL), want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", at: at(5), actor: "lead@example.test", source: null, claimed: true });
    expect(g).toMatchObject({ closed: [], catalog: "none — not installed for ma2c or its office" });
  });

  it("a lead's dismissal closes it with the reason; later runs that report nothing beyond what it saw leave it closed (review amendment C5)", () => {
    const g = typeGapGroups([run(901, 1, [WALL, DOOR])], [dismiss(903, 3, DOOR)], NO_CATALOG, same);
    expect(g.open.map((x) => x.category)).toEqual(["Walls"]);
    expect(g.closed).toEqual([expect.objectContaining({ category: "Doors", closed_by: "dismissed", reason: "a template sample, not a design wall", closed_at: at(3), closed_by_actor: "lead@example.test", closed_ledger: { id: 903, hash: hash(903) } })]);
    expect(typeGapGroups([run(901, 1, [DOOR]), run(907, 7, [DOOR])], [dismiss(903, 3, DOOR)], NO_CATALOG, same))
      .toMatchObject({ open: [], closed: [{ category: "Doors", closed_by: "dismissed", runs: 2 }] });
  });

  it("a run that reports more than the dismissal saw — another element and label — opens the group again and says so (review amendment C5)", () => {
    const more = { ...DOOR, elements: 2, labels: [...DOOR.labels, "L01 · D 2069801"] };
    const g = typeGapGroups([run(901, 1, [DOOR]), run(907, 7, [more])], [dismiss(903, 3, DOOR)], NO_CATALOG, same);
    expect(g.closed).toEqual([]);
    expect(g.open).toMatchObject([{ category: "Doors", elements: 2, runs: 2, reopened: { since: at(3), more: 1 } }]);
  });

  it("the catalogue in force closes a group when it holds the type it wants — or, wanting none, a type of its category named at its size", () => {
    const catalog = { types: [{ category: "Walls", family: "Basic Wall", type: "BDS_EXT_ARC_CMU_125 mm" }, { category: "Doors", family: "BDS_INT_1 PNL", type: "BDS_INT_1 PNL_WOOD_915 x 2134 mm" }], label: "type_catalog@3 · office · 0f0f0f0f0f0f…" };
    const g = typeGapGroups([run(901, 1, [WALL, DOOR])], [], catalog, same);
    expect(g.open).toEqual([]);
    expect(g.closed.map((x) => [x.category, x.closed_by, x.type, x.catalog])).toEqual([
      ["Walls", "catalogue", "BDS_EXT_ARC_CMU_125 mm", "type_catalog@3 · office · 0f0f0f0f0f0f…"], ["Doors", "catalogue", "BDS_INT_1 PNL_WOOD_915 x 2134 mm", "type_catalog@3 · office · 0f0f0f0f0f0f…"]]);
    expect(catalogMatch(catalog.types, { ...WALL, want: "BDS_EXT_ARC_CMU_212 mm" }, same)).toBeNull();
    expect(catalogMatch(catalog.types, { ...DOOR, category: "Windows" }, same)).toBeNull();
    expect(catalogMatch(null, WALL, same)).toBeNull();
  });
});
