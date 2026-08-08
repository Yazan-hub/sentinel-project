import { describe, it, expect } from "vitest";
import { chunkPages, buildMappingPrompt, parseProposal, mergeProposal, LOW_CONFIDENCE } from "./ingest-logic.mjs";

const SECTIONS = [
  { heading: "1. Context", guidance: "why" },
  { heading: "2. Requirements", guidance: "what" },
];

describe("chunkPages", () => {
  it("packs pages up to the budget and marks page numbers", () => {
    const pages = [{ page: 1, text: "a".repeat(50) }, { page: 2, text: "b".repeat(50) }];
    const [chunk] = chunkPages(pages, 500);
    expect(chunk.pages).toEqual([1, 2]);
    expect(chunk.text).toContain("[page 1]");
    expect(chunk.text).toContain("[page 2]");
  });

  it("splits when the budget is exceeded", () => {
    const pages = [{ page: 1, text: "a".repeat(400) }, { page: 2, text: "b".repeat(400) }];
    const chunks = chunkPages(pages, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].pages).toEqual([1]);
    expect(chunks[1].pages).toEqual([2]);
  });

  // CONTRACT CHANGE (external-user run, finding #4): the old pin "keeps a single oversized page
  // as its own chunk" enshrined the docx mega-chunk bug — mammoth extracts any docx as ONE page,
  // so a 49k document became one unmappable prompt. New contract: moderately-over rides whole
  // (≤1.5× budget), far-over splits at paragraph boundaries.
  it("a page moderately over budget (≤1.5×) still rides whole", () => {
    const chunks = chunkPages([{ page: 1, text: "x".repeat(700) }], 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pages).toEqual([1]);
  });

  it("a page FAR over budget is split — no more unmappable mega-chunks", () => {
    const chunks = chunkPages([{ page: 1, text: Array.from({ length: 18 }, () => "p".repeat(450)).join("\n\n") }], 500);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.pages).toEqual([1]);
  });

  it("skips blank pages", () => {
    const chunks = chunkPages([{ page: 1, text: "   " }, { page: 2, text: "real" }], 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pages).toEqual([2]);
  });
});

describe("buildMappingPrompt", () => {
  it("lists every heading and embeds the chunk text", () => {
    const { system, user } = buildMappingPrompt(SECTIONS, { text: "[page 1] hello", pages: [1] });
    expect(system).toContain("1. Context");
    expect(system).toContain("2. Requirements");
    expect(system).toContain("JSON");
    expect(user).toContain("[page 1] hello");
  });
});

describe("parseProposal", () => {
  it("parses clean JSON", () => {
    const raw = JSON.stringify({ assignments: [{ section_heading: "1. Context", text: "t", confidence: 0.9, reason: "r" }] });
    const { assignments, malformed } = parseProposal(raw, SECTIONS);
    expect(assignments).toHaveLength(1);
    expect(malformed).toHaveLength(0);
  });

  it("parses JSON inside a fenced code block with prose around it", () => {
    const raw = 'Sure!\n```json\n{"assignments":[{"section_heading":"2. Requirements","text":"t","confidence":0.7}]}\n```\nHope that helps.';
    const { assignments } = parseProposal(raw, SECTIONS);
    expect(assignments[0].section_heading).toBe("2. Requirements");
  });

  it("routes unknown headings to malformed instead of inventing sections", () => {
    const raw = JSON.stringify({ assignments: [{ section_heading: "99. Nope", text: "t", confidence: 0.9 }] });
    const { assignments, malformed } = parseProposal(raw, SECTIONS);
    expect(assignments).toHaveLength(0);
    expect(malformed).toHaveLength(1);
  });

  it("returns empty results for garbage", () => {
    const { assignments, malformed } = parseProposal("not json at all", SECTIONS);
    expect(assignments).toHaveLength(0);
    expect(malformed).toHaveLength(0);
  });

  it("defaults a missing confidence to 0", () => {
    const raw = JSON.stringify({ assignments: [{ section_heading: "1. Context", text: "t" }] });
    const { assignments } = parseProposal(raw, SECTIONS);
    expect(assignments[0].confidence).toBe(0);
  });
});

describe("mergeProposal", () => {
  const chunk1 = { text: "c1", pages: [1] };
  const chunk2 = { text: "c2", pages: [2] };

  it("groups by section and preserves document order", () => {
    const { sections } = mergeProposal([
      { chunk: chunk1, assignments: [{ section_heading: "1. Context", text: "first", confidence: 0.9 }], malformed: [] },
      { chunk: chunk2, assignments: [{ section_heading: "1. Context", text: "second", confidence: 0.8 }], malformed: [] },
    ], SECTIONS);
    const ctx = sections.find((s) => s.heading === "1. Context");
    expect(ctx.body).toBe("first\n\nsecond");
    expect(ctx.fragments).toHaveLength(2);
    expect(ctx.fragments[0].pages).toEqual([1]);
  });

  it("sends low-confidence assignments to unassigned", () => {
    const { sections, unassigned } = mergeProposal([
      { chunk: chunk1, assignments: [{ section_heading: "1. Context", text: "weak", confidence: LOW_CONFIDENCE }], malformed: [] },
    ], SECTIONS);
    expect(sections.find((s) => s.heading === "1. Context").body).toBe("");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].suggested_heading).toBe("1. Context");
    expect(unassigned[0].pages).toEqual([1]);
  });

  it("sends an unparsed chunk to unassigned with the chunk text", () => {
    const { unassigned } = mergeProposal([{ chunk: chunk1, assignments: [], malformed: [], unparsed: true }], SECTIONS);
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0].reason).toBe("unparsed");
    expect(unassigned[0].text).toBe("c1");
  });

  it("returns every template section even when nothing mapped", () => {
    const { sections } = mergeProposal([], SECTIONS);
    expect(sections.map((s) => s.heading)).toEqual(["1. Context", "2. Requirements"]);
    expect(sections.every((s) => s.body === "")).toBe(true);
  });
});

describe("chunkPages — oversized single pages (the docx mega-chunk bug)", () => {
  it("splits a 49k single-page docx-style extraction into budget-sized chunks at paragraph boundaries", () => {
    const para = "A paragraph of mappable BEP prose about naming and delivery. ".repeat(20); // ~1.2k
    const text = Array.from({ length: 40 }, () => para).join("\n\n");                     // ~49k
    const chunks = chunkPages([{ page: 1, text }]);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(6000 + 200);
    expect(chunks.every((c) => c.pages.includes(1))).toBe(true);
    expect(chunks[0].text.startsWith("[page 1]")).toBe(true);
  });

  it("a page moderately over budget still rides whole (never split mid-sentence for 10% over)", () => {
    const text = "x".repeat(7000); // 1.17× budget — under the 1.5× threshold... a single unbroken run
    const chunks = chunkPages([{ page: 3, text }]);
    expect(chunks).toHaveLength(1);
  });

  it("a single paragraph beyond the budget is hard-split rather than left unmappable", () => {
    const text = "y".repeat(20000); // one giant 'paragraph' (flattened table)
    const chunks = chunkPages([{ page: 2, text }]);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(6000 + 200);
  });

  it("multi-page PDFs behave exactly as before (regression)", () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({ page: i + 1, text: "Page content. ".repeat(100) })); // ~1.4k each
    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].pages.length).toBeGreaterThan(1); // packing still merges small pages
  });
});
