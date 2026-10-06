import { csvCell } from "./csv";

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

/** The IFC classes an FM team maintains, as web-ifc names them (subtypes come with includeInherited): the openings and
 *  the MEP distribution elements. The browser adapter matches the same families by category. */
export const MAINTAINABLE_CLASSES = [
  "IFCDOOR", "IFCWINDOW", "IFCFLOWTERMINAL", "IFCENERGYCONVERSIONDEVICE", "IFCFLOWCONTROLLER", "IFCFLOWMOVINGDEVICE",
  "IFCFLOWSTORAGEDEVICE", "IFCFLOWTREATMENTDEVICE", "IFCDISTRIBUTIONCONTROLELEMENT",
] as const;

/** The property names each FM field is read from — one list for the browser adapter and the bridge, so both measure the
 *  same thing. The first non-empty value wins (exact name, then case-insensitive). */
export const ASSET_KEYS = {
  type_name: ["Reference", "TypeName"],
  tag: ["Tag", "TagNumber", "AssetTag"],
  manufacturer: ["Manufacturer"],
  model: ["ModelLabel", "ModelNumber", "ArticleNumber", "ModelReference"],
  serial: ["SerialNumber"],
  install_date: ["InstallationDate", "InstallDate"],
  warranty: ["WarrantyStartDate", "WarrantyDurationParts", "WarrantyDurationLabor", "WarrantyGuarantorParts"],
} as const;

/** First non-empty value among keys (exact, then case-insensitive). */
export function firstOf(props: Record<string, string>, keys: readonly string[]): string | undefined {
  for (const k of keys) if (props[k] && props[k].trim()) return props[k];
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) lower[k.toLowerCase()] = v;
  for (const k of keys) { const v = lower[k.toLowerCase()]; if (v && v.trim()) return v; }
  return undefined;
}

/** One asset from its identity and its flattened properties (name → value, instance and type property sets). */
export function assetFromProps(
  id: { guid: string; local_id: number; model_id: string; name: string; category: string; object_type?: string; tag?: string },
  props: Record<string, string>,
): Asset {
  const get = (keys: readonly string[]) => firstOf(props, keys);
  return {
    guid: id.guid, local_id: id.local_id, model_id: id.model_id, name: id.name, category: id.category,
    type_name: id.object_type ?? get(ASSET_KEYS.type_name) ?? "Type",
    tag: id.tag ?? get(ASSET_KEYS.tag),
    manufacturer: get(ASSET_KEYS.manufacturer),
    model: get(ASSET_KEYS.model),
    serial: get(ASSET_KEYS.serial),
    install_date: get(ASSET_KEYS.install_date),
    warranty: get(ASSET_KEYS.warranty),
    space: undefined,
  };
}

const nonEmpty = (v: unknown) => v != null && String(v).trim() !== "";
export const missingFields = (a: Asset): RequiredField[] =>
  REQUIRED_FIELDS.filter((f) => !nonEmpty(a[f]));

export function assess(assets: Asset[], floors: string[], spaces: string[]): CobieReport {
  const coverage: FieldCoverage[] = REQUIRED_FIELDS.map((f) => ({ field: f, present: assets.filter((a) => nonEmpty(a[f])).length }));
  const complete = assets.filter((a) => missingFields(a).length === 0).length;
  const total = assets.length;
  // Floored, never rounded up: 94.5 % must not read as the gate's 95 % (a readiness the model does not have).
  const readiness = total ? Math.floor((complete / total) * 100) : 0;
  return { assets, total, complete, readiness, coverage, floors, spaces };
}

/** Serialize a COBie-structured CSV (Facility / Floor / Type / Component sections). Pragmatic single
 *  file rather than an xlsx workbook; the essential FM sheets an FM system can ingest. */
export function toCobieCsv(r: CobieReport, facility: string): string {
  const q = csvCell;
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
