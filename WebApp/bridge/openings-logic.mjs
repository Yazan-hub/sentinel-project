// MA-7-20 — openings advice, pure rules: which ghost doors/windows a photo is asked about, the job for photo/openings.py --judge, and the advice words.
// ADVICE ONLY (plan 7-20: "it never creates"): nothing here accepts, files, moves or declines a ghost; the output is one ledger row and a list of words.
import { usable } from "./evidence-logic.mjs";

// ponytail: a ghost door/window carries only Location (+ optional Width/Height/SillHeight/Rotation), not its type's size - these are the stand-ins (mm)
// until the catalogue's type size is read; a wrong size only moves the IoU, and the advice says nothing stronger than "seen" / "not seen".
export const DEFAULT_SIZE = { door: { w: 900, h: 2100, sill: 0 }, window: { w: 1200, h: 1200, sill: 900 } };
const num = (v) => typeof v === "number" && Number.isFinite(v);
const point = (p) => Array.isArray(p) && p.length === 3 && p.every(num);

/** The changeset's ghost doors and windows → [{id, label, corners_mm: 4x[x,y,z]}] (the rectangle in the wall: centred on Location, turned by Rotation degrees). */
export function ghostOpenings(cs) {
  const out = [];
  for (const e of cs?.elements ?? []) {
    if ((e?.kind !== "door" && e?.kind !== "window") || (e.op && e.op !== "create") || !point(e.place?.Location) || !e.proposal_guid) continue;
    const dflt = DEFAULT_SIZE[e.kind], p = e.place;
    const w = num(p.Width) && p.Width > 0 ? p.Width : dflt.w, h = num(p.Height) && p.Height > 0 ? p.Height : dflt.h;
    const z0 = p.Location[2] + (e.kind === "window" ? (num(p.SillHeight) ? p.SillHeight : dflt.sill) : 0);
    const a = ((num(p.Rotation) ? p.Rotation : 0) * Math.PI) / 180, ux = Math.cos(a) * w / 2, uy = Math.sin(a) * w / 2;
    const [x, y] = p.Location;
    out.push({ id: e.proposal_guid, label: e.kind, corners_mm: [[x - ux, y - uy, z0], [x + ux, y + uy, z0], [x + ux, y + uy, z0 + h], [x - ux, y - uy, z0 + h]] });
  }
  return out;
}

/** The photos to ask: own, admitted, blurred (usable "read") and registered. → {ask: [item], skipped: [{evidence, words}]}. A web/context photo is never asked (usable refuses it). */
export function pickPhotos(pack) {
  const ask = [], skipped = [];
  for (const i of pack?.items ?? []) {
    if (i.kind !== "photo") continue;
    const why = usable(i, "read");
    if (why) { skipped.push({ evidence: i.id, words: why.replace(/; nothing was read$/, "") }); continue; }
    const r = i.registration;
    if (!(r && Array.isArray(r.K) && Array.isArray(r.world_to_cam) && Array.isArray(r.size))) { skipped.push({ evidence: i.id, words: "not registered — not asked" }); continue; }
    ask.push(i);
  }
  return { ask, skipped };
}

/** The job file for one photo (its BLURRED copy — never the original). */
export const buildJob = (item, photoPath, ghosts) =>
  ({ photo: photoPath, evidence: item.id, camera: { K: item.registration.K, world_to_cam: item.registration.world_to_cam, size: item.registration.size }, ghosts });

const oneLine = (s, n = 100) => String(s ?? "").replace(/[\r\n\u2028\u2029]+/g, " ").slice(0, n);
export const toolRows = (tools) => (Array.isArray(tools) ? tools : []).slice(0, 30).map((t) => ({ name: oneLine(t?.name), version: oneLine(t?.version, 40), licence: oneLine(t?.licence) || "licence not reported" }));

/** Per-photo tool answers [{evidence, answer}] + the ghosts → the advice: {ghosts: [{ghost, label, seen_in[], words}], unmatched: [{evidence, label, words}], tools[]}.
 *  A ghost is "seen in ev-… (detector, advice)" when any asked photo says seen, else "not seen"; a detection no ghost meets is "no ghost — not filed". */
export function adviseFrom(ghosts, answers) {
  const seen = new Map(ghosts.map((g) => [g.id, []]));
  const unmatched = [], tools = new Map();
  for (const { evidence, answer } of answers) {
    for (const v of answer.verdicts ?? []) if (v.state === "seen" && seen.has(v.ghost)) seen.get(v.ghost).push(evidence);
    for (const u of answer.unmatched ?? []) unmatched.push({ evidence, label: oneLine(u.label, 40), words: "no ghost — not filed" });
    for (const t of toolRows(answer.tools)) tools.set(JSON.stringify(t), t);
  }
  return {
    ghosts: ghosts.map((g) => { const ev = seen.get(g.id); return { ghost: g.id, label: g.label, seen_in: ev, words: ev.length ? `seen in ${ev.join(", ")} (detector, advice)` : "not seen" }; }),
    unmatched, tools: [...tools.values()],
  };
}
