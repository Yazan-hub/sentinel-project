import { describe, it, expect } from "vitest";
import { planViews, type GuidelineViewStandard, type GuidelineViewNaming } from "./guideline";

const views: GuidelineViewStandard[] = [
  { use: "GA Plan", wipTemplate: "01.100_WIP_FLOOR_PLANS", sheetTemplate: "02.100_SHEET_FLOOR_PLANS", viewType: "FloorPlan", namePrefix: "FP", tag: ["Doors", "Windows", "Rooms"] },
  { use: "RCP", wipTemplate: "01.100_WIP_RCP", viewType: "CeilingPlan", namePrefix: "RCP" },
  { use: "Section", wipTemplate: "01.100_WIP_SECTIONS", viewType: "Section", namePrefix: "SEC" },
  { use: "Coordination", viewType: "FloorPlan" }, // no namePrefix -> not plannable
];
const naming: GuidelineViewNaming = {
  structure: "[STATUS]_[TYPE]_[LEVEL]_[DESCRIPTION]",
  statusPrefixes: { "WIP_": "01_WIP_VIEWS", "SH_": "02_SHEET_VIEWS" },
};

describe("planViews", () => {
  it("plans one WIP view per plan-type entry per level, named to the office structure", () => {
    const plans = planViews(views, naming, ["Level 0", "Level 1"]);
    // 2 plannable entries (GA Plan, RCP) x 2 levels
    expect(plans).toHaveLength(4);
    const ga0 = plans.find(p => p.use === "GA Plan" && p.levelName === "Level 0")!;
    expect(ga0.name).toBe("WIP_FP_LEVEL-0");
    expect(ga0.template).toBe("01.100_WIP_FLOOR_PLANS");
    expect(ga0.viewType).toBe("FloorPlan");
    expect(ga0.browserStatus).toBe("01_WIP_VIEWS");
  });

  it("skips Section/ThreeD entries and entries without a namePrefix", () => {
    const plans = planViews(views, naming, ["Level 0"]);
    expect(plans.some(p => p.use === "Section")).toBe(false);
    expect(plans.some(p => p.use === "Coordination")).toBe(false);
  });

  it("degrades to empty on missing input", () => {
    expect(planViews(undefined, naming, ["Level 0"])).toEqual([]);
    expect(planViews(views, undefined, [])).toEqual([]);
  });

  it("is deterministic: same input, same output order (by view entry, then level)", () => {
    const a = planViews(views, naming, ["Level 1", "Level 0"]);
    const b = planViews(views, naming, ["Level 1", "Level 0"]);
    expect(a).toEqual(b);
    expect(a[0].use).toBe("GA Plan");
  });
});
