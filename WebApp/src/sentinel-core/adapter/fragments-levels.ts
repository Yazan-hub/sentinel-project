// sentinel-core/adapter — groups elements by building storey for the 4D panel's "Level" mode
// (floor-by-floor rise). Fragments FLATTENS spatial containment: a storey's `ContainsElements` is
// directly the array of contained element items (each carrying `_localId`), and an element's
// `ContainedInStructure` is directly the array of containing storeys — no Rel wrapper. (Confirmed by
// the console probe against a real model.) Defensive: returns [] if a model has no containment, and
// the panel falls back to trade sequencing.

import type * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";

export interface LevelGroup {
  name: string;
  elevation: number;
  elements: Record<string, number[]>; // model_id → local_ids on this storey
}

const COSTABLE = /^IFC(WALL|WALLSTANDARDCASE|SLAB|BEAM|COLUMN|DOOR|WINDOW|ROOF|STAIR|COVERING)/i;

export async function elementLevels(fragments: OBC.FragmentsManager): Promise<LevelGroup[]> {
  const groups = new Map<string, LevelGroup>();
  for (const model of fragments.list.values()) {
    const before = countIds(groups);
    await storeySide(model, groups);
    if (countIds(groups) > before) continue; // storey side worked for this model
    await elementSide(model, groups);
  }
  return [...groups.values()].sort((a, b) => a.elevation - b.elevation);
}

// ── PRIMARY: storey.ContainsElements is the array of contained elements ───────
async function storeySide(model: FRAGS.FragmentsModel, groups: Map<string, LevelGroup>): Promise<void> {
  const storeyIds = await catIds(model, /^IFCBUILDINGSTOREY$/i);
  if (!storeyIds.length) return;

  let data: (FRAGS.ItemData | undefined)[] = [];
  try {
    data = await model.getItemsData(storeyIds, { attributesDefault: true, relations: { ContainsElements: { attributes: true } } });
  } catch { return; }

  for (let i = 0; i < storeyIds.length; i++) {
    const d = data[i];
    const name = attr(d, "Name") ?? attr(d, "LongName") ?? `Level ${i + 1}`;
    const elevation = num(d, "Elevation") ?? i;
    const contained = d?.["ContainsElements"];
    if (!Array.isArray(contained)) continue;
    const ids: number[] = [];
    for (const e of contained) { const n = Number(attr(e, "_localId")); if (Number.isFinite(n)) ids.push(n); }
    if (!ids.length) continue;
    const g = group(groups, name, elevation);
    (g.elements[model.modelId] ??= []).push(...ids);
  }
}

// ── FALLBACK: element.ContainedInStructure[0] is the storey ───────────────────
async function elementSide(model: FRAGS.FragmentsModel, groups: Map<string, LevelGroup>): Promise<void> {
  // storey local_id → {name, elevation}, from a plain storey read
  const storeyIds = await catIds(model, /^IFCBUILDINGSTOREY$/i);
  const byId = new Map<number, { name: string; elevation: number }>();
  if (storeyIds.length) {
    try {
      const sd = await model.getItemsData(storeyIds, { attributesDefault: true, relationsDefault: { attributes: false, relations: false } });
      for (let i = 0; i < storeyIds.length; i++) byId.set(storeyIds[i], { name: attr(sd[i], "Name") ?? `Level ${i + 1}`, elevation: num(sd[i], "Elevation") ?? i });
    } catch { /* */ }
  }

  const ids = await catIds(model, COSTABLE);
  if (!ids.length) return;
  let data: (FRAGS.ItemData | undefined)[] = [];
  try {
    data = await model.getItemsData(ids, { attributesDefault: false, relations: { ContainedInStructure: { attributes: true } } });
  } catch { return; }

  for (let i = 0; i < ids.length; i++) {
    const cs = data[i]?.["ContainedInStructure"];
    const storey = Array.isArray(cs) ? cs[0] : cs;
    const sid = Number(attr(storey, "_localId"));
    const meta = Number.isFinite(sid) ? byId.get(sid) : undefined;
    const name = meta?.name ?? attr(storey, "Name") ?? "Unspecified";
    const elevation = meta?.elevation ?? 0;
    const g = group(groups, name, elevation);
    (g.elements[model.modelId] ??= []).push(ids[i]);
  }
}

// ── helpers ──
async function catIds(model: FRAGS.FragmentsModel, cat: RegExp): Promise<number[]> {
  try { return Object.values(await model.getItemsOfCategories([cat])).flat(); } catch { return []; }
}
function group(groups: Map<string, LevelGroup>, name: string, elevation: number): LevelGroup {
  let g = groups.get(name);
  if (!g) { g = { name, elevation, elements: {} }; groups.set(name, g); }
  return g;
}
function countIds(groups: Map<string, LevelGroup>): number {
  let n = 0;
  for (const g of groups.values()) for (const ids of Object.values(g.elements)) n += ids.length;
  return n;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attr(data: any, key: string): string | undefined {
  const a = data?.[key];
  if (a && !Array.isArray(a) && typeof a === "object" && "value" in a && a.value != null) return String(a.value);
  return undefined;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(data: any, key: string): number | undefined {
  const s = attr(data, key);
  if (s == null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
