// MA-8-13 (C15, D13) — the recipe registry's pure half: what a recipe body may hold, and who has approved it.
// A `recipe@n` artefact is the method of one VERIFIED run (a reader, its parameters, a planner, the standards it ran on), so another
// person can repeat it on other evidence. No import of build-jobs or any store (build-jobs → recipe-store is a lazy import; a static
// edge here would close a cycle through evidence-store → artefact-store).
import { canonical } from "./canonical.mjs";

/** reader → [its planner, the key its planner row names the reader row under] (build-jobs READERS; survey-plan, drawing-plan, ifc-plan). */
export const RECIPE_READERS = {
  "sentinel-survey": ["survey-planner", "survey_row"],
  "sentinel-drawing": ["drawing-planner", "drawing_row"],
  "sentinel-ifc": ["ifc-planner", "ifc_row"],
};
export const MAX_PLANNER_ROWS = 20;
const NUMBER_KEYS = ["filed", "web", "carried", "revit", "applied", "undone", "kept", "withdrawn"];

const err = (status, message) => Object.assign(new Error(message), { status });
const bad = (path, want) => err(400, `recipe: ${path || "the body"} ${want}`);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const oneLine = (v, max) => typeof v === "string" && v.trim() !== "" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{64}$/;

function exact(path, o, keys) {
  if (!isObj(o)) throw bad(path, "must be an object");
  const stray = Object.keys(o).find((k) => !keys.includes(k));
  if (stray !== undefined) throw bad(`${path}.${stray}`.replace(/^\./, ""), `is not a recipe field — ${path || "a recipe"} is exactly {${keys.join(", ")}}`);
}
const named = (path, o, names) => {
  exact(path, o, ["name", "version"]);
  if (!names.includes(o.name)) throw bad(`${path}.name`, `must be one of ${names.join(", ")}`);
  if (typeof o.version !== "string" || !SEMVER.test(o.version)) throw bad(`${path}.version`, "must be x.y.z");
};
const ledgerRow = (path, o) => {
  exact(path, o, ["id", "hash"]);
  if (!Number.isInteger(o.id) || o.id < 1) throw bad(`${path}.id`, "must be a ledger row id (a whole number from 1)");
  if (o.hash !== null && !(typeof o.hash === "string" && o.hash.length >= 1 && o.hash.length <= 128)) throw bad(`${path}.hash`, "must be the row's hash (text) or null");
};

/** The recipe body's whole vocabulary; stray keys at any level are refused. A 400 naming the path. Throws; answers true. */
export function validateRecipe(body) {
  exact("", body, ["name", "reader", "params", "planner", "standards", "verified"]);
  if (!oneLine(body.name, 80)) throw bad("name", "must be one line of 1 to 80 characters");
  named("reader", body.reader, Object.keys(RECIPE_READERS));
  if (!isObj(body.params) || Object.keys(body.params).length > 8 || !Object.values(body.params).every(Number.isFinite))
    throw bad("params", "must be an object of at most 8 numbers (the reader's parameters; the bridge bounds each at every run)");
  named("planner", body.planner, [RECIPE_READERS[body.reader.name][0]]);
  exact("standards", body.standards, ["guideline", "type_catalog"]);
  for (const k of ["guideline", "type_catalog"]) {
    exact(`standards.${k}`, body.standards[k], ["label", "sha256"]);
    if (!oneLine(body.standards[k].label, 300)) throw bad(`standards.${k}.label`, "must be one line of 1 to 300 characters");
    if (typeof body.standards[k].sha256 !== "string" || !SHA.test(body.standards[k].sha256)) throw bad(`standards.${k}.sha256`, "must be a sha256 (64 hex characters)");
  }
  const v = body.verified;
  exact("verified", v, ["project", "run", "job_id", "reader_row", "planner_rows", "edit_cost_row", "edit_cost"]);
  if (!oneLine(v.project, 128)) throw bad("verified.project", "must be the project key the run is on");
  if (typeof v.run !== "string" || !/^job#\d+$/.test(v.run)) throw bad("verified.run", "must be a job's run (job#<ledger id>)");
  if (typeof v.job_id !== "string" || !/^job-\d{4,}$/.test(v.job_id)) throw bad("verified.job_id", "must be a job id (job-NNNN)");
  ledgerRow("verified.reader_row", v.reader_row);
  if (!Array.isArray(v.planner_rows) || !v.planner_rows.length || v.planner_rows.length > MAX_PLANNER_ROWS) throw bad("verified.planner_rows", `must hold 1 to ${MAX_PLANNER_ROWS} ledger rows`);
  v.planner_rows.forEach((r, i) => ledgerRow(`verified.planner_rows[${i}]`, r));
  ledgerRow("verified.edit_cost_row", v.edit_cost_row);
  exact("verified.edit_cost", v.edit_cost, [...NUMBER_KEYS, "share_changed"]);
  for (const k of NUMBER_KEYS) if (!Number.isInteger(v.edit_cost[k]) || v.edit_cost[k] < 0) throw bad(`verified.edit_cost.${k}`, "must be a whole number from 0");
  const sc = v.edit_cost.share_changed;
  if (sc !== null && !(Number.isFinite(sc) && sc >= 0 && sc <= 1)) throw bad("verified.edit_cost.share_changed", "must be a share from 0 to 1, or null");
  return true;
}

/** The edit-cost numbers of one run, as publishEditCost writes them (changesets-store) — what the published row and a recipe carry. */
export const editCostNumbers = (r) => ({ filed: r.filed, web: r.web, carried: r.carried, revit: r.revit, applied: r.applied, undone: r.undone, kept: r.kept, withdrawn: r.withdrawn, share_changed: r.share_changed });

/** Do two edit-cost number sets agree? (jsonb reorders keys: canonical, never ===.) */
export const sameJson = (a, b) => canonical(a) === canonical(b);

/**
 * Who has approved `ref` at `sha` (D13). `rows` are the ledger rows of the project the recipe lives on (only entity_type "recipe" is read);
 * `sha` is always recomputed from the stored body, never the pointer's copy. A valid approval: that ref and sha, a role of lead or owner on
 * the row, a string user_id; the FIRST row per person only. `holders` (user_id → the role that person holds NOW on the key the recipe lives
 * on) is the run's re-read of the memberships: an approval counts only while its approver still holds lead or owner (the role on the row
 * still decides which of the two it is). Without `holders` nothing lapses (the list's first pass).
 * → { state: "withdrawn" | "approved" | "pending", approved, withdrawn: row | null, lead, owner (counting rows), counting, lapsed, approvers: every user_id that approved }.
 */
export function approvalState(rows, ref, sha, holders) {
  const mine = (rows ?? []).filter((r) => r?.entity_type === "recipe" && r.new_value?.ref === ref && r.new_value?.sha256 === sha)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const withdrawn = mine.find((r) => String(r.action).startsWith("recipe:withdrawn ")) ?? null;
  const seen = new Set(), valid = [];
  for (const r of mine) {
    const v = r.new_value;
    if (!String(r.action).startsWith("recipe:approved ") || !["lead", "owner"].includes(v.role) || typeof v.user_id !== "string" || seen.has(v.user_id)) continue;
    seen.add(v.user_id);
    valid.push(r);
  }
  const holds = (r) => !holders || ["lead", "owner"].includes(holders[r.new_value.user_id]);
  const counting = valid.filter(holds), lapsed = valid.filter((r) => !holds(r));
  const lead = counting.find((r) => r.new_value.role === "lead") ?? null, owner = counting.find((r) => r.new_value.role === "owner") ?? null;
  const approved = !withdrawn && !!lead && !!owner;
  return { state: withdrawn ? "withdrawn" : approved ? "approved" : "pending", approved, withdrawn, lead, owner, counting, lapsed, approvers: valid.map((r) => r.new_value.user_id), valid };
}

/** The words for a recipe that does not run yet (approve and run share them), without the "nothing was saved" the caller ends with. → null when approved. */
export function notApprovedWords(ref, key, st) {
  if (st.state === "approved") return null;
  if (st.state === "withdrawn") return `${ref} was withdrawn (ledger #${st.withdrawn.id}) and runs no more — draft a new recipe from a run`;
  if (st.lapsed.length)
    return `${ref}'s approval #${st.lapsed[0].id} is by someone who is no longer a lead or owner of ${key}; it runs once a lead and an owner who still hold those roles have approved it`;
  if (!st.counting.length) return `${ref} has no approval yet — it runs once a lead and an owner, two different people, have approved it`;
  const a = st.counting[0];
  return `${ref} has 1 approval (#${a.id}, ${a.new_value.role === "lead" ? "a lead's" : "an owner's"}) — it runs once a lead and an owner, two different people, have approved it`;
}
