// sentinel-core/element-graph — PURE TS. The governed element graph as ECS-over-JSON: each element is an
// ENTITY (identified by its revision-stable IFC GlobalId) carrying typed COMPONENTS (identity, quantities),
// grouped under a governed LAYER (project@revision). This is the IFC5-aligned internal shape — IFC5 is
// ECS-over-JSON + USD-style layering, so representing the governed data this way makes IFC5 export a
// SERIALIZATION step, not a migration. Built from the per-element snapshots (migration 0005).

import type { ElementSnapshot } from "./revision-diff";
import type { Measure } from "./quantities";

export interface ElementComponents {
  identity: { class: string; type?: string };
  quantities?: Partial<Record<Measure, number>>;
}
/** One element = an entity (GlobalId) + its components. */
export interface ElementNode {
  id: string; // IFC GlobalId
  components: ElementComponents;
}
export interface ElementGraph {
  schema: "sentinel.element-graph/1";
  layer: string; // the governed layer, e.g. "riverside@P02" (project@revision)
  count: number;
  elements: ElementNode[];
}

/** Serialize governed element snapshots into the ECS element graph. `layer` names the governed layer. */
export function toElementGraph(snapshots: ElementSnapshot[], layer = "base"): ElementGraph {
  const elements: ElementNode[] = [];
  for (const s of snapshots) {
    if (!s.guid) continue;
    const components: ElementComponents = { identity: { class: s.category ?? "", ...(s.type_name ? { type: s.type_name } : {}) } };
    if (s.quantities && Object.keys(s.quantities).length) components.quantities = s.quantities;
    elements.push({ id: s.guid, components });
  }
  return { schema: "sentinel.element-graph/1", layer, count: elements.length, elements };
}
