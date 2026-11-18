import { describe, it, expect } from "vitest";
import { hideInline, errorLine, detailOf } from "./details";

// A minimal stand-in for the DOM: enough for withDetails (the suite runs in node).
const node = (tag: string): any => ({ tag, children: [] as any[], style: {}, textContent: "", append(...c: any[]) { this.children.push(...c); }, replaceChildren() {} });
const fakeDoc = { createElement: node } as unknown as Document;

describe("details", () => {
  it("moves a History row, a version and a fingerprint out of the sentence", () => {
    const h = hideInline("✓ Admitted a.las · sha 76c6b5e940d1… · History #12 · receipt abababababababab… (ids@3)");
    expect(h.text).toBe("✓ Admitted a.las · Recorded in History ()");
    expect(h.detail).toBe("History entry 12 · receipt abababababababab…\nids@3\nsha256 76c6b5e940d1…");
  });
  it("leaves a sentence with nothing to hide as it is", () => {
    expect(hideInline("Nothing was saved.")).toEqual({ text: "Nothing was saved.", detail: "" });
  });
  it("an error line carries the bridge's cause in Details", () => {
    const e = Object.assign(new Error("Sentinel could not answer."), { detail: "HTTP 500" });
    expect(detailOf(e)).toBe("HTTP 500");
    (globalThis as any).document = fakeDoc;
    try {
      const line = errorLine(e, "Not saved — ");
      expect(line.textContent).toBe("Not saved — Sentinel could not answer.");
      const box = (Array.from(line.children) as any[]).find((c) => c.tag === "details");
      expect(box.children[1].textContent).toBe("HTTP 500");
    } finally { delete (globalThis as any).document; }
  });
});
