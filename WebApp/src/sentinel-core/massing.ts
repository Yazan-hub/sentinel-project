// sentinel-core/massing — the governed answer to photo→BIM. PURE (no DOM/OBC/node), so the estimate is
// validated identically in the browser, on the bridge, and (ported) in the add-in.
//
// The Geopogo demo places geometry straight from a photo, and it drifts because a photo has no
// dimensions — every number is a hidden estimate nobody checks. Here a photo produces an EXPLICIT,
// confidence-scored, correctable estimate instead. This file is the estimate's shape and the validator
// that keeps a vision model's guess honest before a human ever sees it: clamp nonsense, and mark any
// low-confidence or missing field `assumed` so the reviewer fills it rather than trusting a silent guess.
//
// See docs/superpowers/specs/2026-07-23-photo-to-massing.md.

export type FieldSource = "photo" | "assumed" | "user";

/** A single estimated number with how much to trust it and where it came from. */
export interface EstimatedValue {
  value: number;
  /** 0..1. A photo estimate is never 1 — only a measured DWG earns that. */
  confidence: number;
  source: FieldSource;
  /** Set when the value was clamped or filled by the validator, so the reviewer sees it was touched. */
  note?: string;
}

export interface OpeningEstimate {
  /** "door" | "window" — coarse; a photo can't tell a type, only that an opening is there. */
  kind: string;
  widthMm: EstimatedValue;
  heightMm: EstimatedValue;
  /** which façade: "front" is the photographed one; others are inherently `assumed`. */
  facade: string;
}

export interface MassingEstimate {
  footprintWidthMm: EstimatedValue;
  footprintDepthMm: EstimatedValue;
  storeys: EstimatedValue;
  storeyHeightMm: EstimatedValue;
  openings: OpeningEstimate[];
  /** Which façades the photo actually showed. Everything else is `assumed` and flagged for review. */
  facadesSeen: string[];
  /** Free-text the vision model returned — kept for the reviewer, never used as a number. */
  notes?: string;
  /** Always "photo" for this pipeline — provenance the audit ledger records. */
  provenance: "photo";
}

// Plausibility bounds — a vision model with no scale reference will occasionally return a 3mm building or
// a 90-storey house. These are LOD-100 massing sanity limits, not design rules; anything outside is
// clamped and the field dropped to `assumed` so a human sets it.
const BOUNDS = {
  footprintWidthMm: [2000, 500000],   // 2 m … 500 m
  footprintDepthMm: [2000, 500000],
  storeys: [1, 200],
  storeyHeightMm: [2100, 8000],       // 2.1 m … 8 m
  openingWidthMm: [300, 20000],
  openingHeightMm: [300, 12000],
} as const;

/** Confidence at or below which a field is treated as not-really-known and marked `assumed`. */
export const ASSUMED_BELOW = 0.35;

function clampField(v: EstimatedValue, [lo, hi]: readonly [number, number] | number[]): EstimatedValue {
  const out: EstimatedValue = { ...v };
  if (!Number.isFinite(out.value)) {
    return { value: (lo as number), confidence: 0, source: "assumed", note: "no usable value — assumed" };
  }
  if (out.value < lo) { out.value = lo as number; out.note = `raised to the ${lo} mm minimum`; out.source = "assumed"; out.confidence = Math.min(out.confidence, 0.3); }
  if (out.value > hi) { out.value = hi as number; out.note = `capped at the ${hi} mm maximum`; out.source = "assumed"; out.confidence = Math.min(out.confidence, 0.3); }
  // A photo-sourced field the model was barely sure of is an assumption in all but name — say so.
  if (out.source === "photo" && out.confidence <= ASSUMED_BELOW) {
    out.source = "assumed";
    out.note = out.note ?? "low confidence — treat as an assumption to confirm";
  }
  return out;
}

/**
 * Turn a raw vision-model estimate into one that's safe to review: every number clamped to plausibility,
 * every low-confidence or out-of-range field demoted to `assumed`, unseen façades' openings flagged.
 * Pure and total — never throws; a garbage estimate becomes an all-assumed one, not an exception.
 */
export function validateMassing(raw: Partial<MassingEstimate>): MassingEstimate {
  const seen = (raw.facadesSeen ?? []).map((s) => String(s).toLowerCase());

  const openings = (raw.openings ?? []).map((o) => {
    const facade = String(o?.facade ?? "front").toLowerCase();
    const w = clampField(o?.widthMm ?? assumed(BOUNDS.openingWidthMm[0]), BOUNDS.openingWidthMm);
    const h = clampField(o?.heightMm ?? assumed(BOUNDS.openingHeightMm[0]), BOUNDS.openingHeightMm);
    // An opening on a façade the photo didn't show can't have been observed — it's an assumption.
    if (!seen.includes(facade)) {
      w.source = h.source = "assumed";
      w.note = h.note = `on the '${facade}' façade, which the photo did not show`;
    }
    return { kind: o?.kind === "window" ? "window" : "door", widthMm: w, heightMm: h, facade };
  });

  return {
    footprintWidthMm: clampField(raw.footprintWidthMm ?? assumed(BOUNDS.footprintWidthMm[0]), BOUNDS.footprintWidthMm),
    footprintDepthMm: clampField(raw.footprintDepthMm ?? assumed(BOUNDS.footprintDepthMm[0]), BOUNDS.footprintDepthMm),
    storeys: clampField(raw.storeys ?? assumed(1), BOUNDS.storeys),
    storeyHeightMm: clampField(raw.storeyHeightMm ?? assumed(3000), BOUNDS.storeyHeightMm),
    openings,
    facadesSeen: seen,
    notes: raw.notes,
    provenance: "photo",
  };
}

const assumed = (value: number): EstimatedValue => ({ value, confidence: 0, source: "assumed" });

/** Every field a reviewer must confirm before this estimate can be built — the honest gap list. Anything
 *  `assumed`, or below the confidence bar, is here. An empty list means the whole photo estimate was
 *  strong (rare, and worth distrusting on its own). */
export function fieldsNeedingReview(m: MassingEstimate): string[] {
  const out: string[] = [];
  const check = (label: string, v: EstimatedValue) => {
    if (v.source !== "photo" || v.confidence <= ASSUMED_BELOW) out.push(label);
  };
  check("footprint width", m.footprintWidthMm);
  check("footprint depth", m.footprintDepthMm);
  check("storeys", m.storeys);
  check("storey height", m.storeyHeightMm);
  m.openings.forEach((o, i) =>
    check(`opening ${i + 1} (${o.kind} on ${o.facade})`, o.widthMm));
  return out;
}

/** The schema a vision model is constrained to return — the same discipline as GhostBuilder's mapping
 *  call. Kept here so the prompt and the parser can never drift apart. */
export const MASSING_SCHEMA = {
  type: "object",
  properties: {
    footprintWidthMm: valueSchema(),
    footprintDepthMm: valueSchema(),
    storeys: valueSchema(),
    storeyHeightMm: valueSchema(),
    facadesSeen: { type: "array", items: { type: "string" } },
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["door", "window"] },
          widthMm: valueSchema(),
          heightMm: valueSchema(),
          facade: { type: "string" },
        },
        required: ["kind", "widthMm", "heightMm", "facade"],
      },
    },
    notes: { type: "string" },
  },
  required: ["footprintWidthMm", "footprintDepthMm", "storeys", "storeyHeightMm", "facadesSeen"],
} as const;

function valueSchema() {
  return {
    type: "object",
    properties: {
      value: { type: "number" },
      confidence: { type: "number" },
      source: { type: "string", enum: ["photo", "assumed", "user"] },
    },
    required: ["value", "confidence"],
  };
}
