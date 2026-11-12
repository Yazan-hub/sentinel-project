// migration 0051 (BIM documents workspace R1c): the office register store is lead-read. Dry-run on PGlite with every migration; applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

let db, O;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0051.test` });
const owner = u("owner"), lead = u("lead"), viewer = u("viewer"), outsider = u("outsider");
const n = async (tx, store) => (await tx.query("select count(*)::int n from public.bridge_docs where project_id = $1 and store = $2", [O, store])).rows[0].n;
const refused = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); return e.message; } await tx.query("release savepoint r"); return null; };

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, lead, viewer, outsider]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  O = (await db.query("insert into public.projects(key, name, kind) values ('office-51', 'O', 'office') returning id")).rows[0].id;
  for (const [x, r] of [[owner, "owner"], [lead, "lead"], [viewer, "viewer"]])
    await db.query("insert into public.memberships(project_id, user_id, role, party) values ($1, $2, $3, 'lead_appointed')", [O, x.sub, r]);
  for (const s of ["office_register", "annex", "artefact"]) await db.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ($1, $2, 'd1', '{}')", [s, O]);
}, 60_000);

describe("0051 — the register store is lead-read", () => {
  it("a viewer reads 0 register rows, 1 annex row and 1 artefact row", () => as(db, viewer, async (tx) => {
    expect(await n(tx, "office_register")).toBe(0);
    expect(await n(tx, "annex")).toBe(1);
    expect(await n(tx, "artefact")).toBe(1);
  }));
  it("a lead and an owner read the register row", async () => {
    await as(db, lead, async (tx) => expect(await n(tx, "office_register")).toBe(1));
    await as(db, owner, async (tx) => expect(await n(tx, "office_register")).toBe(1));
  });
  it("a stranger reads nothing; the service reads all", async () => {
    await as(db, outsider, async (tx) => expect(await n(tx, "annex")).toBe(0));
    await as(db, "service", async (tx) => expect(await n(tx, "office_register")).toBe(1));
  });
  it("no signed-in role inserts either store (floor is null: service only)", () => as(db, owner, async (tx) => {
    for (const s of ["office_register", "annex"])
      expect(await refused(tx, () => tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ($1, $2, 'x', '{}')", [s, O])), s).toMatch(/row-level security/);
    expect((await tx.query("select public.bridge_docs_floor('office_register') f, public.bridge_docs_floor('annex') g")).rows[0]).toEqual({ f: null, g: null });
  }));
});

describe("0051 files are valid UTF-8", () => {
  for (const f of ["0051_office_register_read.sql", "probes/0051_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
