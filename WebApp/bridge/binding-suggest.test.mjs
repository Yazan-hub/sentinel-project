import { describe, it, expect } from "vitest";
import { suggestBindings } from "./binding-suggest.mjs";

const sec = (id, heading, guidance = "") => ({ id, heading, guidance });

describe("suggestBindings", () => {
  it("suggests naming for a container-naming section", () => {
    const [out] = suggestBindings([sec("s1", "6. Container naming and standards", "The naming convention every information container must follow.")]);
    expect(out.suggested[0].id).toBe("naming.containers");
    expect(out.suggested[0].why).toBeTruthy();
  });

  it("suggests CDE state checks for a CDE/workflow section", () => {
    const [out] = suggestBindings([sec("s2", "5. CDE and workflow", "Container states (WIP → Shared → Published → Archived), transitions and approval gates.")]);
    expect(out.suggested.map((s) => s.id)).toContain("cde.states");
  });

  it("suggests the planned LOIN gap for a level-of-information-need section", () => {
    const [out] = suggestBindings([sec("s3", "7. Level of information need (LOIN)", "What information is required per deliverable.")]);
    const loin = out.suggested.find((s) => s.id === "loin.levels");
    expect(loin).toBeTruthy();
    expect(loin.planned).toBe(true);
  });

  it("suggests the planned MIDP gap for a delivery-milestone section", () => {
    const [out] = suggestBindings([sec("s4", "6. Delivery milestones", "Information delivery dates aligned to project milestones.")]);
    expect(out.suggested.some((s) => s.id === "midp.milestones" && s.planned)).toBe(true);
  });

  it("returns an empty list for a section that matches nothing", () => {
    const [out] = suggestBindings([sec("s5", "1. Project information", "Project name, number, address, client.")]);
    expect(out.suggested).toEqual([]);
  });

  it("is deterministic across runs", () => {
    const s = [sec("s1", "6. Container naming and standards")];
    expect(JSON.stringify(suggestBindings(s))).toBe(JSON.stringify(suggestBindings(s)));
  });

  it("orders suggestions by descending confidence", () => {
    const [out] = suggestBindings([sec("s6", "10. Quality assurance and model checking", "Checks run before each state transition (naming, clash, data completeness).")]);
    const cs = out.suggested.map((x) => x.confidence);
    expect([...cs].sort((a, b) => b - a)).toEqual(cs);
  });

  it("carries every section through, matched or not", () => {
    const out = suggestBindings([sec("a", "6. Container naming"), sec("b", "1. Project information")]);
    expect(out.map((o) => o.section_id)).toEqual(["a", "b"]);
  });

  it("tolerates a section with no guidance", () => {
    expect(() => suggestBindings([{ id: "x", heading: "6. Container naming" }])).not.toThrow();
  });
});
