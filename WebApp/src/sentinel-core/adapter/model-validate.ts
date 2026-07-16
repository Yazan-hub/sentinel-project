// sentinel-core/adapter/model-validate — run an IdsSpec over every loaded fragments model. Bulk-fetches
// each model's items once (getItemsData with the shared property config), parses to ElementProperties,
// and validates. Returns per-model pass/fail + a failure histogram. B1 = logic; the caller logs it.

import type * as OBC from "@thatopen/components";
import { parseElementProperties, PROPERTY_DATA_CONFIG } from "./element-properties";
import { validateElement, type IdsSpec, type ElementResult } from "../ids";

export interface ModelValidation {
  modelId: string;
  scanned: number; // all elements examined
  total: number; // elements in scope of at least one specification
  compliant: number;
  failing: number;
  failuresByRequirement: Record<string, number>;
  results: { localId: number; result: ElementResult }[]; // in-scope elements only (drives B2 colouring)
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
    const results: { localId: number; result: ElementResult }[] = [];
    const failuresByRequirement: Record<string, number> = {};
    let compliant = 0, failing = 0, total = 0;

    for (let i = 0; i < ids.length; i++) {
      const el = parseElementProperties(data[i], model.modelId, ids[i]);
      const r = validateElement(spec, el);
      if (!r.inScope) continue;
      total++;
      if (r.pass) { compliant++; } else {
        failing++;
        for (const f of r.failures) {
          const key = `${f.specification} — ${f.requirement}`;
          failuresByRequirement[key] = (failuresByRequirement[key] ?? 0) + 1;
        }
      }
      results.push({ localId: ids[i], result: r });
    }
    out.push({ modelId: model.modelId, scanned: ids.length, total, compliant, failing, failuresByRequirement, results });
  }
  return out;
}
