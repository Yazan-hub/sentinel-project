// platform-contract — standards travel to the platform (spec 2026-09-27 platform-delivery-gate, Decision 7). When a
// lead installs a contract in Settings, the same body is mirrored into the linked platform project as one root item
// `sentinel-contract.json`, one version per install (versionTag = the ref, "contract@1"; "contract@1.<sha12>" when that tag
// already holds another body — another Sentinel project's contract@1, or a re-numbered install), so the platform's Sentinel
// gate component judges every IFC there against it. The bridge's ledger row is the record; this copy is a mirror: a
// copy that could not be made never blocks the install — the Settings line says "not copied to the platform — <why>".

export const CONTRACT_ITEM = "sentinel-contract.json";

/** The four platform calls this needs (a subset of @thatopen/services' EngineServicesClient). */
export interface ContractClient {
  listFiles(filters?: { projectId?: string }): Promise<Array<{ _id: string; name: string; versions?: Array<{ tag: string }> }>>;
  createFile(p: { file: File; name: string; versionTag: string; projectId: string }): Promise<unknown>;
  createVersion(itemId: string, file: Blob, versionTag: string): Promise<unknown>;
  downloadFile(itemId: string, opts: { versionTag: string }): Promise<Response>;
}

/** JSON with every object's keys sorted: two bodies are the same contract when these strings are equal. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);

export type MirrorResult =
  | { status: "created" | "versioned" | "already"; ref: string }
  | { status: "refused"; ref: string; why: string }
  | { status: "no-platform"; ref: string };

/** Mirror `body` as `sentinel-contract.json` version `ref` in the platform project: created the first time, a new
 *  version after. A tag is "already" only when it holds this same body: when `ref` is taken by another body (another
 *  Sentinel project sharing the platform project, or a re-numbered install), the version is tagged `ref.<sha12>` (the
 *  bridge's sha of this body) instead, and the result names that tag. No platform project is "no-platform"; any
 *  platform refusal is "refused" with its words. Never throws. */
export async function publishContractToPlatform(client: ContractClient | undefined, platformId: string | undefined, body: unknown, ref: string, sha: string): Promise<MirrorResult> {
  if (!client || !platformId) return { status: "no-platform", ref };
  try {
    const items = await client.listFiles({ projectId: platformId });
    const existing = items.find((i) => i.name === CONTRACT_ITEM);
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
    if (!existing) {
      await client.createFile({ file: new File([blob], CONTRACT_ITEM, { type: "application/json" }), name: CONTRACT_ITEM, versionTag: ref, projectId: platformId });
      return { status: "created", ref };
    }
    const tags = new Set((existing.versions ?? []).map((v) => v.tag));
    const named = `${ref}.${sha.slice(0, 12)}`;
    if (tags.has(named)) return { status: "already", ref: named };
    if (tags.has(ref)) {
      // A version that cannot be read is not known to be this body: it gets the named tag.
      const same = await client.downloadFile(existing._id, { versionTag: ref })
        .then(async (r) => r.ok && canon(await r.json()) === canon(body), () => false);
      if (same) return { status: "already", ref };
      await client.createVersion(existing._id, blob, named);
      return { status: "versioned", ref: named };
    }
    await client.createVersion(existing._id, blob, ref);
    return { status: "versioned", ref };
  } catch (e) {
    return { status: "refused", ref, why: (e as Error)?.message || String(e) };
  }
}

/** The words after the install note: what the platform now holds, or why it does not. */
export function mirrorLine(r: MirrorResult): string {
  switch (r.status) {
    case "created": case "versioned": return `also on the platform as ${CONTRACT_ITEM} ${r.ref}`;
    case "already": return `already on the platform as ${CONTRACT_ITEM} ${r.ref}`;
    case "refused": return `not copied to the platform — ${r.why}`;
    case "no-platform": return "not copied to the platform — this project is not linked to a platform project (Settings ▸ Platform project)";
  }
}
