// sentinel-core/adapter/drawings-detect — scan loaded fragments models for 2D / drawing / sheet content.
// Reality: IFC is a 3D model format; Revit sheets almost never survive export. What sometimes DOES come
// through is IfcAnnotation (2D text/curves/dims), IfcGrid/IfcGridAxis, presentation layers, and document
// references. This reports exactly what's present (so we only build a viewer if there's something to view)
// and collects the annotation-like element ids per model so the caller can isolate/show them.

import type * as OBC from "@thatopen/components";

// Category regex → friendly label. Order matters only for display.
const DRAWING_CATS: { re: RegExp; label: string; is2d: boolean }[] = [
  { re: /^IFCANNOTATION$/i, label: "Annotations (2D)", is2d: true },
  { re: /^IFCDRAWINGDEFINITION$/i, label: "Drawing definitions", is2d: true },
  { re: /^IFCGEOMETRICCURVESET$/i, label: "2D curve sets", is2d: true },
  { re: /^IFC(TEXTLITERAL|TEXTLITERALWITHEXTENT)$/i, label: "Text", is2d: true },
  { re: /^IFCSHEET$/i, label: "Sheets", is2d: true },
  { re: /^IFCGRID$/i, label: "Grids", is2d: false },
  { re: /^IFCGRIDAXIS$/i, label: "Grid axes", is2d: false },
  { re: /^IFCPRESENTATIONLAYERASSIGNMENT$/i, label: "Presentation layers", is2d: false },
  { re: /^IFCDOCUMENTREFERENCE$/i, label: "Document references", is2d: false },
];

export interface DrawingScan {
  byCategory: { category: string; label: string; count: number; is2d: boolean }[];
  has2d: boolean; // any real 2D/annotation content present
  drawingMap: OBC.ModelIdMap; // annotation-like element ids per model (for isolate/show)
}

export async function detectDrawings(fragments: OBC.FragmentsManager): Promise<DrawingScan> {
  const counts = new Map<string, number>();
  const drawingMap: OBC.ModelIdMap = {};

  for (const model of fragments.list.values()) {
    const byCat = await model.getItemsOfCategories(DRAWING_CATS.map((d) => d.re));
    for (const [cat, ids] of Object.entries(byCat)) {
      const up = cat.toUpperCase();
      const def = DRAWING_CATS.find((d) => d.re.test(up));
      if (!def) continue;
      counts.set(up, (counts.get(up) ?? 0) + ids.length);
      if (def.is2d && ids.length) {
        (drawingMap[model.modelId] ??= new Set<number>());
        for (const id of ids) drawingMap[model.modelId].add(id);
      }
    }
  }

  const byCategory = DRAWING_CATS
    .map((d) => {
      // sum counts across category keys that match this def (e.g. TEXTLITERAL variants)
      let count = 0;
      for (const [k, v] of counts) if (d.re.test(k)) count += v;
      return { category: d.label, label: d.label, count, is2d: d.is2d };
    })
    .filter((r) => r.count > 0);

  const has2d = byCategory.some((r) => r.is2d && r.count > 0);
  return { byCategory, has2d, drawingMap };
}
