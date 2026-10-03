// sentinel-core/lod-matrix — the ONE reader of lod_matrix@n (MA-2b). PURE TS. The bridge's install check
// (bridge/artefact-store.mjs validateArtefact) runs it through the bundle; the add-in's C# twin
// (SentinelAddin/GhostBuilder/PromotePlanner.cs LodMatrix.FromBody) accepts and refuses the same bodies in the same
// words — both read WebApp/bridge/fixtures/lod-matrix/cases.json. Rows are keyed by Revit category, as guideline@n.
// Promote checks the DD stage only: a key it does not read is refused, so the LOD state never reads higher than what
// was checked. stage_map ties the matrix's stages to Sentinel's project stages (D18); type_snap_mm is a row's snap
// limit, 0 = the exact match (D16: a higher value is the founder's).

/** Sentinel's project stages, in order — the keys of GATE_DEFS (cde-store STAGES is the same list). */
export const STAGES = ["tender", "design", "coord", "constr", "hand", "oper"];
/** The matrix's design stages, in order. */
export const MATRIX_STAGES = ["concept", "SD", "DD", "CD"];
/** D18: concept, SD and DD → design; CD → coord. A matrix's stage_map names some or all of them. */
export const DEFAULT_STAGE_MAP: Record<string, string> = { concept: "design", SD: "design", DD: "design", CD: "coord" };
export const LOD_CATEGORIES = ["Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows"];
/** The DD rules Promote reads, and the one value each may take. */
const LOD_DD: Record<string, string[]> = { type: ["guideline_rule"], level: ["story_level"], top: ["next_story_level"], host: ["wall"] };
/** A snap is measurement noise or a near size, never another type. */
export const MAX_SNAP_MM = 50;

export interface LodRow {
  category: string;
  /** The DD rules Promote checks (type, level, top, host) — never properties or type_snap_mm. */
  dd: Record<string, string>;
  /** The properties DD asks for ("Pset_WallCommon.FireRating"); matrixToIds makes them the stage IDS. */
  properties: string[];
  /** 0 = the exact match (D16). */
  type_snap_mm: number;
}
export interface LodMatrix {
  standard_key: string;
  semver: string;
  draft: boolean;
  /** Every matrix stage → its project stage: the body's stage_map over DEFAULT_STAGE_MAP. */
  stage_map: Record<string, string>;
  rows: LodRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const filled = (v: unknown): v is string => typeof v === "string" && /[^\s\u0085]/.test(v);
const bad = (path: string, want: string) => new Error(`${path} ${want}`);

/** A lod_matrix@n body → the matrix, or an Error whose message names the path ("rows[1].DD.type_snap_mm must be …"). */
export function parseLodMatrix(body: unknown): LodMatrix {
  if (!isObj(body)) throw bad("the body", "must be a JSON object");
  const stray = Object.keys(body).find((k) => !["standard_key", "semver", "status", "stage_map", "rows"].includes(k));
  if (stray !== undefined) throw bad(stray, "is not a lod_matrix field — the body is {standard_key, semver, status?, stage_map?, rows}");
  if (!filled(body.standard_key)) throw bad("standard_key", "must be a non-empty string");
  if (typeof body.semver !== "string" || !/^\d+\.\d+\.\d+$/.test(body.semver)) throw bad("semver", "must be x.y.z");
  if (body.status != null && body.status !== "draft" && body.status !== "approved") throw bad("status", "must be draft or approved");

  const stage_map: Record<string, string> = { ...DEFAULT_STAGE_MAP };
  if (body.stage_map != null) {
    if (!isObj(body.stage_map)) throw bad("stage_map", "must be an object of matrix stage: project stage");
    for (const [k, v] of Object.entries(body.stage_map)) {
      if (!MATRIX_STAGES.includes(k)) throw bad(`stage_map.${k}`, `is not a matrix stage — ${MATRIX_STAGES.join(", ")}`);
      if (typeof v !== "string" || !STAGES.includes(v)) throw bad(`stage_map.${k}`, `must be ${STAGES.join(" | ")}`);
      stage_map[k] = v;
    }
    for (let i = 1; i < MATRIX_STAGES.length; i++) {
      const [prev, k] = [MATRIX_STAGES[i - 1], MATRIX_STAGES[i]];
      if (STAGES.indexOf(stage_map[k]) < STAGES.indexOf(stage_map[prev]))
        throw bad(`stage_map.${k}`, `maps to ${stage_map[k]}, before ${prev}'s ${stage_map[prev]} — a later matrix stage never maps to an earlier project stage`);
    }
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) throw bad("rows", "must be a non-empty array");
  const seen = new Set<string>();
  const rows = body.rows.map((r: unknown, i: number): LodRow => {
    const at = `rows[${i}]`;
    if (!isObj(r)) throw bad(at, "must be an object");
    const strayRow = Object.keys(r).find((k) => k !== "category" && k !== "DD");
    if (strayRow !== undefined) throw bad(`${at}.${strayRow}`, "is not a row field — a row is {category, DD} (Promote checks the DD stage only; stage_map names the others)");
    if (typeof r.category !== "string" || !LOD_CATEGORIES.includes(r.category)) throw bad(`${at}.category`, `must be ${LOD_CATEGORIES.join(" | ")}`);
    if (seen.has(r.category)) throw bad(`${at}.category`, "appears twice — one row per class");
    seen.add(r.category);
    if (!isObj(r.DD)) throw bad(`${at}.DD`, "must be an object");
    const row: LodRow = { category: r.category, dd: {}, properties: [], type_snap_mm: 0 };
    for (const [k, v] of Object.entries(r.DD)) {
      if (k === "properties") {
        if (!Array.isArray(v) || !v.every(filled)) throw bad(`${at}.DD.properties`, "must be an array of non-empty strings");
        row.properties = [...v];
      } else if (k === "type_snap_mm") {
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_SNAP_MM)
          throw bad(`${at}.DD.type_snap_mm`, `must be a whole number of millimetres, 0 to ${MAX_SNAP_MM} (D16: 0 keeps the exact match)`);
        if (v > 0 && (r.category === "Doors" || r.category === "Windows"))
          throw bad(`${at}.DD.type_snap_mm`, `must be 0 for ${r.category} — a door or window is matched by its type name's W x H, never snapped`);
        row.type_snap_mm = v;
      } else if (!Object.prototype.hasOwnProperty.call(LOD_DD, k)) {
        throw bad(`${at}.DD.${k}`, `is not a DD rule Promote reads — ${[...Object.keys(LOD_DD), "properties", "type_snap_mm"].join(", ")}`);
      } else if (!LOD_DD[k].includes(v as string)) {
        throw bad(`${at}.DD.${k}`, `must be ${LOD_DD[k].join(" | ")}`);
      } else row.dd[k] = v as string;
    }
    if (row.dd.type === undefined) throw bad(`${at}.DD.type`, "is required — DD means typed by a guideline rule");
    return row;
  });
  return { standard_key: body.standard_key, semver: body.semver, draft: body.status === "draft", stage_map, rows };
}
