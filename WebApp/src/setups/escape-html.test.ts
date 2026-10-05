// SEC-1 (A): one HTML escaper for every panel that builds markup as a string — text and quoted-attribute contexts alike.
import { describe, it, expect } from "vitest";
import { escapeHtml, fmtDate } from "./escape-html";

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
