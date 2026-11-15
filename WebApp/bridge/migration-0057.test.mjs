// migration 0057 (a task team that is not in Sentinel: a lead records its confirmation taken outside): dry-run on PGlite.
// The rules 0057 keeps are proved by migration-0054.test.mjs and migration-0055.test.mjs, which run on the same full set of migrations. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
let db, P, P2;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0057.test` });
const owner = u("owner"), lead2 = u("lead2"), arc = u("arc"), late = u("late"), helper = u("helper");
const q = async (tx, sql, p) => (await tx.query(sql, p)).rows;
const refusal = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); throw e; } await tx.query("release savepoint r"); throw new Error("expected a refusal, got none"); };
const who = (tx, w) => tx.query(`select set_config('request.jwt.claims', $1, true)`, [w ? JSON.stringify({ sub: w.sub, role: "authenticated", email: w.email }) : ""]);
const sections = [{ id: "s1", heading: "Aim", state: "wip", body: "x", blocks: [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "x" } }] }];
const mkDoc = async (tx, project, stage = "confirmed") => { await who(tx, null); return (await q(tx, "insert into public.bim_documents(project_id, doc_type, title, sections, stage) values ($1, 'BEP', 'Doc', $2, $3) returning id", [project, JSON.stringify(sections), stage]))[0].id; };
const start = async (tx, w, doc) => { await who(tx, w); return (await q(tx, "select public.doc_round_start($1, $2, null, '{}') r", [doc, JSON.stringify({ id: doc, title: "Doc", sections })]))[0].r.round_id; };
const decide = async (tx, w, round, decision, note = null) => { await who(tx, w); return (await q(tx, "select public.doc_round_decide($1, $2, $3) r", [round, decision, note]))[0].r; };
const team = async (tx, w, round, code, outcome = "accept", date = TODAY, name = "Sam Structure", ref = null) => { await who(tx, w); return (await q(tx, "select public.doc_round_record_team_outside($1, $2, $3, $4, $5, $6) r", [round, code, outcome, date, name, ref]))[0].r; };
const mark = async (tx, project, codes, on = true) => { await who(tx, null); await tx.query("update public.task_teams set outside_sentinel = $3 where project_id = $1 and code = any($2)", [project, codes, on]); };
const docRow = async (tx, id) => (await q(tx, "select status, suitability from public.bim_documents where id = $1", [id]))[0];
const chain = (leadRole) => ({ steps: [], documents: { bep: { steps: [{ name: "Task teams confirm", role: "contributor", kind: "task_teams" }, { name: "Lead sign-off", role: leadRole, party: "lead_appointed" }, { name: "Client", role: "viewer", party: "appointing" }] } } });

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, lead2, arc, late, helper]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  const office = async (key, leadRole) => {
    const id = (await db.query("insert into public.projects(key, name, kind) values ($1, 'O', 'office') returning id", [key])).rows[0].id;
    await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review', $2)", [String(id), JSON.stringify({ version: 1, sha256: "ab".repeat(32) })]);
    await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review@1', $2)", [String(id), JSON.stringify({ body: chain(leadRole) })]);
  };
  await office("office-57", "lead"); await office("office-57b", "contributor");
  const proj = async (key, officeKey) => {
    const id = (await db.query("insert into public.projects(key, name, office_key) values ($1, $1, $2) returning id", [key, officeKey])).rows[0].id;
    await db.query("select set_config('sentinel.client_outside', $1, false)", [id]); // the client is outside Sentinel, so the round needs no Client member
    await db.query("update public.projects set client_outside_sentinel = true where id = $1", [id]);
    await db.query("select set_config('sentinel.client_outside', '', false)");
    return id;
  };
  P = await proj("p57", "office-57"); P2 = await proj("p57b", "office-57b");
  const mem = (p, x, role, party, t = null) => db.query("insert into public.memberships(project_id, user_id, role, party, task_team, state) values ($1, $2, $3, $4, $5, 'active')", [p, x.sub, role, party, t]);
  await mem(P, owner, "owner", "lead_appointed"); await mem(P, lead2, "lead", "lead_appointed"); await mem(P, arc, "contributor", "appointed", "ARC");
  for (const [code, name] of [["ARC", "Architecture"], ["MEP", "Services"], ["STR", "Structure"]]) await db.query("insert into public.task_teams(project_id, code, name) values ($1, $2, $3)", [P, code, name]);
  // P2: its chain lets a contributor sign off for the Lead firm, so the owner is the only lead or owner
  await mem(P2, owner, "owner", "lead_appointed"); await mem(P2, helper, "contributor", "lead_appointed");
  await db.query("insert into public.task_teams(project_id, code, name, outside_sentinel) values ($1, 'STR', 'Structure', true)", [P2]);
}, 60_000);

describe("0057 the send", () => {
  it("an unmarked team with no member still stops a confirmed send, naming it; marked, the send goes and the team is owed", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(tx, P);
    await expect(refusal(tx, () => start(tx, owner, doc))).rejects.toThrow(/Team MEP has no active member, so it cannot confirm: invite one, or mark the team as not in Sentinel/);
    await mark(tx, P, ["MEP"]);
    await expect(refusal(tx, () => start(tx, owner, doc))).rejects.toThrow(/Team STR has no active member/);
    await mark(tx, P, ["STR"]);
    const R = await start(tx, owner, doc);
    expect((await q(tx, "select teams_owed from public.doc_rounds where id = $1", [R]))[0].teams_owed).toEqual(["ARC", "MEP", "STR"]);
  }));

  it("a marked team with no member needs a lead or owner other than the sender, to record it", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(tx, P2);
    await expect(refusal(tx, () => start(tx, owner, doc))).rejects.toThrow(/Invite a second lead: the sender does not record a team's confirmation taken outside Sentinel/);
  }));
});

describe("0057 recording a team's confirmation taken outside Sentinel", () => {
  it("a lead who is not the sender records each marked team once; the step completes with the team in Sentinel; the plan reaches Published", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(tx, P);
    await mark(tx, P, ["MEP", "STR"]);
    const R = await start(tx, owner, doc);
    await expect(refusal(tx, () => team(tx, owner, R, "STR"))).rejects.toThrow(/sender does not decide/);
    await expect(refusal(tx, () => team(tx, arc, R, "STR"))).rejects.toThrow(/only a lead or owner records/);
    await expect(refusal(tx, () => team(tx, lead2, R, "XYZ"))).rejects.toThrow(/Team XYZ is not owed a confirmation/);
    await expect(refusal(tx, () => team(tx, lead2, R, "ARC"))).rejects.toThrow(/Team ARC is not marked as not in Sentinel/);
    await mark(tx, P, ["ARC"]);
    await expect(refusal(tx, () => team(tx, lead2, R, "ARC"))).rejects.toThrow(/Team ARC has a member in this round: they confirm in Sentinel/);
    await expect(refusal(tx, () => team(tx, lead2, R, "STR", "accept_with_comments"))).rejects.toThrow(/choices are: accept, reject/);
    await expect(refusal(tx, () => team(tx, lead2, R, "STR", "accept", TODAY, "  "))).rejects.toThrow(/Say who in the team gave it/);
    await expect(refusal(tx, () => team(tx, lead2, R, "STR", "accept", TOMORROW))).rejects.toThrow(/today or earlier/);
    await expect(refusal(tx, () => team(tx, lead2, R, "STR", "reject"))).rejects.toThrow(/Say why/);

    expect(await team(tx, lead2, R, "STR", "accept", TODAY, "Sam Structure", "e-mail of 14 November")).toMatchObject({ step: 1, decision: "accept", task_team: "STR", status: "open", closed: false });
    expect(await docRow(tx, doc)).toEqual({ status: "wip", suitability: "S0" }); // step 1 still waits on ARC and MEP
    await expect(refusal(tx, () => team(tx, lead2, R, "STR"))).rejects.toThrow(/Team STR is already confirmed or skipped/);
    expect(await team(tx, lead2, R, "mep", "accept", TODAY, "Mia Services")).toMatchObject({ task_team: "MEP" }); // the code as declared
    await decide(tx, arc, R, "accept");
    expect(await docRow(tx, doc)).toEqual({ status: "shared", suitability: "S3" });
    await expect(refusal(tx, () => team(tx, lead2, R, "STR"))).rejects.toThrow(/only while the round waits on the task teams/);

    const rows = await q(tx, "select task_team, party, outside, outside_name, outside_date::text d, evidence_ref, uid, note from public.doc_round_decisions where round_id = $1 and outside order by task_team", [R]);
    expect(rows).toEqual([
      { task_team: "MEP", party: "appointed", outside: true, outside_name: "Mia Services", d: TODAY, evidence_ref: null, uid: lead2.sub, note: null },
      { task_team: "STR", party: "appointed", outside: true, outside_name: "Sam Structure", d: TODAY, evidence_ref: "e-mail of 14 November", uid: lead2.sub, note: null },
    ]);
    const led = await q(tx, "select new_value from public.audit_log where project_id = $1 and action = 'review_step_recorded_outside' order by id", [P]);
    expect(led.map((r) => r.new_value)).toMatchObject([{ round_id: R, step: 1, task_team: "STR", outcome: "accept", given_by: "Sam Structure", recorded_by_uid: lead2.sub }, { task_team: "MEP", given_by: "Mia Services" }]);

    // the lead who recorded the teams still signs off for the Lead firm, then records the Client's acceptance
    await decide(tx, lead2, R, "accept");
    await who(tx, lead2);
    expect((await q(tx, "select public.doc_round_record_outside($1, 'accept', $2, 'Jane Client', null) r", [R, TODAY]))[0].r).toMatchObject({ status: "closed", closed: true });
    expect(await docRow(tx, doc)).toEqual({ status: "published", suitability: "A1" });
  }));

  it("a mark taken off, or a member who joined after the send, stops the record; a recorded rejection voids the round; at tender a marked team is recorded too", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(tx, P);
    await mark(tx, P, ["MEP", "STR"]);
    const R = await start(tx, owner, doc);
    await mark(tx, P, ["MEP"], false);
    await expect(refusal(tx, () => team(tx, lead2, R, "MEP"))).rejects.toThrow(/Team MEP is not marked as not in Sentinel/);
    await mark(tx, P, ["MEP"]);
    await who(tx, null);
    await tx.query("insert into public.memberships(project_id, user_id, role, party, task_team, state) values ($1, $2, 'contributor', 'appointed', 'STR', 'active')", [P, late.sub]);
    await expect(refusal(tx, () => team(tx, lead2, R, "STR"))).rejects.toThrow(/Team STR has a member in Sentinel now, so they confirm in Sentinel: withdraw the round and send it again/);
    expect(await team(tx, lead2, R, "MEP", "reject", TODAY, "Mia Services", "the plant rooms are not agreed")).toMatchObject({ decision: "reject", status: "voided", closed: true });
    expect(await docRow(tx, doc)).toEqual({ status: "wip", suitability: "S0" });
    expect((await q(tx, "select note from public.doc_round_decisions where round_id = $1 and outside", [R]))[0].note).toBe("the plant rooms are not agreed");

    const tender = await mkDoc(tx, P, "pre_appointment");
    const T = await start(tx, owner, tender);
    expect(await team(tx, lead2, T, "MEP")).toMatchObject({ step: 1, task_team: "MEP", status: "open" });
  }));
});

describe("0057 the probe passes on PGlite", () => {
  it("part 1 every row true, part 2 'PROBE 0057: 8 of 8 as expected.' (rolled back)", async () => {
    const probe = readFileSync(new URL("../db/migrations/probes/0057_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
    const i = probe.search(/^-- Part 2$/m);
    const r1 = (await db.query(probe.slice(probe.search(/^-- Part 1$/m), i))).rows;
    expect(r1.filter((r) => r.ok !== true).map((r) => r.what)).toEqual([]);
    expect(r1.length).toBe(3);
    await expect(db.exec(probe.slice(i))).rejects.toThrow("PROBE 0057: 8 of 8 as expected.");
  });
});

describe("0057 files are valid UTF-8", () => {
  for (const f of ["0057_team_outside.sql", "probes/0057_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
