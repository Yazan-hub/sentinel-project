// One access decision for every document writer (R1a). R2c adds per-document overrides (`doc.access`) inside requireDocAccess,
// and no caller changes. `doc` is null for a create.
//   doc.access = { members: { <user_id>: "read"|"comment"|"edit" }, teams: { <TEAM CODE>: "read"|"comment"|"edit" } }
// A member entry beats a team entry. Overrides apply to viewers and contributors only: leads and owners govern (a lead cannot be locked
// out of a document). With no override, a viewer comments and a contributor edits. Reads never go below the viewer right.
import { requireMinRole, myMembership } from "./members-store.mjs";
import { currentSub } from "./bridge-auth.mjs";

export const LEVEL_ROLE = { read: "viewer", comment: "viewer", edit: "contributor", govern: "lead" };
/** The delivery parties: the Lead firm and the Firms (everyone but the Client). */
export const DELIVERY = ["lead_appointed", "appointed"];
export const ACCESS_LEVELS = ["read", "comment", "edit"];
const RANK = { read: 1, comment: 2, edit: 3, govern: 4 };
const ROLE_RANK = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
export const LEVEL_WORDS = { read: "can read", comment: "can comment", edit: "can edit" };

const err = (status, message) => Object.assign(new Error(message), { status });
const own = (o, k) => (o && typeof o === "object" && Object.hasOwn(o, k) ? o[k] : undefined);

/** What a stored override says for one person: a valid member entry, else a valid entry for their task team (case-insensitive), else null. */
function overrideFor(access, uid, team) {
  const m = own(access?.members, uid);
  if (ACCESS_LEVELS.includes(m)) return m;
  if (team && access?.teams && typeof access.teams === "object") {
    const code = Object.keys(access.teams).find((c) => c.toLowerCase() === String(team).toLowerCase());
    if (code && ACCESS_LEVELS.includes(access.teams[code])) return access.teams[code];
  }
  return null;
}

/** → "read"|"comment"|"edit"|"govern" for a member of project role `role` on a document with override `access`. Pure. */
export function effectiveLevel(role, access, uid, team) {
  const rank = ROLE_RANK[role] || 0;
  if (rank >= ROLE_RANK.lead) return "govern";
  const o = overrideFor(access, uid, team);
  if (o) return o;
  return rank >= ROLE_RANK.contributor ? "edit" : "comment";
}

const hasOverride = (a) => !!a && typeof a === "object" && (Object.keys(a.members || {}).length > 0 || Object.keys(a.teams || {}).length > 0);

/** Throws 403 (in words) when the caller's level on this document is below `level`; resolves to the caller's project role.
 *  deps (tests): requireMinRole, myMembership, currentSub. */
export async function requireDocAccess(key, doc, level, deps = {}) {
  const role = LEVEL_ROLE[level];
  if (!role) throw err(500, `unknown access level '${level}'`);
  const need = deps.requireMinRole || requireMinRole;
  if (level === "govern" || !doc || !hasOverride(doc.access)) return need(key, role);
  const me = await (deps.myMembership || myMembership)(key);
  if (me.role === "service") return "service";
  if (!me.role) return need(key, "viewer"); // not a member: the project-role refusal in its own words
  const eff = effectiveLevel(me.role, doc.access, (deps.currentSub || currentSub)(), me.task_team);
  if (RANK[eff] < RANK[level])
    throw err(403, `On this document you can ${eff}, not ${level}. A lead sets document access in the workspace, People.`);
  return me.role;
}

/** A lead's access body checked against the project: → the normalised { members, teams } (team codes in their declared case).
 *  members: [{user_id, role}] rows; teams: the declared task-team codes. 400 in words. */
export function validateAccess(access, members, teams) {
  if (!access || typeof access !== "object" || Array.isArray(access)) throw err(400, "document access must be a list of people and teams with a level each");
  const out = { members: {}, teams: {} };
  const level = (v, who) => { if (!ACCESS_LEVELS.includes(v)) throw err(400, `${who}: pick can read, can comment or can edit`); return v; };
  for (const [uid, v] of Object.entries(access.members ?? {})) {
    const m = (members || []).find((x) => x.user_id === uid);
    if (!m) throw err(400, "someone in this list is not a member of the project — nothing was saved");
    if ((ROLE_RANK[m.role] || 0) >= ROLE_RANK.lead) throw err(400, "Leads and owners govern every document, so they are not given a level — nothing was saved");
    out.members[uid] = level(v, "a person");
  }
  for (const [code, v] of Object.entries(access.teams ?? {})) {
    const found = (teams || []).find((c) => String(c).toLowerCase() === String(code).toLowerCase());
    if (!found) throw err(400, `${code} is not a task team of this project — declare it under Deliverables, Task teams, first`);
    out.teams[found] = level(v, `team ${found}`);
  }
  return out;
}
