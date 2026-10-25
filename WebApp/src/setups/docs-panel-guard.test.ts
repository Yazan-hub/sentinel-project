import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./docs-panel.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** The source of `async function <name>(` up to the next function or section divider. */
const fn = (name: string): string => {
  const from = src.indexOf(`async function ${name}(`);
  expect(from, name).toBeGreaterThan(-1);
  const rest = src.slice(from + 1), ends = [rest.indexOf("\n  async function "), rest.indexOf("\n  // ── ")].filter((i) => i > -1);
  return rest.slice(0, Math.min(...ends));
};

describe("F-R1a-1: the Documents tab never shows the previous project's document", () => {
  it("the list empties before it asks the bridge for the role", () => {
    const f = fn("showList"), clear = f.indexOf("bar.replaceChildren(); body.replaceChildren();");
    expect(clear).toBeGreaterThan(-1); expect(clear).toBeLessThan(f.indexOf("await myRoleRead("));
  });
  it("every open view drops an answer that lands after a switch", () => {
    for (const [name, n] of [["showEditor", 3], ["showReadinessEditor", 3], ["showVersions", 2], ["showDocView", 1]] as const) {
      const f = fn(name);
      expect(f, name).toContain("const mine = seq;");
      expect(f.split("mine !== seq").length - 1, name).toBeGreaterThanOrEqual(n);
    }
  });
});
describe("R1b entry points in the old panel", () => {
  it("Open workspace on each row and in both editor bars; a new BEP or EIR opens in the workspace", () => {
    expect(src.split('btn("Open workspace")').length - 1).toBe(3);
    expect(fn("showCreate")).toContain('(t.doc_type === "BEP" || t.doc_type === "EIR") && opts.onOpenWorkspace');
    expect(fn("showCreate")).toContain("opts.onOpenWorkspace(doc.id)");
  });
});
