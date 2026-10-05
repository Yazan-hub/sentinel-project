// SEC-1 (A): one HTML escaper for every panel that builds markup as a string — text and quoted-attribute contexts alike.
import { describe, it, expect } from "vitest";
import { escapeHtml, fmtDate, pathSegment } from "./escape-html";

describe("escapeHtml — one escaper for text and quoted attributes", () => {
  it("escapes & < > \" and '", () => {
    expect(escapeHtml(`a&b <i> "q" 'q'`)).toBe("a&amp;b &lt;i&gt; &quot;q&quot; &#39;q&#39;");
  });

  it("escapes a value that is not a string as its text; null and undefined are empty", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml({ toString: () => `x" y` })).toBe("x&quot; y");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("fmtDate — the issue and RFI history day", () => {
  it("is the day, or a dash for none or for text that is not a date — never that text", () => {
    expect(fmtDate("2026-10-05T12:00:00Z")).toBe("2026-10-05");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("<b>not a date</b>")).toBe("—");
  });
});

describe("pathSegment — a value placed as one segment of a bridge path", () => {
  it("is percent-encoded, so it stays one segment", () => {
    expect(pathSegment("cde.states")).toBe("cde.states");
    expect(pathSegment("a/b?c#d")).toBe("a%2Fb%3Fc%23d");
  });

  it("refuses a value a URL would read as a path step, or no segment at all", () => {
    for (const v of [".", "..", "", null, undefined]) expect(() => pathSegment(v)).toThrow("not a path segment");
  });
});
