// MA-8-13 (C15, D13): the recipe registry's sequencing - every dependency injected, nothing read from a file or a database. A small in-memory
// world holds the ledger, the recipe docs and the memberships; each call is made "as" a person (sub + role on a key), so the two-person rule
// and the third-person run are proven here with distinct people. (write-roles.test.mjs proves them again through the real routes.)
import { describe, it, expect, beforeEach, vi } from "vitest";
import { canonicalSha256 } from "./canonical.mjs";
import { validateRecipe } from "./recipe-logic.mjs";
import { listRecipes, draftRecipe, approveRecipe, withdrawRecipe, recipeForRun, recipeHolds } from "./recipe-store.mjs";
import { readFileSync } from "node:fs";

const GOOD = () => JSON.parse(readFileSync(new URL("./fixtures/recipe/good.json", import.meta.url), "utf8"));

const rank = { viewer: 1, contributor: 2, lead: 3, owner: 4 };
const kf = (key) => `pid-${key}`;
let w; // the world

beforeEach(() => {
  w = {
    ledger: [], nextId: 1000, docs: { "project:demo": [], "project:other": [], "office:office-1": [] }, budgets: [], folds: [],
    members: { "pid-demo": [{ user_id: "u-lead", role: "lead" }, { user_id: "u-owner", role: "owner" }, { user_id: "u-third", role: "contributor" }],
      "pid-office-1": [{ user_id: "u-lead", role: "lead" }, { user_id: "u-owner", role: "owner" }] },
    offices: { demo: "office-1" },
    guideline: "a".repeat(64), catalog: "b".repeat(64), versions: { planner: "0.1.0", reader: null },
  };
});

/** deps "as" a person: `roles` is what they hold per key. */
const as = (sub, roles, over = {}) => ({
  sub, myRole: async (k) => (sub === null ? "service" : roles[k] ?? null),
  requireMinRole: async (k, min) => { const r = sub === null ? "service" : roles[k]; if (r !== "service" && (rank[r] || 0) < rank[min]) throw Object.assign(new Error(`this action requires the ${min} role (you are ${r || "not a member"})`), { status: 403 }); return r; },
  ensureProject: async (k) => ({ id: kf(k), key: k }),
  officeKeyOf: async (k) => w.offices[k] ?? null,
  sb: async (path) => {
    if (path.startsWith("memberships?")) return w.members[decodeURIComponent(path.match(/project_id=eq\.([^&]+)/)[1])] ?? [];
    if (path.startsWith("projects?key=eq.")) return [{ id: kf(decodeURIComponent(path.match(/key=eq\.([^&]+)/)[1])) }];
    if (path.startsWith("audit_log?")) { const pid = path.match(/project_id=eq\.([^&]+)/)[1]; return w.ledger.filter((r) => r.pid === pid && r.entity_type === "recipe"); }
    throw new Error(`unexpected read ${path}`);
  },
  audit: async (pid, et, eid, action, actor, o, v) => { const row = { id: w.nextId++, hash: `h${w.nextId}`, pid, entity_type: et, action, actor, new_value: v }; w.ledger.push(row); return row; },
  takeWriteBudget: (what, lim) => w.budgets.push([what, lim]),
  read: async (scope, key, version) => { const docs = w.docs[`${scope}:${key}`] ?? []; return (version === undefined ? docs.at(-1) : docs.find((d) => d.version === version)) ?? null; },
  fold: async (key, kind, body, { actor, expectVersion }) => {
    validateRecipe(body);
    const scope = w.offices[key] === undefined && key === "office-1" ? "office" : "project", docs = (w.docs[`${scope}:${key}`] ??= []);
    if ((docs.at(-1)?.version || 0) !== expectVersion) throw Object.assign(new Error("another change to recipe landed at the same moment"), { status: 409 });
    const doc = { kind, version: expectVersion + 1, sha256: canonicalSha256(body), installed_by: `${sub}@example.test`, installed_at: "2026-10-13T10:00:00Z", source: null, body };
    docs.push(doc); w.folds.push({ key, actor, expectVersion }); return doc;
  },
  resolveArtefact: async (k, kind) => ({ body: {}, source: "project", ref: `${kind}@7`, sha256: kind === "guideline" ? w.guideline : w.catalog }),
  versions: async () => w.versions,
  ...over,
});
const LEAD = (over) => as("u-lead", { demo: "lead", "office-1": "lead" }, over);
const OWNER = (over) => as("u-owner", { demo: "owner", "office-1": "owner" }, over);
const THIRD = (over) => as("u-third", { demo: "contributor" }, over);
const MACHINE = (over) => as(null, {}, over);

// ── a verified run on `demo`: job-0013 = ledger #900, one Propose #910, edit cost published as #920 ──
const NUMBERS = { filed: 12, web: 1, carried: 0, revit: 1, applied: 10, undone: 1, kept: 9, withdrawn: 0, share_changed: 0.25 };
const RESTS = { applied: "2026-10-12T10:00:00Z", reverted: 905 };
const planner = (id, over = {}) => ({ id, hash: `h${id}`, entity_type: "build", action: "build:run job-0013 · survey-planner 0.1.0 · proposed",
  new_value: { job_id: "job-0013", planner: "survey-planner", version: "0.1.0", survey_row: { id: 900, hash: "h900" }, guideline: "guideline@7 · project · 4cb2…", guideline_sha256: "a".repeat(64),
    catalog: "type_catalog@3 · office · 9f01…", catalog_sha256: "b".repeat(64), claimed: false, ...over } });
let ledgerRows, published, runs, tj;
beforeEach(() => {
  ledgerRows = [planner(910)];
  published = [{ id: 920, hash: "h920", entity_type: "edit_cost", action: "edit_cost:published job-0013 (ledger #900) · 9/12 kept", new_value: { run: "job#900", numbers: { ...NUMBERS }, rests_on: { ...RESTS } } }];
  runs = [{ run: "job#900", label: "job-0013 (ledger #900)", ...NUMBERS, pending: 0, complete: true, rests_on: RESTS }];
  tj = { row: { ledger: { id: 900, hash: "h900" }, reader: "sentinel-survey", version: "0.6.0", params: { voxel_mm: 20, storey_min_mm: 2000 } } };
});
const run = (over = {}) => ({
  getAuditEntry: async (k, id) => (id === 900 ? { id: 900, entity_type: "build", action: "build:run job-0013 · sentinel-survey 0.6.0 · done", new_value: { job_id: "job-0013" } } : null),
  trustedJob: async () => tj,
  auditAll: async (k, f) => (f.entity_type === "build" ? ledgerRows : published),
  editCostOf: async () => ({ runs }),
  ...over,
});
const draft = (who = LEAD, b = { run: "job#900", name: "Kladno storeys" }, over) => draftRecipe("demo", b, "web", who(run(over)));
const nothing = (e) => expect(e.message).toMatch(/nothing was saved/);

describe("draftRecipe - a lead drafts recipe@n from a verified run", () => {
  it("a good draft: every body field comes from the rows (the reader row, the planner row, the published edit cost); recipe@1, one install, the budget taken", async () => {
    const r = await draft();
    expect(r).toMatchObject({ ref: "recipe@1", version: 1, scope: "project", key: "demo" });
    expect(r.body).toEqual({ ...GOOD(), verified: { ...GOOD().verified, project: "demo" } });
    expect(w.folds).toEqual([{ key: "demo", actor: "web", expectVersion: 0 }]);
    expect(w.budgets).toEqual([["recipes", { perUser: 10, all: 30 }]]);
    expect(r.sha256).toBe(canonicalSha256(r.body));
  });
  it("D-B5-2: the newest published row decides, a second Propose under the same standards is still one recipe, and the share changed is no bar", async () => {
    ledgerRows = [planner(910), planner(930)];
    published = [published[0], { ...published[0], id: 925, new_value: { run: "job#900", numbers: { ...NUMBERS, kept: 1 }, rests_on: RESTS } }]; // 925 is older than 920? no: 925 > 920, but numbers differ
    await expect(draft()).rejects.toMatchObject({ status: 409, message: "the edit cost changed since ledger #925 was published (an Undo or a decision) — publish it again, then draft; nothing was saved" });
    published = [published[0]];
    runs[0].share_changed = 0.9; published[0].new_value.numbers.share_changed = 0.9;
    const r = await draft();
    expect(r.body.verified.planner_rows.map((x) => x.id)).toEqual([910, 930]);
    expect(r.body.verified.edit_cost.share_changed).toBe(0.9);
  });
  it("MA-7-9: a run whose Propose carried a person's material choice by photo is not a recipe - a recipe does not repeat a person's choice", async () => {
    ledgerRows = [planner(910, { materials: [{ cid: "scan-L00-wall-2", item: "ev-000C", copy_sha256: "e".repeat(64), material: "Concrete", chosen_by: "web" }] })];
    await expect(draft()).rejects.toMatchObject({ status: 409, message: "a recipe does not repeat a person's choice by photo - run the job and choose by photo again; nothing was saved" });
    expect(w.folds).toEqual([]);
  });
  it("jsonb reorders keys: a published row with its numbers in another order is still the same numbers", async () => {
    published[0].new_value.numbers = Object.fromEntries(Object.entries(NUMBERS).reverse());
    published[0].new_value.rests_on = { reverted: 905, applied: RESTS.applied };
    expect((await draft()).ref).toBe("recipe@1");
  });
  it("who: the machine credential, a contributor and a viewer are 403 with nothing saved; a Promote run and a bad name are 400s", async () => {
    await expect(draft(MACHINE)).rejects.toMatchObject({ status: 403, message: "drafting a recipe is a signed-in person's — the machine credential, the MCP agent and scripts never draft; nothing was saved" });
    await expect(draft(THIRD)).rejects.toMatchObject({ status: 403, message: "drafting a recipe requires the lead role on demo (you are contributor) — nothing was saved" });
    await expect(draft((o) => as("u-v", { demo: "viewer" }, o))).rejects.toMatchObject({ status: 403 });
    await expect(draft(LEAD, { run: "cs-0001", name: "x" })).rejects.toMatchObject({ status: 400, message: "only a job's run is a recipe — a Promote or agent changeset has no reader to repeat; nothing was saved" });
    for (const name of ["", "a\nb", "x".repeat(81), 5, undefined]) await expect(draft(LEAD, { run: "job#900", name })).rejects.toMatchObject({ status: 400 });
    await expect(draft(LEAD, { run: "job#900", name: "x", scope: "team" })).rejects.toMatchObject({ status: 400 });
    expect(w.docs["project:demo"]).toEqual([]);
  });
  it("the four checks of verified, each in its words and with nothing saved", async () => {
    const no = async (over, status, text, setup) => { setup?.(); await expect(draft(LEAD, undefined, over)).rejects.toMatchObject({ status, message: expect.stringContaining(text) }); };
    await no({ getAuditEntry: async () => null }, 404, "ledger #900 on demo is not a job's build:run row");
    await no({ trustedJob: async () => { throw Object.assign(new Error("job-0013's result is not trusted: its result.json is missing"), { status: 409 }); } }, 409, "its result.json is missing — nothing was saved");
    await no({ trustedJob: async () => ({ row: { ...tj.row, ledger: { id: 777, hash: "x" } } }) }, 409, "job-0013 on this PC is ledger #777, not the run's #900");
    ledgerRows = [];
    await no({}, 409, "job#900 was never proposed — a recipe repeats a run whose changesets were reviewed");
    ledgerRows = [planner(910, { claimed: true })]; // a reworded receipt from Revit is claimed
    await no({}, 409, "never proposed");
    ledgerRows = [planner(910, { survey_row: { id: 801, hash: "x" } })]; // another job's reader row
    await no({}, 409, "never proposed");
    ledgerRows = [planner(910), planner(911, { guideline_sha256: "c".repeat(64) })];
    await no({}, 409, "job#900 was proposed under two sets of standards (#910, #911) — it is not one recipe");
    ledgerRows = Array.from({ length: 21 }, (_, i) => planner(910 + i));
    await no({}, 409, "job#900 was proposed 21 times — a recipe names at most 20 of its Proposes");
    ledgerRows = [planner(910)];
    const saved = published; published = [];
    await no({}, 409, "job#900's edit cost is not published — a lead publishes it on the review desk (Edit cost per run) first");
    published = saved;
    runs[0].complete = false; runs[0].pending = 2;
    await no({}, 409, "job#900 is still being reviewed");
    runs[0].complete = true; runs[0].undone = 3; // an Undo since the publish
    await no({}, 409, "the edit cost changed since ledger #920 was published");
    runs[0].undone = 1; runs[0].kept = 0; published[0].new_value.numbers.kept = 0;
    await no({}, 409, "nothing job#900 filed is kept in a model");
    expect(w.docs["project:demo"]).toEqual([]);
  });
  it("the same run again is a 409 naming the version; a changed name is a new recipe (recipe@2); two drafts at once are one", async () => {
    await draft();
    await expect(draft()).rejects.toMatchObject({ status: 409, message: "recipe@1 is this run already — nothing was saved" });
    expect((await draft(LEAD, { run: "job#900", name: "Kladno storeys v2" })).ref).toBe("recipe@2");
    let release;
    const gate = new Promise((r) => { release = r; });
    const slow = draft(LEAD, { run: "job#900", name: "third" }, { trustedJob: async () => { await gate; return tj; } });
    await expect(draft(LEAD, { run: "job#900", name: "fourth" })).rejects.toMatchObject({ status: 409, message: "a recipe is being drafted on demo — try again when it ends; nothing was saved" });
    release(); expect((await slow).ref).toBe("recipe@3");
  });
  it("office scope: the office of the run's project, a lead of it (its own words otherwise), installed on the office key", async () => {
    const r = await draftRecipe("demo", { run: "job#900", name: "Kladno storeys", scope: "office" }, "web", LEAD(run()));
    expect(r).toMatchObject({ ref: "recipe@1", scope: "office", key: "office-1" });
    expect(w.folds).toEqual([{ key: "office-1", actor: "web", expectVersion: 0 }]);
    expect(r.body.verified.project).toBe("demo"); // the project the run is on, whatever the scope
    const lead = as("u-x", { demo: "lead" }); // lead of the project, nothing on the office
    await expect(draftRecipe("demo", { run: "job#900", name: "n", scope: "office" }, "web", { ...lead, ...run() })).rejects.toMatchObject({ status: 403, message: "drafting an office recipe needs the lead role on office-1 — nothing was saved" });
    w.offices = {};
    await expect(draftRecipe("demo", { run: "job#900", name: "n", scope: "office" }, "web", LEAD(run()))).rejects.toMatchObject({ status: 400, message: "demo belongs to no office — an office recipe is drafted from an office project's run; nothing was saved" });
  });
});

/** a recipe@1 installed on demo, as its tests need it */
const install = (over = {}, scope = "project", key = "demo") => {
  const body = { ...GOOD(), ...over };
  const doc = { kind: "recipe", version: (w.docs[`${scope}:${key}`].at(-1)?.version || 0) + 1, sha256: canonicalSha256(body), installed_by: "u-lead@example.test", installed_at: "2026-10-13T10:00:00Z", body };
  w.docs[`${scope}:${key}`].push(doc);
  return doc;
};
const approve = (who, doc, extra = {}, key = "demo", n = doc.version) => approveRecipe(key, n, { sha256: doc.sha256, ...extra }, "web", who());

describe("approveRecipe - two different people, a lead and an owner (D13)", () => {
  it("a lead's approval is one row with who and which role; the owner's second approves it; the row names the body by sha", async () => {
    const doc = install();
    const a = await approve(LEAD, doc);
    expect(a).toMatchObject({ ref: "recipe@1", scope: "project", role: "lead", approved: false, ledger: { id: 1000 } });
    expect(w.ledger[0]).toMatchObject({ pid: "pid-demo", entity_type: "recipe", action: "recipe:approved recipe@1 · lead", actor: "web",
      new_value: { ref: "recipe@1", sha256: doc.sha256, scope: "project", user_id: "u-lead", role: "lead", run: "job#900", name: "Kladno storeys" } });
    const b = await approve(OWNER, doc);
    expect(b).toMatchObject({ role: "owner", approved: true });
    expect(w.budgets.at(-1)).toEqual(["recipe approvals", { perUser: 10, all: 30 }]);
  });
  it("the machine credential, a contributor and a viewer never approve", async () => {
    const doc = install();
    await expect(approve(MACHINE, doc)).rejects.toMatchObject({ status: 403, message: "approving a recipe is a signed-in person's — the machine credential, the MCP agent and scripts never approve; nothing was saved" });
    await expect(approve(THIRD, doc)).rejects.toMatchObject({ status: 403, message: "approving a recipe requires the lead role on demo (you are contributor) — nothing was saved" });
    expect(w.ledger).toEqual([]);
  });
  it("refusals in order: no such version 404; not the body you read 409; the same person again 409; a second of the same role 409; approved already 409", async () => {
    const doc = install();
    await expect(approveRecipe("demo", 9, { sha256: doc.sha256 }, "web", LEAD())).rejects.toMatchObject({ status: 404, message: "no recipe@9 on demo — nothing was saved" });
    await expect(approveRecipe("demo", 1, { sha256: "f".repeat(64) }, "web", LEAD())).rejects.toMatchObject({ status: 409, message: "recipe@1 is not the body you read — read it again; nothing was saved" });
    await expect(approveRecipe("demo", 1, {}, "web", LEAD())).rejects.toMatchObject({ status: 400 });
    await expect(approveRecipe("demo", "x", { sha256: doc.sha256 }, "web", LEAD())).rejects.toMatchObject({ status: 400 });
    doc.sha256 = "e".repeat(64); // the stored copy of the hash no longer matches the body: not trusted
    await expect(approve(LEAD, { ...doc, sha256: canonicalSha256(doc.body) })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("not the body it was installed with") });
    doc.sha256 = canonicalSha256(doc.body);
    await approve(LEAD, doc);
    await expect(approve(LEAD, doc)).rejects.toMatchObject({ status: 409, message: "you approved recipe@1 already (ledger #1000) — the second approval is another person's; nothing was saved" });
    const lead2 = (o) => as("u-lead2", { demo: "lead" }, o);
    w.members["pid-demo"].push({ user_id: "u-lead2", role: "lead" });
    await expect(approve(lead2, doc)).rejects.toMatchObject({ status: 409, message: "recipe@1's approval #1000 is a lead's — the second must be an owner's: a lead and an owner, two different people (D13); nothing was saved" });
    await approve(OWNER, doc);
    await expect(approve(lead2, doc)).rejects.toMatchObject({ status: 409, message: "recipe@1 is approved already (#1000, #1001) — nothing was saved" });
    expect(w.ledger).toHaveLength(2);
  });
  it("an owner first, then a second owner: the second must be a lead's", async () => {
    const doc = install();
    w.members["pid-demo"].push({ user_id: "u-owner2", role: "owner" });
    await approve(OWNER, doc);
    await expect(approve((o) => as("u-owner2", { demo: "owner" }, o), doc)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("is an owner's — the second must be a lead's") });
  });
  it("the body stored with its keys in another order (jsonb) still hashes to the same sha, so the approval holds", async () => {
    const doc = install();
    const flip = (o) => (Array.isArray(o) ? o.map(flip) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).reverse().map(([k, v]) => [k, flip(v)])) : o);
    const shuffled = { ...doc, body: flip(doc.body) };
    w.docs["project:demo"][0] = shuffled;
    expect((await approve(LEAD, doc)).approved).toBe(false);
  });
  it("two approvals of one recipe at once: the second is told, one row is written (a race never reads as two)", async () => {
    const doc = install();
    let release;
    const gate = new Promise((r) => { release = r; });
    const slow = approveRecipe("demo", 1, { sha256: doc.sha256 }, "web", LEAD({ audit: async (...a) => { await gate; return LEAD().audit(...a); } })); // holds the lock at the ledger write
    await new Promise((r) => setTimeout(r, 5));
    await expect(approve(OWNER, doc)).rejects.toMatchObject({ status: 409, message: "recipe@1 is being approved — try again when it ends; nothing was saved" });
    release(); await slow;
    expect(w.ledger.filter((r) => r.action.startsWith("recipe:approved"))).toHaveLength(1);
  });
  it("a withdrawn version takes no approval; withdrawing is a lead's or owner's, once, and the version stays", async () => {
    const doc = install();
    await expect(withdrawRecipe("demo", 1, { sha256: doc.sha256 }, "web", MACHINE())).rejects.toMatchObject({ status: 403, message: expect.stringContaining("never withdraw") });
    await expect(withdrawRecipe("demo", 1, { sha256: doc.sha256 }, "web", THIRD())).rejects.toMatchObject({ status: 403 });
    const r = await withdrawRecipe("demo", 1, { sha256: doc.sha256 }, "web", OWNER());
    expect(r).toMatchObject({ ref: "recipe@1", withdrawn: true });
    expect(w.ledger[0]).toMatchObject({ action: "recipe:withdrawn recipe@1", entity_type: "recipe", new_value: { sha256: doc.sha256, user_id: "u-owner", role: "owner" } });
    await expect(withdrawRecipe("demo", 1, { sha256: doc.sha256 }, "web", LEAD())).rejects.toMatchObject({ status: 409, message: "recipe@1 was withdrawn already (ledger #1000) — nothing was saved" });
    await expect(approve(LEAD, doc)).rejects.toMatchObject({ status: 409, message: "recipe@1 was withdrawn (ledger #1000) — nothing was saved" });
    expect(w.docs["project:demo"]).toHaveLength(1);
  });
  it("an office recipe is approved on the office key with office roles and written to the office's ledger", async () => {
    const doc = install({}, "office", "office-1");
    const a = await approveRecipe("demo", 1, { sha256: doc.sha256, scope: "office" }, "web", LEAD());
    expect(a).toMatchObject({ scope: "office", role: "lead" });
    expect(w.ledger[0]).toMatchObject({ pid: "pid-office-1", new_value: { scope: "office", ref: "recipe@1" } });
    const lead = as("u-x", { demo: "lead" }); // a lead of the project only
    await expect(approveRecipe("demo", 1, { sha256: doc.sha256, scope: "office" }, "web", lead)).rejects.toMatchObject({ status: 403, message: "approving a recipe requires the lead role on office-1 (you are not a member) — nothing was saved" });
    // the same number on the project is another recipe: the project has no recipe@1
    await expect(approveRecipe("demo", 1, { sha256: doc.sha256 }, "web", LEAD())).rejects.toMatchObject({ status: 404 });
  });
});

describe("recipeForRun - a third person runs an approved recipe (D13)", () => {
  const approved = async () => { const doc = install(); await approve(LEAD, doc); await approve(OWNER, doc); return doc; };
  const go = (who = THIRD, scope = "project", version = 1, key = "demo") => recipeForRun(key, { version, scope }, who());

  it("the run is {reader, params, stamp}: the stamp names the recipe, its sha, who runs it, both approvals and the reader version it was verified with", async () => {
    const doc = await approved();
    expect(await go()).toEqual({ reader: "sentinel-survey", params: { voxel_mm: 20, storey_min_mm: 2000 },
      stamp: { ref: "recipe@1", scope: "project", sha256: doc.sha256, runner_user_id: "u-third", reader_version: "0.6.0",
        approvals: [{ id: 1000, hash: w.ledger[0].hash, role: "lead", user_id: "u-lead" }, { id: 1001, hash: w.ledger[1].hash, role: "owner", user_id: "u-owner" }] } });
  });
  it("the checks in order: the machine credential 403; no such version 404; a body that no longer hashes 409; the runner approved it 403 (before the count)", async () => {
    await expect(go(MACHINE)).rejects.toMatchObject({ status: 403, message: "a recipe run is a person's — its build:run row names who ran it: sign in. Nothing was saved." });
    await expect(go()).rejects.toMatchObject({ status: 404, message: "no recipe@1 on demo — nothing was saved" });
    const doc = install();
    w.docs["project:demo"][0] = { ...doc, sha256: "0".repeat(64) };
    await expect(go()).rejects.toMatchObject({ status: 409, message: expect.stringContaining("not the body it was installed with") });
    w.docs["project:demo"][0] = doc;
    await approve(LEAD, doc);
    await expect(go(LEAD)).rejects.toMatchObject({ status: 403, message: "you approved recipe@1 (ledger #1000) — a recipe is run by someone who approved neither (D13); nothing was saved" });
    // one approval is not enough, and says whose
    await expect(go()).rejects.toMatchObject({ status: 409, message: "recipe@1 has 1 approval (#1000, a lead's) — it runs once a lead and an owner, two different people, have approved it; nothing was saved" });
  });
  it("a recipe body this bridge cannot read, and a withdrawn recipe, are 409s", async () => {
    const doc = await approved();
    const bad = { ...doc.body, reader: { name: "laspy", version: "1.0.0" } };
    w.docs["project:demo"][0] = { ...doc, body: bad, sha256: canonicalSha256(bad) };
    await expect(go()).rejects.toMatchObject({ status: 409, message: expect.stringContaining("is not a recipe this bridge reads") });
    w.docs["project:demo"][0] = doc;
    await withdrawRecipe("demo", 1, { sha256: doc.sha256 }, "web", LEAD());
    await expect(go()).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^recipe@1 was withdrawn \(ledger #1002\) and runs no more.*nothing was saved$/) });
  });
  it("amendment 1: an approver who is no longer a lead or owner does not count - removed, or demoted - and the words say so; the replacement approves and it runs", async () => {
    const doc = await approved();
    w.members["pid-demo"] = w.members["pid-demo"].filter((m) => m.user_id !== "u-lead"); // removeMember
    await expect(go()).rejects.toMatchObject({ status: 409, message: "recipe@1's approval #1000 is by someone who is no longer a lead or owner of demo; it runs once a lead and an owner who still hold those roles have approved it; nothing was saved" });
    w.members["pid-demo"].push({ user_id: "u-lead", role: "contributor" }); // demoted
    await expect(go()).rejects.toMatchObject({ status: 409, message: expect.stringContaining("no longer a lead or owner") });
    w.members["pid-demo"].push({ user_id: "u-lead9", role: "lead" });
    await approve((o) => as("u-lead9", { demo: "lead" }, o), doc); // the lapsed lead's row does not block a new lead
    const r = await go();
    expect(r.stamp.approvals.map((a) => a.user_id)).toEqual(["u-lead9", "u-owner"]);
    expect(await listRecipes("demo", LEAD()).then((l) => l.project[0].approvals.map((a) => [a.user_id, a.counts]))).toEqual([["u-lead", false], ["u-owner", true], ["u-lead9", true]]);
  });
  it("the planner and the standards must still be the ones it was verified with, each in its words", async () => {
    await approved();
    w.versions = { planner: "0.2.0", reader: null };
    await expect(go()).rejects.toMatchObject({ status: 409, message: "recipe@1 was verified with survey-planner 0.1.0; this bridge plans with 0.2.0 — draft a new recipe from a run on this bridge; nothing was saved" });
    w.versions = { planner: "0.1.0", reader: null };
    w.guideline = "9".repeat(64);
    await expect(go()).rejects.toMatchObject({ status: 409, message: "the guideline in force on demo (guideline@7 · project · 999999999999…) is not the one recipe@1 ran on (guideline@7 · project · 4cb2…); nothing was saved" });
    w.guideline = "a".repeat(64); w.catalog = "8".repeat(64);
    await expect(go()).rejects.toMatchObject({ status: 409, message: expect.stringContaining("the type_catalog in force on demo") });
    w.catalog = "b".repeat(64);
    expect((await go()).reader).toBe("sentinel-survey");
  });
  it("amendment 15: a sentinel-ifc reader's version is known before the run - a mismatch is refused then", async () => {
    const body = { ...GOOD(), reader: { name: "sentinel-ifc", version: "0.2.0" }, planner: { name: "ifc-planner", version: "0.2.1" }, params: {} };
    const doc = { kind: "recipe", version: 1, sha256: canonicalSha256(body), installed_by: "x", installed_at: "y", body };
    w.docs["project:demo"].push(doc);
    await approve(LEAD, doc); await approve(OWNER, doc);
    w.versions = { planner: "0.2.1", reader: "0.2.1" };
    await expect(go()).rejects.toMatchObject({ status: 409, message: "recipe@1 was verified with sentinel-ifc 0.2.0; this bridge reads with 0.2.1 — draft a new recipe from a run on this bridge; nothing was saved" });
    w.versions = { planner: "0.2.1", reader: "0.2.0" };
    expect((await go()).reader).toBe("sentinel-ifc");
  });
  it("an office recipe runs on any of its projects: read from the office, approvals counted on the office's ledger and members", async () => {
    const doc = install({}, "office", "office-1");
    await approveRecipe("demo", 1, { sha256: doc.sha256, scope: "office" }, "web", LEAD());
    await approveRecipe("demo", 1, { sha256: doc.sha256, scope: "office" }, "web", OWNER());
    const r = await go(THIRD, "office");
    expect(r.stamp).toMatchObject({ ref: "recipe@1", scope: "office", runner_user_id: "u-third" });
    await expect(go(THIRD, "project")).rejects.toMatchObject({ status: 404 }); // the project has no recipe@1
    w.offices = {};
    await expect(go(THIRD, "office")).rejects.toMatchObject({ status: 400 });
  });
});

describe("recipeHolds - Propose from a recipe job", () => {
  const stamp = (doc, over = {}) => ({ ref: "recipe@1", scope: "project", sha256: doc.sha256, runner_user_id: "u-third", approvals: [], reader_version: "0.6.0", same_reader: true, ...over });
  it("passes while the body, the reader, the planner and the standards are the ones it ran on; each change is a 409 in words", async () => {
    const doc = install();
    expect(await recipeHolds("demo", stamp(doc), LEAD())).toBeNull();
    await expect(recipeHolds("demo", stamp(doc, { same_reader: false }), LEAD())).rejects.toMatchObject({ status: 409, message: "this job ran sentinel-survey at a version other than 0.6.0, the one recipe@1 was verified with — run the recipe again; nothing was saved" });
    await expect(recipeHolds("demo", stamp(doc, { sha256: "d".repeat(64) }), LEAD())).rejects.toMatchObject({ status: 409, message: "recipe@1 on demo is not the body this job ran — nothing was saved" });
    w.versions = { planner: "0.3.0", reader: null };
    await expect(recipeHolds("demo", stamp(doc), LEAD())).rejects.toMatchObject({ status: 409, message: expect.stringContaining("this bridge plans with 0.3.0") });
    w.versions = { planner: "0.1.0", reader: null }; w.catalog = "7".repeat(64);
    await expect(recipeHolds("demo", stamp(doc), LEAD())).rejects.toMatchObject({ status: 409, message: expect.stringContaining("the type_catalog in force") });
    await expect(recipeHolds("demo", { ref: "nonsense", scope: "project" }, LEAD())).rejects.toMatchObject({ status: 409 });
  });
});

describe("listRecipes - the registry, with approvals, for any member", () => {
  it("lists the project's and its office's versions newest first, each with state, who approved and why not", async () => {
    const a = install(), b = install({ name: "Kladno v2" });
    const o = install({}, "office", "office-1");
    await approve(LEAD, a);
    await approveRecipe("demo", 1, { sha256: o.sha256, scope: "office" }, "web", LEAD());
    await approveRecipe("demo", 1, { sha256: o.sha256, scope: "office" }, "web", OWNER());
    const l = await listRecipes("demo", THIRD());
    expect(l.project.map((r) => [r.ref, r.state, r.approved])).toEqual([["recipe@2", "pending", false], ["recipe@1", "pending", false]]);
    expect(l.project[1].approvals).toEqual([{ id: 1000, hash: w.ledger[0].hash, role: "lead", user_id: "u-lead", by: "web", at: null, counts: true }]);
    expect(l.project[1].why).toBe("recipe@1 has 1 approval (#1000, a lead's) — it runs once a lead and an owner, two different people, have approved it");
    expect(l.project[0].body.name).toBe("Kladno v2");
    expect(l.office).toMatchObject({ key: "office-1" });
    expect(l.office.recipes.map((r) => [r.ref, r.scope, r.state, r.why])).toEqual([["recipe@1", "office", "approved", null]]);
    expect(l.project[0].sha256).toBe(b.sha256);
  });
  it("a project with no recipe and no office answers empty; a stranger is the role check's 403; a body that no longer hashes is untrusted, not approved", async () => {
    w.offices = {};
    expect(await listRecipes("demo", THIRD())).toEqual({ project: [], office: null });
    const doc = install();
    await approve(LEAD, doc); await approve(OWNER, doc);
    w.docs["project:demo"][0] = { ...doc, sha256: "0".repeat(64) };
    const l = await listRecipes("demo", THIRD());
    expect(l.project[0]).toMatchObject({ state: "untrusted", approved: false, intact: false });
    await expect(listRecipes("demo", as("u-s", {}))).rejects.toMatchObject({ status: 403 });
  });
  it("the ledger read fails closed at the cap: 1000 recipe rows cannot all be counted, so none is trusted", async () => {
    const doc = install();
    await expect(approveRecipe("demo", 1, { sha256: doc.sha256 }, "web", LEAD({ sb: async (p) => (p.startsWith("audit_log") ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [] ) })))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining("cannot all be counted") });
  });
});
