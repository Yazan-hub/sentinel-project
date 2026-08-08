// EIR/BEP ingestion — pure logic. Chunking, prompt construction, proposal parsing and merging.
// No I/O and no network so vitest covers all of it; bimdocs-ingest.mjs composes these with the
// file store and the AI gateway. Mirrors the proven Revit-side extractor shape (page-marked
// chunks -> schema-shaped LLM output -> confidence + page provenance -> human review).

/** Assignments at or below this confidence are parked for human assignment, never auto-placed. */
export const LOW_CONFIDENCE = 0.5;

/**
 * Pack extracted pages into chunks under a character budget, injecting [page N] markers so the
 * model can cite pages. A page moderately over budget stays whole (never split mid-sentence: a
 * half sentence maps worse than a long one) — but a page FAR over budget is split at PARAGRAPH
 * boundaries first. Without that, a docx (which mammoth extracts as ONE page regardless of
 * length) becomes a single monster chunk that blows the local model's context and maps nothing.
 * Blank pages are dropped.
 */
export function chunkPages(pages, budget = 6000) {
  // A page up to 1.5× budget rides whole; beyond that, split it into paragraph-packed sub-pages.
  const splitOversized = (p) => {
    const body = (p.text || "").trim();
    if (body.length <= budget * 1.5) return [p];
    const paras = body.split(/\n{2,}/);
    const out = [];
    let buf = "";
    const push = () => { if (buf.trim()) out.push({ page: p.page, text: buf.trim() }); buf = ""; };
    for (const para of paras) {
      // A single paragraph beyond the budget is hard-split as a last resort (tables flattened by
      // extraction can produce these); mid-paragraph beats un-mappable.
      if (para.length > budget) {
        push();
        for (let i = 0; i < para.length; i += budget) out.push({ page: p.page, text: para.slice(i, i + budget) });
        continue;
      }
      if (buf && buf.length + para.length + 2 > budget) push();
      buf += (buf ? "\n\n" : "") + para;
    }
    push();
    return out;
  };

  const chunks = [];
  let text = "";
  let nums = [];
  const flush = () => {
    if (text.trim()) chunks.push({ text: text.trim(), pages: nums });
    text = "";
    nums = [];
  };
  for (const page of pages) {
    for (const p of splitOversized(page)) {
      const marked = `[page ${p.page}]\n${(p.text || "").trim()}`;
      if (!(p.text || "").trim()) continue;
      if (text && text.length + marked.length > budget) flush();
      text += (text ? "\n\n" : "") + marked;
      nums.push(p.page);
    }
  }
  flush();
  return chunks;
}

/** The mapping ask: which template section does each passage of this chunk belong to? */
export function buildMappingPrompt(templateSections, chunk) {
  const headings = templateSections.map((s) => `- "${s.heading}" — ${s.guidance || ""}`).join("\n");
  const system = [
    "You map passages of a client BIM requirements document onto a fixed set of document sections.",
    "",
    "Sections:",
    headings,
    "",
    'Reply with JSON ONLY, shaped: {"assignments":[{"section_heading":"<one of the headings above, copied exactly>","text":"<the passage, verbatim from the input>","confidence":<0..1>,"reason":"<short>"}]}',
    "",
    "Rules: copy text verbatim — never summarise, never invent. Keep the [page N] markers in the text.",
    "Use only the headings listed above. Omit any passage that fits no section rather than forcing it.",
    "If nothing in the input fits any section, reply {\"assignments\":[]}.",
  ].join("\n");
  return { system, user: chunk.text };
}

/**
 * Defensive JSON extraction: models wrap JSON in prose or fences even when told not to. Assignments
 * naming a heading outside the template land in `malformed` rather than inventing a section.
 */
export function parseProposal(raw, templateSections) {
  const known = new Set(templateSections.map((s) => s.heading));
  const obj = extractJson(raw);
  const list = Array.isArray(obj?.assignments) ? obj.assignments : [];
  const assignments = [];
  const malformed = [];
  for (const a of list) {
    const item = {
      section_heading: String(a?.section_heading || ""),
      text: String(a?.text || ""),
      confidence: Number.isFinite(Number(a?.confidence)) ? Number(a.confidence) : 0,
      reason: String(a?.reason || ""),
    };
    if (!item.text.trim()) continue;
    (known.has(item.section_heading) ? assignments : malformed).push(item);
  }
  return { assignments, malformed };
}

function extractJson(raw) {
  const text = String(raw || "");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c); } catch { /* try the next candidate */ }
  }
  return null;
}

/**
 * Fold every chunk's assignments into one proposal: a body per template section (fragments joined
 * in document order, each keeping its pages + confidence) plus `unassigned` — low-confidence,
 * unknown-heading and unparsed text, each carrying the AI's best guess for the review dropdown.
 */
export function mergeProposal(chunkResults, templateSections) {
  const sections = templateSections.map((s) => ({
    heading: s.heading,
    guidance: s.guidance || "",
    body: "",
    fragments: [],
  }));
  const byHeading = new Map(sections.map((s) => [s.heading, s]));
  const unassigned = [];

  for (const r of chunkResults) {
    const pages = r.chunk?.pages || [];
    if (r.unparsed) {
      unassigned.push({ text: r.chunk?.text || "", pages, suggested_heading: null, confidence: 0, reason: "unparsed" });
      continue;
    }
    for (const a of r.assignments || []) {
      if (a.confidence > LOW_CONFIDENCE) byHeading.get(a.section_heading).fragments.push({ text: a.text, pages, confidence: a.confidence });
      else unassigned.push({ text: a.text, pages, suggested_heading: a.section_heading, confidence: a.confidence, reason: a.reason || "low confidence" });
    }
    for (const m of r.malformed || []) {
      unassigned.push({ text: m.text, pages, suggested_heading: null, confidence: m.confidence, reason: `unknown section '${m.section_heading}'` });
    }
  }

  for (const s of sections) s.body = s.fragments.map((f) => f.text).join("\n\n");
  return { sections, unassigned };
}
