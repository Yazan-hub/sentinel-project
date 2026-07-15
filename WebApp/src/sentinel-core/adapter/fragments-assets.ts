// sentinel-core/adapter — 7D host seam. Pulls the maintainable COMPONENTS (doors, windows, MEP
// equipment/terminals) and their FM attributes (manufacturer, model, serial, install date, warranty)
// from the model's property sets, plus the Floor + Space lists. Feeds cobie.ts (assess/export).

import type * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";
import type { Asset } from "../cobie";

/** The maintainable asset categories an FM team tracks (arch openings + MEP/equipment). */
const MAINTAINABLE: RegExp[] = [
  /^IFC(DOOR|WINDOW)/i,
  /^IFC(FLOWTERMINAL|AIRTERMINAL|AIRTERMINALBOX|SANITARYTERMINAL|WASTETERMINAL|STACKTERMINAL|LIGHTFIXTURE|ELECTRICAPPLIANCE|ELECTRICGENERATOR|ELECTRICMOTOR|MECHANICALEQUIPMENT|PUMP|FAN|BOILER|CHILLER|COOLINGTOWER|TANK|VALVE|ENERGYCONVERSIONDEVICE|FLOWCONTROLLER|FLOWMOVINGDEVICE|FLOWSTORAGEDEVICE|FLOWTREATMENTDEVICE|DISTRIBUTIONCONTROLELEMENT)/i,
];

export async function extractAssets(fragments: OBC.FragmentsManager): Promise<{ assets: Asset[]; floors: string[]; spaces: string[] }> {
  const assets: Asset[] = [];
  const floors = new Set<string>();
  const spaces = new Set<string>();

  for (const model of fragments.list.values()) {
    await collectNames(model, /^IFCBUILDINGSTOREY$/i, floors);
    await collectNames(model, /^IFCSPACE$/i, spaces);

    let ids: number[] = [];
    try { ids = Object.values(await model.getItemsOfCategories(MAINTAINABLE)).flat(); } catch { continue; }
    if (!ids.length) continue;

    const data = await model.getItemsData(ids, {
      attributesDefault: true,
      relations: { IsDefinedBy: { attributes: true, relations: false } },
      relationsDefault: { attributes: false, relations: false },
    });
    for (let i = 0; i < ids.length; i++) assets.push(toAsset(ids[i], data[i], model.modelId));
  }
  return { assets, floors: [...floors], spaces: [...spaces] };
}

async function collectNames(model: FRAGS.FragmentsModel, cat: RegExp, sink: Set<string>): Promise<void> {
  try {
    const ids = Object.values(await model.getItemsOfCategories([cat])).flat();
    if (!ids.length) return;
    const data = await model.getItemsData(ids, { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
    for (const d of data) { const n = attr(d, "Name"); if (n) sink.add(n); }
  } catch { /* category absent */ }
}

function toAsset(localId: number, data: FRAGS.ItemData | undefined, modelId: string): Asset {
  const props = flatten(data);
  const get = (keys: string[]) => firstOf(props, keys);
  return {
    guid: attr(data, "_guid") ?? attr(data, "GlobalId") ?? `${modelId}:${localId}`,
    local_id: localId,
    model_id: modelId,
    name: attr(data, "Name") ?? `#${localId}`,
    category: attr(data, "_category") ?? "",
    type_name: attr(data, "ObjectType") ?? get(["Reference", "TypeName"]) ?? "Type",
    tag: attr(data, "Tag") ?? get(["Tag", "TagNumber", "AssetTag"]),
    manufacturer: get(["Manufacturer"]),
    model: get(["ModelLabel", "ModelNumber", "ArticleNumber", "ModelReference"]),
    serial: get(["SerialNumber"]),
    install_date: get(["InstallationDate", "InstallDate"]),
    warranty: get(["WarrantyStartDate", "WarrantyDurationParts", "WarrantyDurationLabor", "WarrantyGuarantorParts"]),
    space: undefined,
  };
}

function attr(data: FRAGS.ItemData | undefined, key: string): string | undefined {
  if (!data) return undefined;
  const a = data[key];
  if (a && !Array.isArray(a) && "value" in a && a.value != null) return String(a.value);
  return undefined;
}

/** Flatten direct attributes + IsDefinedBy pset HasProperties into name→value. */
function flatten(data: FRAGS.ItemData | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) if (!Array.isArray(v) && v && "value" in v && v.value != null) out[k] = String(v.value);
  const definedBy = data["IsDefinedBy"];
  if (Array.isArray(definedBy)) {
    for (const pset of definedBy) {
      const props = pset["HasProperties"];
      if (Array.isArray(props)) for (const p of props) {
        const name = attr(p, "Name"); const val = attr(p, "NominalValue") ?? attr(p, "Value");
        if (name && val != null) out[name] = val;
      }
    }
  }
  return out;
}

/** First non-empty value among keys (exact, then case-insensitive). */
function firstOf(props: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) if (props[k] && props[k].trim()) return props[k];
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) lower[k.toLowerCase()] = v;
  for (const k of keys) { const v = lower[k.toLowerCase()]; if (v && v.trim()) return v; }
  return undefined;
}
