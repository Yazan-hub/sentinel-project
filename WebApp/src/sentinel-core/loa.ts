// MA-8-5: the LOA band of a measured wall (USIBD Level of Accuracy, represented accuracy against the admitted scan).
// Step 0 done 2026-10-12: the numbers are read from USIBD Document C120 [Guide] v3.1 (2025), "Levels of Accuracy" table, printed p. 15
// (Upper/Lower range, "specified at the 95 % confidence level"; p. 17: "2 Sigma"; corroborated by the C220 template's LOA Framework sheet).
// The guide is CC BY-NC-ND 4.0: only these facts (numbers + citation) are in the repo, never the document.
// Every upper bound is exclusive: a p95 at a bound (and the survey rounds p95 to 0.1 mm, so a reported 5.0 may be 5.04) takes the lower band, so a band never overclaims. Above 150 mm there
// is no USIBD LOA (only LOA10-50 are; a user-defined LOA is never called one). verify:measured compares the model with the admitted scan,
// so this is Represented Accuracy relative to the scan, and the model-vs-scan p95 is the provider's own check (p. 40 method A/B/C), not
// an independent validation: the words say so.

export type LoaBandRow = { band: string; upper_mm: number; inclusive: boolean };

export const LOA_SPEC: { status: "unread" | "read"; source: string | null; read_on: string | null; statistic: string | null; relative_to: string } = {
  status: "read", source: "USIBD C120 v3.1, Table 'Levels of Accuracy', p. 15", read_on: "2026-10-12",
  statistic: "2σ standard deviation, 95 % confidence (C120 v3.1 p. 15, p. 17)",
  relative_to: "the admitted scan, in the lead's frame — not survey control",
};
/** Lowest upper bound first (best band first). */
export const LOA_BANDS: LoaBandRow[] = [
  { band: "LOA50", upper_mm: 1, inclusive: false }, { band: "LOA40", upper_mm: 5, inclusive: false }, { band: "LOA30", upper_mm: 15, inclusive: false },
  { band: "LOA20", upper_mm: 50, inclusive: false }, { band: "LOA10", upper_mm: 150, inclusive: false },
];

// plain words for the desk and the agent; "step 0" stays in the comments (review)
export const LOA_UNREAD = "no band yet — the USIBD accuracy table has not been loaded into Sentinel";
const NO_BAND: Record<string, string> = { insufficient_data: "no band — insufficient data", missing: "no band — missing", not_measured: "no band — not measured" };

/** A measured wall's band from its p95. The status words first (a floor's row is not_measured too), the kind only for a judged status;
 *  a table not yet read gives LOA_UNREAD. Clutter counts against the wall, and a face with an interior but no scan point gives no band (the pooled p95 only covers points that exist), so a band never overclaims. Pure; `bands` is for tests only. */
export function loaBand(m: { kind?: string | null; status: string; p95_mm?: number | null; faces?: { points: number; coverage: number | null }[] | null }, bands: LoaBandRow[] = LOA_BANDS): { band: string; p95_mm: number } | { band: null; why: string } {
  if (NO_BAND[m.status]) return { band: null, why: NO_BAND[m.status] };
  if (m.status !== "within_tolerance" && m.status !== "out_of_tolerance") return { band: null, why: "no band — not judged" };
  if (m.kind !== "wall") return { band: null, why: "no band — only walls are measured" };
  if (!bands.length) return { band: null, why: LOA_UNREAD };
  const p = m.p95_mm;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0) return { band: null, why: "no band — no valid p95" };
  const blind = m.faces?.findIndex((f) => f.coverage != null && !f.points) ?? -1; // MA-8-5b review: an unseen face adds nothing to the pooled p95
  if (blind >= 0) return { band: null, why: `no band — face ${blind + 1} has no scan point` };
  const hit = bands.find((b) => (b.inclusive ? p <= b.upper_mm : p < b.upper_mm));
  if (hit) return { band: hit.band, p95_mm: p };
  const last = bands[bands.length - 1];
  return { band: null, why: `no band — ${last.upper_mm} mm or more, beyond ${last.band} (the lowest USIBD level)` }; // bounds are exclusive: exactly the last bound is out too
}

/** The desk's words: "LOA20 (p95 23 mm, <source>, relative to the scan, not independently validated)" or the no-band words. `bands`/`spec` are for tests only. */
export function loaWords(m: Parameters<typeof loaBand>[0], bands: LoaBandRow[] = LOA_BANDS, spec: { source: string | null } = LOA_SPEC): string {
  const b = loaBand(m, bands);
  return b.band === null ? b.why : `${b.band} (p95 ${b.p95_mm} mm, ${spec.source}, relative to the scan, not independently validated)`;
}

/** What is wrong with a spec marked "read" (null when fine or unread): the guard against a half-filled constant. The statistic must be a 95 % one
 *  (95 % or 2σ), else p95_mm is the wrong input and the slice stops (plan step 0). */
export function loaSpecProblem(spec: typeof LOA_SPEC, bands: LoaBandRow[]): string | null {
  if (spec.status !== "read") return bands.length ? "bands filled while the spec is unread" : null;
  if (!/^\d{4}-\d\d-\d\d$/.test(spec.read_on ?? "")) return "read_on is not a YYYY-MM-DD date";
  if (!/Table\s+\S+.*p\.\s*\d+/.test(spec.source ?? "")) return "source names no table and page";
  if (!/95\s*%|2\s*σ/.test(spec.statistic ?? "")) return "statistic is not a 95 % one (95 % or 2σ)";
  if (!bands.length) return "no bands";
  return null;
}
