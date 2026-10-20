// Standing guard: two offices, two projects, two signed-in users — under row level security, each sees none of the other's rows.
// Runs the real db/migrations/*.sql on an in-memory PGlite (see pglite-harness.mjs for the Supabase shim). Nothing here
// touches a real database. If this fails after a migration, the migration opened a hole (or added a table without a rule).
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid, createHash } from "node:crypto";
import { buildDb, as } from "./pglite-harness.mjs";

let db;
const T = {}; // the two tenants, filled by the seed: { A: {...}, B: {...} }
const userA = { sub: uuid(), email: "a@office-a.test" };
const userB = { sub: uuid(), email: "b@office-b.test" };
const admin = uuid(); // a platform admin who is neither A nor B
const anon = {};

// Tables that hold project- or office-scoped rows, found in information_schema by these column names. A table whose
// column is named differently must be added to CHILD_OF or NOT_SCOPED below, or the "every table is accounted for" test fails.
const SCOPE_COLS = ["project_id", "project_key", "office_id", "office_key"];
// Tables with no project column of their own: the row belongs to a project through its parent. { table: [column, parent sql returning ids] }
const CHILD_OF = {
  container_versions: ["container_id", "select id from public.information_containers where project_id = any($1::uuid[])"],
  bim_document_versions: ["document_id", "select id from public.bim_documents where project_id = any($1::uuid[])"],
};
// Tables intentionally without a tenant. platform_admins: global list of operators; 0033 revokes it from every signed-in role.
const NOT_SCOPED = { platform_admins: "0033_trust_boundaries: global operator list, RLS on with no policy, all privileges revoked from the API roles",
  feed_keys: "0044_feed_keys: a person's own feed keys (user-scoped, not project-scoped); the feed answers per project through feed_rows, tested below",
  audit_chain_tip: "0047_chain_tip: one row, the global ledger chain's tip (an id and a hash, no content); RLS on with no policy, read by service_role only" };
// Tables intentionally WITHOUT row level security on live: none. A new table without RLS fails the RLS test.
const NO_RLS_ALLOWED = {};

// Run one statement inside a savepoint so an RLS error does not poison the surrounding transaction.
async function attempt(tx, sql, params = []) {
  await tx.exec("savepoint s");
  try { const r = await tx.query(sql, params); await tx.exec("release savepoint s"); return { rows: r.rows, n: r.affectedRows ?? r.rows.length }; }
  catch (e) { await tx.exec("rollback to savepoint s"); return { error: e.message }; }
}
const count = async (tx, sql, params) => { const r = await attempt(tx, sql, params); if (r.error) throw new Error(r.error + " :: " + sql); return Number(r.rows[0].n); };

async function seedTenant(tag, user) {
  const q = async (sql, p) => (await db.query(sql, p)).rows[0];
  const t = { tag, user };
  t.officeKey = `office-${tag}`; t.projKey = `proj-${tag}`;
  t.office = (await q(`insert into public.projects(key, name, kind) values ($1, $2, 'office') returning id`, [t.officeKey, `Office ${tag}`])).id;
  t.proj = (await q(`insert into public.projects(key, name, office_key) values ($1, $2, $3) returning id`, [t.projKey, `Project ${tag}`, t.officeKey])).id;
  await db.query(`insert into auth.users(id, email) values ($1, $2)`, [user.sub, user.email]);
  await db.query(`insert into public.memberships(project_id, user_id, role) values ($1, $2, 'lead')`, [t.proj, user.sub]);
  await db.query(`insert into public.parties(project_id, name) values ($1, $2)`, [t.proj, `Party ${tag}`]);
  t.folder = (await q(`insert into public.folders(project_id, name, kind) values ($1, 'Project Files', 'root') returning id`, [t.proj])).id;
  t.container = (await q(`insert into public.information_containers(project_id, iso_name, folder_id) values ($1, $2, $3) returning id`, [t.proj, `PROJ-${tag}.ifc`, t.folder])).id;
  t.version = (await q(`insert into public.container_versions(container_id, revision, sha256) values ($1, 'P01', $2) returning id`, [t.container, tag.repeat(64).slice(0, 64)])).id;
  // a shared (not WIP) version too, so the check does not rest on the WIP rule alone
  const shared = (await q(`insert into public.container_versions(container_id, revision, sha256) values ($1, 'P02', $2) returning id`, [t.container, (tag + "f").repeat(64).slice(0, 64)])).id;
  await db.query(`select public.cde_transition($1, 'shared')`, [shared]); // state moves only through the function; the service role (no uid) may
  t.revision = (await q(`insert into public.model_revisions(project_id, container_version_id, rev_code) values ($1, $2, 'P01') returning id`, [t.proj, t.version])).id;
  await db.query(`insert into public.element_snapshots(revision_id, project_id, guid) values ($1, $2, 'guid-1')`, [t.revision, t.proj]);
  await db.query(`insert into public.transmittals(project_id, reference) values ($1, $2)`, [t.proj, `TX-${tag}`]);
  await db.query(`insert into public.deliverables(project_id, container_name, title) values ($1, $2, 'd')`, [t.proj, `PROJ-${tag}.ifc`]);
  await db.query(`insert into public.task_teams(project_id, code, name) values ($1, 'ARC', 'Architecture')`, [t.proj]);
  t.doc = (await q(`insert into public.bim_documents(project_id, doc_type, title) values ($1, 'BEP', $2) returning id`, [t.proj, `BEP ${tag}`])).id;
  await db.query(`insert into public.bim_document_versions(document_id, version_no, snapshot) values ($1, 1, '{}')`, [t.doc]);
  await db.query(`insert into public.audit_log(project_id, entity_type, entity_id, action, actor) values ($1, 'file', $2, 'seed', 'test')`, [t.proj, t.container]);
  t.topic = uuid();
  await db.query(`insert into public.bcf_topics(guid, project_id, data) values ($1, $2, $3)`, [t.topic, t.projKey, JSON.stringify({ guid: t.topic })]);
  await db.query(`insert into public.bridge_events(project_id, origin, payload) values ($1, 'test', '{}')`, [t.projKey]);
  // bridge documents: stores filed under the project's id, its key, and the OFFICE's id (office_snapshot / artefact are office-scoped too)
  const docs = [["changeset", t.proj], ["doc_comments", t.proj], ["artefact", t.proj], ["office_snapshot", t.proj], ["office_scan", t.proj],
    ["rfi", t.projKey], ["clash", t.projKey], ["tender", t.projKey], ["artefact", t.office], ["office_snapshot", t.office], ["keystore", t.office]];
  for (const [store, pid] of docs) await db.query(`insert into public.bridge_docs(store, project_id, doc_id, data) values ($1, $2, $3, '{}')`, [store, pid, `doc-${tag}-${store}`]);
  t.tokens = [t.proj, t.projKey, t.office, t.officeKey]; // every spelling of "this tenant" a project/office column can hold
  return t;
}

let tables, scoped; // scoped: { table: [columns] }
// Top-level await, not beforeAll: the per-table test names below are generated from the migrated schema at collection time.
async function setup() {
  db = await buildDb();
  await db.query(`insert into auth.users(id, email) values ($1, 'admin@sentinel.test')`, [admin]);
  await db.query(`insert into public.platform_admins(user_id) values ($1)`, [admin]);
  T.A = await seedTenant("a", userA);
  T.B = await seedTenant("b", userB);
  // the global '' namespace is readable by every signed-in user on purpose (0016/0033); one row so the tests know it is there
  await db.query(`insert into public.bridge_docs(store, project_id, doc_id, data) values ('pack', '', 'global-pack', '{}')`);
  tables = (await db.query(`select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`)).rows;
  const cols = (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and column_name = any($1)`, [SCOPE_COLS])).rows;
  scoped = {};
  for (const { table_name, column_name } of cols) (scoped[table_name] ||= []).push(column_name);
  scoped.projects = ["id", "key", "office_key"]; // projects is the tenant itself (its id and key; office_key points at the office)
}
await setup();

// rows of `table` whose tenant column(s) hold any of `tokens`, or (foreign=true) hold a non-empty value that is none of them
function scopedCount(tx, table, tokens, foreign = false) {
  const cols = scoped[table];
  if (cols) {
    const pred = cols.map((c) => foreign ? `(${c}::text <> '' and ${c}::text <> all($1::text[]))` : `${c}::text = any($1::text[])`).join(" or ");
    return count(tx, `select count(*) n from public.${table} where ${pred}`, [tokens]);
  }
  const [col, parent] = CHILD_OF[table];
  return count(tx, `select count(*) n from public.${table} where ${col} ${foreign ? "not in" : "in"} (${parent})`, [tokens.filter((x) => /^[0-9a-f-]{36}$/.test(x))]);
}
const scopedTables = () => [...Object.keys(scoped), ...Object.keys(CHILD_OF)];
const words = { A: "office A / project A", B: "office B / project B" };

describe("the schema is accounted for", () => {
  it("every table in schema public has row level security on (allow-list: " + (Object.keys(NO_RLS_ALLOWED).join(", ") || "none") + ")", () => {
    const bare = tables.filter((t) => !t.rls && !(t.relname in NO_RLS_ALLOWED)).map((t) => t.relname);
    expect(bare, "tables without row level security").toEqual([]);
  });
  it("every table is either tenant-scoped (a project/office column, or a parent that has one) or on the not-scoped list", () => {
    const known = new Set([...scopedTables(), ...Object.keys(NOT_SCOPED)]);
    const unknown = tables.map((t) => t.relname).filter((n) => !known.has(n));
    expect(unknown, "new tables: give them a project/office column, or list them in CHILD_OF / NOT_SCOPED with a reason").toEqual([]);
  });
});

describe("the seed is not vacuous: the service role sees both offices' rows in every table", () => {
  for (const who of ["A", "B"]) {
    it(`service role: every tenant-scoped table holds at least one row of ${words[who]}`, async () => {
      await as(db, "service", async (tx) => {
        for (const table of scopedTables()) expect(await scopedCount(tx, table, T[who].tokens), `${table} rows of ${words[who]}`).toBeGreaterThan(0);
      });
    });
  }
  it("service role: bridge_docs holds the stores changeset, doc_comments, artefact, office_snapshot, office_scan, rfi, clash, tender, keystore for office B", async () => {
    await as(db, "service", async (tx) => {
      const r = await attempt(tx, `select distinct store from public.bridge_docs where project_id = any($1::text[]) order by 1`, [T.B.tokens]);
      expect(r.rows.map((x) => x.store)).toEqual(["artefact", "changeset", "clash", "doc_comments", "keystore", "office_scan", "office_snapshot", "rfi", "tender"]);
    });
  });
});

describe("signed in as a member, a user sees none of the other office's rows", () => {
  for (const [me, other] of [["A", "B"], ["B", "A"]]) {
    describe(`user ${me} (member of ${words[me]}) against ${words[other]}`, () => {
      for (const table of scopedTables()) {
        it(`${table}: user ${me} sees 0 rows of ${words[other]}`, async () => {
          await as(db, T[me].user, async (tx) => expect(await scopedCount(tx, table, T[other].tokens)).toBe(0));
        });
        it(`${table}: every row user ${me} can see belongs to ${words[me]} (nothing foreign, nothing of a third tenant)`, async () => {
          await as(db, T[me].user, async (tx) => expect(await scopedCount(tx, table, T[me].tokens, true)).toBe(0));
        });
      }
      it(`control: user ${me} does see their own project's rows (so a 0 above is isolation, not a broken sign-in)`, async () => {
        await as(db, T[me].user, async (tx) => {
          expect(await count(tx, `select count(*) n from public.information_containers where project_id = $1`, [T[me].proj])).toBe(1);
          expect(await count(tx, `select count(*) n from public.container_versions`)).toBeGreaterThan(0);
          expect(await count(tx, `select count(*) n from public.bridge_docs where project_id = any($1::text[])`, [[T[me].proj, T[me].projKey]])).toBeGreaterThan(0);
        });
      });
      it(`bridge_docs: user ${me} sees 0 office-scoped documents (office_snapshot, artefact, keystore) filed under the id or key of ${words[other]}'s office`, async () => {
        await as(db, T[me].user, async (tx) =>
          expect(await count(tx, `select count(*) n from public.bridge_docs where project_id = any($1::text[])`, [[T[other].office, T[other].officeKey]])).toBe(0));
      });
      it(`bcf_topics: user ${me} cannot read the BCF topic of ${words[other]}'s project by its guid`, async () => {
        await as(db, T[me].user, async (tx) => expect(await count(tx, `select count(*) n from public.bcf_topics where guid = $1`, [T[other].topic])).toBe(0));
      });
      it(`audit_log: user ${me} sees none of ${words[other]}'s trail`, async () => {
        await as(db, T[me].user, async (tx) => expect(await count(tx, `select count(*) n from public.audit_log where project_id = $1`, [T[other].proj])).toBe(0));
      });
    });
  }
});

describe("platform_admins and the global namespace", () => {
  it("platform_admins: a signed-in project member sees 0 operators (and the service role sees 1)", async () => {
    await as(db, userA, async (tx) => {
      const r = await attempt(tx, `select count(*) n from public.platform_admins`);
      expect(r.error ? /permission denied/.test(r.error) : Number(r.rows[0].n) === 0).toBe(true);
    });
    await as(db, "service", async (tx) => expect(await count(tx, `select count(*) n from public.platform_admins`)).toBe(1));
  });
  it("bridge_docs: the one namespace both offices share is the project_id '' one (store pack) — nothing else is shared", async () => {
    for (const me of [userA, userB]) await as(db, me, async (tx) => {
      const r = await attempt(tx, `select store, project_id from public.bridge_docs where project_id = '' or project_id <> all (array(select id::text from public.projects union select key from public.projects))`);
      expect(r.rows.map((x) => `${x.store}:${x.project_id}`)).toEqual(["pack:"]);
    });
  });
});

describe("anon (no sign-in) sees nothing", () => {
  for (const table of [...scopedTables(), ...Object.keys(NOT_SCOPED)]) {
    it(`${table}: anon sees 0 rows of office A or office B`, async () => {
      await as(db, anon, async (tx) => {
        const r = await attempt(tx, `select count(*) n from public.${table}`);
        // either no rows, or the table is not even granted to anon (permission denied): both are isolation
        expect(r.error ? /permission denied/.test(r.error) : Number(r.rows[0].n) === 0, r.error ?? `${r.rows[0].n} rows`).toBe(true);
      });
    });
  }
});

describe("writes across the line are refused", () => {
  const tryWrite = (me, sql, params) => as(db, me, (tx) => attempt(tx, sql, params));
  const refused = (r) => r.error ? /row-level security|permission denied|not found|insufficient|needs|only/i.test(r.error) : r.n === 0;
  it("bridge_docs: user A cannot insert a changeset, an rfi or an office_snapshot into project B or office B (by id or key)", async () => {
    for (const [store, pid] of [["changeset", T.B.proj], ["rfi", T.B.projKey], ["office_snapshot", T.B.office], ["artefact", T.B.officeKey]]) {
      const r = await tryWrite(userA, `insert into public.bridge_docs(store, project_id, doc_id, data) values ($1, $2, 'planted', '{}')`, [store, pid]);
      expect(refused(r), `${store} into ${pid}: ${JSON.stringify(r)}`).toBe(true);
    }
    await as(db, "service", async (tx) => expect(await count(tx, `select count(*) n from public.bridge_docs where doc_id = 'planted'`)).toBe(0));
  });
  it("bridge_docs: user A cannot update or delete a document of project B", async () => {
    expect(refused(await tryWrite(userA, `update public.bridge_docs set data = '{"x":1}' where project_id = $1`, [T.B.proj]))).toBe(true);
    expect(refused(await tryWrite(userA, `delete from public.bridge_docs where project_id = $1`, [T.B.proj]))).toBe(true);
    await as(db, "service", async (tx) => expect(await count(tx, `select count(*) n from public.bridge_docs where project_id = $1 and data = '{}'`, [T.B.proj])).toBeGreaterThan(0));
  });
  it("bcf_topics: user A cannot insert, update or delete a topic of project B", async () => {
    const g = uuid();
    expect(refused(await tryWrite(userA, `insert into public.bcf_topics(guid, project_id, data) values ($1, $2, $3)`, [g, T.B.projKey, JSON.stringify({ guid: g })]))).toBe(true);
    expect(refused(await tryWrite(userA, `update public.bcf_topics set topic_status = 'closed' where guid = $1`, [T.B.topic]))).toBe(true);
    expect(refused(await tryWrite(userA, `delete from public.bcf_topics where guid = $1`, [T.B.topic]))).toBe(true);
    await as(db, "service", async (tx) => expect(await count(tx, `select count(*) n from public.bcf_topics where project_id = $1`, [T.B.projKey])).toBe(1));
  });
  it("audit_log: user A cannot write a line into project B's trail, nor alter or delete it", async () => {
    expect(refused(await tryWrite(userA, `insert into public.audit_log(project_id, entity_type, action, actor) values ($1, 'file', 'forged', 'a')`, [T.B.proj]))).toBe(true);
    expect(refused(await tryWrite(userA, `update public.audit_log set action = 'x' where project_id = $1`, [T.B.proj]))).toBe(true);
    expect(refused(await tryWrite(userA, `delete from public.audit_log where project_id = $1`, [T.B.proj]))).toBe(true);
    await as(db, "service", async (tx) => expect(await count(tx, `select count(*) n from public.audit_log where project_id = $1 and action = 'forged'`, [T.B.proj])).toBe(0));
  });
  it("folders and memberships: user A cannot create a folder in project B, nor make themself a member of it (control: a folder in project A works)", async () => {
    expect(refused(await tryWrite(userA, `insert into public.folders(project_id, name) values ($1, 'planted')`, [T.B.proj]))).toBe(true);
    expect(refused(await tryWrite(userA, `insert into public.memberships(project_id, user_id, role) values ($1, $2, 'viewer')`, [T.B.proj, userA.sub]))).toBe(true);
    const ok = await tryWrite(userA, `insert into public.folders(project_id, name) values ($1, 'mine')`, [T.A.proj]);
    expect(ok.error, "control").toBeUndefined();
  });
  it("projects: user A cannot attach their project to office B, nor rename or delete project B", async () => {
    expect(refused(await tryWrite(userA, `update public.projects set office_key = $1 where id = $2`, [T.B.officeKey, T.A.proj]))).toBe(true);
    expect(refused(await tryWrite(userA, `update public.projects set name = 'taken' where id = $1`, [T.B.proj]))).toBe(true);
    expect(refused(await tryWrite(userA, `delete from public.projects where id = $1`, [T.B.proj]))).toBe(true);
    await as(db, "service", async (tx) => expect(await count(tx, `select count(*) n from public.projects where id = $1 and name = 'Project b'`, [T.B.proj])).toBe(1));
  });
});

describe("security-definer functions answer a stranger as if the project did not exist", () => {
  const call = (me, sql, params) => as(db, me, (tx) => attempt(tx, sql, params));
  it("project_of_container: user A asking for project B's file gets null (user A's own file answers; the service role answers for B)", async () => {
    expect((await call(userA, `select public.project_of_container($1) p`, [T.B.container])).rows[0].p).toBeNull();
    expect((await call(userA, `select public.project_of_container($1) p`, [T.A.container])).rows[0].p).toBe(T.A.proj);
    expect((await call("service", `select public.project_of_container($1) p`, [T.B.container])).rows[0].p).toBe(T.B.proj);
  });
  it("is_member / member_role (refused to signed-in roles) / has_min_role: user A is nothing in project B or office B, and a lead in project A", async () => {
    for (const p of [T.B.proj, T.B.office]) {
      expect((await call(userA, `select public.is_member($1) v`, [p])).rows[0].v).toBe(false);
      const mr = await call(userA, `select public.member_role($1) v`, [p]); // 0013/0014: not callable by signed-in roles, so a refusal is as good as null
      expect(mr.error ? /permission denied/.test(mr.error) : mr.rows[0].v === null).toBe(true);
      expect((await call(userA, `select public.has_min_role($1, 'viewer') v`, [p])).rows[0].v).toBe(false);
    }
    expect((await call(userA, `select public.has_min_role($1, 'lead') v`, [T.A.proj])).rows[0].v).toBe(true);
  });
  it("bridge_docs_role: user A has no role on project B or office B, by id or by key (control: project A answers true)", async () => {
    for (const p of T.B.tokens) expect((await call(userA, `select public.bridge_docs_role($1, 'viewer') v`, [p])).rows[0].v, p).toBe(false);
    expect((await call(userA, `select public.bridge_docs_role($1, 'viewer') v`, [T.A.projKey])).rows[0].v).toBe(true);
  });
  it("review_template: user A cannot call it at all (execute is revoked from signed-in roles), for project B or office B", async () => {
    for (const p of [T.B.proj, T.B.office]) expect((await call(userA, `select public.review_template($1)`, [p])).error).toMatch(/permission denied/);
  });
  it("cde_transition and review_decide: user A on project B's version is told the version does not exist, and nothing changes", async () => {
    const v = T.B.version;
    expect((await call(userA, `select public.cde_transition($1, 'shared')`, [v])).error).toMatch(/not found/);
    expect((await call(userA, `select public.review_decide($1, 'approve')`, [v])).error).toMatch(/not found/);
    await as(db, "service", async (tx) => expect((await attempt(tx, `select state from public.container_versions where id = $1`, [v])).rows[0].state).toBe("wip"));
  });
  it("is_platform_admin: false for user A and user B, true for the operator", async () => {
    for (const me of [userA, userB]) expect((await call(me, `select public.is_platform_admin() v`)).rows[0].v).toBe(false);
    expect((await call({ sub: admin }, `select public.is_platform_admin() v`)).rows[0].v).toBe(true);
  });
});

describe("the data feed (0044): a feed key reads its owner's projects only, while it is live and they are a member", () => {
  const sha = (k) => createHash("sha256").update(k).digest("hex");
  const KA = "sfk_feed_key_of_user_a", KB = "sfk_feed_key_of_user_b", REVOKED = "sfk_revoked_key_of_user_a";
  const call = (me, sql, params) => as(db, me, (tx) => attempt(tx, sql, params));
  beforeAll(async () => {
    await db.query(`insert into public.feed_keys(user_id, key_hash, label) values ($1, $2, 'A'), ($3, $4, 'B'), ($1, $5, 'old')`, [userA.sub, sha(KA), userB.sub, sha(KB), sha(REVOKED)]);
    await db.query(`update public.feed_keys set revoked_at = now() where key_hash = $1`, [sha(REVOKED)]);
  });

  it("A's key reads project A's latest revision as anon (what the bridge sends) — control", async () => {
    const r = await call(anon, `select public.feed_rows($1, $2, 'latest') j`, [KA, T.A.projKey]);
    expect(r.rows[0].j.map((x) => [x.revision, x.guid])).toEqual([["P01", "guid-1"]]); // one json array: no 1000-row cut
    expect((await call(anon, `select public.feed_revisions($1, $2) j`, [KA, T.A.projKey])).rows[0].j.map((x) => [x.revision, Number(x.element_count)])).toEqual([["P01", 1]]);
    expect((await call(anon, `select public.feed_rows($1, $2, 'P01') j`, [KA, T.A.projKey])).rows[0].j).toHaveLength(1);
    expect((await call(anon, `select public.feed_rows($1, $2, 'P99') j`, [KA, T.A.projKey])).error).toMatch(/no such revision/);
  });
  it("a project's 1500 elements come back whole (PostgREST's max-rows would cut a set at 1000)", async () => {
    await as(db, "service", async (tx) => {
      await tx.query(`insert into public.element_snapshots(revision_id, project_id, guid) select $1, $2, 'bulk-' || g from generate_series(1, 1499) g`, [T.A.revision, T.A.proj]);
      await tx.exec("set local role anon");
      expect((await attempt(tx, `select json_array_length(public.feed_rows($1, $2, 'latest')) n`, [KA, T.A.projKey])).rows[0].n).toBe(1500);
    });
  });
  it("A's key on project B or office B, and B's key on project A, are refused in the same words as a project that does not exist", async () => {
    for (const [k, p] of [[KA, T.B.projKey], [KA, T.B.officeKey], [KB, T.A.projKey], [KA, "no-such-project"]]) {
      expect((await call(anon, `select * from public.feed_rows($1, $2, 'latest')`, [k, p])).error, `${p}`).toMatch(/not a member of this project/);
      expect((await call(anon, `select * from public.feed_revisions($1, $2)`, [k, p])).error).toMatch(/not a member of this project/);
    }
  });
  it("a revoked key, an unknown key, an empty key and a key's stored hash are refused", async () => {
    for (const k of [REVOKED, "sfk_never_made", "", sha(KA)])
      expect((await call(anon, `select * from public.feed_rows($1, $2, 'latest')`, [k, T.A.projKey])).error, k).toMatch(/feed key not valid/);
  });
  it("a member removed from project A: their key reads nothing there any more", async () => {
    await as(db, "service", async (tx) => {
      await tx.query(`delete from public.memberships where project_id = $1 and user_id = $2`, [T.A.proj, userA.sub]);
      await tx.exec("set local role anon");
      expect((await attempt(tx, `select * from public.feed_rows($1, $2, 'latest')`, [KA, T.A.projKey])).error).toMatch(/not a member of this project/);
    });
  });
  it("user A sees only their own keys, cannot make one for user B, and cannot revoke, re-point or delete user B's", async () => {
    expect((await call(userA, `select label from public.feed_keys order by label`)).rows.map((x) => x.label)).toEqual(["A", "old"]);
    expect((await call(userA, `insert into public.feed_keys(user_id, key_hash) values ($1, $2)`, [userB.sub, sha("x")])).error).toMatch(/row-level security|permission/);
    expect((await call(userA, `insert into public.feed_keys(key_hash) values ($1)`, [sha("mine")])).n).toBe(1); // their own: yes
    expect((await call(userA, `update public.feed_keys set revoked_at = now() where key_hash = $1`, [sha(KB)])).n).toBe(0);
    expect((await call(userA, `update public.feed_keys set user_id = $1 where key_hash = $2`, [userA.sub, sha(KA)])).error).toMatch(/permission denied/);
    expect((await call(userA, `delete from public.feed_keys where key_hash = $1`, [sha(KA)])).error).toMatch(/permission denied/);
    expect((await call(anon, `select count(*) n from public.feed_keys`)).error).toMatch(/permission denied/);
    expect((await call(userA, `select public.feed_key_owner($1)`, [KA])).error).toMatch(/permission denied/);
  });
});
