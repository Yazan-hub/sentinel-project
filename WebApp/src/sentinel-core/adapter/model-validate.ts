// sentinel-core/adapter/model-validate — run an IdsSpec over every loaded fragments model. Bulk-fetches
// each model's items once (getItemsData with the shared property config), parses to ElementProperties,
// and validates. Returns per-model pass/fail + a failure histogram. B1 = logic; the caller logs it.

import type * as OBC from "@thatopen/components";
import { parseElementProperties, modelUnits, PROPERTY_DATA_CONFIG, type ElementProperties } from "./element-properties";
import { validateElement, missingRequired, unreadFacets, partOfChains, type IdsSpec, type ElementResult, type Failure } from "../ids";

export interface ModelValidation {
  modelId: string;
  scanned: number; // all elements examined
  total: number; // elements in scope of at least one specification
  compliant: number;
  failing: number;
  failuresByRequirement: Record<string, number>;
  results: { localId: number; guid?: string; result: ElementResult }[]; // in-scope elements only (drives B2 colour + B3 BCF)
  /** IDS 1.0 "required" specifications nothing in this model matches (missingRequired): the model fails each. */
  specFailures: Failure[];
  /** What this run could not judge, said beside the verdict, never passed silently. */
  notChecked: string[];
}

export async function validateModels(
  fragments: OBC.FragmentsManager,
  spec: IdsSpec,
): Promise<ModelValidation[]> {
  const out: ModelValidation[] = [];
  for (const model of fragments.list.values()) {
    const byCat = await model.getItemsOfCategories([/^IFC/i]);
    const ids = Object.values(byCat).flat();
    if (!ids.length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await model.getItemsData(ids, PROPERTY_DATA_CONFIG as any);
    const results: { localId: number; guid?: string; result: ElementResult }[] = [];
    const failuresByRequirement: Record<string, number> = {};
    const units = modelUnits(data);
    const els: ElementProperties[] = ids.map((id, i) => parseElementProperties(data[i], model.modelId, id, units));
    partOfChains(els);
    // A specification naming a facet this model's reader does not carry (classification, a conversion-based unit) is not judged: said instead.
    const unread = unreadFacets(spec, els);
    const judged: IdsSpec = { ...spec, specifications: spec.specifications.filter((s) => !unread.some((u) => u.specification === s)) };
    let compliant = 0, failing = 0, total = 0;

    for (let i = 0; i < ids.length; i++) {
      const el = els[i];
      const r = validateElement(judged, el);
      if (!r.inScope) continue;
      total++;
      if (r.pass) { compliant++; } else {
        failing++;
        for (const f of r.failures) {
          const key = `${f.specification} — ${f.requirement}`;
          failuresByRequirement[key] = (failuresByRequirement[key] ?? 0) + 1;
        }
      }
      results.push({ localId: ids[i], guid: el.identity.GlobalId, result: r });
    }
    // An .ids dataType is judged against the value's IFC type; where this model's reader carried none, it is said, not passed.
    const typed = spec.specifications.flatMap((s) => (s.ids10 ? s.requirements.properties.map((p) => p.datatype).filter(Boolean) : []));
    const notChecked = typed.length && !els.some((e) => [...e.psets, ...e.quantities].some((g) => g.rows.some((r) => r.type)))
      ? [`dataType (${[...new Set(typed)].join(", ")}): this model's properties carry no value types`] : [];
    for (const u of unread) notChecked.push(`${u.specification.name}: ${u.facets.join(" and ")} — the viewer's model does not carry it`);
    out.push({ modelId: model.modelId, scanned: ids.length, total, compliant, failing, failuresByRequirement, results, specFailures: missingRequired(judged, els), notChecked });
  }
  return out;
}
