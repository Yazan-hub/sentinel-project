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
  deleted_versions?: number; // kind "file": versions deleted on their own before it — they stay here after its restore
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
export async function restoreDeleted(baseUrl: string, key: string, item: DeletedItem, actor: string): Promise<{ kind: string; iso_name: string; versions?: number; deleted_versions?: number; revision?: string }> {
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
    ? `${i.iso_name} — the file, with ${i.versions ?? 0} version(s)${i.deleted_versions ? ` (and ${i.deleted_versions} deleted version(s), restorable after the file)` : ""}`
    : `${i.iso_name} ${i.revision ?? ""} — a ${i.state ?? "draft"} version`;
  return { what, who: `deleted by ${i.deleted_by || "—"} · ${(i.deleted_at || "").replace("T", " ").slice(0, 16)}` };
}

/** What a restore did, in words. */
export function restoredLine(r: { kind: string; iso_name: string; versions?: number; deleted_versions?: number; revision?: string }): string {
  return r.kind === "file"
    ? `✓ Restored ${r.iso_name} from Deleted items with its ${r.versions ?? 0} version(s).${r.deleted_versions ? ` ${r.deleted_versions} deleted version(s) it held are still in Deleted items — restore each from the list.` : ""}`
    : `✓ Restored ${r.iso_name} ${r.revision ?? ""} from Deleted items — it comes back in its state, not live.`;
}

/** Archive is offered only for a file holding a published version (the founder's default, 2026-09-28): a file of drafts
 *  only has nothing for the archive — Delete moves it to Deleted items. */
export const archivable = (versions: { state: string }[]) => versions.some((v) => v.state === "published");

/** A row of GET /cde/deleted: a Deleted item with the project it is in (the Projects window's Deleted models view). */
export interface DeletedModel extends DeletedItem {
  project_key: string;
  project_name: string;
  office_name?: string | null;
}

/** The Deleted models view's groups: one per project, in the order of its newest row (the rows come newest first); the
 *  search matches the file name, the project name or its key. */
export function groupDeletedModels(rows: DeletedModel[], q: string): { key: string; name: string; office: string | null; rows: DeletedModel[] }[] {
  const s = q.trim().toLowerCase();
  const groups = new Map<string, { key: string; name: string; office: string | null; rows: DeletedModel[] }>();
  for (const r of rows) {
    if (s && ![r.iso_name, r.project_name, r.project_key].some((v) => String(v ?? "").toLowerCase().includes(s))) continue;
    let g = groups.get(r.project_key);
    if (!g) groups.set(r.project_key, (g = { key: r.project_key, name: r.project_name, office: r.office_name ?? null, rows: [] }));
    g.rows.push(r);
  }
  return [...groups.values()];
}

/** What a Deleted models row is: the whole file and its versions, or one version and its state. */
export const deletedModelWhat = (i: DeletedItem): string =>
  i.kind === "file" ? `whole file (${i.versions ?? 0} version${i.versions === 1 ? "" : "s"})` : `version ${i.revision ?? ""} (${i.state ?? "draft"})`;

/** A Deleted models row's identity across two reads of the list (a restore in flight, a ↻): project, file, version. */
export const deletedModelId = (r: DeletedModel): string => `${r.project_key}|${r.container_id}|${r.kind === "version" ? r.version_id ?? "" : ""}`;

/** "N projects" for the bins that were read, and "(k not read)" when some were not — an unread bin is never counted as checked. */
export function deletedAcross(projects: number, notRead: number): string {
  const n = Math.max(0, projects - notRead);
  return `${n} project${n === 1 ? "" : "s"}${notRead ? ` (${notRead} not read)` : ""}`;
}
