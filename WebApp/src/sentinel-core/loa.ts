// MA-8-5: the LOA band of a measured wall (USIBD Level of Accuracy, represented accuracy against the admitted scan).
// STEP 0 IS NOT DONE: the USIBD LOA Specification has not been read on this PC (a download is the founder's), and no band value in the
// repo cites a page (docs/research/2026-09-30-scan-to-3d-catalogue.md:607 says "general knowledge ... not re-opened"). So the table is
// empty and every judged wall reads "no band". Never fill LOA_BANDS from memory: the lead fills LOA_SPEC and LOA_BANDS together, from the
// spec as read, with its page and table (statistic first: if the spec's bound is not a 95 % one, p95_mm is the wrong input and this slice stops).

export type LoaBandRow = { band: string; upper_mm: number; inclusive: boolean };

/** Filled at step 0 as: { status: "read", source: "USIBD LOA Specification v<ver> (<doc no>), Table <n>, p. <n>", read_on: "<YYYY-MM-DD>", statistic: "<…>", relative_to }. */
export const LOA_SPEC: { status: "unread" | "read"; source: string | null; read_on: string | null; statistic: string | null; relative_to: string } = {
  status: "unread", source: null, read_on: null, statistic: null,
  relative_to: "the admitted scan, in the lead's frame — not survey control",
};
/** Lowest upper bound first. Empty until step 0. */
export const LOA_BANDS: LoaBandRow[] = [];

export const LOA_UNREAD = "no band — the LOA table waits for the USIBD spec read (step 0)";
const NO_BAND: Record<string, string> = { insufficient_data: "no band — insufficient data", missing: "no band — missing", not_measured: "no band — not measured" };

/** A measured wall's band from its p95. The status words first (a floor's row is not_measured too), the kind only for a judged status;
 *  a table not yet read gives LOA_UNREAD. Clutter counts against the wall, so a band never overclaims. Pure; `bands` is for tests only. */
export function loaBand(m: { kind?: string | null; status: string; p95_mm?: number | null }, bands: LoaBandRow[] = LOA_BANDS): { band: string; p95_mm: number } | { band: null; why: string } {
  if (NO_BAND[m.status]) return { band: null, why: NO_BAND[m.status] };
  if (m.status !== "within_tolerance" && m.status !== "out_of_tolerance") return { band: null, why: "no band — not judged" };
  if (m.kind !== "wall") return { band: null, why: "no band — only walls are measured" };
  if (!bands.length) return { band: null, why: LOA_UNREAD };
  const p = m.p95_mm;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0) return { band: null, why: "no band — no valid p95" };
  const hit = bands.find((b) => (b.inclusive ? p <= b.upper_mm : p < b.upper_mm));
  return hit ? { band: hit.band, p95_mm: p } : { band: null, why: "no band — beyond the table's last bound" };
}

/** The desk's words: "LOA20 (p95 23 mm, <source>, relative to the scan)" or the no-band words. */
export function loaWords(m: { kind?: string | null; status: string; p95_mm?: number | null }): string {
  const b = loaBand(m);
  return b.band === null ? b.why : `${b.band} (p95 ${b.p95_mm} mm, ${LOA_SPEC.source}, relative to the scan)`;
}
