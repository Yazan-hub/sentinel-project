// sentinel-core/adapter — the ONE host seam. Builds ElementFacts[] from loaded
// Fragments models via OBC. Everything else in sentinel-core is pure and never
// imports this. (Roadmap Phase 3, Rule 2: same engine, host-specific adapter.)
//
// Revit vs web reality: the plugin's rules target worksets/views/sheets, which do
// NOT exist in IFC. On the web those targets simply produce zero facts and the QA
// panel reports them as "authoring-side only". The rules that DO map to IFC:
//   family    → any modelled element, checked by IFC type name
//   level     → IFCBUILDINGSTOREY
//   grid      → IFCGRIDAXIS / IFCGRID
//   parameter → any element carrying the named pset/attribute
// This is the ElementFacts thesis: host difference collapses into data.

import type * as OBC from "@thatopen/components";
import type * as FRAGS from "@thatopen/fragments";
import type { ElementFacts, RuleTarget } from "../types";

/** Maps a rule target to the IFC categories that answer it. `family` is broad — the
 *  scanner narrows by the rule's own `categories` list, exactly like the C# side. */
const TARGET_CATEGORIES: Partial<Record<RuleTarget, RegExp[]>> = {
  level: [/^IFCBUILDINGSTOREY$/i],
  grid: [/^IFCGRIDAXIS$/i, /^IFCGRID$/i],
};

/** Which IFC categories count as "families" (modelled, placeable components) — the
 *  web analogue of Revit model-category families. */
const FAMILY_CATEGORY = /^IFC(DOOR|WINDOW|FURNITURE|FURNISHINGELEMENT|SYSTEMFURNITUREELEMENT|SANITARYTERMINAL|BUILDINGELEMENTPROXY)/i;

interface ExtractOptions {
  /** Rules with target "parameter" need their param names so we flatten only those. */
  parameterNames?: string[];
  /** Family/element categories the ruleset cares about (from rule.categories). */
  familyCategoryHints?: string[];
}

/**
 * Extract ElementFacts from every loaded fragments model.
 * Uses getItemsOfCategories → getItemsData (attributes + IsDefinedBy psets).
 */
export async function extractFacts(
  fragments: OBC.FragmentsManager,
  options: ExtractOptions = {},
): Promise<ElementFacts[]> {
  const facts: ElementFacts[] = [];
  for (const model of fragments.list.values()) {
    await extractFromModel(model, facts, options);
  }
  return facts;
}

async function extractFromModel(
  model: FRAGS.FragmentsModel,
  sink: ElementFacts[],
  options: ExtractOptions,
): Promise<void> {
  const wantParams = options.parameterNames ?? [];

  // ── levels + grids: one category set per target ────────────────────────────
  for (const [target, regexes] of Object.entries(TARGET_CATEGORIES)) {
    const byCat = await model.getItemsOfCategories(regexes);
    const ids = Object.values(byCat).flat();
    if (!ids.length) continue;
    const data = await model.getItemsData(ids, {
      attributesDefault: true,
      relationsDefault: { attributes: false, relations: false },
    });
    for (let i = 0; i < ids.length; i++) {
      sink.push(
        toFact(ids[i], target as RuleTarget, data[i], model.modelId, wantParams),
      );
    }
  }

  // ── families / parameter-bearing elements: scan the modelled element set once ─
  // getItemsOfCategories with the family regex covers doors/windows/furniture/etc;
  // for parameter rules we also want any element carrying the param, so if any
  // parameter rule exists we widen to all categories.
  const familyBuckets = await model.getItemsOfCategories([FAMILY_CATEGORY]);
  const familyIds = Object.values(familyBuckets).flat();
  if (familyIds.length) {
    const data = await model.getItemsData(familyIds, {
      attributesDefault: true,
      // Pull property sets so parameter rules can read pset values.
      relations: {
        IsDefinedBy: { attributes: true, relations: false },
      },
      relationsDefault: { attributes: false, relations: false },
    });
    for (let i = 0; i < familyIds.length; i++) {
      const params = wantParams.length ? flattenParams(data[i]) : {};
      // One element yields up to two facts: a "family" fact (name check) and a
      // "parameter" fact (pset presence), mirroring how the C# side scans the
      // same element under different rule targets.
      const base = toFact(
        familyIds[i],
        "family",
        data[i],
        model.modelId,
        wantParams,
      );
      base.params = params;
      sink.push(base);
      if (wantParams.length) {
        sink.push({ ...base, target: "parameter" });
      }
    }
  }
}

/** Build one ElementFacts from a fragments ItemData record. */
function toFact(
  localId: number,
  target: RuleTarget,
  data: FRAGS.ItemData | undefined,
  modelId: string,
  wantParams: string[],
): ElementFacts {
  const name = attr(data, "Name") ?? `#${localId}`;
  const category = attr(data, "_category") ?? attr(data, "category") ?? "";
  const guid = attr(data, "_guid") ?? attr(data, "GlobalId") ?? `${modelId}:${localId}`;
  return {
    guid,
    local_id: localId,
    model_id: modelId,
    target,
    category,
    type_name: attr(data, "ObjectType") ?? undefined,
    name,
    params: wantParams.length ? flattenParams(data) : {},
  };
}

/** Read a single attribute's `.value` from ItemData (attributes are {value,type}). */
function attr(data: FRAGS.ItemData | undefined, key: string): string | undefined {
  if (!data) return undefined;
  const a = data[key];
  if (a && !Array.isArray(a) && "value" in a && a.value != null) {
    return String(a.value);
  }
  return undefined;
}

/** Flatten IsDefinedBy pset properties into a flat name→value map, plus any direct
 *  attributes. Property naming mirrors Revit LookupParameter — by display name. */
function flattenParams(data: FRAGS.ItemData | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  // direct attributes
  for (const [k, v] of Object.entries(data)) {
    if (!Array.isArray(v) && v && "value" in v && v.value != null) {
      out[k] = String(v.value);
    }
  }
  // psets: IsDefinedBy → array of pset ItemData, each with HasProperties children
  const definedBy = data["IsDefinedBy"];
  if (Array.isArray(definedBy)) {
    for (const pset of definedBy) {
      const props = pset["HasProperties"];
      if (Array.isArray(props)) {
        for (const p of props) {
          const pname = attr(p, "Name");
          const pval = attr(p, "NominalValue") ?? attr(p, "Value");
          if (pname && pval != null) out[pname] = pval;
        }
      }
    }
  }
  return out;
}
