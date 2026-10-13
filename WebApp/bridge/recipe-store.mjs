// MA-8-13 (C15, D13) — the recipe registry: a `recipe@n` artefact is the method of one VERIFIED run, so another person can repeat it on
// other evidence. Drafting checks that the run is a real, reviewed, kept one; approving takes two people (a lead and an owner, different
// people, the machine credential never); running takes a third who approved neither. Bridge-enforced, no migration: artefact docs are the
// bridge's writes since 0030, `recipe:approved` ledger rows (entity_type recipe) are written only here (cde-store reserves the prefix), and
// the run re-reads them — and the memberships — every time. A recipe is NOT a standard in force: it is listed on the review desk and in the
// audit pack's ledger part, never in Settings' Standards rows.
// Deps are injected (the changesets-store idiom); build-jobs, changesets-store and the planners are lazy imports (build-jobs imports this lazily).
import { canonicalSha256 } from "./canonical.mjs";
import * as cde from "./cde-store.mjs";
import * as members from "./members-store.mjs";
import * as art from "./artefact-store.mjs";
import { currentSub } from "./bridge-auth.mjs";
import { RECIPE_READERS, MAX_PLANNER_ROWS, validateRecipe, approvalState, notApprovedWords, editCostNumbers, sameJson } from "./recipe-logic.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });
const enc = encodeURIComponent;
const LEDGER_READ = 1000; // ponytail: 1000 recipe ledger rows a project or office; past it the read fails closed (503), never counts a partial list
const SAVED = (m) => (/nothing was saved/i.test(m) ? m : `${m} — nothing was saved`);

const wire = (deps = {}) => ({
  myRole: deps.myRole || members.myRole,
  sub: deps.sub !== undefined ? () => deps.sub : currentSub,
  ensureProject: deps.ensureProject || cde.ensureProject,
  sb: deps.sb || cde.sb,
  audit: deps.audit || cde.audit,
  auditAll: deps.auditAll || cde.auditAll,
  getAuditEntry: deps.getAuditEntry || cde.getAuditEntry,
  takeWriteBudget: deps.takeWriteBudget || cde.takeWriteBudget,
  resolveArtefact: deps.resolveArtefact || art.resolveArtefact,
  fold: deps.fold || art.foldArtefact,
  officeKeyOf: deps.officeKeyOf || (async (k) => (await import("./office-scope.mjs")).officeKeyOf(k)),
  // the recipe doc {...pointer, body} of `scope`'s key: the newest, or one version
  read: deps.read || ((scope, key, version) => scope === "office" ? art.officeArtefactAsService(key, "recipe", version)
    : version === undefined ? art.getArtefact(key, "recipe") : art.getArtefactVersion(key, "recipe", version)),
  trustedJob: deps.trustedJob || (async (...a) => (await import("./build-jobs.mjs")).trustedJob(...a)),
  editCostOf: deps.editCostOf || (async (...a) => (await import("./changesets-store.mjs")).editCostOf(...a)),
  // → {planner: this bridge's planner version for the reader, reader: its version when known before a run (sentinel-ifc runs in this process)}
  versions: deps.versions || (async (reader) => {
    const m = await import(reader === "sentinel-survey" ? "./survey-plan.mjs" : reader === "sentinel-drawing" ? "./drawing-plan.mjs" : "./ifc-plan.mjs");
    return { planner: m.PLANNER_VERSION, reader: reader === "sentinel-ifc" ? (await import("./ifc-geometry.mjs")).VERSION : null };
  }),
});

const drafting = new Set(), approving = new Set(); // one draft per key, one approval per recipe at a time

/** A signed-in person with at least `min` on `key` — the machine credential never (D13: a recipe's rows name the people who stood behind it). → the role. */
async function person(d, key, min, what, verb) {
  const role = await d.myRole(key);
  if (role === "service") throw err(403, `${what} is a signed-in person's — the machine credential, the MCP agent and scripts never ${verb}; nothing was saved`);
  if (!role || (members.ROLE_RANK[role] || 0) < members.ROLE_RANK[min]) throw err(403, `${what} requires the ${min} role on ${key} (you are ${role || "not a member"}) — nothing was saved`);
  return role;
}

/** The key a recipe of `scope` lives on, and its project id: "office" → the office of `key` (400 when it has none). */
async function locate(d, key, scope) {
  if (scope !== "project" && scope !== "office") throw err(400, 'scope must be "project" or "office" — nothing was saved');
  let at = key;
  if (scope === "office") {
    at = await d.officeKeyOf(key);
    if (!at) throw err(400, `${key} belongs to no office — an office recipe is drafted from an office project's run; nothing was saved`);
  }
  const pid = scope === "project" ? (await d.ensureProject(key)).id : (await d.sb(`projects?key=eq.${enc(at)}&select=id`, { service: true }))?.[0]?.id;
  if (!pid) throw err(404, `no project ${at} — nothing was saved`);
  return { scope, key: at, pid };
}

/** The recipe ledger rows of a project or office (approvals and withdrawals), oldest first — one read, filtered in JS (approvalState). */
async function recipeRows(d, pid) {
  const rows = (await d.sb(`audit_log?project_id=eq.${enc(pid)}&entity_type=eq.recipe&order=id.asc&limit=${LEDGER_READ}`, { service: true })) || [];
  if (rows.length >= LEDGER_READ) throw err(503, `more than ${LEDGER_READ} recipe ledger rows — they cannot all be counted, so none is trusted; nothing was saved`);
  return rows;
}
/** user_id → the role they hold NOW on the project or office (the run's re-read, D13 amendment 1). */
async function holdersOf(d, pid) {
  const rows = (await d.sb(`memberships?project_id=eq.${enc(pid)}&select=user_id,role`, { service: true })) || [];
  return Object.fromEntries(rows.map((m) => [m.user_id, m.role]));
}

const refOf = (n) => `recipe@${n}`;
const versionOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 1e6 ? v : null);

/** The stored doc of `recipe@n`, its body re-hashed (never the pointer's copy). → {doc, sha}, or a 404 / 409 in words. */
async function stored(d, scope, at, n) {
  const doc = await d.read(scope, at, n);
  if (!doc) throw err(404, `no ${refOf(n)} on ${at} — nothing was saved`);
  const sha = canonicalSha256(doc.body);
  if (sha !== doc.sha256) throw err(409, `${refOf(n)} on ${at} is not the body it was installed with (its hash differs) — it is not trusted; nothing was saved`);
  return { doc, sha };
}

/** GET /cde/:key/recipes → {project: [row], office: {key, recipes} | null}, any member. A row: {ref, version, scope, key, sha256, body,
 *  installed_by, installed_at, state, approved, approvals: [{id, hash, role, user_id, by, at, counts}], why}. The newest 20 versions of each. */
export async function listRecipes(key, deps) {
  const d = wire(deps);
  await (deps?.requireMinRole || members.requireMinRole)(key, "viewer");
  const one = async (scope, at) => {
    const pid = scope === "project" ? (await d.ensureProject(at)).id : (await d.sb(`projects?key=eq.${enc(at)}&select=id`, { service: true }))?.[0]?.id;
    const newest = await d.read(scope, at);
    if (!pid || !newest) return [];
    const [rows, holders] = await Promise.all([recipeRows(d, pid), holdersOf(d, pid)]);
    const out = [];
    for (let n = newest.version; n >= 1 && out.length < 20; n--) {
      const doc = n === newest.version ? newest : await d.read(scope, at, n);
      if (!doc) continue;
      const sha = canonicalSha256(doc.body), ref = refOf(n);
      const st = approvalState(rows, ref, sha, holders);
      out.push({ ref, version: n, scope, key: at, sha256: sha, intact: sha === doc.sha256, body: doc.body, installed_by: doc.installed_by ?? null, installed_at: doc.installed_at ?? null,
        state: doc.sha256 === sha ? st.state : "untrusted", approved: st.approved && doc.sha256 === sha,
        approvals: st.valid.map((r) => ({ id: r.id, hash: r.hash ?? null, role: r.new_value.role, user_id: r.new_value.user_id, by: r.actor ?? null, at: r.at ?? null, counts: st.counting.includes(r) })),
        withdrawn: st.withdrawn ? { id: st.withdrawn.id, by: st.withdrawn.actor ?? null, at: st.withdrawn.at ?? null } : null,
        why: doc.sha256 !== sha ? "its body does not hash to the sha256 it was installed with" : notApprovedWords(ref, at, st) });
    }
    return out;
  };
  const officeKey = await d.officeKeyOf(key);
  return { project: await one("project", key), office: officeKey ? { key: officeKey, recipes: await one("office", officeKey) } : null };
}

/** POST /cde/:key/recipes {run, name, scope?} → 201: a lead drafts `recipe@n` from a verified run. Verified (D-B5-2): the reader's row is the
 *  job's own (trustedJob) and is run `run`; its planner rows (claimed false) all ran on ONE set of standards; its edit cost is published and
 *  still the numbers recomputed now; something in it is kept. Refusals end "nothing was saved". */
export async function draftRecipe(key, b, actor, deps) {
  const d = wire(deps);
  await person(d, key, "lead", "drafting a recipe", "draft");
  if (!b || typeof b !== "object" || Array.isArray(b)) throw err(400, "the body is {run, name, scope?} — nothing was saved");
  const { run, name, scope = "project" } = b;
  if (typeof run !== "string" || !/^job#\d+$/.test(run)) throw err(400, "only a job's run is a recipe — a Promote or agent changeset has no reader to repeat; nothing was saved");
  if (typeof name !== "string" || name.trim() === "" || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw err(400, "name must be one line of 1 to 80 characters — nothing was saved");
  const at = await locate(d, key, scope);
  if (scope === "office") {
    try { await person(d, at.key, "lead", "drafting an office recipe", "draft"); }
    catch (e) { if (e.status !== 403 && e.status !== 404) throw e; throw err(403, `drafting an office recipe needs the lead role on ${at.key} — nothing was saved`); } // a stranger and a contributor are told alike; an outage is not a missing role
  }
  d.takeWriteBudget("recipes", { perUser: 10, all: 30 });
  if (drafting.has(at.key)) throw err(409, `a recipe is being drafted on ${at.key} — try again when it ends; nothing was saved`);
  drafting.add(at.key); // taken and checked with no await between
  try {
    const verified = await verifyRun(d, key, run);
    const prev = await d.read(scope, at.key);
    const body = { name: name.trim(), reader: verified.reader, params: verified.params, planner: verified.planner, standards: verified.standards, verified: verified.record };
    if (prev && sameJson(prev.body, body)) throw err(409, `${refOf(prev.version)} is this run already — nothing was saved`);
    let p;
    try { validateRecipe(body); p = await d.fold(at.key, "recipe", body, { actor, expectVersion: prev?.version || 0 }); }
    catch (e) { throw err(e.status ?? 400, SAVED(e.message)); }
    return { ref: refOf(p.version), version: p.version, scope, key: at.key, sha256: p.sha256, installed_by: p.installed_by, installed_at: p.installed_at, body };
  } finally { drafting.delete(at.key); }
}

/** The four checks of "verified" for `run` on `key` → the recipe's parts, or a 404/409 in words. */
async function verifyRun(d, key, run) {
  const L = Number(run.slice(4));
  const unsaved = (e) => { throw err(e.status ?? 503, SAVED(e.message)); };
  // 1. the reader row: the job's own build:run row, trusted (hash-chained row, `· done`, claimed false, result.json re-hashed)
  const entry = await d.getAuditEntry(key, L);
  const jobId = entry?.new_value?.job_id;
  if (!entry || entry.entity_type !== "build" || typeof jobId !== "string" || !String(entry.action).startsWith(`build:run ${jobId} · `))
    throw err(404, `ledger #${L} on ${key} is not a job's build:run row — a recipe repeats a job's run; nothing was saved`);
  const tj = await d.trustedJob(key, jobId).catch(unsaved);
  if (tj.row.ledger.id !== L) throw err(409, `${jobId} on this PC is ledger #${tj.row.ledger.id}, not the run's #${L} — nothing was saved`);
  const reader = tj.row.reader, [planner, rowKey] = RECIPE_READERS[reader] ?? [];
  if (!planner) throw err(409, `${jobId} was read by ${reader}, which has no recipe — nothing was saved`);
  // 2. the planner rows: every Propose of this run, on one set of standards
  let rows;
  try { rows = await d.auditAll(key, { entity_type: "build", action_prefix: `build:run ${jobId} · ` }); } catch (e) { unsaved(e); }
  const proposed = rows.filter((r) => String(r.action).endsWith(" · proposed") && r.new_value?.claimed === false && r.new_value?.planner === planner && r.new_value?.[rowKey]?.id === L)
    .sort((a, b) => a.id - b.id);
  if (!proposed.length) throw err(409, `job#${L} was never proposed — a recipe repeats a run whose changesets were reviewed; nothing was saved`);
  // MA-7-9: a person's choice by photo is not repeated by a recipe - the photo is that person's, from this run
  if (proposed.some((r) => r.new_value?.materials?.length)) throw err(409, "a recipe does not repeat a person's choice by photo - run the job and choose by photo again; nothing was saved");
  const sets = new Map();
  for (const r of proposed) { const v = r.new_value, k = [v.planner, v.version, v.guideline_sha256, v.catalog_sha256].join("|"); if (!sets.has(k)) sets.set(k, r); }
  if (sets.size > 1) throw err(409, `job#${L} was proposed under two sets of standards (${[...sets.values()].map((r) => `#${r.id}`).join(", ")}) — it is not one recipe; nothing was saved`);
  if (proposed.length > MAX_PLANNER_ROWS) throw err(409, `job#${L} was proposed ${proposed.length} times — a recipe names at most ${MAX_PLANNER_ROWS} of its Proposes; nothing was saved`);
  const pv = proposed[0].new_value;
  // 3. the edit cost: published, and still true now
  let published;
  try { published = (await d.auditAll(key, { entity_type: "edit_cost", action_prefix: "edit_cost:published" })).filter((r) => r.new_value?.run === run).sort((a, b) => b.id - a.id)[0]; }
  catch (e) { unsaved(e); }
  if (!published) throw err(409, `${run}'s edit cost is not published — a lead publishes it on the review desk (Edit cost per run) first; nothing was saved`);
  const r = (await d.editCostOf(key).catch(unsaved)).runs.find((x) => x.run === run);
  if (!r || !r.complete) throw err(409, `${run} is still being reviewed — publish its edit cost when every changeset of it is decided; nothing was saved`);
  const numbers = editCostNumbers(r);
  if (!sameJson(published.new_value.numbers, numbers) || !sameJson(published.new_value.rests_on, r.rests_on))
    throw err(409, `the edit cost changed since ledger #${published.id} was published (an Undo or a decision) — publish it again, then draft; nothing was saved`);
  // 4. something is kept
  if (!(r.kept >= 1)) throw err(409, `nothing ${run} filed is kept in a model — a recipe repeats a run someone kept; nothing was saved`);
  const hashOf = (row) => ({ id: row.id, hash: row.hash ?? null });
  return {
    reader: { name: reader, version: tj.row.version }, params: tj.row.params ?? {}, planner: { name: planner, version: pv.version },
    standards: { guideline: { label: pv.guideline, sha256: pv.guideline_sha256 }, type_catalog: { label: pv.catalog, sha256: pv.catalog_sha256 } },
    record: { project: key, run, job_id: jobId, reader_row: { id: tj.row.ledger.id, hash: tj.row.ledger.hash ?? null }, planner_rows: proposed.map(hashOf), edit_cost_row: hashOf(published), edit_cost: numbers },
  };
}

/** The target of an approve or withdraw: who may (a lead or owner OF the key the recipe lives on), the version and its sha, as the caller read it. */
async function target(d, key, n, b, what, verb) {
  const scope = b?.scope ?? "project";
  const at = await locate(d, key, scope);
  const role = await person(d, at.key, "lead", what, verb);
  const v = versionOf(Number(n));
  if (!v) throw err(400, "a recipe version is a whole number from 1 — nothing was saved");
  if (typeof b?.sha256 !== "string") throw err(400, "the body is {sha256, scope?} — the sha256 of the recipe you read; nothing was saved");
  const { doc, sha } = await stored(d, scope, at.key, v);
  if (sha !== b.sha256) throw err(409, `${refOf(v)} is not the body you read — read it again; nothing was saved`);
  return { ...at, role, ref: refOf(v), body: doc.body, sha };
}

/** POST /cde/:key/recipes/:n/approve {sha256, scope?} → 201: a signed-in lead or owner of the key the recipe lives on states they stand behind it (D13).
 *  The row's role is the role they hold now; the second approval must be another person AND the other role. */
export async function approveRecipe(key, n, b, actor, deps) {
  const d = wire(deps);
  const t = await target(d, key, n, b, "approving a recipe", "approve");
  d.takeWriteBudget("recipe approvals", { perUser: 10, all: 30 });
  const lock = `${t.pid}:${t.ref}`;
  if (approving.has(lock)) throw err(409, `${t.ref} is being approved — try again when it ends; nothing was saved`);
  approving.add(lock);
  try {
    const sub = d.sub();
    const [rows, holders] = await Promise.all([recipeRows(d, t.pid), holdersOf(d, t.pid)]);
    const st = approvalState(rows, t.ref, t.sha, holders);
    if (st.state === "withdrawn") throw err(409, `${t.ref} was withdrawn (ledger #${st.withdrawn.id}) — nothing was saved`);
    const mine = st.valid.find((r) => r.new_value.user_id === sub);
    if (mine) throw err(409, `you approved ${t.ref} already (ledger #${mine.id}) — the second approval is another person's; nothing was saved`);
    if (st.approved) throw err(409, `${t.ref} is approved already (#${st.lead.id}, #${st.owner.id}) — nothing was saved`);
    const other = st.counting[0];
    if (other && other.new_value.role === t.role)
      throw err(409, `${t.ref}'s approval #${other.id} is ${t.role === "lead" ? "a lead's" : "an owner's"} — the second must be ${t.role === "lead" ? "an owner's" : "a lead's"}: a lead and an owner, two different people (D13); nothing was saved`);
    const row = await d.audit(t.pid, "recipe", null, `recipe:approved ${t.ref} · ${t.role}`, actor || "web", null,
      { ref: t.ref, sha256: t.sha, scope: t.scope, user_id: sub, role: t.role, run: t.body.verified?.run ?? null, name: t.body.name ?? null });
    return { ref: t.ref, scope: t.scope, role: t.role, approved: !!other, ledger: { id: row?.id ?? null, hash: row?.hash ?? null } };
  } finally { approving.delete(lock); }
}

/** POST /cde/:key/recipes/:n/withdraw {sha256, scope?} → 201: a lead or owner retires a version for good — its approvals no longer run it (a new
 *  draft is a new version). The version stays in the registry and in the ledger. */
export async function withdrawRecipe(key, n, b, actor, deps) {
  const d = wire(deps);
  const t = await target(d, key, n, b, "withdrawing a recipe", "withdraw");
  d.takeWriteBudget("recipe approvals", { perUser: 10, all: 30 });
  const lock = `${t.pid}:${t.ref}`;
  if (approving.has(lock)) throw err(409, `${t.ref} is being approved or withdrawn — try again when it ends; nothing was saved`);
  approving.add(lock);
  try {
    const st = approvalState(await recipeRows(d, t.pid), t.ref, t.sha);
    if (st.withdrawn) throw err(409, `${t.ref} was withdrawn already (ledger #${st.withdrawn.id}) — nothing was saved`);
    const row = await d.audit(t.pid, "recipe", null, `recipe:withdrawn ${t.ref}`, actor || "web", null,
      { ref: t.ref, sha256: t.sha, scope: t.scope, user_id: d.sub(), role: t.role, run: t.body.verified?.run ?? null, name: t.body.name ?? null });
    return { ref: t.ref, scope: t.scope, withdrawn: true, ledger: { id: row?.id ?? null, hash: row?.hash ?? null } };
  } finally { approving.delete(lock); }
}

/** The recipe still fits this bridge and this project: the planner is the version it was verified with (and a sentinel-ifc reader, known
 *  before a run, too), and the guideline and type catalogue in force are the sha256 it ran on. A 409 in words, else null. Shared by the run
 *  and by Propose from a recipe job (they can change between the two). */
async function holds(d, key, ref, body) {
  const v = await d.versions(body.reader.name);
  if (v.planner !== body.planner.version)
    throw err(409, `${ref} was verified with ${body.planner.name} ${body.planner.version}; this bridge plans with ${v.planner} — draft a new recipe from a run on this bridge; nothing was saved`);
  if (v.reader && v.reader !== body.reader.version)
    throw err(409, `${ref} was verified with ${body.reader.name} ${body.reader.version}; this bridge reads with ${v.reader} — draft a new recipe from a run on this bridge; nothing was saved`);
  for (const kind of ["guideline", "type_catalog"]) {
    const now = await d.resolveArtefact(key, kind);
    if (now.sha256 !== body.standards[kind].sha256)
      throw err(409, `the ${kind} in force on ${key} (${now.ref ? art.refLabel(now) : "none"}) is not the one ${ref} ran on (${body.standards[kind].label}); nothing was saved`);
  }
}

/** What startJob asks before a recipe run, in this order (every refusal ends "nothing was saved"): the machine credential 403; the version 404 / 409;
 *  the runner approved it 403 (before the count, so one person proves it live); not approved 409 (withdrawn; an approver who is no longer a lead
 *  or owner; one approval); the planner and the standards 409. → {reader, params, stamp} — stamp is what the job's build:run row carries. */
export async function recipeForRun(key, { version, scope }, deps) {
  const d = wire(deps);
  if ((await d.myRole(key)) === "service")
    throw err(403, "a recipe run is a person's — its build:run row names who ran it: sign in. Nothing was saved.");
  await person(d, key, "contributor", "running a recipe", "run");
  const at = await locate(d, key, scope);
  const n = versionOf(version), ref = refOf(n);
  const { doc, sha } = await stored(d, scope, at.key, n);
  try { validateRecipe(doc.body); } catch (e) { throw err(409, `${ref} on ${at.key} is not a recipe this bridge reads (${e.message}) — nothing was saved`); }
  const sub = d.sub();
  const [rows, holders] = await Promise.all([recipeRows(d, at.pid), holdersOf(d, at.pid)]);
  const st = approvalState(rows, ref, sha, holders);
  const mine = st.valid.find((r) => r.new_value.user_id === sub);
  if (mine) throw err(403, `you approved ${ref} (ledger #${mine.id}) — a recipe is run by someone who approved neither (D13); nothing was saved`);
  const why = notApprovedWords(ref, at.key, st);
  if (why) throw err(409, `${why}; nothing was saved`);
  await holds(d, key, ref, doc.body);
  const hold = (r) => ({ id: r.id, hash: r.hash ?? null, role: r.new_value.role, user_id: r.new_value.user_id });
  return {
    reader: doc.body.reader.name, params: doc.body.params,
    stamp: { ref, scope, sha256: sha, runner_user_id: sub, approvals: [st.lead, st.owner].map(hold), reader_version: doc.body.reader.version },
  };
}

/** Propose from a recipe job (changesets-store proposeFromJob): the job's `recipe` stamp still fits — the recipe body is the one that ran, the
 *  reader was the version it was verified with (`same_reader`), the planner and the standards are unchanged. A 409 in words, else null. */
export async function recipeHolds(key, stamp, deps) {
  const d = wire(deps);
  const n = Number(String(stamp?.ref).split("@")[1]);
  if (!versionOf(n)) throw err(409, "the job's recipe stamp does not name a recipe — nothing was saved");
  const at = await locate(d, key, stamp.scope);
  const { doc, sha } = await stored(d, stamp.scope, at.key, n);
  if (sha !== stamp.sha256) throw err(409, `${stamp.ref} on ${at.key} is not the body this job ran — nothing was saved`);
  if (stamp.same_reader === false)
    throw err(409, `this job ran ${doc.body.reader.name} at a version other than ${doc.body.reader.version}, the one ${stamp.ref} was verified with — run the recipe again; nothing was saved`);
  await holds(d, key, stamp.ref, doc.body);
  return null;
}
