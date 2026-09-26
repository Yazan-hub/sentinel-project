import { bfetch } from "./bridge-fetch";

/** The words cde_transition ends with when shared → published needs the lead's reason (migration 0031). */
export const NEEDS_REASON = "needs the lead's reason";

/**
 * POST /cde/versions/:vid/transition { state, actor, note, override? }. A 409 whose message says the version needs
 * the lead's reason (its newest verdict is not an accepted one that measured something) comes back as
 * { needsReason: <the database's words> } so the panel can ask the lead; nothing is retried here. The reason goes
 * out trimmed as `override`, and a blank one is never sent. Every other refusal throws with the bridge's message —
 * a reason the database will not take (no signed-in lead behind it), a role, an illegal move.
 */
export async function transitionVersion(
  baseUrl: string, versionId: string, state: string, opts: { actor: string; note: string; override?: string },
): Promise<{ ok: true } | { needsReason: string }> {
  const override = opts.override?.trim();
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/versions/${encodeURIComponent(versionId)}/transition`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, actor: opts.actor, note: opts.note, ...(override ? { override } : {}) }),
  });
  const j = (await r.json().catch(() => null)) as { message?: string } | null;
  const message = j?.message || `HTTP ${r.status}`;
  if (r.status === 409 && !override && message.includes(NEEDS_REASON)) return { needsReason: message };
  if (!r.ok) throw new Error(message);
  return { ok: true };
}
