// migration 0053 (BIM documents workspace R2d-1: document review rounds): dry-run on PGlite with every migration. Applying it live is the founder's.
// Concurrency (two deciders at once) rests on `select ... for update` on the round row; PGlite is one connection, so it is not driven here.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

let db, P, P2, P3, OFFICE, DOC;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0053.test` });
const owner = u("owner"), lead2 = u("lead2"), arc = u("arc"), client = u("client"), lvw = u("lvw"), invited = u("invited");
const q = async (tx, sql, p) => (await tx.query(sql, p)).rows;
const refusal = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); throw e; } await tx.query("release savepoint r"); throw new Error("expected a refusal, got none"); };
const who = (tx, w) => tx.query(`select set_config('request.jwt.claims', $1, true)`, [w ? JSON.stringify({ sub: w.sub, role: "authenticated", email: w.email }) : ""]);
const sections = [{ id: "s1", heading: "Aim", state: "wip", body: "x", blocks: [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "x" } }] }];

const mkDoc = async (project, type = "BEP", stage = "pre_appointment") =>
  await db.query(`select set_config('request.jwt.claims', '', true)`) && (await db.query("insert into public.bim_documents(project_id, doc_type, title, sections, stage) values ($1, $2, 'Doc', $3, $4) returning id", [project, type, JSON.stringify(sections), stage])).rows[0].id;
const render = (id, extra = {}) => ({ id, title: "Doc", sections, live: { risks: 3 }, ...extra });
const start = async (tx, w, doc, extra = {}, deadline = null, codes = {}) => {
  await who(tx, w);
  return (await q(tx, "select public.doc_round_start($1, $2, $3, $4) r", [doc, JSON.stringify(render(doc, extra)), deadline, JSON.stringify(codes)]))[0].r;
};
const decide = async (tx, w, round, decision, note = null) => { await who(tx, w); return (await q(tx, "select public.doc_round_decide($1, $2, $3) r", [round, decision, note]))[0].r; };
const docRow = async (tx, id) => (await q(tx, "select status, suitability, stage from public.bim_documents where id = $1", [id]))[0];
const ledger = (tx, project, like) => q(tx, "select action, actor, entity_type, new_value from public.audit_log where project_id = $1 and action like $2 order by id", [project, like]);

const BEP_CHAIN = { steps: [], documents: { bep: { steps: [{ name: "Task teams confirm", role: "contributor", kind: "task_teams" }, { name: "Lead sign-off", role: "lead", party: "lead_appointed" }, { name: "Client", role: "viewer", party: "appointing" }] },
  eir: { steps: [{ name: "Issuer", role: "viewer", party: "appointing" }, { name: "Acceptor", role: "lead", party: "lead_appointed" }] } } };

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, lead2, arc, client, lvw, invited]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  OFFICE = (await db.query("insert into public.projects(key, name, kind) values ('office-53', 'O', 'office') returning id")).rows[0].id;
  await db.query("insert into public.projects(key, name, kind) values ('office-53b', 'O2', 'office')");
  const proj = async (key, office) => (await db.query("insert into public.projects(key, name, office_key) values ($1, $1, $2) returning id", [key, office])).rows[0].id;
  P = await proj("p53", "office-53");
  P2 = await proj("p53-solo", "office-53");   // owner only: no second lead, no Client
  P3 = await proj("p53-noclient", "office-53"); // second lead, team member, no Client
  const mem = (p, x, role, party, team = null, state = "active") =>
    db.query("insert into public.memberships(project_id, user_id, role, party, task_team, state) values ($1, $2, $3, $4, $5, $6)", [p, x.sub, role, party, team, state]);
  await mem(P, owner, "owner", "lead_appointed"); await mem(P, lead2, "lead", "lead_appointed"); await mem(P, arc, "contributor", "appointed", "ARC");
  await mem(P, client, "viewer", "appointing"); await mem(P, lvw, "viewer", "lead_appointed"); await mem(P, invited, "contributor", "appointed", "ARC", "invited");
  await mem(P2, owner, "owner", "lead_appointed"); await mem(P2, arc, "contributor", "appointed", "ARC"); await mem(P2, client, "viewer", "appointing");
  await mem(P3, owner, "owner", "lead_appointed"); await mem(P3, lead2, "lead", "lead_appointed"); await mem(P3, arc, "contributor", "appointed", "ARC");
  for (const p of [P, P2, P3]) await db.query("insert into public.task_teams(project_id, code, name) values ($1, 'ARC', 'Architecture')", [p]);
  // review@1 on the office, as artefact-store files it: the pointer and the body
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review', $2)", [String(OFFICE), JSON.stringify({ version: 1, sha256: "ab".repeat(32) })]);
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review@1', $2)", [String(OFFICE), JSON.stringify({ body: BEP_CHAIN })]);
  DOC = await mkDoc(P);
}, 60_000);

describe("0053 rounds", () => {
  it("tender: step 1 by ARC -> shared S3; step 2 by the second lead -> version P01 = the frozen render, S4, round open; step 3 'selected' by the Client -> closed, document wip S0", () => as(db, "service", async (tx) => {
    const { round_id, render_sha } = await start(tx, owner, DOC, {}, null, {});
    expect(render_sha).toMatch(/^[0-9a-f]{64}$/);
    expect(await docRow(tx, DOC)).toEqual({ status: "wip", suitability: "S0", stage: "pre_appointment" });
    expect(await decide(tx, arc, round_id, "accept")).toMatchObject({ step: 1, closed: false, status: "open", doc_status: "shared" });
    expect(await docRow(tx, DOC)).toMatchObject({ status: "shared", suitability: "S3" });
    const r2 = await decide(tx, lead2, round_id, "accept");
    expect(r2).toMatchObject({ step: 2, closed: false, status: "open", issued_version: 1, published_version: null });
    const v = (await q(tx, "select version_no, revision, label, sha, stage, suitability, snapshot, round_id, published_by from public.bim_document_versions where document_id = $1", [DOC]))[0];
    const rr = (await q(tx, "select render, render_sha, issued_version, status from public.doc_rounds where id = $1", [round_id]))[0];
    expect(v).toMatchObject({ version_no: 1, revision: "P01", label: "Tender issue P01", suitability: "S4", stage: "pre_appointment", round_id, published_by: lead2.email });
    expect(v.snapshot).toEqual(rr.render);
    expect(v.sha).toBe(rr.render_sha); expect(v.sha).toBe(render_sha);
    expect(rr).toMatchObject({ issued_version: 1, status: "open" });
    expect(await docRow(tx, DOC)).toMatchObject({ status: "shared", suitability: "S4" });
    const r3 = await decide(tx, client, round_id, "selected");
    expect(r3).toMatchObject({ step: 3, closed: true, status: "closed", issued_version: 1 });
    expect(await docRow(tx, DOC)).toMatchObject({ status: "wip", suitability: "S0" });
    expect((await q(tx, "select status, outcome from public.doc_rounds where id = $1", [round_id]))[0]).toEqual({ status: "closed", outcome: "selected" });
  }));

  it("confirmed after appointment indicated: steps 1-3 accept -> version C01, document published A1; the version's snapshot equals the round's render though the document's live sources changed", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    const t = await start(tx, owner, doc);
    await decide(tx, arc, t.round_id, "accept"); await decide(tx, lead2, t.round_id, "accept"); await decide(tx, client, t.round_id, "selected");
    await who(tx, owner);
    expect((await q(tx, "select public.doc_appointment_indicated($1) r", [doc]))[0].r).toMatchObject({ stage: "confirmed" });
    expect(await docRow(tx, doc)).toMatchObject({ stage: "confirmed", status: "wip" });
    const c = await start(tx, owner, doc, { live: { risks: 9, register: ["a"] } }, null, { accept: "A1" });
    expect(await decide(tx, arc, c.round_id, "accept_with_comments", "mind the grid")).toMatchObject({ step: 1 });
    expect(await docRow(tx, doc)).toMatchObject({ status: "shared", suitability: "S3" });
    await decide(tx, lead2, c.round_id, "accept");
    expect(await docRow(tx, doc)).toMatchObject({ status: "shared", suitability: "S5" });
    const fin = await decide(tx, client, c.round_id, "accept");
    expect(fin).toMatchObject({ step: 3, closed: true, status: "closed", published_version: 2, doc_status: "published" });
    expect(await docRow(tx, doc)).toMatchObject({ status: "published", suitability: "A1", stage: "confirmed" });
    const v = (await q(tx, "select revision, sha, snapshot, suitability from public.bim_document_versions where document_id = $1 and version_no = 2", [doc]))[0];
    const rr = (await q(tx, "select render, render_sha from public.doc_rounds where id = $1", [c.round_id]))[0];
    expect(v).toMatchObject({ revision: "C01", suitability: "A1" });
    expect(v.snapshot).toEqual(rr.render); expect(v.snapshot.live).toEqual({ risks: 9, register: ["a"] });
    expect(v.sha).toBe(rr.render_sha);
  }));

  it("the lock: while open, an update of sections, status, stage or suitability is refused even as service; a comment write (bridge_docs) is not", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    await start(tx, owner, doc);
    await who(tx, null);
    for (const set of ["sections = '[]'::jsonb", "status = 'archived'", "stage = 'confirmed'", "suitability = 'S5'", "status = 'published', suitability = 'A1'"])
      await expect(refusal(tx, () => tx.query(`update public.bim_documents set ${set} where id = $1`, [doc]))).rejects.toThrow(/out for review: it changes only through the round/);
    await tx.query("update public.bim_documents set title = 'renamed' where id = $1", [doc]);
    await tx.query("update public.bim_documents set sections = sections where id = $1", [doc]);
    await tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('doc_comments', $1, $2, '{}')", [String(P), `c-${doc}`]);
    // a stale mark naming another round does not unlock it, and the mark does not outlive the function that set it
    await tx.query(`select set_config('sentinel.doc_round', $1, true)`, [uuid()]);
    await expect(refusal(tx, () => tx.query("update public.bim_documents set status = 'archived' where id = $1", [doc]))).rejects.toThrow(/out for review/);
  }));

  it("refusals: the sender deciding, a viewer of the Lead firm on step 2, the Client on step 1, an invited member, a second decision by the same person, a reject without a note, the machine (no JWT)", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    const { round_id: R } = await start(tx, owner, doc);
    await expect(refusal(tx, () => decide(tx, owner, R, "accept"))).rejects.toThrow(/sender does not decide/);
    await expect(refusal(tx, () => decide(tx, client, R, "accept"))).rejects.toThrow(/confirmed by each task team/);
    await expect(refusal(tx, () => decide(tx, invited, R, "accept"))).rejects.toThrow(/not on the roster/);
    await expect(refusal(tx, () => decide(tx, arc, R, "reject"))).rejects.toThrow(/rejection says why/);
    await expect(refusal(tx, () => decide(tx, arc, R, "selected"))).rejects.toThrow(/choices are/);
    await who(tx, null);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_decide($1, 'accept')", [R]))).rejects.toThrow(/signed-in person/);
    await decide(tx, arc, R, "accept");
    await expect(refusal(tx, () => decide(tx, arc, R, "accept"))).rejects.toThrow(/already decided/);
    await expect(refusal(tx, () => decide(tx, lvw, R, "accept"))).rejects.toThrow(/needs lead or above/);
    await expect(refusal(tx, () => decide(tx, arc, R, "reject", "x"))).rejects.toThrow(/already decided/);
    // the Client on step 3 of a tender cannot accept (the choices are the four outcomes) and a reject is not among them
    await decide(tx, lead2, R, "accept");
    await expect(refusal(tx, () => decide(tx, client, R, "accept"))).rejects.toThrow(/received, clarification, selected, not_selected/);
    await expect(refusal(tx, () => decide(tx, client, R, "clarification"))).rejects.toThrow(/says what is unclear/);
    // the grants: only authenticated may call, and the frozen render is not readable by it
    await expect(as(db, { sub: uuid(), email: "x@0053.test" }, (t2) => t2.query("select render from public.doc_rounds"))).rejects.toThrow(/permission denied/);
  }));

  it("the roster is the snapshot: a party change or a late joiner after the send changes nothing", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    const { round_id: R } = await start(tx, owner, doc);
    await who(tx, owner);
    await tx.query("update public.memberships set party = 'lead_appointed', task_team = null where project_id = $1 and user_id = $2", [P, arc.sub]);
    await who(tx, null);
    await tx.query("update public.memberships set state = 'active' where project_id = $1 and user_id = $2", [P, invited.sub]); // flips on first sign-in, after the send
    expect(await decide(tx, arc, R, "accept")).toMatchObject({ step: 1 }); // still ARC on the roster
    await expect(refusal(tx, () => decide(tx, invited, R, "accept"))).rejects.toThrow(/not on the roster/);
    await decide(tx, lead2, R, "accept");
    await expect(refusal(tx, () => decide(tx, invited, R, "selected"))).rejects.toThrow(/not on the roster/);
  }));

  it("send refused: no second lead; a stale render; an open round already; a confirmed send with a team owed and no active member; no chain for the type", () => as(db, "service", async (tx) => {
    const solo = await mkDoc(P2);
    await expect(refusal(tx, () => start(tx, owner, solo))).rejects.toThrow(/Invite a second lead/);
    const doc = await mkDoc(P);
    await who(tx, owner);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_start($1, $2, null, '{}')", [doc, JSON.stringify({ ...render(doc), sections: [] })]))).rejects.toThrow(/changed since the preview/);
    expect(await q(tx, "select 1 from public.doc_rounds where document_id = $1", [doc])).toEqual([]); // nothing frozen
    await start(tx, owner, doc);
    await expect(refusal(tx, () => start(tx, owner, doc))).rejects.toThrow(/already out for review/);
    const conf = await mkDoc(P, "BEP", "confirmed");
    await tx.query("insert into public.task_teams(project_id, code, name) values ($1, 'STR', 'Structure')", [P]);
    await expect(refusal(tx, () => start(tx, owner, conf))).rejects.toThrow(/Team STR has no active member, so it cannot confirm/);
    const ready = await mkDoc(P, "READINESS");
    await expect(refusal(tx, () => start(tx, owner, ready))).rejects.toThrow(/No review chain/);
    const noClient = await mkDoc(P3, "BEP", "confirmed");
    await expect(refusal(tx, () => start(tx, lead2, noClient))).rejects.toThrow(/Invite the Client/);
    const d2 = await mkDoc(P), d3 = await mkDoc(P);
    await expect(refusal(tx, () => start(tx, arc, d2))).rejects.toThrow(/only a lead or owner sends/);
    await expect(refusal(tx, () => start(tx, owner, d3, {}, null, { shared: "S4" }))).rejects.toThrow(/Shared is S1, S2 or S3/);
    await who(tx, null);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_start($1, $2, null, '{}')", [doc, JSON.stringify(render(doc))]))).rejects.toThrow(/signed-in person/);
  }));

  it("an EIR runs two steps: the issuer party issues (shared), the acceptor publishes C01", () => as(db, "service", async (tx) => {
    const eir = await mkDoc(P, "EIR");
    const R = (await start(tx, lead2, eir)).round_id;
    await expect(refusal(tx, () => decide(tx, lead2, R, "accept"))).rejects.toThrow(/sender does not decide/);
    await expect(refusal(tx, () => decide(tx, owner, R, "accept"))).rejects.toThrow(/decided by the Client/);
    await decide(tx, client, R, "accept");
    expect(await docRow(tx, eir)).toMatchObject({ status: "shared", suitability: "S3" });
    expect(await decide(tx, owner, R, "accept")).toMatchObject({ step: 2, closed: true, published_version: 1, doc_status: "published" });
    expect((await q(tx, "select revision, suitability from public.bim_document_versions where document_id = $1", [eir]))[0]).toEqual({ revision: "C01", suitability: "A1" });
  }));

  it("a rejection voids the round and returns the document to wip S0; nothing decided carries over", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    const R = (await start(tx, owner, doc)).round_id;
    await decide(tx, arc, R, "accept");
    expect(await decide(tx, lead2, R, "reject", "wrong scope")).toMatchObject({ step: 2, closed: true, status: "voided" });
    expect(await docRow(tx, doc)).toMatchObject({ status: "wip", suitability: "S0" });
    expect((await ledger(tx, P, "review:doc_voided")).pop().new_value).toMatchObject({ outcome: "rejected", note: "wrong scope", by_uid: lead2.sub });
    await who(tx, null);
    await tx.query("update public.bim_documents set status = 'archived' where id = $1", [doc]); // the lock is off
    await expect(refusal(tx, () => decide(tx, client, R, "accept"))).rejects.toThrow(/no longer open/);
  }));

  it("the version guard: a signed-in insert outside a round, a service insert of a BEP when a chain applies, any TIDP insert - refused; READINESS by the service - allowed", () => as(db, "service", async (tx) => {
    const ins = (doc, extra = {}) => tx.query("insert into public.bim_document_versions(document_id, version_no, snapshot, round_id) values ($1, 1, $2, $3)", [doc, JSON.stringify({ id: doc, sections, ...extra }), null]);
    const bep = await mkDoc(P), tidp = await mkDoc(P, "TIDP"), ready = await mkDoc(P, "READINESS");
    await who(tx, null);
    await expect(refusal(tx, () => ins(bep))).rejects.toThrow(/published through a review round/);
    await expect(refusal(tx, () => ins(tidp))).rejects.toThrow(/A TIDP is never published/);
    await ins(ready); // service, READINESS: allowed
    await who(tx, owner);
    await expect(refusal(tx, () => ins(bep))).rejects.toThrow(/recorded by Sentinel only/);
    await expect(refusal(tx, () => ins(tidp))).rejects.toThrow(/A TIDP is never published/);
    // a signed-in insert under the right mark still has to be the round's frozen render, and of an open round
    const R = (await start(tx, owner, bep)).round_id;
    await tx.query(`select set_config('sentinel.doc_round', $1, true)`, [R]);
    await expect(refusal(tx, () => tx.query("insert into public.bim_document_versions(document_id, version_no, snapshot, round_id) values ($1, 1, $2, $3)", [bep, JSON.stringify({ id: bep, sections, live: { risks: 99 } }), R]))).rejects.toThrow(/not the frozen render/);
    await expect(refusal(tx, () => tx.query("insert into public.bim_document_versions(document_id, version_no, snapshot, round_id) values ($1, 1, $2, $3)", [bep, JSON.stringify(render(bep)), uuid()]))).rejects.toThrow(/Sentinel only/);
    // 0049's checks stay: another document's snapshot is refused
    await expect(refusal(tx, () => tx.query("insert into public.bim_document_versions(document_id, version_no, snapshot, round_id) values ($1, 1, $2, $3)", [bep, JSON.stringify({ ...render(bep), id: uuid() }), R]))).rejects.toThrow(/frozen render|another document/);
    // a project without a chain publishes a BEP as before (service)
    await who(tx, null);
    const other = (await tx.query("insert into public.projects(key, name, office_key) values ('p53-nochain', 'N', 'office-53b') returning id")).rows[0].id;
    const free = (await tx.query("insert into public.bim_documents(project_id, doc_type, title, sections) values ($1, 'BEP', 'B', $2) returning id", [other, JSON.stringify(sections)])).rows[0].id;
    await ins(free);
  }));

  it("withdraw after the tender issue: voided, document wip S0, version P01 kept; only a lead or owner, only signed in", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    const R = (await start(tx, owner, doc)).round_id;
    await decide(tx, arc, R, "accept"); await decide(tx, lead2, R, "accept");
    await who(tx, arc);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_withdraw($1, 'x')", [R]))).rejects.toThrow(/only a lead or owner withdraws/);
    await who(tx, null);
    await expect(refusal(tx, () => q(tx, "select public.doc_round_withdraw($1, 'x')", [R]))).rejects.toThrow(/signed-in person/);
    await who(tx, owner);
    expect((await q(tx, "select public.doc_round_withdraw($1, 'client went quiet') r", [R]))[0].r).toMatchObject({ status: "voided", issued_version: 1 });
    expect(await docRow(tx, doc)).toMatchObject({ status: "wip", suitability: "S0" });
    expect((await q(tx, "select count(*)::int n from public.bim_document_versions where document_id = $1", [doc]))[0].n).toBe(1);
    expect((await q(tx, "select status, outcome, issued_version from public.doc_rounds where id = $1", [R]))[0]).toEqual({ status: "voided", outcome: "withdrawn", issued_version: 1 });
    await expect(refusal(tx, () => q(tx, "select public.doc_round_withdraw($1, 'again')", [R]))).rejects.toThrow(/no longer open/);
  }));

  it("appointment indicated: needs a 'selected' evaluation or a note; refused while a round is open; stage moves once", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    await who(tx, owner);
    await expect(refusal(tx, () => q(tx, "select public.doc_appointment_indicated($1)", [doc]))).rejects.toThrow(/does not say selected/);
    const R = (await start(tx, owner, doc)).round_id;
    await who(tx, owner);
    await expect(refusal(tx, () => q(tx, "select public.doc_appointment_indicated($1, 'n')", [doc]))).rejects.toThrow(/out for review/);
    await decide(tx, arc, R, "accept"); await decide(tx, lead2, R, "accept"); await decide(tx, client, R, "not_selected");
    await who(tx, arc);
    await expect(refusal(tx, () => q(tx, "select public.doc_appointment_indicated($1, 'n')", [doc]))).rejects.toThrow(/only a lead or owner/);
    await who(tx, owner);
    await expect(refusal(tx, () => q(tx, "select public.doc_appointment_indicated($1)", [doc]))).rejects.toThrow(/does not say selected/);
    await q(tx, "select public.doc_appointment_indicated($1, 'the client told us by phone')", [doc]);
    expect((await docRow(tx, doc)).stage).toBe("confirmed");
    await expect(refusal(tx, () => q(tx, "select public.doc_appointment_indicated($1, 'again')", [doc]))).rejects.toThrow(/past the tender stage/);
    const row = (await ledger(tx, P, "document_stage_changed")).pop();
    expect(row).toMatchObject({ entity_type: "bim_document", actor: owner.email });
    expect(row.new_value).toMatchObject({ from: "pre_appointment", to: "confirmed", note: "the client told us by phone", by_uid: owner.sub });
  }));

  it("the round tables are the functions': a direct service insert, update or delete is refused", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    await expect(refusal(tx, () => tx.query("insert into public.doc_rounds(project_id, document_id, doc_type, stage, steps, render, render_sha, roster, codes, sent_by) values ($1, $2, 'BEP', 'pre_appointment', '[1,2]', '{}', 'x', '[]', '{}', $3)", [P, doc, owner.sub]))).rejects.toThrow(/send-for-review function only/);
    const R = (await start(tx, owner, doc)).round_id;
    await who(tx, null);
    await expect(refusal(tx, () => tx.query("update public.doc_rounds set render = '{}' where id = $1", [R]))).rejects.toThrow(/changes only through the round functions/);
    await expect(refusal(tx, () => tx.query("delete from public.doc_rounds where id = $1", [R]))).rejects.toThrow(/never deleted/);
    await expect(refusal(tx, () => tx.query("insert into public.doc_round_decisions(round_id, step, uid, decision) values ($1, 1, $2, 'accept')", [R, arc.sub]))).rejects.toThrow(/decide function only/);
    await tx.query(`select set_config('sentinel.doc_round', $1, true)`, [R]);
    await expect(refusal(tx, () => tx.query("update public.doc_rounds set render_sha = 'x' where id = $1", [R]))).rejects.toThrow(/never changes/);
  }));

  it("every function writes its ledger row with the decider's uid", () => as(db, "service", async (tx) => {
    const doc = await mkDoc(P);
    const R = (await start(tx, owner, doc, {}, "2099-01-01", { shared: "S2", issue: "S5" })).round_id;
    const a = await decide(tx, arc, R, "accept_with_comments", "ok but");
    const b = await decide(tx, lead2, R, "accept");
    const c = await decide(tx, client, R, "selected");
    const rows = await ledger(tx, P, "review:doc_%");
    expect(rows.map((r) => r.action)).toEqual(["review:doc_start", "review:doc_accept_with_comments 1", "review:doc_accept 2", "review:doc_issued", "review:doc_selected 3", "review:doc_closed"]);
    expect(rows.every((r) => r.entity_type === "review")).toBe(true);
    expect(rows.slice(0, 1).map((r) => r.new_value)[0]).toMatchObject({ round_id: R, by_uid: owner.sub, stage: "pre_appointment", teams_owed: ["ARC"], codes: { shared: "S2", issue: "S5", accept: "A1" }, deadline: "2099-01-01" });
    expect(rows[1]).toMatchObject({ actor: arc.email }); expect(rows[1].new_value).toMatchObject({ decided_by_uid: arc.sub, party: "appointed", task_team: "ARC", note: "ok but", step: 1 });
    expect(rows[2].new_value).toMatchObject({ decided_by_uid: lead2.sub, party: "lead_appointed" });
    expect(rows[3].new_value).toMatchObject({ revision: "P01", suitability: "S5", by_uid: lead2.sub });
    expect(rows[4].new_value).toMatchObject({ decided_by_uid: client.sub, party: "appointing" });
    expect([a.ledger_id, b.ledger_id, c.ledger_id].every((x) => Number(x) > 0)).toBe(true);
    const ids = (await q(tx, "select step, ledger_id from public.doc_round_decisions where round_id = $1 order by step", [R])).map((d) => String(d.ledger_id));
    expect(ids).toEqual([String(a.ledger_id), String(b.ledger_id), String(c.ledger_id)]);
    expect(await q(tx, "select 1 from public.doc_rounds where id = $1 and status = 'closed'", [R])).toHaveLength(1);
  }));
});

describe("0053 files are valid UTF-8", () => {
  for (const f of ["0053_document_rounds.sql", "probes/0053_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
