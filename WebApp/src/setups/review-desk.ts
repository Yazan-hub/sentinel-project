// review-desk — the web side of a changeset's review (MA-3a, design §6.6, founder decision D17). The ghosts waiting in Revit's
// review (GET /changesets/:key?status=proposed), grouped by storey (a Promote storey's parts, " (i/n)", as Revit's StoreyBatch
// groups them) and by what they do. A signed-in contributor accepts or declines the ticked ghosts — a decline needs a reason and
// BINDS: Revit shows it unticked with the reason and refuses the tick; an accept is advice. A signed-in lead re-opens a decline.
// POST /changesets/:key/:id/review and /reopen; the bridge holds the rules (the machine credential never reviews). A list that was
// not read says "not read — …", never that nothing waits. No 3D here: ghosts in the viewer are MA-3d.
// MA-3b2b: under it, "Recently decided in Revit" — the changesets Revit reported (a second read beside the proposed one), each with
// who, when, the note, its ledger row (and the row of an Undo in Revit after it) and every ghost it did not apply with Revit's reason (result.reasons) and the web's.
// MA-4e: under a placed survey report, its newest measure against the scan (the bridge's verify:measured row) and Measure — a signed-in contributor's.
import { bfetch, bwrite } from "./bridge-fetch";
import { myRoleRead, roleWords } from "./my-role";
import { activePid, onActiveProjectChange } from "./active-project";
import { SERVICE_URL } from "../config";
import { loaWords } from "../sentinel-core/loa";
import { jobLine, startRecipe, type SurveyJob } from "./evidence";
import type * as OBC from "@thatopen/components";

/** MA-3b3: where a carried decline was made — the earlier changeset, the ghost there, and "web" or "revit". */
export interface CarriedFrom { changeset: string; name: string; proposal_guid: string; origin: string; }
/** `carried_from` is set when the bridge filed the ghost already declined; a decline carried from Revit holds the reporter's role as
 *  the bridge read it (review C1). `role` may be null on a review whose role the desk was not given — it is then left out, never printed. */
export interface GhostReview { state: "proposed" | "accepted" | "declined"; action: "accept" | "decline" | "reopen"; reason: string | null; by: string; role: string | null; at: string; rev: number; carried_from?: CarriedFrom | null; evidence?: string[]; evidence_copies?: Record<string, string>; }
/** MA-4d: the survey job a changeset was built from by the bridge (its `job` field; the source stays a string). */
export interface DeskJob {
  id: string; ledger_id: number | null;
  /** The reader and its version ("sentinel-survey 0.6.0", "sentinel-drawing 0.1.0"). */
  reader?: string;
  frame?: { dx_mm: number; dy_mm: number; dz_mm: number; rotation_deg: number; stated_by?: string };
  /** MA-5a-4: a drawing's alignment, computed by the bridge from the lead's two points (in place of a scan's frame). */
  alignment?: { item: string; scale: number; rotation_deg: number; dx_mm: number; dy_mm: number; dz_mm: number; check_mm: number | null; confirmed_by?: string; revises?: string };
  storey?: { level: string; how: string; checked: boolean };
  /** Decision 19: another job's placed changesets on the same scan bytes — named, never refused. */
  overlaps?: { changeset: string; job_id: string; evidence: string[] }[];
  /** The job's items as the bridge stamped them (an IFC job: MA-8-3 adds whose model it is). */
  evidence?: { id: string; sha256: string; provider?: string; licence?: string; licence_ref?: string }[];
}
export interface Ghost {
  proposal_guid: string; kind: string; op?: string | null;
  target?: { unique_id?: string; type_before?: string; ifc_guid?: string | null; placed?: { start: number[]; end: number[] }; at?: number[] } | null;
  place?: { TypeName?: string; FamilyName?: string; LevelName?: string; BaseLevel?: string; TopLevel?: string; Name?: string; Location?: number[]; SillHeight?: number;
    Boundary?: number[][]; BaseElevation?: number; TopElevation?: number;
    /** MA-8-10: a stair - one straight run, its riser count, going and width (mm); TopLevel is the level it reaches. */
    Risers?: number; Going?: number; Width?: number;
    /** MA-8-14: a terrain - the ground points [x, y, z] mm the add-in read off a scan; its Boundary is the storey's footprint. */
    Points?: number[][] } | null;
  validate?: { identity?: { Name?: string } } | null;
  parameter?: string; from?: string; to?: string;
  /** MA-8-7 (D16): a wall or floor create that re-creates a DirectShape or Generic Model as an office type; the original is deleted in the same Undo. */
  replaces?: { unique_id: string; box?: { min: number[]; max: number[] }; kind?: "directshape" | "generic"; category?: string } | null;
  /** MA-8-7: the bridge's judgement of a retype - its type is not one of the office's catalogue; null = no catalogue to judge by. */
  foreign?: boolean | null;
  /** MA-8-10: the stair flag a stair was proposed from. */
  from_flag?: { changeset: string; unique_id: string } | null;
  review?: GhostReview | null;
  // MA-4d: a survey ghost's trust record, stamped by the bridge (never the caller's).
  cid?: string; evidence?: string[]; pretick?: boolean; trim_mm?: number[]; measured?: Record<string, number>;
  accuracy?: { status: string; basis?: string; from_job?: string; fit_rmse_mm?: number | null; face_dev_mm?: number | null; target_mm?: number; scale?: number; check_mm?: number | null } | null;
}
/** What Revit reported on a changeset (bridge reportResult). `reasons` — Revit's reason per ghost — is there only when one was sent. */
export interface DeskResult {
  applied: { proposal_guid: string; removed_unique_id?: string; built?: { risers?: number; riser_mm?: number; going_mm?: number; width_mm?: number; runs?: number; railings?: number; why?: string } | null }[]; rejected: string[]; note: string | null; reported_at: string; reported_by: string;
  declined_on_web?: { proposal_guid: string; by: string; role: string | null; reason: string; carried_from?: CarriedFrom | null }[];
  reasons?: Record<string, string>;
}
export interface PendingChangeset { id: string; name: string; source: string; claimed?: boolean; status: string; created_at: string; review_rev?: number; elements: Ghost[]; result?: DeskResult | null; job?: DeskJob | null;
  /** The changeset's review rows — what is held for a person and why (a type gap, a difference, MA-5b-3: what an earlier drawing placed and this
   *  one no longer draws). Revit shows them untickable; the desk lists them. */
  exceptions?: { unique_id: string; name: string; reason: string }[]; }
/** MA-5b-3: a changeset's review rows in words, at most `max`, then how many more. Pure. */
export function heldLines(cs: PendingChangeset, max = 50): string[] {
  const x = cs.exceptions ?? [];
  return [...x.slice(0, max).map((e) => `${e.name} — ${e.reason}`), ...(x.length > max ? [`… and ${x.length - max} more (every one in Revit's review window)`] : [])];
}
export interface DecidedView { head: string; note: string | null; declined: { line: string; why: string[] }[]; }
/** A report's ledger rows: its changeset_applied row, and the newest changeset_reverted row after it (an Undo or a Redo in Revit). */
export interface LedgerRows { row: number | null; reverted: { id: number; op: string; on_word?: string } | null; }   // on_word: the account an undo was recorded on the word of (basis "absent")
export interface DeskGroup { what: string; ghosts: { cs: PendingChangeset; el: Ghost }[]; }
export interface DeskStorey { storey: string; changesets: PendingChangeset[]; groups: DeskGroup[]; }
export interface LedgerRef { id: number | null; hash: string | null; }
/** MA-4e: one placed element as the bridge judged it against the scan (a verify:measured row's element). */
export interface Measured {
  proposal_guid: string; kind?: string | null; status: string; points?: number; p95_mm?: number | null; mean_signed_mm?: number | null;
  coverage?: number | null; share_within?: Record<string, number> | null; reason?: string; reference?: string;
  /** MA-5a-2: each face's own numbers — the per-face verdict's. */
  faces?: { points: number; coverage: number | null; share_within: Record<string, number> | null }[];
}
/** MA-4e: the newest verify:measured row of a changeset. */
export interface VerifyRecord {
  id: number; at: string; actor: string; status: string; reference?: string; target_mm?: number; counts?: Record<string, number>; error?: string;
  /** MA-5a-2: the per-face rule the bridge judged by (rows before it carry target_mm, p95's). */
  deviation?: { within_mm: number; face_share_min: number };
  placed_by?: { reported_by?: string | null; reported_role?: string | null } | null; elements: Measured[];
}
/** MA-4e: what POST /cde/:key/verify answers. */
export interface MeasureReply { changeset: { id: string; name: string }; status: string; reference?: string; counts: Record<string, number>; elements: Measured[]; ledger: LedgerRef | null; }

// Revit's StoreyBatch.Part: " (i/n)" at the end of a Promote storey's part (ASCII digits).
const PART = / \(([0-9]{1,4})\/([0-9]{1,4})\)$/;
/** A changeset's storey: its name without " (i/n)" (StoreyBatch.StoreyOf). */
export const storeyOf = (name: string): string => (name ?? "").replace(PART, "");

/** What a ghost does, as a group heading: "retype wall", "attach wall", "set_parameter wall", "create floor". */
export const whatOf = (el: Ghost): string => `${el.op ?? "create"} ${el.kind}`;

/** The pending changesets as the desk shows them: by storey (oldest first, a storey's parts together), then by what the ghosts do. */
export function groupDesk(pending: PendingChangeset[]): DeskStorey[] {
  const storeys = new Map<string, DeskStorey>();
  for (const cs of [...pending].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))) {
    const key = storeyOf(cs.name);
    const s = storeys.get(key) ?? { storey: key, changesets: [], groups: [] };
    storeys.set(key, s);
    s.changesets.push(cs);
    for (const el of cs.elements ?? []) {
      let g = s.groups.find((x) => x.what === whatOf(el));
      if (!g) s.groups.push((g = { what: whatOf(el), ghosts: [] }));
      g.ghosts.push({ cs, el });
    }
  }
  return [...storeys.values()];
}

const xy = (p?: number[]): string => (p && p.length >= 2 ? `(${Math.round(p[0])}, ${Math.round(p[1])})` : "(?)");

/** One ghost in words — Revit's review row, shortened: `W 1 · Generic - 200mm → BDS_EXT_ARC_CMU_200 mm`. */
export function ghostLine(el: Ghost): string {
  const name = el.validate?.identity?.Name ?? el.proposal_guid;
  const type = (el.place?.FamilyName ? el.place.FamilyName + " : " : "") + (el.place?.TypeName ?? "?");
  switch (el.op) {
    case "retype": return `${name} · ${el.target?.type_before ?? "?"} → ${type}${unticked(el)}`;
    case "attach": return `${name} · ${el.place?.BaseLevel ?? "?"} → top ${el.place?.TopLevel ?? "?"}`;
    // MA-5b-4: a placed wall moved to the revised drawing's line — Revit keeps one a person edited since it was placed
    case "reshape": return `${name} · reshape ${el.target?.unique_id ?? "?"} to the revised drawing's line (kept as it stands if edited by hand since placed)`;
    // MA-5b-5: a door or window no wall hosts, replaced by the office type in the one wall it stands in (Revit's row, shortened)
    case "rehost": return `${name} · rehost ${el.target?.type_before ?? "?"} at ${xy(el.target?.at)} → ${type} in the wall at ${xy(el.place?.Location)} on ${el.place?.LevelName ?? "?"}` +
      `${el.place?.SillHeight != null ? `, sill ${Math.round(el.place.SillHeight)} mm` : ""}; the unhosted instance and any tags on it are removed (one Undo in Revit brings them back); its Mark, Comments, workset and phase carry over`;
    case "set_parameter": return `${type} · ${el.parameter} "${el.from ?? ""}" → "${el.to ?? ""}" (a type edit: it reaches every element of the type)`;
    // MA-5b-1: a room reads its number, then its name (Revit's review row: room: 101 · OFFICE · its level)
    default: if (el.replaces) return replacesLine(el, name, type); // MA-8-7: a create is not a plain create when it deletes the original
      return `${name}${el.place?.Name && el.place.Name !== name ? " · " + el.place.Name : ""}${el.place?.TypeName ? " · " + type : ""}${el.place?.LevelName && el.kind !== "terrain" ? " · " + el.place.LevelName : ""}` +
      (el.kind === "mass" ? massSize(el.place) : "") + (el.kind === "stair" ? stairLine(el.place) : "") +
      (el.kind === "terrain" ? terrainLine(el) : "");
  }
}

/** MA-8-14: a terrain says whose word its points are - a signed-in member's filing (the bridge refuses the machine credential), tied to the scan's level, footprint and height band
 *  but not re-measured (review round 1: only what the bridge checks is claimed) - and that a person checks it. Review round 2: what Revit builds beyond the points is said
 *  (TerrainPlanner.Shape, Revit's row); the scan's changeset is named in the terrain changeset's own title (plan amendment 8 amended: no from_scan read here).
 *  Review round 3: the type and the name already say Toposolid and the level - the line says neither again. */
function terrainLine(el: Ghost): string {
  const n = el.place?.Points?.length;
  return n ? ` · ${n} ground points, filed by a signed-in member from the survey changeset this was proposed from (the bridge checked its level, footprint and height band, not the points; not re-measured); ` +
    TERRAIN_SHAPE + " — check it against the site survey" : "";
}
/** Review round 3: TerrainPlanner.Shape verbatim (tools/promote-check Ma8Terrain reads this line and compares it; "plus 1 m" is survey-plan's GROUND_PAD_MM). */
export const TERRAIN_SHAPE = "the hole is the walls' box plus 1 m (a notch or courtyard inside it gets no ground); Sentinel adds points along the outer edge and the hole's edge, each at the nearest ground point's height";

/** MA-8-10: a stair says what it is - one straight run to the level above, and that the rest is a person's (Revit's row says the same). */
function stairLine(p: Ghost["place"]): string {
  return p?.TopLevel && p.Risers != null && p.Going != null && p.Width != null
    ? ` · to ${p.TopLevel} · ${p.Risers} risers, going ${p.Going} mm, width ${p.Width} mm — one straight run; landings, turns and railings are a person's` : "";
}

/** MA-8-7 review: why a retype is not pre-ticked, in a few words (Revit never ticks a foreign one, nor a column or beam; no catalogue = not judged). */
function unticked(el: Ghost): string {
  return el.foreign === true ? " — not pre-ticked: a type that is not the office's"
    : el.kind === "column" || el.kind === "beam" ? " — not pre-ticked: structure is a person's"
    : el.foreign === null && el.pretick === false ? " — not pre-ticked: not judged, no type catalogue" : "";
}

/** MA-8-7 (D16): a create that replaces an element, in Revit's row's words - the reviewer is told the original is deleted. */
function replacesLine(el: Ghost, name: string, type: string): string {
  const b = el.replaces?.box;
  const cls = el.replaces?.kind === "generic" ? "Generic Model" : el.replaces?.kind === "directshape" ? "DirectShape" : "DirectShape or Generic Model";
  const what = el.replaces?.category ? `${el.replaces.category} ${cls}` : cls;
  const size = b ? `, ${[0, 1, 2].map((i) => Math.round(b.max[i] - b.min[i])).join(" x ")} mm` : "";
  return `${name} · re-creates ${el.replaces?.unique_id ?? "?"} (${what}${size}) as ${type}${el.place?.LevelName ? " on " + el.place.LevelName : ""}; ` +
    "the original and any tags on it are removed in the same Undo (one Undo in Revit brings it back and removes the new element)";
}

/** MA-6-6 review fix: a mass's size as Revit's row says it — its footprint's plan extent, then its two elevations. */
function massSize(p: Ghost["place"]): string {
  const b = p?.Boundary ?? [], span = (i: number) => Math.round(Math.max(...b.map((q) => q[i])) - Math.min(...b.map((q) => q[i])));
  return b.length && p?.BaseElevation != null && p.TopElevation != null ? ` · ${span(0)} x ${span(1)} mm footprint, ${Math.round(p.BaseElevation)} to ${Math.round(p.TopElevation)} mm` : "";
}

/** MA-3b3: who declined, and — for a decline the bridge carried from an earlier changeset — where it was made (the web, or Revit) and
 *  in which changeset. An origin the desk does not know is "before", never guessed. */
export const declinedBy = (r: { by: string; role: string | null; carried_from?: CarriedFrom | null }): string => {
  const who = r.role ? `${r.by} (${r.role})` : r.by, c = r.carried_from;
  return c ? `declined ${c.origin === "revit" ? "in Revit" : c.origin === "web" ? "on the web" : "before"} by ${who} in "${c.name}", carried here by the bridge` : `declined by ${who}`;
};

/** The web desk's decision in words (Revit's ChangesetTrust.ReviewLine, from the desk's side); "waiting" when nobody decided. */
export function reviewWords(el: Ghost): string {
  const r = el.review;
  if (!r || (r.state === "proposed" && r.action !== "reopen")) return "waiting — nobody decided on the web";
  const who = r.role ? `${r.by} (${r.role})` : r.by; // C16: a role the desk was not given is left out (declinedBy's rule), never "(null)"
  if (r.state === "declined") return `${declinedBy(r)}: ${r.reason} — binds: Revit shows it unticked and refuses the tick`;
  // MA-7-10: a photo cited on the accept confirms the ghost a scan already proposed - a person linked it, nothing registered it to the model
  const photo = r.evidence?.length ? ` · confirmed by photo ${r.evidence.join(", ")} (person-linked, not registered)` : "";
  if (r.state === "accepted") return `accepted by ${who}${r.reason ? ": " + r.reason : ""}${photo} — advice: Revit still asks for the tick`;
  return `re-opened by ${who}: ${r.reason}`;
}

/** MA-4d: a ghost the bridge built from a survey job, in words — what was measured, from which job, the fit and the faces against D7's 20 mm, whether the
 *  bridge pre-ticked it, its trimmed ends and its evidence; "" for a ghost nothing measured. Pure. */
export function trustWords(el: Ghost, vendor = false): string { // vendor (MA-8-3): the ghost's IFC is a third party's model
  const a = el.accuracy;
  if (!a?.from_job) return "";
  const t = el.measured?.thickness_mm, trim = el.trim_mm ?? [];
  const after = [el.pretick ? "pre-ticked" : "not pre-ticked", ...(trim.some((v) => v !== 0) ? [`ends ${trim.join(" / ")} mm to the corners`] : []),
    ...(el.evidence?.length ? [`evidence ${el.evidence.slice(0, 3).join(", ")}`] : [])];
  // MA-5a-4: a drawing's ghost — read off the paper at the alignment's scale, never measured
  if (a.basis === "drawing") return [`drawn — from ${a.from_job} at 1:${a.scale}`, ...(t != null ? [`${t} mm thick as drawn`] : []),
    `inferred (what someone drew, not what was built)`, a.check_mm != null ? `alignment checked to ${a.check_mm} mm` : "alignment not checked by a third point", ...after].join(" · ");
  // MA-6-8: an IFC concept's ghost — read off the model, never measured
  if (a.basis === "ifc") return [`modelled — from ${a.from_job} (IFC)`, ...(t != null ? [`${t} mm thick as modelled`] : []),
    vendor ? "inferred (what a third party's model says, not what was measured here)" : "inferred (what a concept says, not what was built)", ...after].join(" · ");
  return [`measured from ${a.from_job}`, ...(t != null ? [`${t} mm thick`] : []), ...(a.fit_rmse_mm != null ? [`fit ${a.fit_rmse_mm} mm rms`] : []),
    ...(a.face_dev_mm != null ? [`faces ${a.face_dev_mm} mm off`] : []), `${a.status.replace(/_/g, " ")}${a.target_mm != null ? ` (${a.target_mm} mm)` : ""}`, ...after].join(" · ");
}
/** MA-5a-4: a changeset the bridge built from a drawing job — no scan behind it: no Measure, no scan. MA-6-8: and from a concept IFC. */
export const isDrawn = (cs: PendingChangeset): boolean => ["sentinel-drawing ", "sentinel-ifc "].some((r) => (cs.job?.reader ?? "").startsWith(r));
/** MA-4d: a survey changeset's origin in words — its job and row, the lead's frame and who stated it, how its storey met its level, and
 *  another job's placed changesets on the same scan (decision 19: named, never refused). "" else. Pure. */
export function sourceWords(cs: PendingChangeset): string {
  const j = cs.job;
  if (!j) return "";
  const f = j.frame, s = j.storey, al = j.alignment;
  const o = j.overlaps ?? [];
  const again = o.length ? ` · the same ${al ? "drawing" : "scan"} ${[...new Set(o.flatMap((x) => x.evidence))].join(", ")} was placed before by ${o.map((x) => x.changeset).join(", ")}` : "";
  if (al) return `from drawing ${j.id} (ledger #${j.ledger_id ?? "?"}) · ${al.item}${al.revises ? ` (revises ${al.revises}: what is the same is left as placed)` : ""} at 1:${al.scale}, turned ${al.rotation_deg}°, its paper corner at ${al.dx_mm}, ${al.dy_mm} mm, ` +
    `level at ${al.dz_mm} mm${al.confirmed_by ? `, stated by ${al.confirmed_by}` : ""}${al.check_mm != null ? ` · checked to ${al.check_mm} mm by a third point` : " · no check point"}` +
    `${s ? ` · storey ${s.level} (${s.how}${s.checked ? "" : " — its height not checked"})` : ""} · nothing from a drawing is pre-ticked${again}`;
  if ((j.reader ?? "").startsWith("sentinel-ifc ")) { // MA-6-8
    const v = j.evidence?.[0], bought = v?.provider && v.provider !== "own"; // MA-8-3: a third party's model says whose, and its order
    return `from IFC ${j.id}${bought ? ` by ${v.provider}` : ""} (${bought ? `${v.licence ?? "commercial"}, ref ${v.licence_ref ?? "?"}, ` : ""}ledger #${j.ledger_id ?? "?"})${f ? ` · the concept ${f.dx_mm || f.dy_mm || f.dz_mm || f.rotation_deg ? `moved ${f.dx_mm}, ${f.dy_mm}, ${f.dz_mm} mm, turned ${f.rotation_deg}°` : "at the model's internal origin"}${f.stated_by ? `, stated by ${f.stated_by}` : ""}` : ""}` +
      `${s ? ` · storey ${s.level} (${s.how}${s.checked ? "" : " — its height not checked"})` : ""} · nothing from an IFC is pre-ticked${again}`;
  }
  const frame = f ? ` · the scan ${f.dx_mm || f.dy_mm || f.dz_mm || f.rotation_deg ? `moved ${f.dx_mm}, ${f.dy_mm}, ${f.dz_mm} mm, turned ${f.rotation_deg}°` : "at the model's internal origin"}${f.stated_by ? `, stated by ${f.stated_by}` : ""}` : "";
  return `from survey ${j.id} (ledger #${j.ledger_id ?? "?"})${frame}${s ? ` · storey ${s.level} (${s.how}${s.checked ? "" : " — its height not checked: nothing here is pre-ticked"})` : ""}${again}`;
}

/** Who may accept or decline on the desk: a signed-in contributor or above. The machine credential ("service") never reviews (Q1). */
export const canDecide = (role: string): boolean => ["owner", "lead", "contributor"].includes(role);
/** Who may re-open a decline: a signed-in lead or owner. */
export const canReopen = (role: string): boolean => ["owner", "lead"].includes(role);

const at = (base: string, key: string, path = "") => `${base.replace(/\/$/, "")}/changesets/${encodeURIComponent(key)}${path}`;

async function readList(url: string): Promise<PendingChangeset[]> {
  let r: Response;
  try { r = await bfetch(url); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as PendingChangeset[] | { message?: string } | null;
  if (!r.ok || !Array.isArray(j)) throw new Error(`not read — ${(j as { message?: string } | null)?.message || (r.ok ? "the bridge answered without a list" : `HTTP ${r.status}`)}`);
  return j;
}

/** GET /changesets/:key?status=proposed. Any failure throws "not read — <why>", never an empty list. */
export const readPending = (base: string, key: string): Promise<PendingChangeset[]> => readList(at(base, key, "?status=proposed"));

// ── MA-3b2b: recently decided in Revit — what Revit reported, with its reason per ghost. Read-only; every string here is rendered
//    with textContent (a reason is free text typed in Revit — MA-3b2 review C13). ──

/** How many reports the desk shows, newest first; decidedCount says when there are more. */
export const DECIDED_MAX = 10;
const DECIDED: Record<string, string> = { applied: "applied", partially_applied: "partially applied", declined: "declined" };

/** GET /changesets/:key — every changeset (the bridge's list takes one status or none); kept: the ones Revit reported, newest report
 *  first. Any failure throws "not read — <why>". ponytail: the whole list is read to show ten; a bridge `status` list + `limit` when a
 *  project's list grows heavy (Next). */
export async function readDecided(base: string, key: string): Promise<PendingChangeset[]> {
  return (await readList(at(base, key)))
    .filter((c) => c.status in DECIDED && !!c.result)
    .sort((a, b) => { const x = a.result!.reported_at ?? "", y = b.result!.reported_at ?? ""; return x < y ? 1 : x > y ? -1 : 0; });
}

/** GET …/audit → its rows and total; any failure throws "not read — <why>", never an empty list. */
async function auditRows<T>(url: string): Promise<{ rows: T[]; total: number }> {
  let r: Response;
  try { r = await bfetch(url); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as { rows?: T[]; total?: number; message?: string } | null;
  if (!r.ok || !Array.isArray(j?.rows)) throw new Error(`not read — ${j?.message || (r.ok ? "the bridge answered without rows" : `HTTP ${r.status}`)}`);
  return { rows: j.rows, total: j.total ?? 0 };
}

/** The ledger rows of the reports (the stored changeset holds no row id): GET /cde/:key/audit by changeset id → per changeset, its
 *  changeset_applied row and (review C3) the newest changeset_reverted row — rows come newest first, so the first one seen. No id
 *  asked is no read. Any failure throws "not read — <why>" — the desk then says the row was not read, never a made-up id; so does a
 *  ledger holding more changeset_* rows for these reports than one read returns (1000): a cut read could miss a report's row. */
export async function readLedger(base: string, key: string, ids: string[]): Promise<Map<string, LedgerRows>> {
  if (!ids.length) return new Map();
  const j = await auditRows<{ id: number; entity_id: string; action: string; actor?: string; new_value?: { op?: unknown; basis?: unknown } | null }>(`${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=changeset_&entity_id=${ids.map(encodeURIComponent).join(",")}&limit=1000`);
  if (j.total > j.rows.length) throw new Error(`not read — the ledger holds more rows for these reports (${j.total}) than one read returns`);
  const out = new Map<string, LedgerRows>();
  for (const x of j.rows) {
    if (x.action !== "changeset_applied" && x.action !== "changeset_reverted") continue;
    const e = out.get(x.entity_id) ?? { row: null, reverted: null };
    if (x.action === "changeset_applied") e.row = x.id;
    else if (!e.reverted) e.reverted = { id: x.id, op: typeof x.new_value?.op === "string" ? x.new_value.op : "",
      ...(x.new_value?.basis === "absent" ? { on_word: x.actor || "an unknown account" } : {}) };   // final verification round 2
    out.set(x.entity_id, e);
  }
  return out;
}

/** "3 report(s), newest first." — or that only the newest DECIDED_MAX are shown. */
export const decidedCount = (n: number): string =>
  n > DECIDED_MAX ? `The newest ${DECIDED_MAX} of ${n} reports — the older ones are on the ledger.` : `${n} report(s), newest first.`;

/** One reported changeset in words. `ledger`: its rows; null when the ledger read found none; the Error of a read that failed.
 *  Each ghost the result did not apply carries Revit's reason (result.reasons) and the web's (declined_on_web) — or says it has none.
 *  Review C3: a report undone in Revit says so (the ledger's changeset_reverted row), never "applied" alone. Review C4: total — a
 *  result without its lists, its reporter or its time (an old or hand-written one) is said with what it has, never thrown. */
export function decidedView(cs: PendingChangeset, ledger: LedgerRows | null | Error): DecidedView {
  const r: Partial<DeskResult> = cs.result ?? {};
  const applied = r.applied ?? [], rejected = r.rejected ?? [], when = r.reported_at ?? "";
  const at = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(when) ? `${when.slice(0, 10)} ${when.slice(11, 16)} UTC` : "an unknown time";
  const rev = ledger instanceof Error ? null : ledger?.reverted ?? null;
  const row = (ledger instanceof Error ? `ledger row ${ledger.message}` : ledger?.row != null ? `ledger #${ledger.row}` : "no ledger row found for it")
    // final verification round 2: an undo recorded on a person's word that the element is gone is not an Undo Revit was seen doing
    + (!rev ? "" : rev.op === "undo" && rev.on_word ? ` · recorded as gone on ${rev.on_word}'s word after the report, not an Undo seen in Revit (ledger #${rev.id})`
      : rev.op === "undo" ? ` · undone in Revit after the report (ledger #${rev.id})` : rev.op === "redo" ? ` · undone, then redone in Revit (ledger #${rev.id})`
      : ` · a changeset_reverted row follows the report (ledger #${rev.id})`);
  const byGuid = new Map((cs.elements ?? []).map((e) => [e.proposal_guid, e]));
  const rehosted = applied.filter((a) => byGuid.get(a.proposal_guid)?.op === "rehost").length; // MA-5b-5
  // MA-8-7 (amendment 3): only what Revit reported removed counts as removed; a replacing create without a matching removed_unique_id is said apart
  const replacing = applied.filter((a) => byGuid.get(a.proposal_guid)?.replaces);
  const replaced = replacing.filter((a) => a.removed_unique_id?.toLowerCase() === byGuid.get(a.proposal_guid)?.replaces?.unique_id.toLowerCase()).length;
  const notReported = replacing.length - replaced;
  const web = new Map((r.declined_on_web ?? []).map((d) => [d.proposal_guid, d]));
  const revit = (g: string): string | null => (r.reasons && Object.prototype.hasOwnProperty.call(r.reasons, g) ? r.reasons[g] : null);
  return {
    head: `${cs.name} — ${DECIDED[cs.status] ?? cs.status} in Revit by ${r.reported_by || "an unknown account"} · ${at} · ${applied.length} applied${rehosted ? ` (${rehosted} rehosted — the unhosted instance removed)` : ""}${replaced ? ` (${replaced} re-created — the original removed)` : ""}${notReported ? ` (${notReported} placed, the original not reported removed — check the model)` : ""}, ${rejected.length} not applied · ${row}`,
    note: r.note ?? null,
    declined: rejected.map((g) => {
      const el = byGuid.get(g), w = web.get(g), why: string[] = [];
      if (revit(g)) why.push(`Revit: ${revit(g)}`);
      if (w) why.push(w.carried_from ? `${declinedBy(w)}: ${w.reason}` : `web, ${w.by} (${w.role}): ${w.reason}`); // MA-3b3: a carried decline names its origin
      // MA-5b-5 review (R10): a ghost Revit kept as it stands carries its reason on the note, not per ghost
      const kept = !why.length && /kept as they stand/.test(r.note ?? "") && (el?.op === "rehost" || el?.op === "reshape" || !!el?.replaces);
      return { line: el ? ghostLine(el) : g, why: why.length ? why : [kept ? "Revit kept it as it stands — its reason is in the note above" : "no reason given for this ghost"] };
    }),
  };
}

/** MA-7-10: the photo ids typed on the desk ("ev-000C, ev-000D") as the list the bridge reads; blanks and repeats dropped. */
export const citesOf = (text: string): string[] => [...new Set(text.split(/[\s,;]+/).filter(Boolean))];

/** POST /changesets/:key/:id/review {decisions}. A decline with a blank reason is never sent; a refusal throws the bridge's words. */
export async function postReview(base: string, key: string, id: string, decision: "accept" | "decline", guids: string[], reason: string, cites: string[] = []): Promise<{ ledger: LedgerRef | null }> {
  const why = reason.trim();
  if (!guids.length) throw new Error("tick a ghost first");
  if (decision === "decline" && !why) throw new Error("a decline needs a reason — the ledger records it and Revit shows it");
  return bwrite(at(base, key, `/${encodeURIComponent(id)}/review`), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisions: guids.map((g) => ({ proposal_guid: g, decision, ...(why ? { reason: why } : {}), ...(decision === "accept" && cites.length ? { evidence: cites } : {}) })) }),
  });
}

/** POST /changesets/:key/:id/reopen {proposal_guid, reason} — a lead's. A blank reason is never sent. */
export async function postReopen(base: string, key: string, id: string, guid: string, reason: string): Promise<{ ledger: LedgerRef | null }> {
  const why = reason.trim();
  if (!why) throw new Error("a re-open needs a reason — the ledger records it");
  return bwrite(at(base, key, `/${encodeURIComponent(id)}/reopen`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposal_guid: guid, reason: why }),
  });
}

/** The desk's posts for the ticked ghosts: one per changeset (all or none on the bridge — a storey's parts are separate changesets),
 *  leaving out a ghost already in the state the decision leads to: a repeat is a 409 that would refuse its whole post (C6). */
export function postsFor(ticked: Map<string, { cs: PendingChangeset; el: Ghost }>, decision: "accept" | "decline"): { posts: Map<string, string[]>; already: number } {
  const target = decision === "accept" ? "accepted" : "declined";
  const posts = new Map<string, string[]>();
  let already = 0;
  for (const [g, x] of ticked) {
    if (x.el.review?.state === target) { already++; continue; }
    posts.set(x.cs.id, [...(posts.get(x.cs.id) ?? []), g]);
  }
  return { posts, already };
}

/** "ledger #1201" when the bridge named the row; else that it did not. */
export const rowWords = (r: { ledger: LedgerRef | null } | null): string => (r?.ledger?.id != null ? `ledger #${r.ledger.id}` : "the bridge named no ledger row");

// ── MA-4e: measured against the scan — the bridge's verify:measured rows ("verify:" is reserved on the open audit route). Every string here
//    is rendered with textContent. ──

/** The newest verify:measured row of each changeset asked — one read per changeset, newest first, limit 1, in parallel (journey-store's
 *  newest-row read; readLedger's is pinned to changeset_ rows): a report measured often never cuts a quiet one's. → per id its record, null
 *  (never measured) or that one read's "not read — …" Error, never a guess. None asked is no read.
 *  ponytail: one read per survey report shown (at most DECIDED_MAX); a ledger view of the newest row per entity if the desk shows more. */
export async function readVerified(base: string, key: string, ids: string[]): Promise<Map<string, VerifyRecord | Error | null>> {
  const at = `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=verify:measured&limit=1&entity_id=`;
  return new Map(await Promise.all(ids.map(async (id): Promise<[string, VerifyRecord | Error | null]> => {
    try {
      const [x] = (await auditRows<{ id: number; at: string; actor: string; new_value?: Partial<VerifyRecord> | null }>(at + encodeURIComponent(id))).rows;
      if (!x) return [id, null];
      const v = x.new_value ?? {};
      return [id, { id: x.id, at: x.at, actor: x.actor, status: String(v.status ?? ""), reference: v.reference, target_mm: v.target_mm, deviation: v.deviation, counts: v.counts, error: v.error,
        placed_by: v.placed_by, elements: Array.isArray(v.elements) ? v.elements : [] }];
    } catch (e) { return [id, e as Error]; }
  })));
}

/** MA-8-5c: how many of the project's newest verify:measured rows the desk's "Measured against the scan" section reads. */
export const MEASURED_MAX = 200;
/** MA-8-5c: the project's newest verify:measured rows in one read (no entity_id), the newest per changeset — for the survey changesets older than the
 *  DECIDED_MAX newest reports, whose measure the decided list no longer shows; `shown` = the ids whose measure the decided list already renders (left out here). `name` is the row's own action text (the desk may not know the
 *  changeset); `capped` when the ledger holds older rows than this read returns. Throws "not read — <why>". */
export async function readMeasuredRecent(base: string, key: string, shown: Set<string>): Promise<{ items: { id: string; name: string; rec: VerifyRecord }[]; capped: boolean }> {
  const j = await auditRows<{ id: number; entity_id: string; at: string; actor: string; action?: string; new_value?: (Partial<VerifyRecord> & { changeset?: { name?: unknown } }) | null }>(
    `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/audit?entity_type=changeset&action_prefix=verify:measured&limit=${MEASURED_MAX}`);
  const seen = new Map<string, { id: string; name: string; rec: VerifyRecord }>();
  for (const x of j.rows) {   // newest first: the first row of a changeset is its newest
    if (shown.has(x.entity_id) || seen.has(x.entity_id)) continue;
    const v = x.new_value ?? {};
    // MA-8-5c review: the row's own changeset name, else its action text without the ledger prefix
    const nm = typeof v.changeset?.name === "string" && v.changeset.name ? v.changeset.name : (x.action ?? "").replace(/^verify:measured\s*/, "");
    seen.set(x.entity_id, { id: x.entity_id, name: nm || `Survey changeset ${x.entity_id.slice(0, 8)}`, rec: { id: x.id, at: x.at, actor: x.actor, status: String(v.status ?? ""), reference: v.reference,
      target_mm: v.target_mm, deviation: v.deviation, counts: v.counts, error: v.error, placed_by: v.placed_by, elements: Array.isArray(v.elements) ? v.elements : [] } });
  }
  return { items: [...seen.values()], capped: j.total > j.rows.length };
}

const MEASURED = ["within_tolerance", "out_of_tolerance", "missing", "insufficient_data", "not_measured"];
/** "3 within tolerance, 0 out of tolerance, 0 missing, 0 insufficient data, 0 not measured" — the bridge's count words (survey-plan countWords). Pure. */
export const countWords = (n: Record<string, number>): string => MEASURED.map((s) => `${n[s] ?? 0} ${s.replace(/_/g, " ")}`).join(", ");

/** One measured element in words: the verdict against its row's rule (MA-5a-2: each face's share within the window; an older row: p95 against
 *  its target), the numbers sentinel-survey gave, the bridge's reason — a number it
 *  did not give is left out, never a zero. Pure. */
export function measureWords(m: Measured, rec: { target_mm?: number; deviation?: { within_mm: number; face_share_min: number } } = {}): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`, dv = rec.deviation;
  const judged = m.status === "within_tolerance" || m.status === "out_of_tolerance";
  // MA-5a-2: a row that names its per-face rule says it and each face's share at it; an older row keeps p95 against its target
  const rule = dv ? ` (each face ${pct(dv.face_share_min)} within ${dv.within_mm} mm)` : ` (${rec.target_mm ?? 20} mm, p95)`;
  const at = dv ? String(dv.within_mm) : null;
  // a face's share rounded down (review): 0.196 reads 19%, never the 20% its verdict says it missed
  const down = (v: number) => `${Math.floor(Math.round(v * 1000) / 10)}%`;
  const faces = at && m.faces?.some((f) => f.share_within) ? [`faces within ${at} mm: ${m.faces.map((f) => (f.share_within ? down(f.share_within[at]) : "—")).join(" / ")}`] : [];
  const sw = m.share_within ? Object.entries(m.share_within).filter(([t]) => t !== at) : null;
  // MA-8-5: the LOA band, read at render from the row's p95 — a repeat measure is a 409, so a row is never rewritten; every older row gets it
  // the band words only where a band could stand (judged, or insufficient data): missing and not-measured rows already say it
  return [`${m.status.replace(/_/g, " ")}${judged ? rule : ""}`, ...(judged || m.status === "insufficient_data" ? [loaWords(m)] : []), ...faces,
    ...(m.p95_mm != null ? [`p95 ${m.p95_mm} mm`] : []),
    ...(m.mean_signed_mm != null ? [`mean ${m.mean_signed_mm > 0 ? "+" : ""}${m.mean_signed_mm} mm (+ = the scan outside it)`] : []),
    ...(m.coverage != null ? [`${pct(m.coverage)} of its faces seen`] : []),
    ...(sw?.length ? [`within ${sw.map(([t]) => t).join(" / ")} mm: ${sw.map(([, v]) => pct(v)).join(" / ")}`] : []),
    ...(m.points ? [`${m.points} points`] : []),
    ...(m.reason ? [m.reason] : [])].join(" · ");
}

/** MA-4f: what the head says each reference measured — as filed (the changeset's geometry), Revit's re-read at Apply (the add-in's claim), or a
 *  mix. Never "a wall moved since Apply": Revit re-reads at Apply. */
const MEASURED_AS: Record<string, string> = {
  "as filed": " as filed (the changeset's geometry, which Revit placed exactly — not re-read from Revit: a wall moved since, Revit's joins, the type's width in Revit and the lead's frame are not seen)",
  "revit (claimed)": " as Revit placed it (Revit's re-read at Apply, the add-in's claim: its joins, its location line and the type's width in Revit are measured — a wall moved since Apply and the lead's frame are not seen)",
  mixed: " as Revit placed it where Revit re-read it at Apply (the add-in's claim), else as filed — a wall moved since Apply and the lead's frame are not seen",
};

/** A changeset's newest measure in words: the head (by Revit's re-read where it sent one, else as filed; who reported the placement, the counts
 *  or why it did not finish, its row, when, who) and a line per placed element (ghostLine, then measureWords); null when it was never measured;
 *  the read's own failure as the head. Pure. */
export function verifiedView(cs: PendingChangeset, rec: VerifyRecord | null | Error): { head: string; lines: { line: string; words: string }[] } | null {
  if (rec instanceof Error) return { head: `Measure ${rec.message}`, lines: [] };
  if (!rec) return null;
  const when = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(rec.at ?? "") ? `${rec.at.slice(0, 10)} ${rec.at.slice(11, 16)} UTC` : "an unknown time";
  const what = rec.status === "done" ? countWords(rec.counts ?? {}) : `did not finish — ${rec.error ?? "no reason on its row"}`;
  const filed = rec.reference && Object.prototype.hasOwnProperty.call(MEASURED_AS, rec.reference) ? MEASURED_AS[rec.reference] : "";
  // Which walls count as placed is Revit's report, not the bridge's measure: who filed it, and the machine credential's said so.
  const pb = rec.placed_by, placed = `placed as Revit reported${pb?.reported_by ? ` (by ${pb.reported_by})` : ""}${pb?.reported_role === "service" ? " — the machine credential's report" : ""}`;
  const byGuid = new Map((cs.elements ?? []).map((e) => [e.proposal_guid, e]));
  return {
    head: `Measured against the scan${filed} · ${placed} · ${what} · ledger #${rec.id} · ${when} · by ${rec.actor || "an unknown account"}`,
    lines: rec.elements.map((m) => { const el = byGuid.get(m.proposal_guid); return { line: el ? ghostLine(el) : m.proposal_guid,
      words: measureWords(m, rec) + (rec.reference === "mixed" && m.reference === "as filed" ? " · as filed" : "") }; }),
  };
}

/** MA-8-5c: the "Measured against the scan" section as plain data (the desk renders it): a note per thing the read did not give, and one entry per
 *  measured changeset the decided list does not show — named by the desk's own changeset when it has it, its elements in ghostLine words. A bad
 *  row is said in its own entry, never takes the others with it. null when there is nothing to say. Pure. */
export function measuredView(data: Awaited<ReturnType<typeof readMeasuredRecent>> | Error, byId: Map<string, PendingChangeset>):
  { notes: { text: string; warn: boolean }[]; items: { summary: string; head: string; lines: { line: string; words: string }[] }[] } | null {
  if (data instanceof Error) return { notes: [{ text: `Measures ${data.message}`, warn: true }], items: [] };
  if (!data.items.length && !data.capped) return null;
  const notes: { text: string; warn: boolean }[] = [];
  if (!data.items.length) notes.push({ text: `None outside the reports above in the newest ${MEASURED_MAX} measures — the older ones are on the ledger.`, warn: false });
  else {
    if (data.capped) notes.push({ text: `The newest ${MEASURED_MAX} measures — the older ones are on the ledger.`, warn: false });
    notes.push({ text: "Each is its newest measure as written; an Undo in Revit since then is not read here — open the report in Revit or ask sentinel_changeset_status.", warn: false });
  }
  const items = data.items.map((m) => {
    const cs = byId.get(m.id), summary = cs?.name || m.name;
    try { const mv = verifiedView(cs ?? { id: m.id, name: m.name, source: "", status: "", created_at: "", elements: [] } as PendingChangeset, m.rec)!; return { summary, ...mv }; }
    catch (e) { return { summary: `${summary}: measure not shown — ${(e as Error).message}`, head: "", lines: [] }; }
  });
  return { notes, items };
}

/** MA-8 nits (F-B3-4): the placed survey changesets older than the DECIDED_MAX newest reports with no verify:measured row in the read above — the
 *  decided list shows no Measure for them, so "Measured against the scan" does. From the desk's own list (readDecided, every reported changeset): no new
 *  route. A drawing's or an IFC's never (isDrawn: MA-5a-4 / MA-6-8). [] when the measures were not read — never a guess. Only a done measure counts
 *  (review: a failed or refused run's row leaves it unmeasured — the bridge takes a new measure after one). Pure. */
export function unmeasuredOlder(decided: PendingChangeset[], measured: Awaited<ReturnType<typeof readMeasuredRecent>> | Error): PendingChangeset[] {
  if (measured instanceof Error) return [];
  const seen = new Set(measured.items.filter((m) => m.rec.status === "done").map((m) => m.id));
  return decided.slice(DECIDED_MAX).filter((cs) => !!cs.job && !isDrawn(cs) && (cs.status === "applied" || cs.status === "partially_applied") && !seen.has(cs.id));
}

/** Who sees Measure on a report: a placed survey changeset (its job; applied or partially), a signed-in contributor or above (never the
 *  machine credential), not undone in Revit since (its newest changeset_reverted row). The bridge holds the same rules. Pure. */
export const canMeasure = (cs: PendingChangeset, role: string, rows: LedgerRows | null | Error): boolean =>
  !!cs.job && !isDrawn(cs) && (cs.status === "applied" || cs.status === "partially_applied") && canDecide(role) && !(rows && !(rows instanceof Error) && rows.reverted?.op === "undo");

/** POST /cde/:key/verify {changeset} — the id only: the bridge picks the elements, their geometry, the scan and the seed. A refusal throws the
 *  bridge's words. */
export const postMeasure = (base: string, key: string, id: string): Promise<MeasureReply> =>
  bwrite(`${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeset: id }) });

/** The status line after Measure. Pure. */
export const measureLine = (r: MeasureReply): string =>
  `✓ Measured ${r.changeset.name} against the scan ${r.reference === "revit (claimed)" ? "as Revit re-read it (the add-in's claim)" : r.reference === "mixed" ? "as Revit re-read it (the add-in's claim), else as filed" : "as filed"} — ${countWords(r.counts)} · ${rowWords(r)}`;

// ── MA-8-1 (C11): the edit cost of each run — how much of what was filed a person changed. Computed by the bridge at read time; a lead
//    publishes a complete run's numbers as one ledger row. ──
export interface EditCostRun { run: string; label: string; filed: number; web: number; carried: number; revit: number; applied: number; undone: number; kept: number;
  pending: number; withdrawn: number; share_changed: number | null; complete: boolean; ceiling: string; }
export interface EditCost { runs: EditCostRun[]; withdrawn: number; ceiling: string; }

/** GET /changesets/:key/edit-cost. Any failure throws "not read — <why>". */
export async function readEditCost(base: string, key: string): Promise<EditCost> {
  let r: Response;
  try { r = await bfetch(at(base, key, "/edit-cost")); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (EditCost & { message?: string }) | null;
  if (!r.ok || !j || !Array.isArray(j.runs)) throw new Error(`not read — ${j?.message || (r.ok ? "the bridge answered without runs" : `HTTP ${r.status}`)}`);
  return j;
}

/** POST /changesets/:key/edit-cost/publish {run} — a lead's. A refusal throws the bridge's words. */
export const postEditCostPublish = (base: string, key: string, run: string): Promise<{ ledger: LedgerRef | null }> =>
  bwrite(at(base, key, "/edit-cost/publish"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run }) });

/** One run as a line, with the ceiling. Pure. */
export function editCostLine(r: EditCostRun): string {
  const parts = [r.label, `${r.filed} filed`, `${r.web} declined on the web`];
  if (r.carried) parts.push(`${r.carried} declined before (carried)`);
  parts.push(`${r.revit} not applied in Revit (unticked, or removed at commit)`, `${r.applied} applied`, `${r.undone} undone`);
  if (r.pending) parts.push(`${r.pending} still pending`);
  if (r.withdrawn) parts.push(`${r.withdrawn} withdrawn (not in the share)`);
  return `${parts.join(" · ")} · ${keptWords(r)} — ${r.ceiling}`;
}

/** MA-8 nits (F-B5-2): kept in 8-1's own terms — share_changed is (declined on the web + not applied in Revit + undone) over the decided ghosts
 *  (filed − pending − carried), i.e. the share NOT kept as filed: "1 of 14 kept as filed (13 not kept)", never "% changed". Pure. */
export function keptWords(r: { filed: number; kept: number; web: number; revit: number; undone: number; carried: number; pending?: number; share_changed: number | null }): string {
  const decided = r.filed - (r.pending ?? 0) - r.carried;
  return r.share_changed == null || decided <= 0 ? `${r.kept} kept` : `${r.kept} of ${decided} kept as filed (${r.web + r.revit + r.undone} not kept)`;
}

// ── MA-8-13 (C15, D13): the recipe registry — the method of a verified run, approved by a lead and an owner (two different people), run by a third. ──
export interface RecipeApproval { id: number; hash: string | null; role: string; user_id: string; by: string | null; at: string | null; counts: boolean; }
export interface RecipeBody {
  name: string; reader: { name: string; version: string }; params: Record<string, number>; planner: { name: string; version: string };
  standards: { guideline: { label: string; sha256: string }; type_catalog: { label: string; sha256: string } };
  verified: { project: string; run: string; job_id: string; edit_cost: { filed: number; web: number; carried: number; revit: number; undone: number; kept: number; share_changed: number | null } };
}
export interface RecipeRow { ref: string; version: number; scope: "project" | "office"; key: string; sha256: string; body: RecipeBody; state: "pending" | "approved" | "withdrawn" | "untrusted";
  approved: boolean; approvals: RecipeApproval[]; withdrawn: { id: number } | null; why: string | null; installed_by: string | null; }
export interface RecipeList { project: RecipeRow[]; office: { key: string; recipes: RecipeRow[] } | null; }

const recipesAt = (base: string, key: string, path = "") => `${base.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/recipes${path}`;
/** GET /cde/:key/recipes. Any failure throws "not read — <why>". */
export async function readRecipes(base: string, key: string): Promise<RecipeList> {
  let r: Response;
  try { r = await bfetch(recipesAt(base, key)); }
  catch (e) { throw new Error(`not read — ${(e as Error).message}`); }
  const j = (await r.json().catch(() => null)) as (RecipeList & { message?: string }) | null;
  if (!r.ok || !j || !Array.isArray(j.project)) throw new Error(`not read — ${j?.message || (r.ok ? "the bridge answered without recipes" : `HTTP ${r.status}`)}`);
  return j;
}
const recipePost = <T>(url: string, body: unknown) => bwrite<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
/** POST /cde/:key/recipes {run, name, scope?} — a lead's. A refusal throws the bridge's words. */
export const postRecipeDraft = (base: string, key: string, run: string, name: string, scope: "project" | "office" = "project") =>
  recipePost<{ ref: string; scope: string; key: string }>(recipesAt(base, key), { run, name, scope });
/** POST /cde/:key/recipes/:n/approve {sha256, scope} — the sha the desk shows, so an approval names the body that was read. */
export const postRecipeApprove = (base: string, key: string, r: RecipeRow) =>
  recipePost<{ ref: string; role: string; approved: boolean; ledger: LedgerRef | null }>(recipesAt(base, key, `/${r.version}/approve`), { sha256: r.sha256, scope: r.scope });
export const postRecipeWithdraw = (base: string, key: string, r: RecipeRow) =>
  recipePost<{ ref: string; ledger: LedgerRef | null }>(recipesAt(base, key, `/${r.version}/withdraw`), { sha256: r.sha256, scope: r.scope });

/** The standard a recipe names, without its sha: "guideline@7". */
const refOnly = (label: string): string => label.split(" · ")[0];
const roleWord = (role: string): string => (role === "lead" ? "a lead" : role === "owner" ? "an owner" : `a ${role}`);

/** One recipe in one line: its reader and planner, the standards it ran on, the run it was verified on (kept as filed of the decided, keptWords) and where
 *  its approvals stand — who approved, who is owed, who no longer counts. Pure. */
export function recipeLine(r: RecipeRow): string {
  const b = r.body, ec = b.verified.edit_cost;
  const head = `${r.ref} · ${r.scope} · ${b.name} · ${b.reader.name} ${b.reader.version} → ${b.planner.name} ${b.planner.version} · ${refOnly(b.standards.guideline.label)}, ${refOnly(b.standards.type_catalog.label)}`
    + ` · ${b.verified.job_id}: ${keptWords(ec)}`;
  const counting = r.approvals.filter((a) => a.counts), lapsed = r.approvals.filter((a) => !a.counts);
  const by = counting.map((a) => `${roleWord(a.role)} (#${a.id})`).join(" and ");
  const stand = r.state === "withdrawn" ? `withdrawn (ledger #${r.withdrawn?.id ?? "?"}) — it runs no more`
    : r.state === "untrusted" ? `not trusted — ${r.why ?? "its body does not hash to the sha256 it was installed with"}`
    : r.state === "approved" ? `approved by ${by} — a third person, who approved neither, may run it`
    : counting.length ? `approved by ${by}; ${counting[0].role === "lead" ? "an owner's" : "a lead's"} approval is owed`
    : "no approval yet — a lead's and an owner's, two different people, are owed";
  return `${head} · ${stand}${lapsed.length ? ` · ${lapsed.map((a) => `#${a.id}`).join(", ")} no longer counts (its approver is not a lead or owner any more)` : ""}`;
}
/** What the desk says after a draft and after an approval. Pure. */
export const draftWords = (r: { ref: string; scope: string }, run: string): string =>
  `✓ Drafted ${r.ref} (${r.scope}) from ${run} — it runs once a lead and an owner (two different people) approve it; whoever runs it approved neither.`;
export const approveWords = (r: { ref: string; role: string; approved: boolean; ledger: LedgerRef | null }): string =>
  `Approved ${r.ref} as ${r.role} · ${rowWords(r)} — ${r.approved ? "it is approved: a third person may run it" : `${r.role === "lead" ? "an owner's" : "a lead's"} approval, from another person, is owed`}.`;

/** MA-3d: what Highlight in 3D does with a storey's ghosts and what each loaded model answered for their GlobalIds (null = not in it):
 *  the highlighter's map (modelId → the local ids found) and the words. Pure. */
/** MA-3d: the distinct GlobalIds a storey's ghosts highlight: a retype's or an attach's element. A type edit (set_parameter) is left
 *  out: its GlobalId names an IfcTypeObject, which has no geometry in the loaded model. */
export const guidsOf = (ghosts: Ghost[]): string[] =>
  [...new Set(ghosts.filter((g) => g.op !== "set_parameter").map((g) => g.target?.ifc_guid).filter((g): g is string => typeof g === "string" && g.length > 0))];

export function highlightPlan(ghosts: Ghost[], found: Map<string, (number | null)[]>): { map: Record<string, Set<number>>; guids: string[]; words: string } {
  const guids = guidsOf(ghosts);
  const changes = ghosts.filter((g) => g.op && g.op !== "create" && g.op !== "set_parameter");
  const typeEdits = ghosts.filter((g) => g.op === "set_parameter").length;
  const typeWords = typeEdits ? `; ${typeEdits} type edit(s) are not highlighted (a type has no geometry)` : "";
  const withoutGuid = changes.length - changes.filter((g) => g.target?.ifc_guid).length;
  // MA-5b-4 review: a drawing revision's reshape names its wall by Revit id only (the bridge has no IFC GlobalId for it)
  const reshapes = changes.filter((g) => g.op === "reshape" && !g.target?.ifc_guid).length;
  if (!guids.length) return { map: {}, guids, words: reshapes > 0 && reshapes === withoutGuid
    ? "Nothing to highlight: a drawing revision's reshape names its wall by Revit id, not IFC GlobalId — select it in Revit (Show in the review window)."
    : withoutGuid > 0
    ? "Nothing to highlight: these ghosts were filed before the add-in sent IFC GlobalIds — a new Promote run sends them."
    : typeEdits ? "Nothing to highlight: this storey proposes only creates and type edits (a create has no element yet; a type has no geometry)."
    : "Nothing to highlight: this storey proposes only creates (they have no element in the model yet)." };
  if (!found.size) return { map: {}, guids, words: "Load a model first (Files ▸ Open 3D) — nothing is loaded to highlight in." };
  const map: Record<string, Set<number>> = {};
  const hit = new Set<string>();
  for (const [modelId, ids] of found) ids.forEach((id, i) => { if (id != null) { (map[modelId] ??= new Set()).add(id); hit.add(guids[i]); } });
  const models = [...found.keys()].join(", ");
  const missing = guids.length - hit.size;
  return { map, guids, words: hit.size === 0
    ? `None of the ${guids.length} element(s) is in the loaded model(s) (${models}) — the loaded version may be older than Revit's model; load the newest published version, or Revit may be newer.`
    : `Highlighted ${hit.size} of ${guids.length} element(s) in ${models}` + (missing ? ` — ${missing} not in them: the loaded version may be older than Revit's model (Revit may be newer)` : "") + (withoutGuid > 0 ? `; ${withoutGuid} ghost(s) filed before the add-in sent GlobalIds cannot be highlighted` : "") + typeWords + "." };
}

/** MA-3d2: the words after a storey's proposal models loaded (or not). `shown`: per changeset, the header's counts; `failed`: changesets whose model did not load, each with why. */
export function proposalWords(shown: { creates: number; drawn: number; skipped: string[]; skipped_total?: number }[], failed: string[], noneToShow: boolean): string {
  if (noneToShow && !shown.length && !failed.length) return "Nothing to show: this storey proposes no create (a retype or attach changes an element that exists — Highlight in 3D selects it).";
  const creates = shown.reduce((n, s) => n + s.creates, 0), drawn = shown.reduce((n, s) => n + s.drawn, 0), skipped = shown.flatMap((s) => s.skipped), skippedTotal = shown.reduce((n, s) => n + (s.skipped_total ?? s.skipped.length), 0);
  const head = shown.length ? `Showing ${drawn} of ${creates} proposed create(s) as a proposal model in orange — walls as boxes on their lines, floors, roofs and ceilings as their outlines, doors and windows as their openings' boxes turned to the wall under them (a thickness not sent is sketched at 200 mm, a door with no size in its type name at 915 x 2134, a window at 1000 x 1000 on a 900 sill; a level no element of this changeset stands on sits at elevation 0 here); the executor places the real shapes at Apply. Not part of any published version — Hide creates removes it.` : "";
  const skip = skipped.length ? ` Not drawn: ${skipped.slice(0, 3).join("; ")}${skippedTotal > 3 ? ` (+${skippedTotal - 3} more)` : ""}.` : "";
  const fail = failed.length ? ` Not loaded: ${failed.join("; ")}.` : "";
  return (head + skip + fail).trim();
}

/** The desk: plain DOM, re-read on a project or person change (main.ts → refreshActiveProject) or by its own ↻ Refresh. */
export function reviewDeskPanel(opts: { baseUrl?: string; components?: OBC.Components } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
  const status = document.createElement("div");
  status.style.cssText = "padding:.3rem .6rem;color:#93c5fd";
  root.append(bar, status, body);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", css = ""): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    e.textContent = text;
    e.style.cssText = css;
    return e;
  };
  const btn = (label: string, onClick: () => void) => { const b = el("button", label, "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.35rem;padding:.25rem .55rem;font:600 11px system-ui;cursor:pointer"); b.onclick = onClick; return b; };
  const reason = el("input", "", "flex:1;min-width:10rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui");
  reason.placeholder = "Reason (a decline needs one; one line)";
  const photos = el("input", "", "width:9rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui");
  photos.placeholder = "Photo ev-… (accept only)"; photos.title = "Cited for every ticked ghost in this accept";
  const ticked = new Map<string, { cs: PendingChangeset; el: Ghost }>();
  const say = (text: string, bad = false) => { status.textContent = text; status.style.color = bad ? "#fca5a5" : "#93c5fd"; };
  // MA-3d: Highlight in 3D — a storey's ghosts in the viewer's loaded models, by each element's IFC GlobalId. No model is loaded here:
  // the Files panel's Open 3D loads a version (its model id names the version), and the words say which versions answered.
  const highlight = async (ghosts: Ghost[]) => {
    const comps = opts.components;
    if (!comps) { say("Highlighting needs the viewer — not available on this page.", true); return; }
    const [OBCm, OBF] = await Promise.all([import("@thatopen/components"), import("@thatopen/components-front")]);
    const fragments = comps.get(OBCm.FragmentsManager);
    const highlighter = comps.get(OBF.Highlighter);
    const guids = guidsOf(ghosts);
    const found = new Map<string, (number | null)[]>();
    if (guids.length) for (const model of fragments.list.values()) {
      const m = model as unknown as { modelId: string; getLocalIdsByGuids(g: string[]): Promise<(number | null)[]> };
      try { found.set(m.modelId, await m.getLocalIdsByGuids(guids)); }
      catch (e) { say(`The model "${m.modelId}" could not answer for the GlobalIds — ${(e as Error).message}`, true); return; }
    }
    const plan = highlightPlan(ghosts, found);
    try { if (Object.keys(plan.map).length) await (highlighter as unknown as { highlightByID(n: string, m: Record<string, Set<number>>, a: boolean, b: boolean): Promise<void> }).highlightByID("select", plan.map, true, true); }
    catch (e) { say(`Highlighting failed — ${(e as Error).message}`, true); return; }
    say(plan.words, !Object.keys(plan.map).length);
  };
  const clearHighlight = async () => {
    if (!opts.components) { say("Highlighting needs the viewer — not available on this page.", true); return; }
    try {
      const OBF = await import("@thatopen/components-front");
      await (opts.components?.get(OBF.Highlighter) as unknown as { clear(n: string): Promise<void> } | undefined)?.clear("select");
      say("Highlight cleared.");
    } catch (e) { say(`Clearing failed — ${(e as Error).message}`, true); }
  };
  // MA-3d2: Show creates in 3D — the storey's proposal model (the bridge's .frag of its parts' creates, MA-3d3: one per storey)
  // loaded beside what is loaded, every item orange; Hide creates disposes it. Model ids "proposal:storey:<storey>" — never a version's.
  const proposalId = (storey: string) => `proposal:storey:${storey}`;
  const showCreates = async (storey: DeskStorey) => {
    const comps = opts.components;
    if (!comps) { say("Showing creates needs the viewer — not available on this page.", true); return; }
    // the same dynamic imports as highlight() — the viewer libraries never load under vitest
    const [OBCm, OBF, FRAGS, THREE] = await Promise.all([import("@thatopen/components"), import("@thatopen/components-front"), import("@thatopen/fragments"), import("three")]);
    const fragments = comps.get(OBCm.FragmentsManager) as unknown as { core: { load(buf: ArrayBuffer, o: { modelId: string }): Promise<unknown>; disposeModel(id: string): Promise<void>; models: { list: Map<string, unknown> } } };
    const highlighter = comps.get(OBF.Highlighter) as unknown as { styles: Map<string, unknown>; highlightByID(n: string, m: Record<string, Set<number>>, a: boolean, b: boolean): Promise<void> };
    const withCreates = storey.changesets.filter((cs) => cs.elements.some((e) => (e.op ?? "create") === "create"));
    const shown: { creates: number; drawn: number; skipped: string[]; skipped_total?: number }[] = [], failed: string[] = [];
    if (withCreates.length) {
      try {
        const r = await bfetch(at(base, activePid(), `/proposal.frag?ids=${withCreates.map((cs) => encodeURIComponent(cs.id)).join(",")}`));
        if (!r.ok) failed.push(`${storey.storey}: ${((await r.json().catch(() => ({ message: `HTTP ${r.status}` }))) as { message: string }).message}`);
        else {
          const counts = JSON.parse(r.headers.get("X-Sentinel-Proposal") || '{"creates":0,"drawn":0,"skipped":[]}') as { creates: number; drawn: number; skipped: string[]; skipped_total?: number };
          const buf = await r.arrayBuffer();
          const id = proposalId(storey.storey);
          if (fragments.core.models.list.has(id)) await fragments.core.disposeModel(id);
          await fragments.core.load(buf, { modelId: id });
          const model = fragments.core.models.list.get(id) as { getItemsIdsWithGeometry(): Promise<number[]> } | undefined;
          const ids = model ? await model.getItemsIdsWithGeometry() : [];
          if (!highlighter.styles.has("proposal")) highlighter.styles.set("proposal", { color: new THREE.Color(0xf59e0b), renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 1, transparent: false });
          if (ids.length) await highlighter.highlightByID("proposal", { [id]: new Set(ids) }, false, false);
          shown.push(counts);
        }
      } catch (e) { failed.push(`${storey.storey}: ${(e as Error).message}`); }
    }
    say(proposalWords(shown, failed, withCreates.length === 0), failed.length > 0);
  };
  const hideCreates = async (storey: DeskStorey) => {
    const comps = opts.components; if (!comps) return;
    const OBCm = await import("@thatopen/components");
    const fragments = comps.get(OBCm.FragmentsManager) as unknown as { core: { disposeModel(id: string): Promise<void>; models: { list: Map<string, unknown> } } };
    let n = 0;
    const id = proposalId(storey.storey);
    if (fragments.core.models.list.has(id)) { await fragments.core.disposeModel(id); n++; }
    say(n ? `Hid the storey's proposal model.` : "No proposal model is shown for this storey.");
  };
  let seq = 0;

  // MA-4e: Measure — one press, one run (the service may start cold). MA-8 nits (F-B3-4): shared by a report and an older never-measured changeset.
  const measureBtn = (id: string, label: string): HTMLElement => {
    const go = btn(label, async () => {
      if (go.disabled) return;
      go.disabled = true; go.textContent = "Measuring…";
      try { say(measureLine(await postMeasure(base, activePid(), id))); }
      catch (e) { say(`Not measured — ${(e as Error).message}`, true); }
      void show();
    });
    return go;
  };

  // MA-3b2b: what Revit reported, under the proposed list. Every node is made by el() — textContent, never markup (C13).
  const recent = (decided: PendingChangeset[] | Error, ledger: Map<string, LedgerRows> | Error, role: string, verified: Map<string, VerifyRecord | Error | null>): HTMLElement => {
    const box = el("div", "", "margin-top:.9rem;border-top:1px solid #2a2a30;padding-top:.5rem");
    box.append(el("div", "Recently decided in Revit", "font-weight:600"));
    if (decided instanceof Error) { box.append(el("div", `Reports ${decided.message}`, "color:#fca5a5")); return box; }
    if (!decided.length) { box.append(el("div", "Revit has reported no changeset on this project.", "color:#8b93a1")); return box; }
    box.append(el("div", decidedCount(decided.length), "color:#8b93a1"));
    for (const cs of decided.slice(0, DECIDED_MAX)) {
      const v = decidedView(cs, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null);
      const one = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      one.append(el("summary", v.head, "cursor:pointer"));
      one.append(el("div", v.note ? `Note: ${v.note}` : "No note.", "margin:.3rem 0;color:#8b93a1"));
      if (v.declined.length) one.append(el("div", `Not applied (${v.declined.length}):`, "margin:.3rem 0 .1rem;color:#8b93a1"));
      for (const g of v.declined) {
        const row = el("div", "", "padding:.15rem 0");
        row.append(el("div", g.line), ...g.why.map((w) => el("div", w, "color:#fca5a5")));
        one.append(row);
      }
      // MA-4e: a placed survey changeset's newest measure, and Measure — one press, one run (the service may start cold).
      if (cs.job && !isDrawn(cs)) {
        const mv = verifiedView(cs, verified.get(cs.id) ?? null);
        if (mv) {
          one.append(el("div", mv.head, "margin:.3rem 0 .1rem;color:#8b93a1"));
          for (const m of mv.lines) one.append(el("div", m.line), el("div", m.words, "color:#8b93a1;font-size:11px"));
        }
        if (canMeasure(cs, role, ledger instanceof Error ? ledger : ledger.get(cs.id) ?? null)) {
          one.append(measureBtn(cs.id, mv?.lines.length ? "Measure again" : "Measure against the scan"));
        }
      }
      box.append(one);
    }
    return box;
  };

  // MA-8-5c: the measured changesets the decided list above does not show (older than its newest DECIDED_MAX). textContent only; nothing to say = no box.
  const measuredBox = (data: Awaited<ReturnType<typeof readMeasuredRecent>> | Error, byId: Map<string, PendingChangeset>, decided: PendingChangeset[], role: string): HTMLElement | null => {
    const v = measuredView(data, byId), older = unmeasuredOlder(decided, data);
    if (!v && !older.length) return null;
    const box = el("div", "", "margin-top:.9rem;border-top:1px solid #2a2a30;padding-top:.5rem");
    box.append(el("div", "Measured against the scan", "font-weight:600"));
    // MA-8 nits (F-B3-4): an older placed survey changeset with no measure gets Measure here (the ledger's Undo rows are the bridge's to read: canMeasure with none)
    if (older.length) {
      const capped = !(data instanceof Error) && data.capped;
      box.append(el("div", `Placed as reported, no finished measure (older than the newest ${DECIDED_MAX} reports; an Undo in Revit since is not read here — the bridge refuses an undone one${capped ? `; a measure older than the newest ${MEASURED_MAX} is not seen here` : ""}):`, "color:#8b93a1"));
      for (const cs of older) {
        const row = el("div", "", "display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;padding:.15rem 0");
        row.append(el("span", cs.name || cs.id));
        if (canMeasure(cs, role, null)) row.append(measureBtn(cs.id, "Measure against the scan"));
        box.append(row);
      }
    }
    for (const n of v?.notes ?? []) box.append(el("div", n.text, `color:${n.warn ? "#fca5a5" : "#8b93a1"}`));
    for (const m of v?.items ?? []) {
      const one = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      one.append(el("summary", m.summary, "cursor:pointer"));
      if (m.head) one.append(el("div", m.head, "margin:.3rem 0 .1rem;color:#8b93a1"));
      for (const l of m.lines) one.append(el("div", l.line), el("div", l.words, "color:#8b93a1;font-size:11px"));
      box.append(one);
    }
    return box;
  };

  // MA-8-1: one line per run; a lead gets Publish on a complete one (textContent only).
  const editCostBox = (data: EditCost | Error, role: string, hasOffice = false): HTMLElement => {
    const box = el("div", "", "margin-top:.9rem;border-top:1px solid #2a2a30;padding-top:.5rem");
    box.append(el("div", "Edit cost per run", "font-weight:600"));
    if (data instanceof Error) { box.append(el("div", `Edit cost ${data.message}`, "color:#fca5a5")); return box; }
    if (!data.runs.length) { box.append(el("div", "No run has been filed on this project.", "color:#8b93a1")); return box; }
    for (const r of data.runs) {
      // MA-8 nits (F-B5-1): the run's line on its own row, its controls on a row under it - beside the recipe controls the line was one word wide
      const row = el("div", "", "padding:.2rem 0");
      const controls = el("div", "", "display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin-top:.2rem");
      row.append(el("div", editCostLine(r)));
      if (r.complete && canReopen(role))
        controls.append(btn("Publish", async () => {
          try { say(`Published ${r.label} · ${rowWords(await postEditCostPublish(base, activePid(), r.run))}`); void show(); }
          catch (e) { say(`not published — ${(e as Error).message}`, true); }
        }));
      // MA-8-13 (C15): a job's complete run with something kept can become a recipe - a lead's; the bridge checks that it is verified (textContent only)
      if (r.complete && r.kept >= 1 && /^job#\d+$/.test(r.run) && canReopen(role)) {
        const name = el("input", "", "width:9rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.2rem .4rem;font:11px system-ui");
        name.placeholder = "Recipe name (one line)";
        const scope = hasOffice ? el("select", "", "background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;font:11px system-ui") : null;
        if (scope) for (const [v, w] of [["project", "this project"], ["office", "its office"]]) { const o = el("option", w); o.value = v; scope.append(o); }
        controls.append(name, ...(scope ? [scope] : []), btn("Draft a recipe…", async () => {
          if (!name.value.trim()) return say("Name the recipe first (one line).", true);
          try { say(draftWords(await postRecipeDraft(base, activePid(), r.run, name.value.trim(), (scope?.value as "project" | "office" | undefined) ?? "project"), r.run)); void show(); }
          catch (e) { say(`not drafted — ${(e as Error).message}`, true); }
        }));
      }
      if (controls.childElementCount) row.append(controls);
      box.append(row);
    }
    return box;
  };

  // MA-8-13 (D13): the registry under the edit cost - Approve (a lead or owner; the bridge counts two people of the two roles), Withdraw, and Run on the evidence pack
  // for a contributor once approved (the bridge refuses a runner who approved it). textContent only.
  const recipesBox = (data: RecipeList | Error, role: string): HTMLElement => {
    const box = el("div", "", "margin-top:.9rem;border-top:1px solid #2a2a30;padding-top:.5rem");
    box.append(el("div", "Recipes", "font-weight:600"));
    if (data instanceof Error) { box.append(el("div", `Recipes ${data.message}`, "color:#fca5a5")); return box; }
    const all = [...data.project, ...(data.office?.recipes ?? [])];
    if (!all.length) { box.append(el("div", "No recipe yet — a lead drafts one from a complete run above (Draft a recipe…).", "color:#8b93a1")); return box; }
    for (const r of all) {
      const row = el("div", "", "display:flex;gap:.4rem;align-items:flex-start;padding:.2rem 0");
      row.append(el("div", recipeLine(r), "flex:1"));
      const live = r.state === "pending" || r.state === "approved";
      if (live && canReopen(role) && r.state === "pending")
        row.append(btn("Approve", async () => {
          try { say(approveWords(await postRecipeApprove(base, activePid(), r))); void show(); }
          catch (e) { say(`not approved — ${(e as Error).message}`, true); }
        }));
      if (live && canReopen(role))
        row.append(btn("Withdraw", async () => {
          try { say(`Withdrew ${r.ref} · ${rowWords(await postRecipeWithdraw(base, activePid(), r))} — it runs no more.`); void show(); }
          catch (e) { say(`not withdrawn — ${(e as Error).message}`, true); }
        }));
      if (r.state === "approved" && canDecide(role))
        row.append(btn("Run on the evidence pack", async () => {
          try { const j = (await startRecipe(base, activePid(), { version: r.version, scope: r.scope })).job as SurveyJob; say(`✓ Started ${jobLine(j)} — Files ▸ Evidence ↻ shows its progress.`); }
          catch (e) { say(`not started — ${(e as Error).message}`, true); }
        }));
      box.append(row);
    }
    return box;
  };

  const decide = async (decision: "accept" | "decline") => {
    // One post per changeset (all or none on the bridge); a ghost already accepted (or declined) is not sent again (C6).
    const { posts, already } = postsFor(ticked, decision);
    const skipped = already ? `${already} already ${decision === "accept" ? "accepted" : "declined"} — not sent` : "";
    if (!posts.size) return say(skipped ? skipped + "." : "Tick a ghost first.", true);
    const done: string[] = [];
    try {
      for (const [id, guids] of posts) done.push(`${guids.length} ${decision === "accept" ? "accepted" : "declined"} · ${rowWords(await postReview(base, activePid(), id, decision, guids, reason.value, decision === "accept" ? citesOf(photos.value) : []))}`);
      reason.value = ""; if (decision === "accept") photos.value = "";
      say([...done, ...(skipped ? [skipped] : [])].join("; ") + (decision === "decline" ? " — Revit now shows them unticked with the reason and refuses the tick." : " — advice: Revit still asks for the tick."));
    } catch (e) { say(`${done.length ? done.join("; ") + "; then " : ""}not recorded — ${(e as Error).message}`, true); }
    void show();
  };

  async function show(): Promise<void> {
    const mine = ++seq, key = activePid();
    ticked.clear();
    body.replaceChildren(el("div", "Reading…"));
    const [role, pending, decided] = await Promise.all([myRoleRead(base, key), readPending(base, key).catch((e: Error) => e), readDecided(base, key).catch((e: Error) => e)]);
    if (mine !== seq) return;
    // MA-3b2b: the ledger rows of the reports shown — a read of its own, so a ledger that cannot be read is said on each report.
    const ledger = decided instanceof Error ? new Map<string, LedgerRows>() : await readLedger(base, key, decided.slice(0, DECIDED_MAX).map((c) => c.id)).catch((e: Error) => e);
    if (mine !== seq) return;
    const cost = await readEditCost(base, key).catch((e: Error) => e); // MA-8-1: a read of its own; a failure is said in its section
    const recipes = await readRecipes(base, key).catch((e: Error) => e); // MA-8-13: likewise
    if (mine !== seq) return;
    // MA-4e: the newest measure of each placed survey changeset shown — one read each; a failed one is said under its own report, never a guess.
    const shownMeasured = new Set(decided instanceof Error ? [] : decided.slice(0, DECIDED_MAX).filter((c) => c.job && !isDrawn(c)).map((c) => c.id));
    // MA-8-5c: a read of its own, started beside the per-report reads; a failure is said in its section
    const measuredP = readMeasuredRecent(base, key, shownMeasured).catch((e: Error) => e);
    const verified = decided instanceof Error ? new Map<string, VerifyRecord | Error | null>() : await readVerified(base, key, decided.slice(0, DECIDED_MAX).filter((c) => c.job && !isDrawn(c)).map((c) => c.id));
    const measuredAll = await measuredP;
    if (mine !== seq) return;
    // Review C4: built once, and a throw in it is said — it never leaves the desk at "Reading…" or takes the proposed list with it.
    let tail: HTMLElement;
    try { tail = recent(decided, ledger, role.role, verified); } catch (e) { tail = el("div", `Reports not shown — ${(e as Error).message}`, "color:#fca5a5"); }
    try { const mb = measuredBox(measuredAll, new Map(decided instanceof Error ? [] : decided.map((c) => [c.id, c])), decided instanceof Error ? [] : decided, role.role); if (mb) tail.append(mb); } catch (e) { tail.append(el("div", `Measures not shown — ${(e as Error).message}`, "color:#fca5a5")); }
    try { tail.append(editCostBox(cost, role.role, !(recipes instanceof Error) && recipes.office != null)); } catch (e) { tail.append(el("div", `Edit cost not shown — ${(e as Error).message}`, "color:#fca5a5")); }
    try { tail.append(recipesBox(recipes, role.role)); } catch (e) { tail.append(el("div", `Recipes not shown — ${(e as Error).message}`, "color:#fca5a5")); }
    bar.replaceChildren(el("b", `Review desk · ${key}`), el("span", roleWords(role), "color:#8b93a1"), btn("↻ Refresh", () => void show()));
    if (canDecide(role.role)) bar.append(reason, photos, btn("Accept ticked", () => void decide("accept")), btn("Decline ticked", () => void decide("decline")));
    else bar.append(el("span", role.role === "service" ? "· sign in to accept or decline — the machine credential never reviews" : "· read-only: accepting or declining needs contributor", "color:#fbbf24"));
    if (pending instanceof Error) { body.replaceChildren(el("div", `Proposals ${pending.message}`, "color:#fca5a5"), tail); return; }
    if (!pending.length) { body.replaceChildren(el("div", "Nothing waits for review in Revit on this project."), tail); return; }
    body.replaceChildren(el("div", "A decline binds: Revit shows the ghost unticked with your reason and refuses the tick. An accept is advice. A changeset stays proposed until Revit applies or declines it — a decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason); a lead re-opens it here while its changeset is still proposed.", "color:#8b93a1;margin-bottom:.5rem"));
    for (const s of groupDesk(pending)) {
      const box = el("details", "", "margin:.4rem 0;border:1px solid #2a2a30;border-radius:.35rem;padding:.3rem .5rem");
      box.open = true;
      box.append(el("summary", `${s.storey} — ${s.groups.reduce((n, g) => n + g.ghosts.length, 0)} ghost(s) in ${s.changesets.length} changeset(s)`, "cursor:pointer;font-weight:600"));
      const hrow = el("div", "", "display:flex;gap:.4rem;margin:.2rem 0");
      hrow.append(btn("Highlight in 3D", () => void highlight(s.groups.flatMap((g) => g.ghosts.map((x) => x.el)))), btn("Clear", () => void clearHighlight()), btn("Show creates in 3D", () => void showCreates(s)), btn("Hide creates", () => void hideCreates(s)));
      box.append(hrow);
      // MA-4d: a survey changeset's job, frame and storey level (textContent: nothing here is HTML).
      for (const cs of s.changesets) { const w = sourceWords(cs); if (w) box.append(el("div", w, "color:#8b93a1;font-size:11px")); }
      for (const g of s.groups) {
        box.append(el("div", `${g.what} (${g.ghosts.length})`, "margin:.4rem 0 .2rem;color:#8b93a1"));
        for (const x of g.ghosts) {
          const row = el("div", "", "display:flex;gap:.4rem;align-items:flex-start;padding:.15rem 0");
          const tick = el("input");
          tick.type = "checkbox";
          tick.disabled = !canDecide(role.role) || x.el.review?.state === "declined";
          tick.onchange = () => { if (tick.checked) ticked.set(x.el.proposal_guid, x); else ticked.delete(x.el.proposal_guid); };
          const words = el("div", "");
          words.append(el("div", ghostLine(x.el)), el("div", reviewWords(x.el), `color:${x.el.review?.state === "declined" ? "#fca5a5" : x.el.review?.state === "accepted" ? "#86efac" : "#8b93a1"}`));
          const tw = trustWords(x.el, x.cs.job?.evidence?.[0]?.provider != null && x.cs.job.evidence[0].provider !== "own"); if (tw) words.append(el("div", tw, "color:#8b93a1;font-size:11px"));
          row.append(tick, words);
          if (x.el.review?.state === "declined" && canReopen(role.role))
            row.append(btn("Re-open", async () => {
              try { say(`Re-opened · ${rowWords(await postReopen(base, key, x.cs.id, x.el.proposal_guid, reason.value))} — Revit may tick it again.`); reason.value = ""; }
              catch (e) { say(`not recorded — ${(e as Error).message}`, true); }
              void show();
            }));
          box.append(row);
        }
      }
      // MA-5b-3: each changeset's review rows — held for a person, never ticked (textContent: a reason is the bridge's words over drawn text)
      for (const cs of s.changesets) {
        const lines = heldLines(cs);
        if (!lines.length) continue;
        const held = el("details", "", "margin:.4rem 0 .1rem");
        held.append(el("summary", `Held for a person in ${cs.name} (${cs.exceptions!.length})`, "cursor:pointer;color:#fbbf24"));
        for (const l of lines) held.append(el("div", l, "color:#8b93a1;font-size:11px;padding:.05rem 0 .05rem .8rem"));
        box.append(held);
      }
      body.append(box);
    }
    body.append(tail);
  }
  onActiveProjectChange(() => void show());
  void show();
  return root;
}
