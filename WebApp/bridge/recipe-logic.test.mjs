// MA-8-13 (D13): the recipe body's validator and the approval count - pure, nothing injected.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateRecipe, approvalState, notApprovedWords, editCostNumbers, sameJson, RECIPE_READERS } from "./recipe-logic.mjs";

const SHA = (c) => c.repeat(64);
const GOOD = () => JSON.parse(readFileSync(new URL("./fixtures/recipe/good.json", import.meta.url), "utf8")); // shared with recipe-store.test.mjs and write-roles.test.mjs
const no = (body) => { try { validateRecipe(body); } catch (e) { return [e.status, e.message]; } return null; };

describe("validateRecipe (MA-8-13)", () => {
  it("a verified run's recipe is accepted, for each of the three readers with its own planner", () => {
    expect(validateRecipe(GOOD())).toBe(true);
    for (const [reader, [planner]] of Object.entries(RECIPE_READERS)) {
      const b = GOOD(); b.reader.name = reader; b.planner.name = planner; b.params = {};
      expect(validateRecipe(b)).toBe(true);
    }
    const nulls = GOOD(); nulls.verified.edit_cost.share_changed = null; nulls.verified.reader_row.hash = null;
    expect(validateRecipe(nulls)).toBe(true);
  });
  it("stray keys at any level, an unknown reader, a planner that is not the reader's, bad versions and shas, row counts and the name are each a 400 naming the path", () => {
    const m = (edit) => { const b = GOOD(); edit(b); return no(b); };
    expect(m((b) => { b.extra = 1; })).toEqual([400, "recipe: extra is not a recipe field — a recipe is exactly {name, reader, params, planner, standards, verified}"]);
    expect(m((b) => { b.reader.licence = "x"; })[1]).toContain("recipe: reader.licence is not a recipe field");
    expect(m((b) => { b.verified.edit_cost.bonus = 1; })[1]).toContain("verified.edit_cost.bonus");
    expect(m((b) => { b.reader.name = "laspy"; })[1]).toBe("recipe: reader.name must be one of sentinel-survey, sentinel-drawing, sentinel-ifc");
    expect(m((b) => { b.planner.name = "ifc-planner"; })[1]).toBe("recipe: planner.name must be one of survey-planner");
    expect(m((b) => { b.reader.version = "0.6"; })[1]).toBe("recipe: reader.version must be x.y.z");
    expect(m((b) => { b.standards.guideline.sha256 = "xyz"; })[1]).toBe("recipe: standards.guideline.sha256 must be a sha256 (64 hex characters)");
    expect(m((b) => { delete b.standards.type_catalog; })[1]).toContain("standards.type_catalog");
    expect(m((b) => { b.verified.planner_rows = []; })[1]).toBe("recipe: verified.planner_rows must hold 1 to 20 ledger rows");
    expect(m((b) => { b.verified.planner_rows = Array.from({ length: 21 }, (_, i) => ({ id: i + 1, hash: null })); })[1]).toContain("1 to 20");
    expect(m((b) => { b.verified.run = "cs-0001"; })[1]).toBe("recipe: verified.run must be a job's run (job#<ledger id>)");
    expect(m((b) => { b.verified.edit_cost.kept = -1; })[1]).toBe("recipe: verified.edit_cost.kept must be a whole number from 0");
    expect(m((b) => { b.verified.edit_cost.share_changed = 2; })[1]).toContain("share from 0 to 1");
    expect(m((b) => { b.params = { a: "x" }; })[1]).toContain("params must be an object of at most 8 numbers");
    expect(m((b) => { b.params = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i])); })[1]).toContain("at most 8 numbers");
    for (const name of ["", "  ", "a\nb", "x".repeat(81), 5]) expect(m((b) => { b.name = name; })[1]).toBe("recipe: name must be one line of 1 to 80 characters");
    expect(no(null)[1]).toBe("recipe: the body must be an object");
  });
});

describe("approvalState (D13)", () => {
  const REF = "recipe@1", S = SHA("c");
  let id = 100;
  const row = (user, role, over = {}, action) => ({ id: ++id, entity_type: "recipe", action: action ?? `recipe:approved ${REF} · ${role}`, actor: `${user}@example.test`, hash: `h${id}`,
    new_value: { ref: REF, sha256: S, scope: "project", user_id: user, role, ...over } });
  it("a lead and an owner, two different people, are approved; two leads are not; one person counts once", () => {
    const a = row("u-lead", "lead"), b = row("u-owner", "owner");
    expect(approvalState([a, b], REF, S)).toMatchObject({ state: "approved", approved: true, approvers: ["u-lead", "u-owner"] });
    expect(approvalState([a, b], REF, S).lead.id).toBe(a.id);
    expect(approvalState([a, row("u-lead2", "lead")], REF, S)).toMatchObject({ state: "pending", approved: false, owner: null });
    const again = row("u-lead", "lead"); // the same person twice: the first row only
    expect(approvalState([a, again], REF, S).valid).toEqual([a]);
    expect(approvalState([a, row("u-lead", "owner")], REF, S)).toMatchObject({ approved: false, approvers: ["u-lead"] }); // one person never fills both roles
  });
  it("another sha, another ref, a contributor's row, a row with no user_id and a row of another entity type are ignored; the order of rows does not matter", () => {
    const a = row("u-lead", "lead");
    const noise = [row("u-owner", "owner", { sha256: SHA("d") }), row("u-owner", "owner", { ref: "recipe@2" }), row("u-owner", "contributor"), row("u-owner", "owner", { user_id: undefined }),
      { ...row("u-owner", "owner"), entity_type: "event" }, row("u-owner", "owner", {}, "note: recipe:approved recipe@1 · owner")];
    expect(approvalState([...noise, a], REF, S)).toMatchObject({ approved: false, approvers: ["u-lead"] });
    const b = row("u-owner", "owner");
    expect(approvalState([b, a], REF, S).approved).toBe(true);
  });
  it("an approval counts only while its approver still holds lead or owner (the role on the row decides which); a lapsed one is named", () => {
    const a = row("u-lead", "lead"), b = row("u-owner", "owner");
    expect(approvalState([a, b], REF, S, { "u-lead": "lead", "u-owner": "owner" }).approved).toBe(true);
    expect(approvalState([a, b], REF, S, { "u-lead": "owner", "u-owner": "owner" }).approved).toBe(true); // promoted: still counts as the lead they were
    const demoted = approvalState([a, b], REF, S, { "u-lead": "contributor", "u-owner": "owner" });
    expect(demoted).toMatchObject({ state: "pending", approved: false, lead: null });
    expect(demoted.lapsed.map((r) => r.id)).toEqual([a.id]);
    expect(approvalState([a, b], REF, S, { "u-owner": "owner" }).approved).toBe(false); // removed from the project: no row
  });
  it("a withdrawn version is withdrawn for good, approved or not", () => {
    const a = row("u-lead", "lead"), b = row("u-owner", "owner"), w = row("u-lead", "lead", {}, `recipe:withdrawn ${REF}`);
    const st = approvalState([a, b, w], REF, S);
    expect(st).toMatchObject({ state: "withdrawn", approved: false });
    expect(st.withdrawn.id).toBe(w.id);
    expect(approvalState([a, b, row("u-x", "owner", { sha256: SHA("d") }, `recipe:withdrawn ${REF}`)], REF, S).approved).toBe(true); // another body's withdrawal is not this one's
  });
  it("the words a recipe that does not run yet gets", () => {
    const a = row("u-lead", "lead"), b = row("u-owner", "owner");
    expect(notApprovedWords(REF, "demo", approvalState([a, b], REF, S))).toBeNull();
    expect(notApprovedWords(REF, "demo", approvalState([], REF, S))).toBe("recipe@1 has no approval yet — it runs once a lead and an owner, two different people, have approved it");
    expect(notApprovedWords(REF, "demo", approvalState([a], REF, S))).toBe(`recipe@1 has 1 approval (#${a.id}, a lead's) — it runs once a lead and an owner, two different people, have approved it`);
    expect(notApprovedWords(REF, "demo", approvalState([b], REF, S))).toContain("an owner's");
    expect(notApprovedWords(REF, "demo", approvalState([a, b], REF, S, { "u-owner": "owner" })))
      .toBe(`recipe@1's approval #${a.id} is by someone who is no longer a lead or owner of demo; it runs once a lead and an owner who still hold those roles have approved it`);
    expect(notApprovedWords(REF, "demo", approvalState([a, b, row("u-lead", "lead", {}, `recipe:withdrawn ${REF}`)], REF, S))).toMatch(/^recipe@1 was withdrawn \(ledger #\d+\) and runs no more/);
  });
});

describe("edit-cost helpers", () => {
  it("editCostNumbers is publishEditCost's nine numbers; sameJson ignores key order (jsonb reorders)", () => {
    const r = { run: "job#9", filed: 12, web: 1, carried: 0, revit: 1, applied: 10, undone: 1, kept: 9, withdrawn: 0, share_changed: 0.25, pending: 0 };
    expect(editCostNumbers(r)).toEqual({ filed: 12, web: 1, carried: 0, revit: 1, applied: 10, undone: 1, kept: 9, withdrawn: 0, share_changed: 0.25 });
    expect(sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
  });
});
