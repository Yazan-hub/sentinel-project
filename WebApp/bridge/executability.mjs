// BEP executability — "how many pages of this document actually control the project?"
//
// Same honesty doctrine as check-registry.mjs: a clause only counts as CONTROLLING when it is bound
// to a check Sentinel can actually evaluate today. A clause bound only to a PLANNED check is
// reported as `declared` — an honest statement of intent — and is NEVER added to the score. A
// fabricated score is the one unacceptable failure of this feature.
//
// Pure: no I/O, no DB. bimdocs-store.mjs composes it with getDoc().

export const SECTION_KINDS = ["controlling", "declared", "narrative"];

/** Classify one section by what it is wired to. `implemented`/`planned` are Sets of check ids. */
export function classifySection(section, implemented, planned) {
  const checks = (section?.bindings?.checks || []).map((c) => c?.id).filter(Boolean);
  const controlling_checks = checks.filter((id) => implemented.has(id));
  const declared_checks = checks.filter((id) => !implemented.has(id) && planned.has(id));
  const unknown_checks = checks.filter((id) => !implemented.has(id) && !planned.has(id));
  const kind = controlling_checks.length ? "controlling" : declared_checks.length ? "declared" : "narrative";
  return {
    section_id: section.id,
    heading: section.heading,
    kind,
    controlling_checks,
    declared_checks,
    unknown_checks,
    owner: section.owner ?? null,
    has_body: !!String(section.body || "").trim(),
  };
}

/**
 * The strip test, as a number. Returns per-section classification plus the roll-up.
 * `score` is the percentage of sections that are CONTROLLING — never including `declared`.
 * A document with no sections scores null with a reason rather than a flattering 0 or 100.
 */
export function executability(doc, implementedIds, plannedIds) {
  const implemented = new Set(implementedIds || []);
  const planned = new Set(plannedIds || []);
  const sections = (doc.sections || []).map((s) => classifySection(s, implemented, planned));

  const summary = {
    sections: sections.length,
    controlling: sections.filter((s) => s.kind === "controlling").length,
    declared: sections.filter((s) => s.kind === "declared").length,
    narrative: sections.filter((s) => s.kind === "narrative").length,
    unowned: sections.filter((s) => !s.owner).length,
    empty: sections.filter((s) => !s.has_body).length,
  };

  const score = summary.sections ? Math.round((summary.controlling / summary.sections) * 100) : null;
  const reason = summary.sections
    ? undefined
    : "This document has no sections yet, so there is nothing to score.";

  return {
    document_id: doc.id,
    title: doc.title,
    doc_type: doc.doc_type,
    generated_at: new Date().toISOString(),
    score,
    ...(reason ? { reason } : {}),
    summary,
    // What the strip test removes: clauses that control nothing that Sentinel can observe.
    strip: sections.filter((s) => s.kind === "narrative").map((s) => s.heading),
    sections,
  };
}
