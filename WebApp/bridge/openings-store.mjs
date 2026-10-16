// MA-7-20 — "Are the ghost doors and windows seen in the registered photos?" ADVICE ONLY: this reads a changeset and the evidence pack, asks
// photo/openings.py (via photo-store.runJudge) about each registered own photo's BLURRED copy, and writes ONE ledger row (type "evidence",
// action "evidence:openings") with the words and the tool receipt (every tool, version, licence). It never accepts, files, moves or declines a
// ghost and never creates an element (plan 7-20; the rule of 7-10: a photo never creates). Registration (7-17/7-18) writes item.registration.
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveActor } from "./bridge-auth.mjs";
import { PACK_ID } from "./evidence-logic.mjs";
import * as L from "./openings-logic.mjs";

const err = (status, message) => Object.assign(new Error(message), { status });

/** POST /cde/:key/changesets/:id/openings-advice → 200 {advice, ledger}. `deps.judge` = photo-store.runJudge (503 when absent). A signed-in contributor or above; the machine credential is a 403.
 *  Refusals in order: 403 (machine credential), 403/404 (role, project), 429, 404 (changeset, pack), 409 (no ghost door or window; no registered photo), 503 (no tool), 422/500 (the tool). */
export async function adviseOpenings(key, changesetId, actor, deps = {}) {
  const cde = (deps.ensureProject && deps.audit && deps.takeWriteBudget) ? null : await import("./cde-store.mjs");
  const members = (deps.myRole && deps.requireMinRole) ? null : await import("./members-store.mjs");
  const myRole = deps.myRole || members.myRole, requireMinRole = deps.requireMinRole || members.requireMinRole;
  if ((await myRole(key)) === "service") throw err(403, "openings advice needs a person — the row names who asked: sign in. Nothing was advised.");
  await requireMinRole(key, "contributor");
  if (!deps.judge) throw err(503, "the openings tool is not set up on this PC — nothing was advised");
  (deps.takeWriteBudget || cde.takeWriteBudget)("openings advice", { perUser: 10, all: 30 }); // each press loads two models in a Python child
  const getChangeset = deps.getChangeset || (await import("./changesets-store.mjs")).getChangeset;
  const ev = (deps.readPack && deps.dir) ? null : await import("./evidence-store.mjs");
  const cs = await getChangeset(key, changesetId);
  const ghosts = L.ghostOpenings(cs);
  if (!ghosts.length) throw err(409, `${changesetId} holds no ghost door or window — nothing was advised`);
  const { pack } = await (deps.readPack || ev.readPack)(key, PACK_ID).catch((e) => { if (e.status === 404 || e.status === 409) e.message += "; nothing was advised"; throw e; });
  const { ask, skipped } = L.pickPhotos(pack);
  if (!ask.length) throw err(409, `no registered photo in the evidence pack${skipped.length ? ` (${skipped.map((s) => `${s.evidence}: ${s.words}`).join("; ").slice(0, 400)})` : ""} — nothing was advised`);
  const dir = deps.dir || ev.evidenceDir(key, deps.root);
  const tmp = mkdtempSync(join(tmpdir(), "sentinel-openings-"));
  let answers = [];
  try {
    const jobs = [];
    for (const item of ask) {
      const photo = join(dir, ".sentinel", "view", `${item.id}.jpg`);
      if (!(deps.exists ?? existsSync)(photo)) { skipped.push({ evidence: item.id, words: "its blurred copy is missing from the evidence folder — not asked" }); continue; }
      jobs.push(L.buildJob(item, photo, ghosts));
    }
    if (jobs.length) { // one child for every photo: the two models load once (~15 s), each photo then takes ~1 s on the GPU
      const jobFile = join(tmp, "jobs.json");
      writeFileSync(jobFile, JSON.stringify(jobs));
      const r = await deps.judge(jobFile);
      answers = (r.answers ?? []).map((a) => ({ evidence: a.evidence, answer: { ...a, tools: r.tools } }));
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  if (!answers.length) throw err(409, "no registered photo had its blurred copy — nothing was advised");
  const advice = { changeset: changesetId, ...L.adviseFrom(ghosts, answers), asked: answers.map((a) => a.evidence), skipped };
  const proj = await (deps.ensureProject || cde.ensureProject)(key);
  const who = resolveActor(actor, "web");
  const seen = advice.ghosts.filter((g) => g.seen_in.length).length;
  const r = await (deps.audit || cde.audit)(proj.id, "evidence", null, `evidence:openings ${changesetId} · ${seen}/${ghosts.length} seen · advice`, who, null,
    { pack_id: PACK_ID, advice: true, ...advice, actor: who });
  return { advice, ledger: { id: r?.id ?? null, hash: r?.hash ?? null } };
}
