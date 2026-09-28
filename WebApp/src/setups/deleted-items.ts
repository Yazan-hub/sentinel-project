import { bfetch } from "./bridge-fetch";

/**
 * Deleted items (migration 0035, as in ACC/Forma): a deleted file, or a draft an archive set aside, is never erased — it
 * waits here, with who deleted it and when, until a lead restores it. Kept for ever (no purge). Any member reads the
 * list; Restore is a lead's (the bridge and the database both check). A list that was not read says so — never "none".
 */

export interface DeletedItem {
  kind: "file" | "version";
  container_id: string;
  iso_name: string;
  deleted_at: string;
  deleted_by: string | null;
  versions?: number; // kind "file": how many versions come back with it
  version_id?: string; // kind "version"
  revision?: string;
  state?: string;
}

const at = (baseUrl: string, key: string, path: string) => `${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/files/${path}`;

/** GET /cde/:key/files/deleted → the items, newest first. A failed read throws "not read — …". */
export async function readDeleted(baseUrl: string, key: string): Promise<DeletedItem[]> {
  let r: Response;
  try { r = await bfetch(at(baseUrl, key, "deleted")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (DeletedItem[] & { message?: string }) | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}

/** POST /cde/:key/files/restore → the bridge's answer; a refusal throws the bridge's words (a taken name is a 409). */
export async function restoreDeleted(baseUrl: string, key: string, item: DeletedItem, actor: string): Promise<{ kind: string; iso_name: string; versions?: number; revision?: string }> {
  const r = await bfetch(at(baseUrl, key, "restore"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ container_id: item.container_id, ...(item.kind === "version" ? { version_id: item.version_id } : {}), actor }),
  });
  const j = (await r.json().catch(() => null)) as { message?: string; kind?: string; iso_name?: string } | null;
  if (!r.ok || !j) throw new Error(j?.message || `HTTP ${r.status}`);
  return j as { kind: string; iso_name: string };
}

/** What a row says: the file (or the file's version and its state), then who and when. */
export function deletedItemLine(i: DeletedItem): { what: string; who: string } {
  const what = i.kind === "file"
    ? `${i.iso_name} — the file, with ${i.versions ?? 0} version(s)`
    : `${i.iso_name} ${i.revision ?? ""} — a ${i.state ?? "draft"} version`;
  return { what, who: `deleted by ${i.deleted_by || "—"} · ${(i.deleted_at || "").replace("T", " ").slice(0, 16)}` };
}

/** What a restore did, in words. */
export function restoredLine(r: { kind: string; iso_name: string; versions?: number; revision?: string }): string {
  return r.kind === "file"
    ? `✓ Restored ${r.iso_name} from Deleted items with its ${r.versions ?? 0} version(s).`
    : `✓ Restored ${r.iso_name} ${r.revision ?? ""} from Deleted items — it comes back in its state, not live.`;
}

/** Archive is offered only for a file holding a published version (the founder's default, 2026-09-28): a file of drafts
 *  only has nothing for the archive — Delete moves it to Deleted items. */
export const archivable = (versions: { state: string }[]) => versions.some((v) => v.state === "published");
