import { bfetch } from "./bridge-fetch";
import { canEditRole, canGovernRole, roleWords } from "./my-role";

/** W-2 (G3): a board's state moves, folder Delete and Rotate key… are a lead's (cde_transition 0043, folders_delete 0004);
 *  + Container, + Folder, Rename, a folder move and Attach a contributor's. null: draw everything; else the one line the
 *  board says where the missing controls would be — for a read-only caller its role words alone. */
export const boardLockedWords = (r: { role: string; read: boolean }): string | null =>
  canGovernRole(r.role) ? null
    : canEditRole(r.role) ? `${roleWords(r)} — sharing, publishing, archiving, deleting folders and key rotation are a lead's`
      : r.role === "viewer" && r.read ? `${roleWords(r)} — read-only` : roleWords(r);

/** The words cde_transition ends with when a share, a publish or a restore needs the lead's reason (migrations 0031, 0040). */
export const NEEDS_REASON = "needs the lead's reason";

/** POST `body` (plus the trimmed reason as `override`, never a blank one). A 409 whose words ask for the lead's reason comes
 *  back as { needsReason } so the panel can ask the lead; nothing is retried here. Any other refusal throws its words. */
async function postAsking(url: string, body: Record<string, unknown>, override?: string): Promise<{ ok: true; j: unknown } | { needsReason: string }> {
  const reason = override?.trim();
  const r = await bfetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...(reason ? { override: reason } : {}) }),
  });
  const j = (await r.json().catch(() => null)) as { message?: string } | null;
  const message = j?.message || `HTTP ${r.status}`;
  if (r.status === 409 && !reason && message.includes(NEEDS_REASON)) return { needsReason: message };
  if (!r.ok) throw new Error(message);
  return { ok: true, j };
}

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
  const r = await postAsking(`${baseUrl.replace(/\/$/, "")}/cde/versions/${encodeURIComponent(versionId)}/transition`,
    { state, actor: opts.actor, note: opts.note }, opts.override);
  return "needsReason" in r ? r : { ok: true };
}

/** POST /cde/:key/files/unarchive { container_id, actor, override? } — SEC-3: a restore reads the verdict as a publish does,
 *  so it asks the lead's reason the same way. Answers how many archived versions were restored. */
export async function unarchiveFile(
  baseUrl: string, key: string, containerId: string, opts: { actor: string; override?: string },
): Promise<{ ok: true; restored: number } | { needsReason: string }> {
  const r = await postAsking(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/files/unarchive`,
    { container_id: containerId, actor: opts.actor }, opts.override);
  return "needsReason" in r ? r : { ok: true, restored: Number((r.j as { restored?: number } | null)?.restored ?? 0) };
}

/** The CDE panel's label for an encrypted attach: P{n}, n past the file's versions and its Deleted items, stepped past a
 *  label the file already holds (trimmed, in any case — as the bridge and 0041 compare them; a revision is registered
 *  once per file). A label held only in Deleted items is not listed here: the bridge's 409 says so. */
export function nextAttachRevision(c: { container_versions?: { revision?: string | null }[]; deleted_versions?: number }): string {
  const held = new Set((c.container_versions ?? []).map((v) => String(v.revision ?? "").trim().toUpperCase()));
  let n = (c.container_versions?.length ?? 0) + (c.deleted_versions ?? 0) + 1;
  while (held.has(`P${String(n).padStart(2, "0")}`)) n++;
  return `P${String(n).padStart(2, "0")}`;
}
