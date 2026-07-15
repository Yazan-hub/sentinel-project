// sentinel-core/cobie — the 7D core. PURE TS (no OBC/DOM). Asset-register completeness assessment +
// a COBie-structured export. The host adapter (adapter/fragments-assets.ts) pulls the maintainable
// components + their FM attributes from the model; this file scores handover-readiness and serializes
// COBie. The "maintained as-built the FM team actually uses" — with the gaps made visible.

export interface Asset {
  guid: string;
  local_id: number;
  model_id: string;
  name: string;
  category: string;
  type_name: string;
  tag?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  install_date?: string;
  warranty?: string;
  space?: string;
}

/** The FM-critical fields handover requires on every maintainable asset. */
export const REQUIRED_FIELDS = ["serial", "manufacturer", "warranty", "install_date"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export interface FieldCoverage { field: RequiredField; present: number; }
export interface CobieReport {
  assets: Asset[];
  total: number;
  complete: number; // assets with ALL required fields
  readiness: number; // % complete (0–100) — feeds the handover gate
  coverage: FieldCoverage[];
  floors: string[];
  spaces: string[];
}

const nonEmpty = (v: unknown) => v != null && String(v).trim() !== "";
export const missingFields = (a: Asset): RequiredField[] =>
  REQUIRED_FIELDS.filter((f) => !nonEmpty(a[f]));

export function assess(assets: Asset[], floors: string[], spaces: string[]): CobieReport {
  const coverage: FieldCoverage[] = REQUIRED_FIELDS.map((f) => ({ field: f, present: assets.filter((a) => nonEmpty(a[f])).length }));
  const complete = assets.filter((a) => missingFields(a).length === 0).length;
  const total = assets.length;
  const readiness = total ? Math.round((complete / total) * 100) : 0;
  return { assets, total, complete, readiness, coverage, floors, spaces };
}

/** Serialize a COBie-structured CSV (Facility / Floor / Type / Component sections). Pragmatic single
 *  file rather than an xlsx workbook; the essential FM sheets an FM system can ingest. */
export function toCobieCsv(r: CobieReport, facility: string): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const line = (...cells: unknown[]) => cells.map(q).join(",");
  const out: string[] = [];

  out.push("Facility", line("Name", "Category", "Project"), line(facility, "Facility", facility), "");
  out.push("Floor", line("Name", "Category"));
  for (const f of r.floors) out.push(line(f, "Floor"));
  out.push("");
  if (r.spaces.length) { out.push("Space", line("Name", "Category")); for (const s of r.spaces) out.push(line(s, "Space")); out.push(""); }

  out.push("Type", line("Name", "Category", "Manufacturer", "ModelNumber", "WarrantyDurationParts"));
  const types = new Map<string, Asset>();
  for (const a of r.assets) if (!types.has(a.type_name)) types.set(a.type_name, a);
  for (const [t, a] of types) out.push(line(t, a.category, a.manufacturer, a.model, a.warranty));
  out.push("");

  out.push("Component", line("Name", "TypeName", "Space", "ExtIdentifier", "SerialNumber", "InstallationDate", "WarrantyStartDate", "TagNumber"));
  for (const a of r.assets) out.push(line(a.name, a.type_name, a.space, a.guid, a.serial, a.install_date, a.warranty, a.tag));

  return out.join("\r\n");
}
