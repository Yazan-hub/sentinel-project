// AI drafting + integrity analysis — the I/O half. Assembles the grounding pack from existing
// stores, makes ONE chat() call per operation, and gates the reply through bimdocs-ai-logic.
// WRITES NOTHING: no DB write, no audit row. An accepted draft is saved by the human through the
// existing patchSection route, which audits it as a normal section edit.
import { chat as realChat } from "./ai-gateway.mjs";
import * as store from "./bimdocs-store.mjs";
import * as registry from "./check-registry.mjs";
import * as deliverables from "./deliverables-store.mjs";
import * as cde from "./cde-store.mjs";
import { buildGrounding, buildDraftPrompt, buildIntegrityPrompt, parseDraft, parseFindings } from "./bimdocs-ai-logic.mjs";

// Budget for the ASSEMBLED prompt (system + user: fact block AND document text) on both AI paths.
// Name kept for import compatibility; since the review fix it caps the prompt, not just doc chars.
export const MAX_INTEGRITY_CHARS = 60000;
const err = (status, message) => Object.assign(new Error(message), { status });

/** deps is a test seam only — production callers pass nothing and get the real modules. */
const wire = (deps) => ({
  chat: deps.chat || realChat,
  getDoc: deps.getDoc || store.getDoc,
  complianceReport: deps.complianceReport || store.complianceReport,
  listChecks: deps.listChecks || registry.listChecks,
  deliverableStatus: deps.deliverableStatus || deliverables.deliverableStatus,
  ensureProject: deps.ensureProject || cde.ensureProject,
  projectNamingRuleset: deps.projectNamingRuleset || cde.projectNamingRuleset,
});

async function assembleGrounding(key, docId, d) {
  const [project, naming, status, compliance] = await Promise.all([
    d.ensureProject(key),
    d.projectNamingRuleset(key).catch(() => ({ ruleset: null, source: "unknown" })),
    d.deliverableStatus(key).catch(() => null),
    d.complianceReport(key, docId).catch(() => null),
  ]);
  const { checks, planned } = d.listChecks();
  return buildGrounding({
    project,
    ruleset: naming.ruleset, rulesetSource: naming.source,
    checks, planned,
    deliverableSummary: status?.summary || null,
    compliance,
  });
}

/** Cap the ASSEMBLED prompt, not the raw document: the fact block (checks, compliance results,
 *  deliverables) rides in every prompt, so a fact-heavy project can blow the budget with a small
 *  doc — and a local model would silently truncate or thrash instead of failing honestly. */
const assertPromptWithinCap = (system, user, what) => {
  const chars = system.length + user.length;
  if (chars > MAX_INTEGRITY_CHARS)
    throw err(413, `assembled ${what} prompt is too large (${chars} chars, limit ${MAX_INTEGRITY_CHARS}) — fewer bound checks or a smaller document will fit`);
};

export async function draftSection(key, docId, sectionId, { provider, model } = {}, deps = {}) {
  const d = wire(deps);
  const doc = await d.getDoc(key, docId);
  if (doc.status === "published" || doc.status === "archived")
    throw err(409, `document is ${doc.status}; drafting requires an editable document`);
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) throw err(404, "section not found");

  const grounding = await assembleGrounding(key, docId, d);
  const { system, user } = buildDraftPrompt(grounding, doc, section);
  assertPromptWithinCap(system, user, "draft");
  const reply = await d.chat({ provider, model, system, messages: [{ role: "user", content: user }], format: "json" });
  // A refusal is not a parse failure — surface the real reason, not "unusable output".
  if (reply.refused) throw err(502, "model declined to draft this section — rephrase the section guidance or switch model");
  const parsed = parseDraft(reply.text);
  if (parsed.unparsed) throw err(502, "model returned unusable output — try again or switch model");
  return { proposal: parsed.body, grounding_used: grounding.facts.length, provider: reply.provider, model: reply.model };
}

export async function integrityReport(key, docId, { provider, model } = {}, deps = {}) {
  const d = wire(deps);
  const doc = await d.getDoc(key, docId);

  const contentChars = doc.sections.reduce((n, s) => n + (s.body || "").trim().length, 0);
  if (!contentChars)
    // Honest not-checkable, not a vacuous pass — and no AI cost for an empty document.
    return { findings: [], dropped: 0, grounding_used: 0, generated_at: new Date().toISOString(), note: "document has no content to analyse" };

  const grounding = await assembleGrounding(key, docId, d);
  const { system, user } = buildIntegrityPrompt(grounding, doc);
  assertPromptWithinCap(system, user, "integrity"); // the real prompt, doc + fact block — not doc chars alone
  const reply = await d.chat({ provider, model, system, messages: [{ role: "user", content: user }], format: "json" });
  if (reply.refused) throw err(502, "model declined to analyse this document — try again or switch model");
  const parsed = parseFindings(reply.text, doc, grounding.facts.length);
  if (parsed.unparsed) throw err(502, "model returned unusable output — try again or switch model");
  return {
    findings: parsed.findings, dropped: parsed.dropped,
    grounding_used: grounding.facts.length,
    generated_at: new Date().toISOString(),
    provider: reply.provider, model: reply.model,
  };
}
