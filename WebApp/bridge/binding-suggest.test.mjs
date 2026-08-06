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

  it("does not suggest ids.last_verdict from 'grids' (substring, not the word IDS)", () => {
    const [out] = suggestBindings([sec("g1", "Structural grids and levels", "Grid spacing and level datums for the structural model.")]);
    expect(out.suggested.some((s) => s.id === "ids.last_verdict")).toBe(false);
  });

  it("suggests ids.last_verdict when IDS genuinely appears as a word", () => {
    const [out] = suggestBindings([sec("g2", "Data requirements", "Element data requirements are defined by an IDS spec.")]);
    expect(out.suggested.some((s) => s.id === "ids.last_verdict")).toBe(true);
  });

  it("matches both midp and tidp in a slash-joined heading", () => {
    const [out] = suggestBindings([sec("g3", "MIDP/TIDP delivery schedule", "")]);
    const ids = out.suggested.map((s) => s.id);
    expect(ids).toContain("midp.milestones");
  });

  it("does not suggest loin.levels from 'exploded' (substring, not the word LOD)", () => {
    const [out] = suggestBindings([sec("g4", "Exploded view diagrams", "An exploded view showing assembly order.")]);
    expect(out.suggested.some((s) => s.id === "loin.levels")).toBe(false);
  });

  it("remains deterministic for the adversarial inputs (same input twice → identical JSON)", () => {
    const s = [sec("g1", "Structural grids and levels"), sec("g2", "Data requirements", "Defined by an IDS spec.")];
    expect(JSON.stringify(suggestBindings(s))).toBe(JSON.stringify(suggestBindings(s)));
  });
});
