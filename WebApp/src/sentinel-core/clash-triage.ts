// sentinel-core/clash-triage — PURE (no OBC/THREE/DOM). Turns clash hits into the groups a coordinator handles:
// kind × element pair (plain names) × level × the discipline that yields. Spec: docs/superpowers/specs/2026-10-20-clash-triage-design.md.
import type { Aabb } from "./clash";

export interface TriageSide { modelId: string; localId?: number; guid?: string | null; category?: string | null; name?: string | null; level?: string | null; box?: Aabb }
export interface TriageHit { id: string; a: TriageSide; b: TriageSide; volume: number; touching?: boolean; distance?: number; bcf_guid?: string }
export type TriageKind = "clash" | "duplicate" | "touching";
export interface TriageGroup { key: string; kind: TriageKind; pair: string; level: string; discipline: string; hits: TriageHit[]; volume: number }

const NAMES: [RegExp, string][] = [
  [/^IFCWALL(STANDARDCASE|ELEMENTEDCASE)?$/, "Wall"], [/^IFCCURTAINWALL$/, "Curtain wall"], [/^IFCSLAB/, "Slab"],
  [/^IFCBEAM/, "Beam"], [/^IFCCOLUMN/, "Column"], [/^IFCMEMBER/, "Member"], [/^IFCPLATE/, "Plate"],
  [/^IFCFOOTING$/, "Footing"], [/^IFCPILE$/, "Pile"], [/^IFCROOF$/, "Roof"], [/^IFCSTAIR(FLIGHT)?$/, "Stair"],
  [/^IFCRAMP(FLIGHT)?$/, "Ramp"], [/^IFCRAILING$/, "Railing"], [/^IFCDOOR/, "Door"], [/^IFCWINDOW/, "Window"],
  [/^IFCCOVERING$/, "Ceiling/covering"], [/^IFCDUCTSEGMENT$/, "Duct"], [/^IFCDUCTFITTING$/, "Duct fitting"],
  [/^IFCPIPESEGMENT$/, "Pipe"], [/^IFCPIPEFITTING$/, "Pipe fitting"], [/^IFCCABLECARRIERSEGMENT$/, "Cable tray"],
  [/^IFCCABLECARRIERFITTING$/, "Cable tray fitting"], [/^IFCAIRTERMINAL$/, "Air terminal"], [/^IFCFLOWTERMINAL$/, "Terminal"],
  [/^IFCFLOWFITTING$/, "Fitting"], [/^IFC(FURNISHINGELEMENT|FURNITURE)$/, "Furniture"],
  [/^IFCBUILDINGELEMENTPROXY$/, "Generic element"], [/^IFCSPACE$/, "Room"], [/^IFCOPENINGELEMENT$/, "Opening"],
];

/** "IFCDUCTSEGMENT" → "Duct". An IFC2x3 flow segment is named from its element name (duct/pipe/tray). Never an IFC code alone. */
export function plainCategory(category?: string | null, name?: string | null): string {
  const c = String(category ?? "").toUpperCase();
  if (!c) return "Unknown element";
  if (c === "IFCFLOWSEGMENT") return /duct/i.test(name ?? "") ? "Duct" : /pipe/i.test(name ?? "") ? "Pipe" : /tray|cable/i.test(name ?? "") ? "Cable tray" : "Service run";
  for (const [re, n] of NAMES) if (re.test(c)) return n;
  const s = c.replace(/^IFC/, "").replace(/STANDARDCASE$/, "").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// BS EN ISO 19650-2 UK NA role codes (the 6th field of Project-Originator-Volume-Level-Type-Role-Number).
const ROLES: Record<string, string> = {
  A: "Architecture", B: "Building surveying", C: "Civil", D: "Drainage", E: "Electrical", F: "Facilities", G: "Survey",
  H: "Heating & ventilation", I: "Interior", K: "Client", L: "Landscape", M: "Mechanical", P: "Public health",
  Q: "Cost", S: "Structure", T: "Planning", W: "Contractor", X: "Subcontractor", Y: "Specialist", Z: "General",
};
const STRUCTURAL = new Set(["Beam", "Column", "Member", "Plate", "Footing", "Pile"]);
const SERVICES = /^(Duct|Pipe|Cable tray|Service run|Fitting|Terminal|Air terminal)/;
const SERVICE_DISCIPLINES = new Set(["Mechanical", "Electrical", "Public health", "Heating & ventilation", "Drainage", "Services"]);

/** The discipline of one element: its model's ISO role code (modelId is "<iso_name>@<revision>"), else its element type. */
export function disciplineOf(side: TriageSide): string {
  const f = side.modelId.split("@")[0].split("-");
  if (f.length >= 7 && ROLES[f[5].toUpperCase()]) return ROLES[f[5].toUpperCase()];
  const p = plainCategory(side.category, side.name);
  return STRUCTURAL.has(p) ? "Structure" : SERVICES.test(p) ? "Services" : "Architecture";
}
const rank = (d: string) => (d === "Structure" ? 3 : SERVICE_DISCIPLINES.has(d) ? 1 : 2);

/** The side that yields (moves, or loses its copy): structure never moves, services move first. */
export function yieldingSide(h: TriageHit): "a" | "b" {
  const da = disciplineOf(h.a), db = disciplineOf(h.b);
  if (rank(da) !== rank(db)) return rank(da) < rank(db) ? "a" : "b";
  // ponytail: equal rank → alphabetical discipline; a size rule (duct over pipe over tray) when coordinators ask
  return da <= db ? "a" : "b";
}

const near = (a: Aabb, b: Aabb, tol: number) => [0, 1, 2].every((i) => Math.abs(a.min[i] - b.min[i]) <= tol && Math.abs(a.max[i] - b.max[i]) <= tol);

export function kindOf(h: TriageHit): TriageKind {
  if (h.a.box && h.b.box && plainCategory(h.a.category, h.a.name) === plainCategory(h.b.category, h.b.name) && near(h.a.box, h.b.box, 0.01)) return "duplicate";
  if (h.distance == null && (h.touching || h.volume <= 1e-9) && !h.bcf_guid) return "touching";
  return "clash";
}

const KIND_ORDER: TriageKind[] = ["clash", "duplicate", "touching"];

/** "full" = kind × pair × level × yielding discipline; "pair" = kind × pair only (levels counted, disciplines joined " / "). */
export function groupHits(hits: readonly TriageHit[], by: "full" | "pair" = "full"): TriageGroup[] {
  const groups = new Map<string, TriageGroup & { levels: Set<string>; disciplines: Set<string> }>();
  for (const h of hits) {
    const kind = kindOf(h);
    const y = yieldingSide(h), other = y === "a" ? "b" : "a";
    const pair = [plainCategory(h.a.category, h.a.name), plainCategory(h.b.category, h.b.name)].sort().join(" × ");
    const level = h[y].level || h[other].level || "No level";
    const discipline = disciplineOf(h[y]);
    const key = by === "pair" ? `${kind}|${pair}` : `${kind}|${pair}|${level}|${discipline}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, kind, pair, level, discipline, hits: [], volume: 0, levels: new Set(), disciplines: new Set() }));
    g.hits.push(h); g.volume += h.volume || 0; g.levels.add(level); g.disciplines.add(discipline);
  }
  return [...groups.values()]
    .map(({ levels, disciplines, ...g }) => ({ ...g, level: levels.size > 1 ? `${levels.size} levels` : g.level, discipline: [...disciplines].sort().join(" / ") }))
    .sort((p, q) => KIND_ORDER.indexOf(p.kind) - KIND_ORDER.indexOf(q.kind) || q.hits.length - p.hits.length || q.volume - p.volume);
}

/** The disciplines a group's hits yield to ("Mechanical / Structure" in the pair-only view). */
export const disciplinesOf = (g: TriageGroup) => g.discipline.split(" / ");

/** The one-line title of a group: "Beam × Duct · Level 03 · Mechanical". */
export const groupTitle = (g: TriageGroup) => `${g.kind === "duplicate" ? "Duplicate " : g.kind === "touching" ? "Touching " : ""}${g.pair} · ${g.level} · ${g.discipline}`;

/** What a group's owner is asked to do — the text of its BCF topic. Never asks to move or remove structure. */
export function groupInstruction(g: TriageGroup): string {
  const st = disciplinesOf(g).includes("Structure");
  if (g.kind === "duplicate")
    return `The same element is modelled twice. Remove the copy in the ${g.discipline} model${g.discipline === "Structure" ? " (both copies are structural — check which one the structural engineer keeps)" : st ? " (where both copies are structural, check which one the structural engineer keeps)" : " — never the structural copy"}. Sentinel does not delete elements: a person removes it in Revit.`;
  if (g.kind === "touching") return "The solids meet with no overlap volume — usually not a clash (touching faces).";
  return `Coordinate these ${g.hits.length} clash(es): the ${g.discipline} elements give way${st ? " — structure is never moved without the structural engineer" : "; structure is not moved"}.`;
}
