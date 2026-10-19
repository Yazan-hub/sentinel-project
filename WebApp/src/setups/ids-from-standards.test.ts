import { describe, it, expect } from "vitest";
// @ts-ignore — the bridge's compiler (plain .mjs, no types): the words are said of what it makes.
import { standardsToIds } from "../../bridge/ids-compile.mjs";
import { specWords, staleWords } from "./ids-from-standards";

describe("ids-from-standards — the IDS the standards make, in plain words", () => {
  it("says each requirement the bridge compiled as one sentence", () => {
    const { ids } = standardsToIds({
      contract: { label: "contract@1", sha256: "a", body: { contract_key: "k", ifc_schema: "IFC4", required_entities: [], required_psets: [], forbidden_entities: [], require_georeference: false,
        required_properties: ["Pset_WallCommon.FireRating"] } },
      ruleset: { label: "ruleset@1", sha256: "b", body: { rules: [
        { id: "LV-01", target: "level", mode: "warn", tokens: ["L"], token_defs: { L: "L\\d{2}" } },
        { id: "PR-01", target: "parameter", mode: "warn", parameter_name: "Mark", categories: ["Doors"] }] } },
    });
    expect(ids.specifications.flatMap(specWords)).toEqual([
      "Walls must have FireRating in Pset_WallCommon",
      "Levels must have a Name matching ^(?:(?:L\\d{2}))$",
      "Doors must have Mark in any property set",
    ]);
  });
  it("names an IDS made from earlier standards, and says nothing otherwise", () => {
    expect(staleWords({ up_to_date: false, current: "ids@2 · project · 3f07…" })).toBe("ids@2 · project · 3f07… was generated from an earlier contract or naming rules — generate it again to bring it up to date");
    expect(staleWords({ up_to_date: true, current: "ids@2" })).toBe("");
    expect(staleWords({ up_to_date: null, current: "ids@2" })).toBe("");
    expect(staleWords(null)).toBe("");
  });
});
