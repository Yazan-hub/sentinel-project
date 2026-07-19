// setups/snapshot-store — thin client for the bridge's element-snapshot ingest (migration 0005). Lets the
// 5D/6D panels persist a baseline as a server REVISION (team-wide, durable) instead of a client-only blob,
// and rehydrate a baseline's per-element snapshots for the Δ. Degrades gracefully: if the CDE isn't
// configured (bridge returns 503) or we're offline, postRevision returns null and the caller falls back to
// storing the snapshot inline in the project store — so nothing breaks.

import type { ElementSnapshot } from "../sentinel-core";

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

/** POST a snapshot batch as a server revision. Returns the revision_id, or null if the CDE is unavailable. */
export async function postRevision(
  base: string,
  key: string,
  snapshots: ElementSnapshot[],
  meta: { rev_code?: string } = {},
): Promise<string | null> {
  try {
    const r = await fetch(`${base}/cde/${encodeURIComponent(key)}/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rev_code: meta.rev_code ?? null, snapshots }),
    });
    if (!r.ok) return null; // 503 (CDE not configured) or other → caller keeps the inline-blob fallback
    const d = await r.json();
    return (d && typeof d.revision_id === "string") ? d.revision_id : null;
  } catch {
    return null; // offline
  }
}

/** Fetch a revision's element rows and map to ElementSnapshot[]. Empty array on any failure. */
export async function fetchRevisionSnapshots(base: string, key: string, revisionId: string): Promise<ElementSnapshot[]> {
  try {
    const rows = (await (await fetch(`${base}/cde/${encodeURIComponent(key)}/snapshots/${encodeURIComponent(revisionId)}`)).json()) as SnapRow[];
    return Array.isArray(rows) ? rows.map(rowToSnapshot) : [];
  } catch {
    return [];
  }
}
