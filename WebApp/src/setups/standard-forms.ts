/**
 * Standards without JSON (spec docs/superpowers/specs/2026-10-19-standards-forms-design.md, the founder's rule of
 * 2026-10-19): a form per standard kind a BIM manager changes in the web. Each kind reads the body in force into a
 * model of plain values (`fromBody`) and writes it back (`toBody`): keys the form does not show are kept (the body is
 * spread first, a row keeps its original object), the common mistakes are said in plain words, and the bridge's
 * validateArtefact stays the judge. `renderStandardForm` draws any of them as plain DOM (iframe-safe, no prompt/confirm).
 */

import { DEFAULT_STAGE_MAP, LOD_CATEGORIES, MATRIX_STAGES, MAX_SNAP_MM, STAGES } from "../sentinel-core/lod-matrix";

export type Cell = string | boolean;
export interface Row { v: Record<string, Cell>; orig: Record<string, unknown> }
export type Model = Record<string, Cell | Row[]>;
type Body = Record<string, unknown>;

interface Scalar { key: string; label: string; type: "text" | "number" | "list" | "check" | "select"; options?: [string, string][]; hint?: string; width?: string }
/** A list of rows drawn as cards (they fit a narrow panel): `item` names one ("Step 2"), `blank` fills a new one. */
interface Rows { key: string; label: string; type: "rows"; columns: Scalar[]; add: string; item: string; blank?: Record<string, Cell>; max?: number; hint?: string }
export type Field = Scalar | Rows;

export interface StandardForm {
  kind: string;
  title: string;
  intro: string;
  fields: Field[];
  fromBody(body: Body | null): Model;
  toBody(m: Model, prev: Body | null, ctx: { projectKey: string }): Body;
}

// The bridge's vocabularies (bridge/artefact-store.mjs; standard-forms.test.ts proves each value installs).
export const IFC_SCHEMAS = ["IFC2X3", "IFC4"];
export const LAYER_CATEGORIES = ["Walls", "Floors", "Ceilings", "Doors", "Windows", "Columns", "Furniture"];

// ── model helpers ────────────────────────────────────────────────────────────────────────────────────────────
const str = (m: Model | Record<string, Cell>, k: string) => (typeof m[k] === "string" ? (m[k] as string).trim() : "");
const rows = (m: Model, k: string) => (Array.isArray(m[k]) ? (m[k] as Row[]) : []);
/** A list typed as "a, b" or one per line → ["a", "b"]. */
export const listOf = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const joinList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : "");
const text = (v: unknown) => (v == null ? "" : String(v));
const row = (orig: unknown, v: Record<string, Cell>): Row => ({ v, orig: orig && typeof orig === "object" && !Array.isArray(orig) ? (orig as Body) : {} });
/** A number typed in a field, or null when blank; anything else is said in words. One comma is a decimal comma ("65,5"),
 *  but "1,250" could be 1250 or 1.25 and two separators ("1,250.5") are a thousands separator: both refused, never guessed. */
function num(s: string, what: string): number | null {
  const t = s.replace(/\s/g, "");
  if (!t) return null;
  if ((t.match(/[,.]/g) ?? []).length > 1 || /^-?\d+,\d{3}$/.test(t)) throw new Error(`${what}: “${s}” could be read two ways — write it without a thousands separator, e.g. 1250 or 12.5`);
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${what}: “${s}” is not a number`);
  return n;
}
function whole(s: string, what: string, min: number, max: number): number {
  const n = num(s, what);
  if (n === null || !Number.isInteger(n) || n < min || n > max) throw new Error(`${what} must be a whole number from ${min} to ${max}`);
  return n;
}
/** Set `k` to `v`, or take the key out when `v` is empty (null, "", []). */
function put(o: Body, k: string, v: unknown) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) delete o[k];
  else o[k] = v;
}
const bump = (semver: unknown) => {
  const m = typeof semver === "string" ? /^(\d+)\.(\d+)\.(\d+)$/.exec(semver) : null;
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : "1.0.0";
};
/** A name pattern the naming judges compile ({org} stands in for the office code, as the bridge's rulePattern reads it). */
function pattern(p: string, what: string) {
  let ok = p.length <= 512;
  try { new RegExp(p.split("{org}").join("ORG")); } catch { ok = false; }
  if (!ok) throw new Error(`${what}: “${p}” is not a valid pattern — e.g. [0-9]{4} = four digits, [A-Z]{2,6} = 2 to 6 capital letters`);
}
/** Layer names with * wildcards, bounded as the bridge bounds them (at most 64, 3 * each, 512 characters). */
function globs(list: string[], what: string): string[] {
  if (list.length > 64) throw new Error(`${what}: at most 64 names`);
  for (const g of list) if (g.length > 512 || g.split("*").length - 1 > 3) throw new Error(`${what}: “${g}” — at most 3 * and 512 characters in one name`);
  return list;
}
const IFC_CLASS = /^IFC[A-Z0-9_]+$/;
function ifcClass(s: string, what: string): string {
  const c = s.trim().toUpperCase().replace(/\s+/g, "");
  if (!IFC_CLASS.test(c)) throw new Error(`${what}: “${s}” is not an IFC class name — write it like IFCWALL`);
  return c;
}

// ── the forms ──────────────────────────────────────────────────────────────────────────────────────────────
const publish: StandardForm = {
  kind: "publish", title: "Auto-publish",
  intro: "Whether a model saved in Revit is published by itself when it passes the delivery gate.",
  fields: [{ key: "auto", label: "Publish automatically when a saved model passes the gate", type: "check", hint: "Off: a person publishes with Governed Publish." }],
  fromBody: (b) => ({ auto: b?.auto === true }),
  toBody: (m) => ({ auto: m.auto === true }),
};

// AI privacy (spec 2026-10-20): the office's or project's two switches. The bridge ORs the office's with the project's.
const aiPolicy: StandardForm = {
  kind: "ai_policy", title: "AI privacy",
  intro: "What Sentinel's AI may do with this project's data. Set on the office, a switch holds for every project in it: a project can add one, never take the office's back.",
  fields: [
    { key: "local_only", label: "AI stays on this network: no cloud AI", type: "check", hint: "Cloud AI (Claude, Gemini, Kimi, NVIDIA) is refused, and Sentinel's MCP tools do not answer about the project (Claude Desktop is a cloud AI). Local AI (Ollama) still works." },
    { key: "redact", label: "Mask names in what cloud AI reads", type: "check", hint: "The project's name, client, address and the people on it are replaced by tokens such as CLIENT_7Q2MXK4D before a cloud AI or an MCP client reads them, and put back in the answer you see." },
  ],
  fromBody: (b) => ({ local_only: b?.local_only === true, redact: b?.redact === true }),
  toBody: (m) => ({ local_only: m.local_only === true, redact: m.redact === true }),
};

// What the chain enforces (0032 review_decide: has_min_role) — a viewer is a member but never approves a step.
const REVIEW_ROLES: [string, string][] = [["contributor", "A contributor, lead or owner (not viewers)"], ["lead", "A lead or the owner"], ["owner", "The owner"]];
const review: StandardForm = {
  kind: "review", title: "Review chain",
  intro: "The sign-offs a shared container needs before it is published, in order. No steps: no review chain.",
  fields: [{
    key: "steps", label: "Steps", type: "rows", add: "Add a step", item: "Step", max: 6, blank: { role: "lead", approvals: "1" },
    columns: [
      { key: "name", label: "Step", type: "text", width: "12rem" },
      { key: "role", label: "Who may approve", type: "select", options: REVIEW_ROLES },
      { key: "approvals", label: "Approvals needed", type: "number", width: "5rem" },
    ],
  }],
  fromBody: (b) => ({ steps: (Array.isArray(b?.steps) ? b.steps : []).map((s: Body) => row(s, { name: text(s.name), role: text(s.role || "lead"), approvals: text(s.approvals ?? 1) })) }),
  toBody: (m) => {
    const steps = rows(m, "steps");
    if (steps.length > 6) throw new Error("A review chain has at most 6 steps");
    return {
      steps: steps.map((r, i) => {
        const name = str(r.v, "name");
        if (!name) throw new Error(`Step ${i + 1} needs a name`);
        if (name.length > 80) throw new Error(`Step ${i + 1}'s name is longer than 80 characters`);
        return { name, role: str(r.v, "role") || "lead", approvals: whole(str(r.v, "approvals") || "1", `Step ${i + 1}'s approvals`, 1, 5) };
      }),
    };
  },
};

const ROI_MINUTES: [string, string][] = [["delivery_gate", "Minutes saved per delivery gate run"], ["naming", "Minutes saved per rename"], ["family_heal", "Minutes saved per family heal"]];
const roi: StandardForm = {
  kind: "roi", title: "ROI rate card",
  intro: "What the Revit ROI dashboard multiplies Sentinel's ledger counts by. A blank minutes field is not counted.",
  fields: [
    { key: "currency", label: "Currency (three letters, e.g. EUR)", type: "text", width: "6rem" },
    { key: "hourly_rate", label: "Hourly rate", type: "number", width: "8rem" },
    ...ROI_MINUTES.map(([key, label]): Scalar => ({ key, label, type: "number", width: "6rem" })),
    { key: "basis", label: "Where the figures come from (optional)", type: "text" },
  ],
  fromBody: (b) => {
    const mins = (b?.minutes ?? {}) as Body;
    return { currency: text(b?.currency || "EUR"), hourly_rate: text(b?.hourly_rate), basis: text(b?.basis), ...Object.fromEntries(ROI_MINUTES.map(([k]) => [k, text(mins[k])])) };
  },
  toBody: (m) => {
    const currency = str(m, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("The currency is three letters, e.g. EUR");
    const rate = num(str(m, "hourly_rate"), "Hourly rate");
    if (rate === null || rate <= 0) throw new Error("The hourly rate must be a number greater than 0");
    const minutes: Body = {};
    for (const [k, label] of ROI_MINUTES) {
      const n = num(str(m, k), label);
      if (n !== null && n < 0) throw new Error(`${label} cannot be below 0`);
      if (n !== null) minutes[k] = n;
    }
    if (!Object.keys(minutes).length) throw new Error("Fill at least one of the minutes saved");
    const out: Body = { currency, hourly_rate: rate, minutes };
    put(out, "basis", str(m, "basis"));
    return out;
  },
};

const ENFORCE: [string, string][] = [["reject", "Refuse it"], ["warn", "Warn only"], ["off", "Off"]];
const naming: StandardForm = {
  kind: "naming", title: "Container naming",
  intro: "How file and container names are built: the parts in order, joined by the separator.",
  fields: [
    { key: "title", label: "Name of the standard", type: "text" },
    { key: "separator", label: "Separator between parts (one character)", type: "text", width: "4rem" },
    {
      key: "fields", label: "Parts, in order", type: "rows", add: "Add a part", item: "Part", max: 64,
      hint: "Give each part its allowed values (comma-separated), or a pattern for free codes, e.g. [0-9]{4} = four digits.",
      columns: [
        { key: "label", label: "Part", type: "text", width: "9rem" },
        { key: "key", label: "Short key (optional)", type: "text", width: "7rem" },
        { key: "values", label: "Allowed values", type: "list" },
        { key: "pattern", label: "or a pattern", type: "text", width: "8rem" },
      ],
    },
    { key: "enforce", label: "A name that does not follow it", type: "select", options: ENFORCE },
    { key: "strip_extensions", label: "File extensions to ignore when checking (optional)", type: "list", hint: "e.g. .rvt, .ifc, .pdf" },
  ],
  fromBody: (b) => ({
    title: text(b?.title), separator: text(b?.separator ?? "-"), enforce: text(b?.enforce || "reject"), strip_extensions: joinList(b?.strip_extensions),
    fields: (Array.isArray(b?.fields) ? b.fields : []).map((f: Body) => row(f, { label: text(f.label), key: text(f.key), values: joinList(f.enum), pattern: text(f.pattern) })),
  }),
  toBody: (m, prev, { projectKey }) => {
    const title = str(m, "title");
    if (!title) throw new Error("Name the standard");
    const separator = typeof m.separator === "string" ? m.separator : "";
    if (separator.length !== 1) throw new Error("The separator is exactly one character, e.g. -");
    const parts = rows(m, "fields");
    if (!parts.length) throw new Error("Add at least one part");
    const used = new Set<string>();
    const fields = parts.map((r, i) => {
      const label = str(r.v, "label");
      if (!label) throw new Error(`Part ${i + 1} needs a name`);
      const key = str(r.v, "key") || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `part_${i + 1}`;
      if (used.has(key)) throw new Error(`Two parts have the key “${key}” — give one another key`);
      used.add(key);
      const values = listOf(str(r.v, "values")), pat = str(r.v, "pattern");
      if (!values.length && !pat) throw new Error(`Part “${label}” needs its allowed values or a pattern`);
      if (pat) pattern(pat, `Part “${label}”`);
      const f: Body = { ...r.orig, key, label };
      put(f, "enum", values);
      put(f, "pattern", pat);
      return f;
    });
    const out: Body = { ...(prev ?? {}), standard_key: (prev?.standard_key as string) || `${projectKey}-naming`, semver: bump(prev?.semver), title, separator, fields, enforce: str(m, "enforce") || "reject" };
    put(out, "strip_extensions", listOf(str(m, "strip_extensions")));
    return out;
  },
};

const NO_COUNT_LIMIT = 2147483647; // a C# int's maximum: what the Revit gate reads as "no count limit"
const contract: StandardForm = {
  kind: "contract", title: "Delivery contract",
  intro: "What a delivered IFC must hold to pass the delivery gate (intake, Governed Publish and the platform gate read it).",
  fields: [
    { key: "contract_key", label: "Contract name (letters, digits, . _ @ -)", type: "text" },
    { key: "ifc_schema", label: "IFC schema", type: "select", options: IFC_SCHEMAS.map((s) => [s, s]) },
    {
      key: "required_entities", label: "Classes the model must hold", type: "rows", add: "Add a class", item: "Class", blank: { min_count: "1" },
      columns: [{ key: "entity", label: "IFC class, e.g. IFCWALL", type: "text", width: "12rem" }, { key: "min_count", label: "At least", type: "number", width: "6rem" }],
    },
    { key: "required_psets", label: "Property sets every element must carry", type: "list", hint: "e.g. Pset_WallCommon" },
    { key: "required_properties", label: "Properties every element must carry", type: "list", hint: "e.g. Pset_WallCommon.FireRating" },
    {
      key: "forbidden_entities", label: "Classes allowed only up to a limit", type: "rows", add: "Add a class", item: "Class",
      hint: "A model fails when it holds more than either limit. e.g. IFCBUILDINGELEMENTPROXY at most 0 (none allowed), or at most 5 % of the elements.",
      columns: [
        { key: "entity", label: "IFC class", type: "text", width: "12rem" },
        { key: "max_count", label: "At most, count (blank = no limit)", type: "number", width: "7rem" },
        { key: "max_ratio", label: "At most, % of elements (blank = no limit)", type: "number", width: "7rem" },
      ],
    },
    { key: "require_georeference", label: "The model must be georeferenced", type: "check" },
    { key: "min_coverage", label: "Share of elements that must carry the sets and properties, in % (blank = 100)", type: "number", width: "6rem" },
    { key: "tolerance_mm", label: "Position tolerance in mm (blank = not set)", type: "number", width: "6rem" },
  ],
  fromBody: (b) => ({
    contract_key: text(b?.contract_key), ifc_schema: text(b?.ifc_schema || "IFC4"),
    required_entities: (Array.isArray(b?.required_entities) ? b.required_entities : []).map((e: Body) => row(e, { entity: text(e.entity), min_count: text(e.min_count) })),
    required_psets: joinList(b?.required_psets), required_properties: joinList(b?.required_properties),
    // No limit on a side is shown blank: the count's C# int maximum (the base contract's "no count limit") and a share of 100 %.
    forbidden_entities: (Array.isArray(b?.forbidden_entities) ? b.forbidden_entities : []).map((e: Body) =>
      row(e, { entity: text(e.entity), max_count: e.max_count === NO_COUNT_LIMIT ? "" : text(e.max_count),
        max_ratio: typeof e.max_ratio === "number" && e.max_ratio < 1 ? String(+(e.max_ratio * 100).toFixed(4)) : "" })),
    require_georeference: b?.require_georeference === true,
    min_coverage: typeof b?.min_coverage === "number" ? String(+(b.min_coverage * 100).toFixed(4)) : "",
    tolerance_mm: text(b?.tolerance_mm),
  }),
  toBody: (m, prev) => {
    const contract_key = str(m, "contract_key");
    if (!/^[A-Za-z0-9._@-]{1,100}$/.test(contract_key)) throw new Error("The contract name is 1 to 100 letters, digits, . _ @ or - (no spaces)");
    const pct = (s: string, what: string) => {
      const n = num(s, what);
      if (n !== null && (n < 0 || n > 100)) throw new Error(`${what} is a share from 0 to 100 %`);
      return n === null ? null : n / 100;
    };
    const out: Body = {
      ...(prev ?? {}), contract_key, ifc_schema: str(m, "ifc_schema") || "IFC4",
      required_entities: rows(m, "required_entities").map((r, i) => ({
        ...r.orig, entity: ifcClass(str(r.v, "entity"), `Required class ${i + 1}`),
        min_count: whole(str(r.v, "min_count") || "1", `Required class ${i + 1}'s count`, 0, 2147483647),
      })),
      required_psets: listOf(str(m, "required_psets")),
      required_properties: listOf(str(m, "required_properties")),
      forbidden_entities: rows(m, "forbidden_entities").map((r, i) => {
        const what = `Limited class ${i + 1}`;
        const count = str(r.v, "max_count"), share = str(r.v, "max_ratio");
        // Both gates fail a model over EITHER limit (IfcDeliveryGate.cs, delivery-gate.mjs): a blank side is no limit, never 0.
        if (!count && !share && !("max_count" in r.orig)) throw new Error(`${what}: give the most allowed — a count, a share in %, or both (0 = none allowed)`);
        return {
          ...r.orig, entity: ifcClass(str(r.v, "entity"), what),
          max_count: count ? whole(count, `${what}'s count`, 0, NO_COUNT_LIMIT) : NO_COUNT_LIMIT,
          max_ratio: pct(share, `${what}'s share`) ?? 1,
        };
      }),
      require_georeference: m.require_georeference === true,
    };
    const cov = pct(str(m, "min_coverage"), "The coverage");
    if (cov === null) delete out.min_coverage; else out.min_coverage = cov;
    const tol = num(str(m, "tolerance_mm"), "The tolerance");
    if (tol !== null && (tol < 1 || tol > 1000)) throw new Error("The tolerance is from 1 to 1000 mm");
    put(out, "tolerance_mm", tol);
    return out;
  },
};

const layers: StandardForm = {
  kind: "layers", title: "CAD layer standard",
  intro: "How layers in a DWG are read: which category each layer is, which layers are skipped, and where levels and grids are drawn.",
  fields: [
    { key: "standard", label: "Name of the standard", type: "text" },
    {
      key: "layers", label: "Layers", type: "rows", add: "Add a layer", item: "Layer",
      columns: [
        { key: "layer", label: "Layer", type: "text", width: "10rem" },
        { key: "category", label: "Is", type: "select", options: LAYER_CATEGORIES.map((c) => [c, c]) },
        { key: "family", label: "Family (optional)", type: "text", width: "8rem" },
        { key: "aliases", label: "Other names (optional)", type: "list" },
      ],
    },
    { key: "ignore", label: "Layers to skip (optional, * matches any text)", type: "list", hint: "e.g. *-TEXT, DEFPOINTS" },
    { key: "datum_levels", label: "Layers where levels are drawn (optional)", type: "list" },
    { key: "datum_grids", label: "Layers where grids are drawn (optional)", type: "list" },
    { key: "skip_letters", label: "Grid letters not used (blank = I and O, as Revit reads it; none = every letter is used)", type: "list", hint: "e.g. I, O" },
    { key: "level_merge_mm", label: "Levels closer than this are one level, in mm (optional)", type: "number", width: "6rem" },
    { key: "grid_merge_mm", label: "Grids closer than this are one grid, in mm (optional)", type: "number", width: "6rem" },
  ],
  fromBody: (b) => {
    const d = (b?.datum ?? {}) as Body;
    return {
      standard: text(b?.standard), ignore: joinList(b?.ignore),
      layers: (Array.isArray(b?.layers) ? b.layers : []).map((l: Body) => row(l, { layer: text(l.layer), category: text(l.category || "Walls"), family: text(l.family), aliases: joinList(l.aliases) })),
      // An explicit [] (every letter used) is said as "none" — blank means the add-in's default, I and O (LayerRulesetMatcher.cs).
      datum_levels: joinList(d.levels), datum_grids: joinList(d.grids),
      skip_letters: Array.isArray(d.skip_letters) && !d.skip_letters.length ? "none" : joinList(d.skip_letters),
      level_merge_mm: text(d.level_merge_mm), grid_merge_mm: text(d.grid_merge_mm),
    };
  },
  toBody: (m, prev) => {
    const standard = str(m, "standard");
    if (!standard) throw new Error("Name the standard");
    const ls = rows(m, "layers");
    if (!ls.length) throw new Error("Add at least one layer");
    const out: Body = {
      ...(prev ?? {}), standard,
      layers: ls.map((r, i) => {
        const layer = str(r.v, "layer");
        if (!layer) throw new Error(`Layer ${i + 1} needs its name`);
        const l: Body = { ...r.orig, layer, category: str(r.v, "category") || "Walls" };
        put(l, "family", str(r.v, "family"));
        put(l, "aliases", listOf(str(r.v, "aliases")));
        return l;
      }),
    };
    put(out, "ignore", globs(listOf(str(m, "ignore")), "Layers to skip"));
    const levels = globs(listOf(str(m, "datum_levels")), "Level layers"), grids = globs(listOf(str(m, "datum_grids")), "Grid layers");
    const skipText = str(m, "skip_letters"), none = /^none$/i.test(skipText);
    const skip = none ? [] : listOf(skipText).map((s) => s.toUpperCase());
    const mm = (k: string, what: string) => {
      const n = num(str(m, k), what);
      if (n !== null && (n < 1 || n > 1000)) throw new Error(`${what} is from 1 to 1000 mm`);
      return n;
    };
    const lm = mm("level_merge_mm", "The level merge distance"), gm = mm("grid_merge_mm", "The grid merge distance");
    if (!levels.length && !grids.length) {
      if (skipText || lm !== null || gm !== null) throw new Error("Name the layers where levels or grids are drawn first");
      delete out.datum;
    } else {
      if (skip.some((s) => !/^[A-Z]$/.test(s))) throw new Error("Grid letters not used are single letters A to Z, e.g. I, O — or none");
      const d: Body = { ...((prev?.datum as Body) ?? {}) };
      put(d, "levels", levels); put(d, "grids", grids);
      if (none) d.skip_letters = []; else put(d, "skip_letters", skip);
      put(d, "level_merge_mm", lm); put(d, "grid_merge_mm", gm);
      out.datum = d;
    }
    return out;
  },
};

// Batch 3 (spec 2026-10-19-standards-batch3-design.md): the office's LOD matrix. parseLodMatrix is the judge; the DD rules
// are one fixed value each, so they are ticks, and type is always guideline_rule (DD means typed by a guideline rule).
const STAGE_NAMES: [string, string][] = [["tender", "Tender"], ["design", "Design"], ["coord", "Coordination"], ["constr", "Construction"], ["hand", "Handover"], ["oper", "Operate"]];
const MATRIX_STAGE_NAMES: Record<string, string> = { concept: "Concept", SD: "Schematic design (SD)", DD: "Design development (DD)", CD: "Construction documents (CD)" };
const LOD_TICKS: [string, string, string][] = [["level", "story_level", "On its storey level"], ["top", "next_story_level", "Top attached to the next storey level"], ["host", "wall", "Hosted in a wall"]];
const lodMatrix: StandardForm = {
  kind: "lod_matrix", title: "LOD matrix",
  intro: "What DD means for each class when Promote checks a model: typed by a guideline rule, plus what is ticked here. The stage map ties the matrix's stages to the project's.",
  fields: [
    { key: "status", label: "Status", type: "select", options: [["approved", "Approved"], ["draft", "Draft (Promote marks it DRAFT)"]] },
    ...MATRIX_STAGES.map((s): Scalar => ({ key: `stage_${s}`, label: `${MATRIX_STAGE_NAMES[s]} is the project's`, type: "select", options: STAGE_NAMES })),
    {
      key: "rows", label: "Classes at DD", type: "rows", add: "Add a class", item: "Class", max: LOD_CATEGORIES.length, blank: { category: "Walls", level: true, snap: "0" },
      hint: "One card per class. Type snap: how far a size may be from a catalogue type and still take it, in mm (0 = the exact match; doors and windows are always 0).",
      columns: [
        { key: "category", label: "Class", type: "select", options: LOD_CATEGORIES.map((c) => [c, c]) },
        ...LOD_TICKS.map(([key, , label]): Scalar => ({ key, label, type: "check", width: "9rem" })),
        { key: "properties", label: "Properties DD asks for (optional)", type: "list", hint: "e.g. Pset_WallCommon.FireRating" },
        { key: "snap", label: "Type snap, mm", type: "number", width: "5rem" },
      ],
    },
  ],
  fromBody: (b) => {
    const map = { ...DEFAULT_STAGE_MAP, ...((b?.stage_map ?? {}) as Record<string, string>) };
    return {
      status: b?.status === "draft" ? "draft" : "approved",
      ...Object.fromEntries(MATRIX_STAGES.map((s) => [`stage_${s}`, text(map[s])])),
      rows: (Array.isArray(b?.rows) ? b.rows : []).map((r: Body) => {
        const dd = (r.DD ?? {}) as Body;
        return row(r, { category: text(r.category), ...Object.fromEntries(LOD_TICKS.map(([k, v]) => [k, dd[k] === v])), properties: joinList(dd.properties), snap: text(dd.type_snap_mm ?? 0) });
      }),
    };
  },
  toBody: (m, prev, { projectKey }) => {
    const map = Object.fromEntries(MATRIX_STAGES.map((s) => [s, str(m, `stage_${s}`) || DEFAULT_STAGE_MAP[s]]));
    for (let i = 1; i < MATRIX_STAGES.length; i++) {
      const [a, b] = [MATRIX_STAGES[i - 1], MATRIX_STAGES[i]];
      if (STAGES.indexOf(map[b]) < STAGES.indexOf(map[a])) throw new Error(`${MATRIX_STAGE_NAMES[b]} cannot come before ${MATRIX_STAGE_NAMES[a]}: it is mapped to an earlier project stage`);
    }
    // Only a stage that differs from the default, or that the body already named, is written (D18 fills the rest).
    const named = (prev?.stage_map ?? {}) as Body;
    const stage_map = Object.fromEntries(MATRIX_STAGES.filter((s) => s in named || map[s] !== DEFAULT_STAGE_MAP[s]).map((s) => [s, map[s]]));
    const list = rows(m, "rows");
    if (!list.length) throw new Error("Add at least one class");
    const seen = new Set<string>();
    const out: Body = {
      ...(prev ?? {}), standard_key: (prev?.standard_key as string) || `${projectKey}-lod`, semver: bump(prev?.semver),
      rows: list.map((r) => {
        const category = str(r.v, "category") || "Walls";
        if (seen.has(category)) throw new Error(`${category} appears twice — one card per class`);
        seen.add(category);
        const orig = (r.orig.DD ?? {}) as Body;
        const dd: Body = { type: "guideline_rule" };
        for (const [k, v] of LOD_TICKS) if (r.v[k] === true) dd[k] = v;
        const props = listOf(str(r.v, "properties"));
        if (props.length || "properties" in orig) dd.properties = props;
        const snap = whole(str(r.v, "snap") || "0", `Type snap for ${category}`, 0, MAX_SNAP_MM);
        if (snap > 0 && (category === "Doors" || category === "Windows")) throw new Error(`Type snap for ${category} must be 0 — a door or window is matched by its type name's width x height, never snapped`);
        if (snap > 0 || "type_snap_mm" in orig) dd.type_snap_mm = snap;
        return { ...r.orig, category, DD: dd };
      }),
    };
    if (str(m, "status") === "draft") out.status = "draft"; else if (prev?.status != null) out.status = "approved"; else delete out.status;
    if (Object.keys(stage_map).length) out.stage_map = stage_map; else delete out.stage_map;
    return out;
  },
};

/** The kinds Standards in force edits with a form (spec batch 1 + 2, lod_matrix batch 3). */
export const STANDARD_FORMS: Record<string, StandardForm> = { naming, contract, layers, review, publish, roi, lod_matrix: lodMatrix, ai_policy: aiPolicy };

/** Where a kind with no web form is changed — a tab the panel opens, or words naming the place in Revit. */
export type StandardLink = { open: "docs" | "standards" | "carbon"; label: string } | { text: string };
export const STANDARD_LINKS: Record<string, StandardLink> = {
  ids: { open: "docs", label: "Edit in Documents" },
  ruleset: { open: "standards", label: "Choose in Standards" },
  carbon_factors: { open: "carbon", label: "Edit in Carbon" },
  type_catalog: { text: "Edit in Revit ▸ Standards & Build ▸ Standards ▸ Build Office System" },
  protection: { text: "Edit in Revit ▸ Standards & Build ▸ Protection" },
  guideline: { text: "Edit in Revit ▸ Standards & Build ▸ Standards ▸ Modelling Guideline" },
  ifc_export: { text: "Edit in Revit ▸ Standards & Build ▸ Standards ▸ IFC Export Mapping" },
};

// ── the renderer ───────────────────────────────────────────────────────────────────────────────────────────
const INP = "background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem .4rem;font:12px system-ui;box-sizing:border-box";
const BTN = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .6rem;font:600 11.5px system-ui;cursor:pointer";

function control(f: Scalar, get: () => Cell, set: (v: Cell) => void): HTMLElement {
  if (f.type === "check") {
    const c = document.createElement("input");
    c.type = "checkbox"; c.checked = get() === true; c.setAttribute("aria-label", f.label);
    c.addEventListener("change", () => set(c.checked));
    return c;
  }
  if (f.type === "select") {
    const s = document.createElement("select");
    s.style.cssText = INP; s.setAttribute("aria-label", f.label);
    for (const [v, l] of f.options ?? []) s.append(new Option(l, v));
    const cur = String(get() ?? "");
    if (cur && ![...s.options].some((o) => o.value === cur)) s.append(new Option(cur, cur)); // a value the form does not list stays as it is
    s.value = cur || s.options[0]?.value || "";
    set(s.value);
    s.addEventListener("change", () => set(s.value));
    return s;
  }
  // A list is a text box: values pasted one per line keep their line breaks (a one-line input would turn them into spaces).
  const i = document.createElement(f.type === "list" ? "textarea" : "input");
  if (i instanceof HTMLTextAreaElement) { i.rows = 2; i.style.resize = "vertical"; }
  else { i.type = "text"; if (f.type === "number") i.inputMode = "decimal"; } // numbers too: "1,5" and blanks are read by toBody, never dropped by the browser
  i.value = String(get() ?? "");
  i.style.cssText += `;${INP};width:100%;max-width:${f.width ?? "100%"};font-family:system-ui`;
  i.setAttribute("aria-label", f.label);
  if (f.hint) i.placeholder = f.hint;
  i.addEventListener("input", () => set(i.value));
  return i;
}

/** The rows as cards — "Step 2", its fields side by side where the panel is wide enough, stacked where it is not. */
function rowCards(f: Rows, list: Row[]): HTMLElement {
  const box = document.createElement("div");
  const draw = () => {
    box.replaceChildren();
    list.forEach((r, i) => {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2a2a30;border-radius:.35rem;padding:.35rem .45rem;margin-bottom:.35rem;background:#16161a";
      const head = document.createElement("div"); head.style.cssText = "display:flex;align-items:center;gap:.4rem;margin-bottom:.2rem";
      const name = document.createElement("span"); name.textContent = `${f.item} ${i + 1}`; name.style.cssText = "flex:1;color:#9ca3af;font:600 11px system-ui";
      const rm = document.createElement("button");
      rm.textContent = "Remove"; rm.setAttribute("aria-label", `Remove ${f.item.toLowerCase()} ${i + 1}`);
      rm.style.cssText = `${BTN};padding:.1rem .45rem;font-size:10.5px`;
      rm.addEventListener("click", () => { list.splice(i, 1); draw(); });
      head.append(name, rm);
      const grid = document.createElement("div"); grid.style.cssText = "display:flex;flex-wrap:wrap;gap:.3rem .5rem";
      for (const c of f.columns) {
        const cell = document.createElement("label");
        cell.style.cssText = `display:flex;flex-direction:column;gap:.15rem;flex:1 1 ${c.width ?? "12rem"};min-width:6rem;color:#9ca3af;font-size:10.5px`;
        cell.append(c.label, control({ ...c, width: "100%" }, () => r.v[c.key] ?? "", (v) => { r.v[c.key] = v; }));
        grid.append(cell);
      }
      card.append(head, grid);
      box.append(card);
    });
    if (!list.length) { const e = document.createElement("div"); e.textContent = "None."; e.style.cssText = "color:#71717a;font-size:11px;padding:.2rem 0"; box.append(e); }
    if (f.max === undefined || list.length < f.max) {
      const add = document.createElement("button");
      add.textContent = `+ ${f.add}`; add.style.cssText = BTN;
      add.addEventListener("click", () => { list.push({ v: { ...(f.blank ?? {}) }, orig: {} }); draw(); });
      box.append(add);
    }
  };
  draw();
  return box;
}

/** The form for `form`, filled from `model` (edited in place). `onSave` gets the model; its error is shown under the
 *  buttons in its own words and the form stays open. */
export function renderStandardForm(form: StandardForm, model: Model, opts: { from: string; onSave: (m: Model) => Promise<void>; onCancel: () => void }): HTMLElement {
  const root = document.createElement("div");
  root.className = "ps-std-form";
  root.dataset.kind = form.kind;
  root.style.cssText = "border:1px solid #6528d7;border-radius:.45rem;padding:.6rem .7rem;margin:.5rem 0;background:#141418";
  const h = document.createElement("div"); h.textContent = `Edit ${form.title}`; h.style.cssText = "font:600 12.5px system-ui;color:#eee";
  const intro = document.createElement("div"); intro.textContent = form.intro; intro.style.cssText = "color:#9ca3af;font-size:11.5px;margin:.2rem 0 .1rem";
  const from = document.createElement("div"); from.textContent = opts.from; from.style.cssText = "color:#71717a;font-size:11px;margin-bottom:.3rem";
  root.append(h, intro, from);
  for (const f of form.fields) {
    const wrap = document.createElement("div"); wrap.style.marginTop = ".55rem";
    const l = document.createElement("label"); l.textContent = f.label; l.style.cssText = "display:block;color:#c9cfda;font-size:11.5px;margin-bottom:.2rem";
    if (f.type === "rows") {
      if (!Array.isArray(model[f.key])) model[f.key] = [];
      wrap.append(l);
      if (f.hint) { const hn = document.createElement("div"); hn.textContent = f.hint; hn.style.cssText = "color:#71717a;font-size:11px;margin-bottom:.2rem"; wrap.append(hn); }
      wrap.append(rowCards(f, model[f.key] as Row[]));
    } else if (f.type === "check") {
      const c = control(f, () => model[f.key] as Cell, (v) => { model[f.key] = v; });
      l.style.cssText = "display:flex;align-items:center;gap:.45rem;color:#c9cfda;font-size:11.5px;cursor:pointer";
      l.prepend(c);
      wrap.append(l);
      if (f.hint) { const hn = document.createElement("div"); hn.textContent = f.hint; hn.style.cssText = "color:#71717a;font-size:11px;margin:.15rem 0 0 1.4rem"; wrap.append(hn); }
    } else {
      wrap.append(l, control(f, () => (model[f.key] as Cell) ?? "", (v) => { model[f.key] = v; }));
    }
    root.append(wrap);
  }
  const bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:.4rem;margin-top:.7rem";
  const save = document.createElement("button"); save.className = "ps-std-save"; save.textContent = "Save as the project's standard"; save.style.cssText = `${BTN};background:#2a1e4d;border-color:#6528d7;color:#c4b5fd`;
  const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.style.cssText = BTN;
  const out = document.createElement("div"); out.className = "ps-std-error"; out.style.cssText = "color:#fca5a5;font-size:11.5px;padding-top:.35rem;min-height:1em";
  save.addEventListener("click", async () => {
    save.disabled = true; cancel.disabled = true; out.textContent = ""; save.textContent = "Saving…";
    try { await opts.onSave(model); }
    catch (e) { out.textContent = (e as Error)?.message ?? String(e); }
    finally { save.disabled = false; cancel.disabled = false; save.textContent = "Save as the project's standard"; }
  });
  cancel.addEventListener("click", opts.onCancel);
  bar.append(save, cancel);
  root.append(bar, out);
  return root;
}
