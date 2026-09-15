// Who — or WHAT — proposed this, and a receipt anyone can check.
//
// The market this sits in generates BIM from prompts: GPT-6 detailing a wall junction in Revit, a
// language model writing an IFC out of a scan mesh, an agent editing a fire rating in a browser.
// The recurring objection from practitioners is never "the geometry is wrong", it is "who is
// accountable for this and how would anyone prove it later". That is a ledger question, and this
// bridge already has the ledger.
//
// TWO RULES, both non-negotiable:
//
//  1. PROVENANCE IS CLAIMED, NEVER VERIFIED. Sentinel cannot check that the caller really is
//     "gpt-6-astra" — the field is whatever the client typed. So it is stored under `claimed: true`
//     and every surface must render it as an assertion. A provenance block that reads as verified
//     would be a worse lie than no provenance at all, because it would be believed.
//  2. THE PROMPT IS HASHED, NOT STORED. A prompt can carry client-confidential briefing material,
//     and the ledger is append-only and immutable — the wrong place to learn that. The digest still
//     proves "this verdict came from that exact prompt" when the prompt is produced later.
import { createHash } from "node:crypto";

export const RECEIPT_VERSION = "sentinel-receipt/1";
const KINDS = new Set(["human", "agent", "unknown"]);
const sha256 = (text) => createHash("sha256").update(String(text)).digest("hex");
const trim = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Normalise a client-supplied provenance block. Returns null when nothing usable was supplied —
 * an empty claim is not recorded, so the absence of provenance stays visible as an absence.
 */
export function normalizeAgent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const kindRaw = String(input.kind ?? "").trim().toLowerCase();
  const kind = KINDS.has(kindRaw) ? kindRaw : input.model || input.tool ? "agent" : "unknown";
  const model = trim(input.model, 120);
  const tool = trim(input.tool, 120);
  const prompt = typeof input.prompt === "string" ? input.prompt : null;
  const promptDigest = trim(input.prompt_sha256, 64);

  // Nothing but an "unknown" kind is not a claim worth a ledger field.
  if (kind === "unknown" && !model && !tool && !prompt && !promptDigest) return null;

  return {
    claimed: true,                       // read this on every surface before believing any field below
    kind,
    model,
    tool,
    prompt_sha256: prompt ? sha256(prompt) : promptDigest,
    prompt_chars: prompt ? prompt.length : null,
  };
}

/**
 * The shareable receipt for one adjudication. `ledger_hash` is the audit row's own hash-chain entry
 * — the anchor is the chain, not a digest this module invents, so a receipt is checkable against a
 * ledger that is truncate-proof at the database core.
 */
export function buildReceipt(row, { project_key = null } = {}) {
  if (!row || row.id === undefined || row.id === null) return null;
  const v = row.new_value || {};
  return {
    version: RECEIPT_VERSION,
    project: project_key,
    audit_id: row.id,
    recorded_at: row.at ?? null,
    actor: row.actor ?? null,
    verdict: v.verdict ?? null,
    ids_source: v.ids_source ?? null,
    summary: v.summary ?? null,
    agent: v.agent ?? null,              // claimed provenance, or null when none was supplied
    ledger_hash: row.hash ?? null,
    prev_hash: row.prev_hash ?? null,
  };
}

/**
 * Check a receipt against the ledger row it names. Every mismatch is listed rather than collapsed
 * into a boolean: "this receipt is false" and "this receipt is for a different verdict" are
 * different conversations to have with a client.
 */
export function verifyReceipt(receipt, row) {
  const reasons = [];
  if (!receipt || typeof receipt !== "object") return { matches: false, reasons: ["no receipt was supplied"] };
  if (!row) return { matches: false, reasons: ["no ledger entry exists with that audit id"] };
  if (receipt.version !== RECEIPT_VERSION) reasons.push(`receipt version "${receipt.version}" is not ${RECEIPT_VERSION}`);

  const actual = buildReceipt(row, { project_key: receipt.project });
  for (const field of ["audit_id", "recorded_at", "verdict", "ledger_hash"]) {
    // A receipt with no hash cannot be trusted even when every other field lines up: the hash is
    // the only field the database, rather than the caller, produced.
    if (field === "ledger_hash" && !actual.ledger_hash) { reasons.push("the ledger entry carries no chain hash, so this receipt cannot be confirmed"); continue; }
    if (String(receipt[field] ?? "") !== String(actual[field] ?? "")) reasons.push(`${field} does not match the ledger (receipt: ${receipt[field] ?? "—"}, ledger: ${actual[field] ?? "—"})`);
  }
  return { matches: reasons.length === 0, reasons, ledger: actual };
}
