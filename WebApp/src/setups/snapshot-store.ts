// setups/snapshot-store — thin client for the bridge's element-snapshot ingest (migration 0005). Lets the
// 5D/6D panels persist a baseline as a server REVISION (team-wide, durable) instead of a client-only blob,
// and rehydrate a baseline's per-element snapshots for the Δ. Degrades gracefully: if the CDE isn't
// configured (bridge returns 503) or we're offline, postRevision returns null and the caller falls back to
// storing the snapshot inline in the project store — so nothing breaks.

import type { ElementSnapshot, ElementQuantities } from "../sentinel-core";
import { bfetch } from "./bridge-fetch";

/** Revision metadata row from GET /cde/:key/snapshots — the baseline picker's list. */
export interface RevisionMeta {
  id: string;
  rev_code?: string | null;
  model_id?: string | null;
  element_count?: number | null;
  container_version_id?: string | null; // CDE file-version linkage (migration 0011) — powers the Versions-panel compare
  uploaded_at: string;
}

// The row shape returned by GET /cde/:key/snapshots/:revId (DB columns; measures are nullable).
interface SnapRow {
  guid: string;
  category?: string | null;
  type_name?: string | null;
  count?: number | null;
  length?: number | null;
  area?: number | null;
  volume?: number | null;
  weight?: number | null;
}

/** Map a persisted snapshot row back to the pure ElementSnapshot shape (dropping null measures). */
export function rowToSnapshot(r: SnapRow): ElementSnapshot {
  return {
    guid: String(r.guid),
    category: r.category ?? undefined,
    type_name: r.type_name ?? undefined,
    quantities: {
      ...(r.count != null ? { count: Number(r.count) } : {}),
      ...(r.length != null ? { length: Number(r.length) } : {}),
      ...(r.area != null ? { area: Number(r.area) } : {}),
      ...(r.volume != null ? { volume: Number(r.volume) } : {}),
      ...(r.weight != null ? { weight: Number(r.weight) } : {}),
    },
  };
}

/** Why a revision cannot be priced although it was read: its rows carry no quantity. */
export const NO_QUANTITIES = "that revision carries no quantities (a take-off saved before 2026-09-29, when the bridge dropped them, or an intake capture of element identities only) — it cannot be priced; take a new baseline";

/** GET/POST a bridge JSON answer, or throw its reason — a failed read is never an empty list (item 6 step 0). */
async function readJson(url: string, init?: RequestInit): Promise<unknown> {
  let r: Response;
  try { r = await bfetch(url, init); }
  catch (e) { throw new Error(`can't reach the bridge (${(e as Error)?.message ?? e})`); }
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error((body as { message?: string } | null)?.message || `HTTP ${r.status}`);
  return body;
}

/** POST a snapshot batch as a server revision → its id; a refusal or an unreached bridge throws its reason. */
export async function postRevision(
  base: string,
  key: string,
  snapshots: ElementSnapshot[],
  meta: { rev_code?: string } = {},
): Promise<string> {
  const d = await readJson(`${base}/cde/${encodeURIComponent(key)}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rev_code: meta.rev_code ?? null, snapshots }),
  }) as { revision_id?: unknown } | null;
  if (typeof d?.revision_id !== "string") throw new Error("the bridge answered without a revision id");
  return d.revision_id;
}

/** A revision's element rows, ready to price — else it throws: the read failed, or the rows carry no quantity. */
export async function fetchRevisionSnapshots(base: string, key: string, revisionId: string): Promise<ElementSnapshot[]> {
  const rows = await readJson(`${base}/cde/${encodeURIComponent(key)}/snapshots/${encodeURIComponent(revisionId)}`);
  const snaps = Array.isArray(rows) ? (rows as SnapRow[]).map(rowToSnapshot) : [];
  if (snaps.length && !snaps.some((s) => Object.keys(s.quantities).length)) throw new Error(NO_QUANTITIES);
  return snaps;
}

/** A project's saved revisions (newest first) for the baseline picker; a failed read throws its reason. */
export async function fetchRevisions(base: string, key: string): Promise<RevisionMeta[]> {
  const rows = await readJson(`${base}/cde/${encodeURIComponent(key)}/snapshots`);
  return Array.isArray(rows) ? (rows as RevisionMeta[]) : [];
}

/**
 * Reconstitute stored snapshots into ElementQuantities so a picked baseline revision can be RE-PRICED at the
 * current rates/factors (buildBoQ / buildCarbon) — this is what makes a Δ isolate composition change from rate
 * edits. local_id / model_id are synthetic (baseline elements aren't in the live model, so not isolatable).
 */
export function quantitiesFromSnapshots(snaps: ElementSnapshot[]): ElementQuantities[] {
  return snaps.map((s, i) => ({
    guid: s.guid,
    local_id: i,
    model_id: "revision",
    category: s.category ?? "",
    type_name: s.type_name,
    count: s.quantities.count ?? 1,
    length: s.quantities.length,
    area: s.quantities.area,
    volume: s.quantities.volume,
    weight: s.quantities.weight,
    has_qto: true,
  }));
}
