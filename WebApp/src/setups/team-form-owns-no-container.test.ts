import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// F-RUN-7: the panel needs a DOM, so this guards the form's source, as docs-panel-guard.test.ts does.
const src = readFileSync(new URL("./deliverables-panel.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("F-RUN-7: the task team form carries the tick", () => {
  it("shows the tick with its plain label and sends it with the team", () => {
    expect(src).toContain('label("Owns no file: works inside another team\'s model", noCI)');
    expect(src).toContain("owns_no_container: noCI.checked");
    expect(src).toContain("noCI.checked = !!editing.owns_no_container");
  });
  it("sends it only when ticked or when the row already carries it (the column may not be there yet)", () => {
    expect(src).toContain("noCI.checked || editing.owns_no_container !== undefined");
  });
});
