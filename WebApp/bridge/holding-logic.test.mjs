// The held list, derived (phase 6a, spec 2026-09-27 Decision 7): pure over the hold rows, the dismissal rows and the
// registered versions — open, repeats collapsed, cleared by a later registration (one not accepted is listed with its
// label), cleared by a dismissal, a naming hold that says why the corrected file does not clear it.
import { describe, it, expect } from "vitest";
import { heldItems, clearedRecent, clearedLabel, NAMING_NOTE } from "./holding-logic.mjs";

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
