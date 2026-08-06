// AI drafting + integrity analysis — the pure half. Builds the grounding pack (a numbered list of
// facts code derived from project state), the two prompts, and parses/gates the model's replies.
// No I/O and no AI here: what the model is shown, and what of its output survives, are both
// decided by unit-testable code.
//
// THE GATE (load-bearing): every integrity finding must cite a fact index from the grounding.
// A finding citing nothing, an unknown index, or a section not in the document is dropped here —
// the model cannot introduce a "fact" of its own into the report. Same honesty rule as the check
// registry (never claim what wasn't measured), applied to generative output.

export const SEVERITIES = ["high", "medium", "low"];
export const MAX_FINDING_CHARS = 500;

/** Numbered facts, built ONLY from sources that exist — an absent source contributes no fact,
 *  never a placeholder (a placeholder would be a fact we invented). */
export function buildGrounding({ project, ruleset, rulesetSource, checks, planned, deliverableSummary, compliance } = {}) {
  const texts = [];
  if (project?.name) texts.push(`This project is "${project.name}" (key: ${project.key})${project.appointing_party ? `, appointing party: ${project.appointing_party}` : ""}.`);
  if (ruleset && rulesetSource !== "unknown") {
    const fields = Array.isArray(ruleset.fields) ? ruleset.fields.join("-") : null;
    texts.push(`The active naming ruleset (${rulesetSource}) requires container names with fields: ${fields || "as configured"}.`);
  }
  for (const c of checks || []) texts.push(`A governance check is configured: "${c.label}" (${c.id}) — ${c.description}`);
  for (const p of planned || []) texts.push(`NO check exists for "${p.label}" — ${p.reason}`);
  if (deliverableSummary) {
    const s = deliverableSummary;
    texts.push(s.total
      ? `The MIDP tracks ${s.total} deliverable(s): ${s.delivered || 0} delivered, ${s.late || 0} late, ${s.in_wip || 0} in WIP unissued, ${s.overdue || 0} overdue, ${s.pending || 0} pending, ${s.unscheduled || 0} unscheduled.`
      : `No deliverables are planned in the MIDP tracker.`);
  }
  for (const sec of compliance?.sections || [])
    for (const r of sec.results || [])
      texts.push(`Compliance for section "${sec.heading}", check "${r.label}": ${r.status}${r.summary ? ` — ${r.summary}` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  return { facts: texts.map((text, i) => ({ n: i + 1, text })) };
}

const factBlock = (grounding) => grounding.facts.map((f) => `FACT ${f.n}: ${f.text}`).join("\n");

export function buildDraftPrompt(grounding, doc, section) {
  const siblings = doc.sections.filter((s) => s.id !== section.id).map((s) => s.heading).join("; ");
  return {
    system:
      `You draft one section of a BIM Execution Plan. Use ONLY the supplied facts for any project ` +
      `specifics — never invent names, dates, tools, or numbers not present in the facts. General ` +
      `ISO 19650 practice wording is fine. Reply with JSON only: {"body": "..."}`,
    user:
      `${factBlock(grounding)}\n\nDocument: "${doc.title}" (${doc.doc_type}). Other sections: ${siblings || "none"}.\n\n` +
      `Write the body for the section below. Match a professional BEP register. 1-4 paragraphs.\n` +
      `Section heading: ${section.heading}\nSection guidance: ${section.guidance || "none"}\n` +
      `Current body (may be empty; improve or replace): ${section.body || "(empty)"}\n\n` +
      `Reply with JSON only: {"body": "..."}`,
  };
}

export function buildIntegrityPrompt(grounding, doc) {
  const sections = doc.sections
    .filter((s) => (s.body || "").trim())
    .map((s) => `SECTION id=${s.id} heading="${s.heading}":\n${s.body}`)
    .join("\n\n");
  return {
    system:
      `You audit a BIM document against a numbered list of FACTS about the project's actual ` +
      `configuration. Report ONLY contradictions between the document text and a specific fact. ` +
      `Each finding MUST cite the fact number it contradicts. If nothing contradicts a fact, ` +
      `report nothing about it. Reply with JSON only: ` +
      `{"findings":[{"section_id":"...","fact":N,"claim":"what the document says","reality":"what the fact says","severity":"high|medium|low"}]}`,
    user:
      `${factBlock(grounding)}\n\nDocument "${doc.title}" (${doc.doc_type}):\n\n${sections}\n\n` +
      `Reply with JSON only: {"findings":[{"section_id":"...","fact":N,"claim":"...","reality":"...","severity":"high|medium|low"}]}`,
  };
}

/** Tolerant JSON extraction. Small models often echo the requested schema in one fenced block and
 *  put the real answer in another, so first-parse-wins would return the echo. Every fenced block
 *  and the greedy brace span are all candidates; a parse that carries `key` beats one that merely
 *  parses. Returns null when hopeless. */
function extractJson(text, key) {
  const raw = String(text ?? "").trim();
  const candidates = [raw];
  for (const m of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push(m[1].trim());
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) candidates.push(brace[0]);
  let fallback = null;
  for (const c of candidates) {
    try {
      const j = JSON.parse(c);
      if (j && typeof j === "object" && key in j) return j;
      fallback = fallback ?? j;
    } catch { /* next */ }
  }
  return fallback;
}

export function parseDraft(text) {
  const j = extractJson(text, "body");
  if (!j || typeof j.body !== "string" || !j.body.trim()) return { unparsed: true };
  return { body: j.body };
}

export function parseFindings(text, doc, factCount) {
  const j = extractJson(text, "findings");
  if (!j || !Array.isArray(j.findings)) return { unparsed: true };
  const ids = new Set((doc?.sections || []).map((s) => s.id));
  const clip = (v) => String(v).slice(0, MAX_FINDING_CHARS);
  let dropped = 0;
  const findings = [];
  for (const f of j.findings) {
    const cited = Number.isInteger(f?.fact) && f.fact >= 1 && f.fact <= factCount;
    const located = typeof f?.section_id === "string" && ids.has(f.section_id);
    const showable = typeof f?.claim === "string" && f.claim.trim() && typeof f?.reality === "string" && f.reality.trim();
    if (!cited || !located || !showable) { dropped += 1; continue; }
    findings.push({
      section_id: f.section_id,
      fact: f.fact,
      claim: clip(f.claim),
      reality: clip(f.reality),
      severity: SEVERITIES.includes(f.severity) ? f.severity : "low",
    });
  }
  return { findings, dropped };
}
