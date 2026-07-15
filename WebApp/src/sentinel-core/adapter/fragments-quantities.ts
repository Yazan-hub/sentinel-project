// sentinel-core/adapter — the 5D host seam. Builds ElementQuantities[] from loaded
// Fragments models by reading IFC Qto_ quantity sets. Companion to fragments-facts.ts;
// the ONLY 5D file that imports the host engine. Everything else in sentinel-core is pure.
//
// Qto_ vs Pset_ (the gotcha): property sets carry values under HasProperties → NominalValue,
// but QUANTITY sets carry them under `Quantities` → the type-specific field
// (LengthValue / AreaValue / VolumeValue / CountValue / WeightValue). This reader handles that
// second shape — flattenParams in fragments-facts.ts only reads the first.

import type * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";
import type { ElementQuantities } from "../quantities";

/** The cost drivers we take off by default (walls/slabs/frame/openings/finishes/stairs/roofs). */
const COSTABLE: RegExp[] = [
  /^IFC(WALL|WALLSTANDARDCASE|SLAB|BEAM|COLUMN|DOOR|WINDOW|ROOF|STAIR|COVERING)/i,
];

/** Extract per-element quantities from every loaded fragments model. */
export async function quantityTakeoff(
  fragments: OBC.FragmentsManager,
  cats: RegExp[] = COSTABLE,
): Promise<ElementQuantities[]> {
  const out: ElementQuantities[] = [];
  for (const model of fragments.list.values()) {
    await fromModel(model, out, cats);
  }
  return out;
}

async function fromModel(
  model: FRAGS.FragmentsModel,
  sink: ElementQuantities[],
  cats: RegExp[],
): Promise<void> {
  const byCat = await model.getItemsOfCategories(cats);
  const ids = Object.values(byCat).flat();
  if (!ids.length) return;

  const data = await model.getItemsData(ids, {
    attributesDefault: true,
    // Pull property/quantity sets so we can read the Qto_ set.
    relations: { IsDefinedBy: { attributes: true, relations: false } },
    relationsDefault: { attributes: false, relations: false },
  });

  for (let i = 0; i < ids.length; i++) {
    sink.push(toQuantities(ids[i], data[i], model.modelId));
  }
}

function toQuantities(
  localId: number,
  data: FRAGS.ItemData | undefined,
  modelId: string,
): ElementQuantities {
  const category = attr(data, "_category") ?? attr(data, "category") ?? "";
  const guid = attr(data, "_guid") ?? attr(data, "GlobalId") ?? `${modelId}:${localId}`;
  const type_name = attr(data, "ObjectType") ?? undefined;
  const q = readQto(data);
  return {
    guid,
    local_id: localId,
    model_id: modelId,
    category,
    type_name,
    count: 1,
    length: q.length,
    area: q.area,
    volume: q.volume,
    weight: q.weight,
    has_qto: q.has,
  };
}

interface QtoResult {
  length?: number;
  area?: number;
  volume?: number;
  weight?: number;
  has: boolean;
}

/** Walk IsDefinedBy for Qto_* sets and read each quantity's *Value; prefer Net over Gross. */
function readQto(data: FRAGS.ItemData | undefined): QtoResult {
  const res: QtoResult = { has: false };
  const defined = data?.["IsDefinedBy"];
  if (!Array.isArray(defined)) return res;

  for (const pset of defined) {
    const name = attr(pset, "Name") ?? "";
    if (!/^Qto_/i.test(name)) continue;
    const quantities = pset["Quantities"];
    if (!Array.isArray(quantities)) continue;

    for (const q of quantities) {
      const qname = (attr(q, "Name") ?? "").toLowerCase();
      const volume = num(q, "VolumeValue");
      const area = num(q, "AreaValue");
      const length = num(q, "LengthValue");
      const weight = num(q, "WeightValue");
      // One quantity carries exactly one of these; assign to its dimension.
      if (volume != null) { res.volume = prefer(res.volume, volume, qname); res.has = true; }
      else if (area != null) { res.area = prefer(res.area, area, qname); res.has = true; }
      else if (length != null) { res.length = prefer(res.length, length, qname); res.has = true; }
      else if (weight != null) { res.weight = prefer(res.weight, weight, qname); res.has = true; }
    }
  }
  return res;
}

/** Keep the first value, but a "Net…" quantity always overrides a prior "Gross…". */
function prefer(cur: number | undefined, val: number, name: string): number {
  if (cur == null) return val;
  return name.includes("net") ? val : cur;
}

function attr(data: FRAGS.ItemData | undefined, key: string): string | undefined {
  if (!data) return undefined;
  const a = data[key];
  if (a && !Array.isArray(a) && "value" in a && a.value != null) return String(a.value);
  return undefined;
}

function num(data: FRAGS.ItemData | undefined, key: string): number | undefined {
  const s = attr(data, key);
  if (s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
