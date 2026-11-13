// migration 0054 (BIM documents workspace R2d-2: the client outside Sentinel, the tender skip rule, Incorporated in appointment): dry-run on PGlite.
// Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

let db, PA, PB, PC, PD;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0054.test` });
const owner = u("owner"), lead2 = u("lead2"), arc = u("arc"), client = u("client");
const q = async (tx, sql, p) => (await tx.query(sql, p)).rows;
const refusal = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); throw e; } await tx.query("release savepoint r"); throw new Error("expected a refusal, got none"); };
const who = (tx, w) => tx.query(`select set_config('request.jwt.claims', $1, true)`, [w ? JSON.stringify({ sub: w.sub, role: "authenticated", email: w.email }) : ""]);
const sections = [{ id: "s1", heading: "Aim", state: "wip", body: "x", blocks: [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "x" } }] }];
const mkDoc = async (project, type = "BEP", stage = "pre_appointment") =>
  await db.query(`select set_config('request.jwt.claims', '', true)`) && (await db.query("insert into public.bim_documents(project_id, doc_type, title, sections, stage) values ($1, $2, 'Doc', $3, $4) returning id", [project, type, JSON.stringify(sections), stage])).rows[0].id;
const render = (id) => ({ id, title: "Doc", sections, live: { risks: 3 } });
const start = async (tx, w, doc) => { await who(tx, w); return (await q(tx, "select public.doc_round_start($1, $2, null, '{}') r", [doc, JSON.stringify(render(doc))]))[0].r; };
const decide = async (tx, w, round, decision, note = null) => { await who(tx, w); return (await q(tx, "select public.doc_round_decide($1, $2, $3) r", [round, decision, note]))[0].r; };
const outside = async (tx, w, round, outcome, date = "2026-11-03", name = "Jane Client", ref = null) => { await who(tx, w); return (await q(tx, "select public.doc_round_record_outside($1, $2, $3, $4, $5) r", [round, outcome, date, name, ref]))[0].r; };
const skip = async (tx, w, round, step, reason = "no one at the client") => { await who(tx, w); return (await q(tx, "select public.doc_round_skip($1, $2, $3) r", [round, step, reason]))[0].r; };
const setting = async (tx, w, project, on) => { await who(tx, w); return (await q(tx, "select public.set_client_outside_sentinel($1, $2) r", [project, on]))[0].r; };
const docRow = async (tx, id) => (await q(tx, "select status, suitability, stage from public.bim_documents where id = $1", [id]))[0];
const ledger = (tx, project, like) => q(tx, "select action, actor, entity_type, new_value from public.audit_log where project_id = $1 and action like $2 order by id", [project, like]);
const CHAIN = { steps: [], documents: { bep: { steps: [{ name: "Task teams confirm", role: "contributor", kind: "task_teams" }, { name: "Lead sign-off", role: "lead", party: "lead_appointed" }, { name: "Client", role: "viewer", party: "appointing" }] } } };

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, lead2, arc, client]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  const OFFICE = (await db.query("insert into public.projects(key, name, kind) values ('office-54', 'O', 'office') returning id")).rows[0].id;
  const proj = async (key) => (await db.query("insert into public.projects(key, name, office_key) values ($1, $1, 'office-54') returning id", [key])).rows[0].id;
  PA = await proj("p54-client"); PB = await proj("p54-outside"); PC = await proj("p54-skip"); PD = await proj("p54-late-client");
  const mem = (p, x, role, party, team = null) => db.query("insert into public.memberships(project_id, user_id, role, party, task_team, state) values ($1, $2, $3, $4, $5, 'active')", [p, x.sub, role, party, team]);
  for (const p of [PA, PB, PC, PD]) { await mem(p, owner, "owner", "lead_appointed"); await mem(p, lead2, "lead", "lead_appointed"); await mem(p, arc, "contributor", "appointed", "ARC"); await db.query("insert into public.task_teams(project_id, code, name) values ($1, 'ARC', 'Architecture')", [p]); }
  await mem(PA, client, "viewer", "appointing");
  await db.query("select set_config('sentinel.client_outside', $1, false)", [PB]); // the setting is on for PB (committed); its toggling is tested in a rolled-back transaction
  await db.query("update public.projects set client_outside_sentinel = true where id = $1", [PB]);
  await db.query("select set_config('sentinel.client_outside', '', false)");
  await db.query("insert into public.task_teams(project_id, code, name) values ($1, 'STR', 'Structure')", [PC]); // no member
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review', $2)", [String(OFFICE), JSON.stringify({ version: 1, sha256: "ab".repeat(32) })]);
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review@1', $2)", [String(OFFICE), JSON.stringify({ body: CHAIN })]);
}, 60_000);

describe("0054 the setting", () => {
  it("an owner turns it on and off, each change a ledger row; a lead, an active Client and a direct write are refused", () => as(db, "service", async (tx) => {
    await expect(refusal(tx, () => setting(tx, lead2, PC, true))).rejects.toThrow(/only an owner changes/);
    await expect(refusal(tx, () => setting(tx, owner, PA, true))).rejects.toThrow(/Client is already in Sentinel/);
    await who(tx, null);
    await expect(refusal(tx, () => tx.query("update public.projects set client_outside_sentinel = true where id = $1", [PC]))).rejects.toThrow(/changed by an owner/);
    await expect(refusal(tx, () => q(tx, "select public.set_client_outside_sentinel($1, true)", [PC]))).rejects.toThrow(/signed-in owner/);
    expect(await setting(tx, owner, PC, true)).toMatchObject({ client_outside_sentinel: true, changed: true });
    expect((await q(tx, "select client_outside_sentinel x from public.projects where id = $1", [PC]))[0].x).toBe(true);
    expect(await setting(tx, owner, PC, true)).toMatchObject({ changed: false });
    expect(await setting(tx, owner, PC, false)).toMatchObject({ client_outside_sentinel: false });
    expect(await setting(tx, owner, PC, true)).toMatchObject({ changed: true });
    const rows = await ledger(tx, PC, "client_outside_sentinel_changed");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ actor: owner.email, entity_type: "project" });
    expect(rows[0].new_value).toMatchObject({ client_outside_sentinel: true, by_uid: owner.sub });
  }));
});

describe("0054 the client outside Sentinel", () => {
  it("tender: steps 1-2, then a lead records 'selected' outside Sentinel -> round closed, document wip S0, the decision carries date and name, ledger row", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(PB);
    const R = (await start(tx, owner, doc)).round_id;
    await decide(tx, arc, R, "accept");
    await expect(refusal(tx, () => outside(tx, lead2, R, "selected"))).rejects.toThrow(/Only the Client's step/); // step 2 is waiting
    await decide(tx, lead2, R, "accept");
    await expect(refusal(tx, () => outside(tx, arc, R, "selected"))).rejects.toThrow(/only a lead or owner records/);
    await expect(refusal(tx, () => outside(tx, owner, R, "selected"))).rejects.toThrow(/sender does not decide/);
    await expect(refusal(tx, () => outside(tx, lead2, R, "accept"))).rejects.toThrow(/choices are: received, clarification, selected, not_selected/);
    await expect(refusal(tx, () => outside(tx, lead2, R, "selected", "2999-01-01"))).rejects.toThrow(/today or earlier/);
    await expect(refusal(tx, () => outside(tx, lead2, R, "selected", "2026-11-03", "  "))).rejects.toThrow(/Say who at the client/);
    await expect(refusal(tx, () => outside(tx, lead2, R, "clarification"))).rejects.toThrow(/Say why/);
    await who(tx, null);
    expect(await outside(tx, lead2, R, "selected", "2026-11-03", "Jane Client", "mail 3 Nov")).toMatchObject({ step: 3, closed: true, status: "closed", issued_version: 1 });
    expect(await docRow(tx, doc)).toMatchObject({ status: "wip", suitability: "S0" });
    expect((await q(tx, "select status, outcome from public.doc_rounds where id = $1", [R]))[0]).toEqual({ status: "closed", outcome: "selected" });
    const dec = (await q(tx, "select outside, outside_name, outside_date::text d, evidence_ref, party, decision, email from public.doc_round_decisions where round_id = $1 and step = 3", [R]))[0];
    expect(dec).toEqual({ outside: true, outside_name: "Jane Client", d: "2026-11-03", evidence_ref: "mail 3 Nov", party: "appointing", decision: "selected", email: lead2.email });
    const row = (await ledger(tx, PB, "review_step_recorded_outside")).pop();
    expect(row).toMatchObject({ entity_type: "review", actor: lead2.email });
    expect(row.new_value).toMatchObject({ round_id: R, step: 3, outcome: "selected", given_by: "Jane Client", recorded_by_uid: lead2.sub, evidence_ref: "mail 3 Nov" });
    // the lead who decided step 2 recorded step 3: the one-decision index does not count outside rows
    expect((await q(tx, "select count(*)::int n from public.doc_round_decisions where round_id = $1 and uid = $2", [R, lead2.sub]))[0].n).toBe(2);
  }));

  it("confirmed: a BEP is sent with no Client when the setting is on; a lead's recorded acceptance is step 3 -> version C01 (the frozen render), published A1", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(PB, "BEP", "confirmed");
    const R = (await start(tx, owner, doc)).round_id;
    await decide(tx, arc, R, "accept_with_comments", "mind the grid");
    await decide(tx, lead2, R, "accept");
    expect(await docRow(tx, doc)).toMatchObject({ status: "shared", suitability: "S5" });
    await expect(refusal(tx, () => outside(tx, lead2, R, "selected"))).rejects.toThrow(/choices are: accept, reject/);
    const fin = await outside(tx, lead2, R, "accept", "2026-11-04", "Jane Client");
    expect(fin).toMatchObject({ step: 3, closed: true, published_version: 1, doc_status: "published" });
    expect(await docRow(tx, doc)).toMatchObject({ status: "published", suitability: "A1" });
    const v = (await q(tx, "select revision, sha, snapshot from public.bim_document_versions where document_id = $1", [doc]))[0];
    const rr = (await q(tx, "select render, render_sha from public.doc_rounds where id = $1", [R]))[0];
    expect(v.revision).toBe("C01"); expect(v.snapshot).toEqual(rr.render); expect(v.sha).toBe(rr.render_sha);
    const rows = (await ledger(tx, PB, "review_step_recorded_outside")).map((x) => x.new_value.outcome);
    expect(rows).toContain("accept");
  }));

  it("a rejection recorded outside voids the round with its reason; with the setting off, or with a Client in the roster, the record is refused", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(PB, "BEP", "confirmed");
    const R = (await start(tx, owner, doc)).round_id;
    await decide(tx, arc, R, "accept"); await decide(tx, lead2, R, "accept");
    expect(await outside(tx, lead2, R, "reject", "2026-11-04", "Jane Client", "wants the programme changed")).toMatchObject({ status: "voided", closed: true });
    expect(await docRow(tx, doc)).toMatchObject({ status: "wip", suitability: "S0" });
    // setting off
    const d2 = await mkDoc(PC);
    const R2 = (await start(tx, owner, d2)).round_id;
    await expect(refusal(tx, () => outside(tx, lead2, R2, "selected"))).rejects.toThrow(/is off on this project/);
    // a Client who is in the roster decides in Sentinel (PD: the setting is on, then a Client joins before the send)
    await setting(tx, owner, PD, true);
    await who(tx, null);
    await tx.query("insert into public.memberships(project_id, user_id, role, party, state) values ($1, $2, 'viewer', 'appointing', 'active')", [PD, client.sub]);
    const d3 = await mkDoc(PD);
    const R3 = (await start(tx, owner, d3)).round_id;
    await decide(tx, arc, R3, "accept"); await decide(tx, lead2, R3, "accept");
    await expect(refusal(tx, () => outside(tx, lead2, R3, "selected"))).rejects.toThrow(/they decide in Sentinel/);
  }));

  it("with the setting off, a confirmed send with no Client is still refused (0053)", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(PC, "BEP", "confirmed");
    await tx.query("delete from public.task_teams where project_id = $1 and code = 'STR'", [PC]);
    await expect(refusal(tx, () => start(tx, owner, doc))).rejects.toThrow(/Invite the Client/);
    await tx.query("insert into public.task_teams(project_id, code, name) values ($1, 'STR', 'Structure')", [PC]);
  }));
});

describe("0054 the tender skip rule", () => {
  it("step 1: the team with no member is skipped with a reason; then step 2 issues P01; step 3 is skipped (no Client) -> closed, 'skipped' outcome, document wip S0, P01 kept", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(PC);
    const R = (await start(tx, owner, doc)).round_id;
    await expect(refusal(tx, () => skip(tx, lead2, R, 1, "  "))).rejects.toThrow(/carries its reason/);
    await expect(refusal(tx, () => skip(tx, arc, R, 1))).rejects.toThrow(/only a lead or owner skips/);
    await expect(refusal(tx, () => skip(tx, lead2, R, 2))).rejects.toThrow(/waits on step 1/);
    await decide(tx, arc, R, "accept");
    expect(await docRow(tx, doc)).toMatchObject({ status: "wip" }); // STR still owed
    expect(await skip(tx, lead2, R, 1, "no structural engineer appointed yet")).toMatchObject({ step: 1, decision: "skipped", closed: false });
    expect(await docRow(tx, doc)).toMatchObject({ status: "shared", suitability: "S3" });
    await expect(refusal(tx, () => skip(tx, lead2, R, 2))).rejects.toThrow(/Only a step nobody can decide/);
    await decide(tx, lead2, R, "accept");
    expect(await docRow(tx, doc)).toMatchObject({ suitability: "S4" });
    await expect(refusal(tx, () => skip(tx, arc, R, 3))).rejects.toThrow(/only a lead or owner skips/);
    expect(await skip(tx, lead2, R, 3, "the client has no Sentinel account")).toMatchObject({ step: 3, closed: true, status: "closed", issued_version: 1 });
    expect(await docRow(tx, doc)).toMatchObject({ status: "wip", suitability: "S0" });
    expect((await q(tx, "select status, outcome, issued_version from public.doc_rounds where id = $1", [R]))[0]).toEqual({ status: "closed", outcome: "skipped", issued_version: 1 });
    expect((await q(tx, "select count(*)::int n from public.bim_document_versions where document_id = $1", [doc]))[0].n).toBe(1);
    const rows = await ledger(tx, PC, "review_step_skipped");
    expect(rows).toHaveLength(2);
    expect(rows[0].new_value).toMatchObject({ step: 1, teams: ["STR"], reason: "no structural engineer appointed yet", skipped_by_uid: lead2.sub });
    expect(rows[1].new_value).toMatchObject({ step: 3, reason: "the client has no Sentinel account" });
    expect(rows[0]).toMatchObject({ entity_type: "review", actor: lead2.email });
    // the closed round does not skip again
    await expect(refusal(tx, () => skip(tx, lead2, R, 3))).rejects.toThrow(/no longer open/);
  }));

  it("refused: step 1 when every team owed has a member; step 3 when the Client is on the roster; any skip at confirmed; the machine", () => as(db, "service", async (tx) => {
    const d1 = await mkDoc(PB);
    const R1 = (await start(tx, owner, d1)).round_id;
    await expect(refusal(tx, () => skip(tx, lead2, R1, 1))).rejects.toThrow(/Every team owed has a member/);
    const d2 = await mkDoc(PA);
    const R2 = (await start(tx, owner, d2)).round_id;
    await decide(tx, arc, R2, "accept"); await decide(tx, lead2, R2, "accept");
    await expect(refusal(tx, () => skip(tx, lead2, R2, 3))).rejects.toThrow(/Client is a member of this round/);
    const d3 = await mkDoc(PB, "BEP", "confirmed");
    const R3 = (await start(tx, owner, d3)).round_id;
    await expect(refusal(tx, () => skip(tx, lead2, R3, 1))).rejects.toThrow(/tender stage only/);
    await who(tx, null);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_skip($1, 1, 'x')", [R1]))).rejects.toThrow(/signed-in person/);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_record_outside($1, 'selected', '2026-11-03', 'J', null)", [R1]))).rejects.toThrow(/signed-in person/);
    await expect(as(db, { sub: uuid(), email: "x@0054.test" }, (t2) => t2.query("select public.doc_round_skip($1, 1, 'x')", [R1]))).rejects.toThrow(/not found|permission/);
  }));
});

describe("0054 Incorporated in appointment", () => {
  it("a lead records the version, its sha and the parties on the ledger; a contributor, an unknown version and no parties are refused", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(PB, "BEP", "confirmed");
    const R = (await start(tx, owner, doc)).round_id;
    await decide(tx, arc, R, "accept"); await decide(tx, lead2, R, "accept"); await outside(tx, lead2, R, "accept");
    const sha = (await q(tx, "select sha from public.bim_document_versions where document_id = $1 and version_no = 1", [doc]))[0].sha;
    const inc = async (w, ver, parties) => { await who(tx, w); return (await q(tx, "select public.doc_incorporated($1, $2, $3) r", [doc, ver, parties]))[0].r; };
    await expect(refusal(tx, () => inc(arc, 1, ["Firm A"]))).rejects.toThrow(/only a lead or owner/);
    await expect(refusal(tx, () => inc(lead2, 7, ["Firm A"]))).rejects.toThrow(/not a published version/);
    await expect(refusal(tx, () => inc(lead2, 1, []))).rejects.toThrow(/Name the parties/);
    await expect(refusal(tx, () => inc(lead2, 1, ["  "]))).rejects.toThrow(/Name the parties/);
    expect(await inc(lead2, 1, ["Firm A", " Firm B "])).toMatchObject({ version_no: 1, sha, parties: ["Firm A", "Firm B"] });
    const row = (await ledger(tx, PB, "document_incorporated")).pop();
    expect(row).toMatchObject({ entity_type: "bim_document", actor: lead2.email });
    expect(row.new_value).toMatchObject({ version_no: 1, sha, parties: ["Firm A", "Firm B"], by_uid: lead2.sub });
    await who(tx, null);
    await expect(refusal(tx, () => q(tx, "select public.doc_incorporated($1, 1, array['x'])", [doc]))).rejects.toThrow(/signed-in person/);
  }));
});

describe("0054 files are valid UTF-8", () => {
  for (const f of ["0054_round_outside.sql", "probes/0054_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
