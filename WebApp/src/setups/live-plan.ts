import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { ensureSectionStyle, STYLE_NAME } from "./clipper-tool";

/**
 * Live plan (roadmap item 5 Phase C, spec 2026-09-29 2d-sheets-midp): a Revit level opened as a plan of the loaded models
 * on the engine's Views — `createFromIfcStoreys` (one orthographic view per IfcBuildingStorey, cut 1.5 m above its
 * floor), `open`, the cut drawn filled and outlined by `ClipStyler.createFromView` in the clipper's "Section" style;
 * `close` returns to the 3D camera as it was. The engine frames the view on its own slab (`fitOnOpen`). Every refusal
 * is said: no model loaded, no world, a level that is no storey of the loaded models.
 */

const CUT_ABOVE_FLOOR = 1.5; // m — a plan's usual cut height
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The storey view for a Revit level: the same name (spaces and case ignored), else the one storey whose name contains
 *  it — never a guess between two. */
export function matchStoreyView(names: string[], level: string): string | null {
  const t = norm(level);
  if (!t) return null;
  const exact = names.find((n) => norm(n) === t);
  if (exact) return exact;
  const partial = names.filter((n) => norm(n).includes(t));
  return partial.length === 1 ? partial[0] : null;
}

let builtFor = ""; // the loaded models the storey views were made from
let edgesId: string | null = null;
let pill: HTMLElement | null = null;

const worldOf = (components: OBC.Components) => ([...components.get(OBC.Worlds).list.values()][0] as OBC.World | undefined) ?? null;

function dropSection(components: OBC.Components) {
  const styler = components.get(OBF.ClipStyler);
  if (edgesId && styler.list.has(edgesId)) styler.list.delete(edgesId); // a DataMap delete disposes
  edgesId = null;
}

/** Leaves the live plan, if one is open. */
export function closeLivePlan(components: OBC.Components) {
  dropSection(components);
  const views = components.get(OBC.Views);
  if (views.hasOpenViews) views.close();
  const was = !!pill;
  pill?.remove();
  pill = null;
  if (was) document.dispatchEvent(new CustomEvent("sentinel:live-plan-closed")); // panels saying "Live plan — …" update
}

/** One view per storey of the loaded models, made once per set of models: the storey names, or why there are none. */
async function ensureStoreyViews(components: OBC.Components): Promise<{ names: string[]; world: OBC.World } | { error: string }> {
  const fragments = components.get(OBC.FragmentsManager);
  if (!fragments.list.size) return { error: "no model is loaded" };
  const world = worldOf(components);
  if (!world) return { error: "the viewer has no 3D world yet" };
  const views = components.get(OBC.Views);
  const models = [...fragments.list.keys()].sort().join("|");
  if (builtFor !== models) {
    closeLivePlan(components);
    views.world = world;
    views.list.clear();
    try { await views.createFromIfcStoreys({ world, offset: CUT_ABOVE_FLOOR }); }
    catch (e) { return { error: `the storey views could not be made: ${(e as Error)?.message ?? e}` }; }
    builtFor = models;
  }
  return { names: [...views.list.keys()], world };
}

/** The levels a live plan can open on: the loaded models' storeys, or why there are none. */
export async function livePlanLevels(components: OBC.Components): Promise<{ names: string[] } | { error: string }> {
  const r = await ensureStoreyViews(components);
  return "error" in r ? r : { names: r.names };
}

/** Opens `level` as a live plan; answers what happened in words. */
export async function openLivePlan(components: OBC.Components, level: string): Promise<{ ok: boolean; message: string }> {
  const built = await ensureStoreyViews(components);
  if ("error" in built) return { ok: false, message: `live plan not opened — ${built.error}` };
  const { names, world } = built;
  const views = components.get(OBC.Views);
  const name = matchStoreyView(names, level);
  if (!name) return { ok: false, message: `live plan not opened — “${level}” is not a storey of the loaded models (${names.join(", ") || "none found"})` };

  dropSection(components);
  if (views.hasOpenViews) views.close();
  views.open(name);
  try {
    ensureSectionStyle(components);
    const styler = components.get(OBF.ClipStyler);
    styler.world = world;
    const id = `live-plan:${name}`;
    const edges = styler.createFromView(views.list.get(name)!, { id, items: { All: { style: STYLE_NAME } }, link: true, world });
    edgesId = id;
    edges.visible = true; // createFromView does not add the group to the scene; the setter does
    void Promise.resolve(edges.update()).catch((e) => console.warn("[live-plan] section edges skipped:", e));
  } catch (e) {
    console.warn("[live-plan] section edges skipped:", e); // the plan stays open without its filled cut
  }
  showPill(components, name);
  return { ok: true, message: `Live plan — ${name} (cut ${CUT_ABOVE_FLOOR} m above the floor). “Exit to 3D” at the top returns.` };
}

function showPill(components: OBC.Components, name: string) {
  pill?.remove();
  pill = document.createElement("div");
  pill.style.cssText = "position:fixed;top:.6rem;left:50%;transform:translateX(-50%);z-index:1000;display:flex;gap:.5rem;align-items:center;background:#16161ae6;border:1px solid #6d28d9;border-radius:100px;padding:.3rem .45rem .3rem .8rem;font:600 12px system-ui;color:#e5e7eb;box-shadow:0 4px 14px #0006";
  const label = document.createElement("span");
  label.textContent = `▦ Live plan — ${name}`;
  const exit = document.createElement("button");
  exit.textContent = "Exit to 3D";
  exit.style.cssText = "border:1px solid #2c2c34;background:#241a3a;color:#c4b5fd;border-radius:100px;padding:.2rem .6rem;font:600 11px system-ui;cursor:pointer";
  exit.addEventListener("click", () => closeLivePlan(components));
  pill.append(label, exit);
  document.body.append(pill);
}
