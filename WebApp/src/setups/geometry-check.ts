// SEC-5: Open 3D shows a version's geometry only as the bytes the bridge linked to it. The bridge's "geometry linked"
// ledger row (cde-store attachGeometry, Sentinel's own row) records the sha256 of the bytes it uploaded as that item; a
// download is checked against it before it is loaded, and a mismatch is said in words, never shown.

/** A version's "geometry linked" ledger row, as GET /cde/:key/audit answers it (new_value only). */
export interface GeometryLinkRow {
  new_value?: { platform_item_id?: string; frag_sha256?: string; ifc_sha256?: string; ifc_item_id?: string } | null;
}

export type GeometryCheck = { load: true; checked: boolean; line: string } | { load: false; line: string };

/** Lower-case hex sha256 of the bytes (WebCrypto, which the platform's iframe has). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The sha256 the item's bytes must hash to, or null for a link that recorded none (made before SEC-5). A link recorded
 *  since SEC-5 carries `frag_sha256` (the .frag the bridge uploaded) or `ifc_item_id` (on a raw-IFC link the IFC is the
 *  item: its `ifc_sha256`). */
export function linkedHash(row: GeometryLinkRow | null): string | null {
  const nv = row?.new_value ?? null;
  if (nv?.frag_sha256) return nv.frag_sha256.toLowerCase();
  if (nv?.ifc_item_id) return (nv.ifc_sha256 ?? "").toLowerCase();
  return null;
}

/** The tag of an item's first platform version when it has more than one, else null. The platform lists versions
 *  newest first; by createdAt when every version carries one. */
export function firstTag(versions: ReadonlyArray<{ tag?: string; createdAt?: string }> | null | undefined): string | null {
  const vs = (versions ?? []).filter((v) => v && v.tag);
  if (vs.length < 2) return null;
  const dated = vs.every((v) => v.createdAt);
  return (dated ? [...vs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) : [...vs].reverse())[0].tag ?? null;
}

/** May downloaded bytes (sha256 `got`) of platform item `item` be shown as the version's geometry? `row` is the
 *  version's newest "geometry linked" row, or null; `first` is the tag downloaded for a link that recorded no hash (the
 *  item's first platform version, founder decision A-a), or null (its newest). A recorded hash must match. */
export function geometryCheck(got: string, item: string, row: GeometryLinkRow | null, first: string | null = null): GeometryCheck {
  const nv = row?.new_value ?? null;
  if (nv?.platform_item_id && nv.platform_item_id !== item)
    return { load: false, line: "the ledger links another platform item to this version — not shown as this version's geometry" };
  const want = linkedHash(row);
  if (want !== null) {
    if (want !== "" && got.toLowerCase() === want) return { load: true, checked: true, line: "geometry checked against the ledger's link" };
    return { load: false, line: "the downloaded bytes are not the ones linked to this version (the item changed on the platform, or the download was cut) — not shown" };
  }
  if (first) return { load: true, checked: false, line: "geometry not hash-checked — the item's first platform version" };
  if (!row) return { load: true, checked: false, line: "geometry not hash-checked — the ledger holds no geometry link for this version" };
  return { load: true, checked: false, line: "geometry not hash-checked — this version was linked before Sentinel recorded the geometry's hash" };
}
