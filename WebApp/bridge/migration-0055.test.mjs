// migration 0055 (R2d follow-up: the Client's step of an EIR is recorded outside Sentinel, as a BEP's is): dry-run on PGlite.
// The BEP rules 0055 keeps are proved by migration-0054.test.mjs, which runs on the same full set of migrations. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

const TODAY = new Date().toISOString().slice(0, 10);
let db, P;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0055.test` });
const owner = u("owner"), lead2 = u("lead2");
const q = async (tx, sql, p) => (await tx.query(sql, p)).rows;
const refusal = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); throw e; } await tx.query("release savepoint r"); throw new Error("expected a refusal, got none"); };
const who = (tx, w) => tx.query(`select set_config('request.jwt.claims', $1, true)`, [w ? JSON.stringify({ sub: w.sub, role: "authenticated", email: w.email }) : ""]);
const sections = [{ id: "s1", heading: "Aim", state: "wip", body: "x", blocks: [{ id: "s1.t0", kind: "text", title: "", data: { markdown: "x" } }] }];
const outside = async (tx, w, round, outcome, date = TODAY, name = "Jane Client", ref = null) => { await who(tx, w); return (await q(tx, "select public.doc_round_record_outside($1, $2, $3, $4, $5) r", [round, outcome, date, name, ref]))[0].r; };
// the Lead firm issues, the Client accepts
const CHAIN = { steps: [], documents: { eir: { steps: [{ name: "Issue", role: "lead", party: "lead_appointed" }, { name: "Accept", role: "viewer", party: "appointing" }] } } };

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, lead2]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  const OFFICE = (await db.query("insert into public.projects(key, name, kind) values ('office-55', 'O', 'office') returning id")).rows[0].id;
  P = (await db.query("insert into public.projects(key, name, office_key) values ('p55', 'p55', 'office-55') returning id")).rows[0].id;
  for (const [x, role] of [[owner, "owner"], [lead2, "lead"]]) await db.query("insert into public.memberships(project_id, user_id, role, party, state) values ($1, $2, $3, 'lead_appointed', 'active')", [P, x.sub, role]);
  await db.query("select set_config('sentinel.client_outside', $1, false)", [P]); // the setting is on (committed)
  await db.query("update public.projects set client_outside_sentinel = true where id = $1", [P]);
  await db.query("select set_config('sentinel.client_outside', '', false)");
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review', $2)", [String(OFFICE), JSON.stringify({ version: 1, sha256: "ab".repeat(32) })]);
  await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review@1', $2)", [String(OFFICE), JSON.stringify({ body: CHAIN })]);
}, 60_000);

describe("0055 an EIR's Client step outside Sentinel", () => {
  it("only the Client's step is recorded; the outcome is accept or reject; a rejection carries its reason and voids the round", () => as(db, "service", async (tx) => {
    const doc = (await q(tx, "insert into public.bim_documents(project_id, doc_type, title, sections) values ($1, 'EIR', 'Doc', $2) returning id", [P, JSON.stringify(sections)]))[0].id;
    await who(tx, owner);
    const R = (await q(tx, "select public.doc_round_start($1, $2, null, '{}') r", [doc, JSON.stringify({ id: doc, title: "Doc", sections })]))[0].r.round_id;
    await expect(refusal(tx, () => outside(tx, lead2, R, "accept"))).rejects.toThrow(/Only the Client's step/); // step 1 is the Lead firm's
    await who(tx, lead2);
    await q(tx, "select public.doc_round_decide($1, 'accept', null)", [R]);
    await expect(refusal(tx, () => outside(tx, lead2, R, "accept_with_comments"))).rejects.toThrow(/choices are: accept, reject/);
    await expect(refusal(tx, () => outside(tx, lead2, R, "reject"))).rejects.toThrow(/Say why/);
    await expect(refusal(tx, () => outside(tx, owner, R, "accept"))).rejects.toThrow(/sender does not decide/);
    expect(await outside(tx, lead2, R, "reject", TODAY, "Jane Client", "the scope is unclear")).toMatchObject({ step: 2, status: "voided", closed: true });
    expect((await q(tx, "select status, suitability from public.bim_documents where id = $1", [doc]))[0]).toEqual({ status: "wip", suitability: "S0" });
    const row = (await q(tx, "select new_value from public.audit_log where project_id = $1 and action = 'review_step_recorded_outside' order by id desc limit 1", [P]))[0].new_value;
    expect(row).toMatchObject({ round_id: R, step: 2, outcome: "reject", given_by: "Jane Client", evidence_ref: "the scope is unclear", recorded_by_uid: lead2.sub });
  }));
});

describe("0055 the probe passes on PGlite", () => {
  it("part 1 every row true, part 2 'PROBE 0055: 9 of 9 as expected.' (rolled back)", async () => {
    const probe = readFileSync(new URL("../db/migrations/probes/0055_probe.sql", import.meta.url), "utf8").replace(/\r/g, "");
    const i = probe.search(/^-- Part 2$/m);
    const r1 = (await db.query(probe.slice(probe.search(/^-- Part 1$/m), i))).rows;
    expect(r1.filter((r) => r.ok !== true).map((r) => r.what)).toEqual([]);
    expect(r1.length).toBe(2);
    await expect(db.exec(probe.slice(i))).rejects.toThrow("PROBE 0055: 9 of 9 as expected.");
  });
});

describe("0055 files are valid UTF-8", () => {
  for (const f of ["0055_eir_outside.sql", "probes/0055_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
