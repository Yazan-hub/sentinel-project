import { describe, it, expect, vi } from "vitest";

// live-plan imports the engine; only the pure matcher is under test here.
vi.mock("@thatopen/components", () => ({}));
vi.mock("@thatopen/components-front", () => ({}));
vi.mock("./clipper-tool", () => ({ ensureSectionStyle: () => {}, STYLE_NAME: "Section" }));
const { matchStoreyView } = await import("./live-plan");

describe("matchStoreyView — a Revit level to a storey view", () => {
  const names = ["Level 1", "Level 10", "Roof", "00 Ground Floor"];
  it("the same name, spaces and case ignored", () => {
    expect(matchStoreyView(names, "  level   1 ")).toBe("Level 1");
  });
  it("else the ONE storey whose name contains it — never a guess between two", () => {
    expect(matchStoreyView(names, "Ground")).toBe("00 Ground Floor");
    expect(matchStoreyView(names, "Level")).toBeNull(); // Level 1 and Level 10 both contain it
    expect(matchStoreyView(names, "Basement")).toBeNull();
    expect(matchStoreyView(names, "")).toBeNull();
  });
});
