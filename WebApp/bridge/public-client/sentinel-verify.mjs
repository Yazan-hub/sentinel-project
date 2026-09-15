// sentinel-verify — the whole public client, in one zero-dependency file.
//
// WHY THIS EXISTS. Every tool in this market proposes: an agent writes IFC, a viewer edits a
// property, a generator produces a family. None of them can say "and here is the proof it was
// allowed". Sentinel can, but only if calling it is trivial from someone else's app — so the
// referee's public surface is this file: no build step, no package, no framework, drop it in an
// <script type="module"> next to a That Open viewer and you have a governed publish.
//
// Nothing here is privileged. It is a thin, readable wrapper over three HTTP calls, published so
// that anyone can check what the referee is actually being asked and what it actually answered.
//
// Usage:
//   import { Sentinel } from "./sentinel-verify.mjs";
//   const s = new Sentinel({ baseUrl: "http://127.0.0.1:4100", project: "bds" });
//   const verdict = await s.propose({ elements, agent: { kind: "agent", model: "gpt-6", prompt } });
//   const check   = await s.verify(verdict.receipt);   // ← anyone can run this, not just the proposer

export const CONTRACT_VERSION = "sentinel-verdict/1";

export class SentinelError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "SentinelError";
    this.status = status;
    this.body = body;
  }
}

export class Sentinel {
  /** @param {{baseUrl: string, project: string, token?: string, fetch?: typeof globalThis.fetch}} opts */
  constructor({ baseUrl, project, token, fetch: f } = {}) {
    if (!baseUrl) throw new Error("baseUrl is required (the Sentinel bridge, e.g. http://127.0.0.1:4100)");
    if (!project) throw new Error("project is required (the project key)");
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.project = project;
    this.token = token || null;
    this._fetch = f || ((...a) => globalThis.fetch(...a));
  }

  async _call(path, init = {}) {
    const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const r = await this._fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new SentinelError(body?.message || `Sentinel responded ${r.status}`, r.status, body);
    return body;
  }

  /**
   * Submit elements for adjudication. Returns the verdict plus a receipt anchored on the ledger.
   * `agent` provenance is CLAIMED and recorded as such — the prompt is hashed bridge-side, never stored.
   */
  propose({ elements, ids, agent, source, note, container_name } = {}) {
    if (!Array.isArray(elements)) throw new Error("elements must be an array");
    return this._call(`/cde/${encodeURIComponent(this.project)}/propose`, {
      method: "POST",
      body: JSON.stringify({ elements, ids, agent, source, note, container_name }),
    });
  }

  /** Re-check a receipt against the ledger. The point of the whole exercise: do not take my word for it. */
  verify(receipt) {
    return this._call(`/receipt/${encodeURIComponent(this.project)}/verify`, {
      method: "POST",
      body: JSON.stringify({ receipt }),
    });
  }

  /** Fetch the authoritative receipt for a ledger entry, by audit id. */
  receipt(auditId) {
    return this._call(`/receipt/${encodeURIComponent(this.project)}/${encodeURIComponent(String(auditId))}`);
  }
}

/**
 * A verdict badge as a DOM node — built with createElement, never innerHTML, so it is safe to render
 * next to untrusted model data.
 *
 * It renders UNVERIFIED until `verify()` has confirmed the receipt against the ledger. A badge that
 * looked authoritative on the proposer's say-so would defeat its own purpose: the whole value is
 * that the reader checked, not that the writer asserted.
 */
export function verdictBadge(receipt, check, doc = globalThis.document) {
  if (!doc) throw new Error("no document available — pass one for non-browser use");
  const verdict = receipt?.verdict ?? "unknown";
  const confirmed = check?.matches === true;
  const accepted = verdict === "accepted";
  const color = !confirmed ? "#9ca3af" : accepted ? "#16a34a" : "#dc2626";

  const el = doc.createElement("span");
  el.setAttribute("data-sentinel-verdict", verdict);
  el.setAttribute("data-sentinel-confirmed", String(confirmed));
  el.style.cssText = `display:inline-flex;gap:.4rem;align-items:baseline;border:1px solid ${color};color:${color};border-radius:.35rem;padding:.1rem .45rem;font:600 12px system-ui`;

  const mark = doc.createElement("span");
  mark.textContent = !confirmed ? "?" : accepted ? "✓" : "✗";
  const label = doc.createElement("span");
  label.textContent = !confirmed
    ? `${verdict} — unverified`
    : accepted ? "accepted by Sentinel" : "rejected by Sentinel";
  el.append(mark, label);

  if (receipt?.ledger_hash) {
    const hash = doc.createElement("code");
    hash.textContent = String(receipt.ledger_hash).slice(0, 8);
    hash.style.cssText = "font:11px ui-monospace,Consolas,monospace;opacity:.7";
    hash.title = confirmed
      ? `Confirmed against the immutable ledger (entry ${receipt.audit_id}).`
      : "Not confirmed — call verify() before believing this badge.";
    el.append(hash);
  }
  return el;
}
