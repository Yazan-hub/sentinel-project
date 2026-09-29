// sentinel-core/adapter — 7D host seam. Pulls the maintainable COMPONENTS (doors, windows, MEP
// equipment/terminals) and their FM attributes (manufacturer, model, serial, install date, warranty)
// from the model's property sets, plus the Floor + Space lists. Feeds cobie.ts (assess/export).

import type * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";
import { assetFromProps, type Asset } from "../cobie";
import { PSET_RELATIONS } from "./element-properties";

/** The maintainable asset categories an FM team tracks (arch openings + MEP/equipment) — occurrences only: a type or
 *  style (IFCDOORSTYLE, IFCPUMPTYPE) is a definition, never an asset of its own. */
const MAINTAINABLE: RegExp[] = [
  /^IFC(DOOR|WINDOW)(?!\w*(TYPE|STYLE)$)/i,
  /^IFC(FLOWTERMINAL|AIRTERMINAL|AIRTERMINALBOX|SANITARYTERMINAL|WASTETERMINAL|STACKTERMINAL|LIGHTFIXTURE|ELECTRICAPPLIANCE|ELECTRICGENERATOR|ELECTRICMOTOR|MECHANICALEQUIPMENT|PUMP|FAN|BOILER|CHILLER|COOLINGTOWER|TANK|VALVE|ENERGYCONVERSIONDEVICE|FLOWCONTROLLER|FLOWMOVINGDEVICE|FLOWSTORAGEDEVICE|FLOWTREATMENTDEVICE|DISTRIBUTIONCONTROLELEMENT)(?!\w*(TYPE|STYLE)$)/i,
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
      relations: PSET_RELATIONS,
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
  return assetFromProps({
    guid: attr(data, "_guid") ?? attr(data, "GlobalId") ?? `${modelId}:${localId}`,
    local_id: localId, model_id: modelId,
    name: attr(data, "Name") ?? `#${localId}`,
    category: attr(data, "_category") ?? "",
    object_type: attr(data, "ObjectType"), tag: attr(data, "Tag"),
  }, flatten(data));
}

function attr(data: FRAGS.ItemData | undefined, key: string): string | undefined {
  if (!data) return undefined;
  const a = data[key];
  if (a && !Array.isArray(a) && "value" in a && a.value != null) return String(a.value);
  return undefined;
}

/** Flatten direct attributes + the element's pset HasProperties into name→value — its type's sets too (IsTypedBy, or
 *  an IFC2x3 type under IsDefinedBy, via HasPropertySets), as the bridge's measureCobie reads them; the element's own
 *  value wins over its type's. */
function flatten(data: FRAGS.ItemData | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) if (!Array.isArray(v) && v && "value" in v && v.value != null) out[k] = String(v.value);
  const list = (x: unknown): FRAGS.ItemData[] => (Array.isArray(x) ? x : []);
  const read = (sets: FRAGS.ItemData[]) => {
    for (const pset of sets) for (const p of list(pset["HasProperties"])) {
      const name = attr(p, "Name"); const val = attr(p, "NominalValue") ?? attr(p, "Value");
      if (name && val != null && String(val).trim()) out[name] = val;
    }
  };
  const related = [...list(data["IsDefinedBy"]), ...list(data["IsTypedBy"])];
  read(related.flatMap((r) => list(r["HasPropertySets"]))); // the type's sets first …
  read(related); // … so the element's own sets overwrite them
  return out;
}


