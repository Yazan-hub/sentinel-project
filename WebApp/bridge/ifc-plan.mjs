// MA-6-8 — a done sentinel-ifc job's candidates to changesets, the pure half (plan-b3 §2; the IFC twin of survey-plan planSurvey). One
// changeset per storey of creates the bridge builds from the job's own result: the lead's frame places the concept in the model (D5: the
// IFC's own world position is a hint, never applied), a wall's inside or outside is the IFC's IsExternal, else wall-location's reading, and
// every wall and floor is typed exactly (D16) by the project's typer. What the reader did not read is one exception a storey and IFC class
// (the full list stays on the job's receipt). Nothing is pre-ticked: what a concept says is not what was built.
// ponytail: the IFC's axes already meet — no trimEnds; level-bound wall tops (Promote DD attaches them) and curved walls are MA-8's.
import { MAX_CHANGESET_ELEMENTS } from "./changesets-logic.mjs";
import { KIND_ENTITY } from "./changesets-typing.mjs";
import { toModel, placeRefusal, matchStoreys, gapOf, groupGaps, NOT_MEASURED } from "./survey-plan.mjs";
import { locate } from "./wall-location.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
export const PLANNER = "ifc-planner";
export const PLANNER_VERSION = "0.1.0";
/** A base or top more than this off its storey's level is held for a person (mm). */
export const LEVEL_MM = 2;
const FROM = { layers: "material layers", type_layers: "the type's layers", base_quantities: "base quantities", body: "the body" };
const ID_SHOWN = 3;

/** → {storeys: [{storey, body | null, byCid, exceptions, once}], groups, already_filed}, planSurvey's shape. `job` {id, ledger: {id}, reader,
 *  version}; `notRead` the receipt's list [{global_id, ifc_class, storey, why}]. Throws 400/413 in words; writes nothing. */
export function planIfc({ job, candidates, frame, levels: named = {}, manifest = [], type, filed = { cids: new Set(), storeys: new Map() }, notRead = [] }) {
  const M = toModel(frame);
  const far = placeRefusal(candidates, frame);
  if (far) throw err(400, `${far} — nothing was saved`);
  const ref = `${job.id} (ledger #${job.ledger.id})`;
  const gaps = [];
  let already = 0;
  const again = (c) => { if (!filed.cids.has(c.cid)) return false; already++; return true; };
  const storeys = matchStoreys(candidates.filter((c) => c.kind === "level"), frame, named, manifest, job.id, filed.storeys, (c) => `IFC ${c.cid} ${job.id}`).map((s) => {
    const E = s.elevation_mm, elements = [], byCid = new Map(), exceptions = [];
    const mine = candidates.filter((c) => c.kind !== "level" && c.geometry?.storey === s.cid);
    const trust = (c) => ({ measured: c.measured, accuracy: { status: "inferred", basis: "ifc", from_job: job.id }, pretick: false });
    const hold = (c, why) => exceptions.push({ unique_id: c.cid.slice(0, 64), name: `${c.kind} ${c.cid}`.slice(0, 256), reason: why.slice(0, 300) });
    const gap = (c, g) => {
      gaps.push({ ...g, size: g.size ?? (g.want ? null : NOT_MEASURED), label: `${s.level} · ${c.cid}`.slice(0, 256), evidence: c.evidence });
      hold(c, `type gap — ${g.want ? `${g.want} is not in the type catalogue` : `no office rule types it (${g.key})`}; it waits in the Holding Area`);
    };
    // a base or top off its storey's level is a person's call, never a guess
    const off = (c, z, what) => {
      const d = Math.round((z - s.scan_mm) * 10) / 10;
      if (Math.abs(d) <= LEVEL_MM) return false;
      hold(c, `its ${what} sits ${d} mm off ${s.level} — a person decides`);
      return true;
    };
    const walls = mine.filter((c) => c.kind === "wall");
    const segs = walls.map((c) => ({ x0: c.geometry.LocationCurve.start[0], y0: c.geometry.LocationCurve.start[1], x1: c.geometry.LocationCurve.end[0], y1: c.geometry.LocationCurve.end[1], width: c.measured.thickness_mm }));
    walls.forEach((c, i) => {
      if (again(c)) return;
      const g = c.geometry, ext = g.is_external;
      const loc = ext === true ? { location: "Exterior", why: null } : ext === false ? { location: "Interior", why: null } : locate(segs, i);
      const facts = { thickness_mm: c.measured.thickness_mm, ...(loc.location ? { params: { Location: loc.location } } : {}) };
      const gp = gapOf(type, "wall", facts, c.cid, loc.why, s.level);
      if (gp) { gap(c, gp); return; }
      if (off(c, g.BaseElevation, "base")) return;
      const L = g.LocationCurve;
      elements.push({ op: "create", kind: "wall", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: KIND_ENTITY.wall, Name: c.cid } },
        place: { LevelName: s.level, LocationCurve: { start: [...M.xy(L.start), E], end: [...M.xy(L.end), E] }, TopElevation: M.z(g.TopElevation) },
        reason: (`IFC wall ${c.cid} "${g.name}": ${c.measured.thickness_mm} mm thick (${FROM[g.thickness_from] ?? g.thickness_from}), ${c.measured.height_mm} mm high, ` +
          `${c.measured.length_mm} mm long as modelled · Location ${loc.location} (${ext == null ? "read from the storey's walls" : "IsExternal"}) · ${ref}`).slice(0, 500) });
      byCid.set(c.cid, trust(c));
    });
    for (const c of mine.filter((x) => x.kind === "floor")) {
      if (again(c)) continue;
      const facts = { thickness_mm: c.measured.thickness_mm, params: { Function: c.geometry.is_external ? "Exterior" : "Interior" } }; // the BDS floor rule's key
      const gp = gapOf(type, "floor", facts, c.cid, null, s.level);
      if (gp) { gap(c, gp); continue; }
      if (off(c, c.geometry.TopElevation, "top")) continue;
      elements.push({ op: "create", kind: "floor", cid: c.cid, evidence: c.evidence, facts, validate: { identity: { Class: KIND_ENTITY.floor, Name: c.cid } },
        place: { LevelName: s.level, LocationLoop: c.geometry.LocationLoop.map((p) => [...M.xy(p), E]) },
        reason: `IFC floor ${c.cid} "${c.geometry.name}": ${c.measured.thickness_mm} mm thick, ${c.measured.area_m2} m² as modelled · ${ref}`.slice(0, 500) });
      byCid.set(c.cid, trust(c));
    }
    // what was not read: one exception per IFC class on the storey (a 20 MB file can hold thousands), the first GlobalIds named
    const unread = new Map();
    for (const n of notRead.filter((x) => x.storey === s.cid)) unread.set(n.ifc_class, [...(unread.get(n.ifc_class) ?? []), n]);
    for (const [cls, list] of unread) {
      const whys = [...new Set(list.map((n) => n.why))], shown = list.slice(0, ID_SHOWN).map((n) => n.global_id).join(", ");
      const pretty = list[0].ifc_name ?? /^an (Ifc\w+) —/.exec(whys[0] ?? "")?.[1] ?? `Ifc${cls.slice(3).toLowerCase()}`;   // the reader's CamelCase name
      exceptions.push({ unique_id: `${cls}@${s.cid}`.slice(0, 64), name: `${pretty}${list.length > 1 ? ` × ${list.length}` : ` ${list[0].global_id}`}`.slice(0, 256),
        reason: `${whys[0]}${whys.length > 1 ? ` (and ${whys.length - 1} other reason(s))` : ""} · ${shown}${list.length > ID_SHOWN ? ", …" : ""}`.slice(0, 300) });
    }
    if (!elements.length) return { storey: s, body: null, byCid, exceptions, once: [] };
    if (s.how === "created") {
      const lv = candidates.find((c) => c.cid === s.cid);
      elements.unshift({ op: "create", kind: "level", cid: s.cid, evidence: lv.evidence, validate: { identity: { Class: "IFCBUILDINGSTOREY", Name: s.level } },
        place: { BaseElevation: E, Name: s.level }, reason: `IFC storey ${s.cid} "${lv.geometry.name}" at ${s.scan_mm} mm · a new level at ${E} mm in the model · ${ref}`.slice(0, 500) });
      byCid.set(s.cid, trust(lv));
    }
    if (elements.length > MAX_CHANGESET_ELEMENTS)
      throw err(413, `${s.cid} would file ${elements.length} elements on ${s.level} — over the ${MAX_CHANGESET_ELEMENTS} one changeset (one Undo) holds; a storey is not split into changesets yet — export a part of the concept — nothing was saved`);
    return { storey: s, byCid, exceptions, once: [], body: { name: `IFC ${job.id} · ${s.level}`, contract: 2, source: `${job.reader} ${job.version}`, elements, exceptions } };
  });
  return { storeys, groups: groupGaps(gaps), already_filed: already };
}
