// migration 0050 (BIM documents workspace R2a, the people side): dry-run on PGlite with every migration. Applying it live is the founder's.
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID as uuid } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildDb, as } from "./pglite-harness.mjs";

let db, P;
const u = (tag) => ({ sub: uuid(), email: `${tag}@0050.test` });
const owner = u("owner"), owner2 = u("owner2"), lead = u("lead"), contrib = u("contrib"), viewer = u("viewer"), client = u("client"), invited = u("invited");
const q = async (tx, sql, p) => (await tx.query(sql, p)).rows;
const party = async (tx, who) => (await q(tx, "select party, task_team, state from public.memberships where project_id = $1 and user_id = $2", [P, who.sub]))[0];
const ledger = (tx, action, who) => q(tx, "select actor, old_value, new_value from public.audit_log where project_id = $1 and entity_type = 'membership' and entity_id = $2 and action = $3 order by id", [P, who.sub, action]);
// An expected refusal inside a shared transaction: run it under a savepoint so the transaction stays usable.
const refusal = async (tx, fn) => { await tx.query("savepoint r"); try { await fn(); } catch (e) { await tx.query("rollback to savepoint r"); throw e; } await tx.query("release savepoint r"); throw new Error("expected a refusal, got none"); };
const claims = (tx, who) => tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.sub, role: "authenticated", email: who.email })]);

beforeAll(async () => {
  db = await buildDb();
  for (const x of [owner, owner2, lead, contrib, viewer, client, invited]) await db.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
  await db.query("insert into public.projects(key, name, kind) values ('office-50', 'O', 'office')");
  P = (await db.query("insert into public.projects(key, name, office_key) values ('p50', 'P', 'office-50') returning id")).rows[0].id;
  for (const [x, r, extra] of [[owner, "owner"], [owner2, "owner"], [lead, "lead"], [contrib, "contributor"], [viewer, "viewer"], [client, "viewer", { party: "appointing" }], [invited, "viewer", { state: "invited" }]])
    await db.query("insert into public.memberships(project_id, user_id, role, party, state) values ($1, $2, $3, $4, $5)", [P, x.sub, r, extra?.party ?? (r === "viewer" ? null : "lead_appointed"), extra?.state ?? "active"]);
  await db.query("insert into public.task_teams(project_id, code, name) values ($1, 'ARC', 'Architecture')", [P]);
}, 60_000);

describe("0050 part 1 — columns, the creator's party, backfill", () => {
  it("a project made by a signed-in person gives its creator owner + Lead firm", () => as(db, lead, async (tx) => {
    await tx.query("insert into public.projects(key, name) values ('mine-50', 'M')"); // no RETURNING: the select policy runs before the owner row is visible (createProject's trap)
    expect(await q(tx, "select m.role, m.party, m.state from public.memberships m join public.projects p on p.id = m.project_id where p.key = 'mine-50'")).toEqual([{ role: "owner", party: "lead_appointed", state: "active" }]);
  }));
  it("backfill: owners and leads of an existing project become the Lead firm, others stay without a party", async () => {
    const old = await buildDb({ before: "0050_party_invitations.sql" });
    const p = (await old.query("insert into public.projects(key, name) values ('old', 'O') returning id")).rows[0].id;
    for (const [x, r] of [[owner, "owner"], [lead, "lead"], [contrib, "contributor"], [viewer, "viewer"]]) {
      await old.query("insert into auth.users(id, email) values ($1, $2)", [x.sub, x.email]);
      await old.query("insert into public.memberships(project_id, user_id, role) values ($1, $2, $3)", [p, x.sub, r]);
    }
    await old.exec(readFileSync(new URL("../db/migrations/0050_party_invitations.sql", import.meta.url), "utf8"));
    const rows = (await old.query("select role, party, state from public.memberships where project_id = $1 order by role", [p])).rows;
    expect(rows).toEqual([{ role: "contributor", party: null, state: "active" }, { role: "lead", party: "lead_appointed", state: "active" }, { role: "owner", party: "lead_appointed", state: "active" }, { role: "viewer", party: null, state: "active" }]);
    expect((await old.query("select count(*)::int n from public.audit_log where entity_type = 'membership'")).rows[0].n).toBe(0); // the backfill is not a person's act
  }, 60_000);
});

describe("0050 part 2 — an invited member counts as nobody", () => {
  it("the invited person reads no membership row and has no role; an active viewer reads them", async () => {
    await as(db, invited, async (tx) => {
      expect(await q(tx, "select 1 from public.memberships where project_id = $1", [P])).toEqual([]);
      expect((await q(tx, "select public.has_min_role($1, 'viewer') ok", [P]))[0].ok).toBe(false);
    });
    await as(db, viewer, async (tx) => expect((await q(tx, "select count(*)::int n from public.memberships where project_id = $1", [P]))[0].n).toBe(7));
  });
});

describe("0050 part 3 — the guard", () => {
  const setParty = (tx, who, p, team = null) => tx.query("update public.memberships set party = $3, task_team = $4 where project_id = $1 and user_id = $2", [P, who.sub, p, team]);
  it("a lead cannot change a party; an owner can, and the trigger writes the one ledger row", async () => {
    await expect(as(db, lead, (tx) => setParty(tx, viewer, "lead_appointed"))).rejects.toThrow(/only by an owner/);
    await as(db, owner, async (tx) => {
      await setParty(tx, viewer, "appointed", "ARC");
      expect(await party(tx, viewer)).toEqual({ party: "appointed", task_team: "ARC", state: "active" });
      const rows = await ledger(tx, "membership_party_changed", viewer);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor).toBe(owner.email);
      expect(rows[0].old_value).toEqual({ party: null, task_team: null, state: "active" });
      expect(rows[0].new_value).toEqual({ party: "appointed", task_team: "ARC", state: "active", by_uid: owner.sub });
    });
  });
  it("an owner cannot change their own row", async () => {
    await expect(as(db, owner, (tx) => setParty(tx, owner, "appointed", "ARC"))).rejects.toThrow(/never on your own row/);
  });
  it("a Firm member needs a task team; any other party drops the team", async () => {
    await expect(as(db, owner, (tx) => setParty(tx, viewer, "appointed"))).rejects.toThrow(/belongs to a task team/);
    await as(db, owner, async (tx) => { await setParty(tx, viewer, "lead_appointed", "ARC"); expect((await party(tx, viewer)).task_team).toBeNull(); });
  });
  it("only an owner inserts the Client; a lead inserts a Firm member with a team, ledgered with its state", async () => {
    const ins = (tx, p, team) => tx.query("insert into public.memberships(project_id, user_id, role, party, task_team, state) values ($1, $2, 'viewer', $3, $4, 'invited')", [P, uuid(), p, team]);
    await expect(as(db, lead, (tx) => ins(tx, "appointing", null))).rejects.toThrow(/only an owner adds the Client/);
    await as(db, owner, (tx) => ins(tx, "appointing", null));
    await as(db, lead, async (tx) => { await ins(tx, "appointed", "ARC"); expect(await q(tx, "select 1 from public.audit_log where project_id = $1 and action = 'membership_party_changed' and new_value->>'task_team' = 'ARC' and new_value->>'state' = 'invited'", [P])).toHaveLength(1); });
  });
  it("the service key flips invited -> active (ledgered as member_joined) and nothing else", async () => {
    await as(db, "service", async (tx) => {
      await tx.query("update public.memberships set state = 'active' where project_id = $1 and user_id = $2", [P, invited.sub]);
      expect((await party(tx, invited)).state).toBe("active");
      const rows = await ledger(tx, "member_joined", invited);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor).toBe("service");
    });
    await expect(as(db, "service", (tx) => setParty(tx, viewer, "appointing"))).rejects.toThrow(/service credential changes only invited/);
    await expect(as(db, "service", (tx) => tx.query("update public.memberships set state = 'active', party = 'appointing' where project_id = $1 and user_id = $2", [P, invited.sub]))).rejects.toThrow(/service credential changes only invited/);
  });
  it("a role change alone (0004's path) is not the guard's business", () => as(db, owner, async (tx) => {
    await tx.query("update public.memberships set role = 'contributor' where project_id = $1 and user_id = $2", [P, viewer.sub]);
    expect(await ledger(tx, "membership_party_changed", viewer)).toHaveLength(0);
  }));
});

// A review chain installed as artefact-store files it: the pointer and the body under the project's id.
const installChain = async (tx, steps) => {
  await tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review', $2)", [String(P), JSON.stringify({ version: 1, sha256: "ab".repeat(32) })]);
  await tx.query("insert into public.bridge_docs(store, project_id, doc_id, data) values ('artefact', $1, 'review@1', $2)", [String(P), JSON.stringify({ body: { steps } })]);
};
const sharedVersion = async (tx, sharer) => {
  const folder = (await q(tx, "insert into public.folders(project_id, name, kind) values ($1, 'Project Files', 'root') returning id", [P]))[0].id;
  const c = (await q(tx, "insert into public.information_containers(project_id, iso_name, folder_id) values ($1, 'X.ifc', $2) returning id", [P, folder]))[0].id;
  const v = (await q(tx, "insert into public.container_versions(container_id, revision, sha256) values ($1, 'P01', $2) returning id", [c, "cd".repeat(32)]))[0].id;
  await claims(tx, sharer);
  await tx.query("select public.cde_transition($1, 'shared', null, null, 'drill: no verdict yet')", [v]);
  return v;
};
const decideAs = async (tx, who, v, decision = "approve", note = null) => {
  await claims(tx, who);
  return (await q(tx, "select public.review_decide($1, $2, $3) r", [v, decision, note]))[0].r;
};
const CHAIN = [{ name: "Task team", role: "contributor", approvals: 1, party: "lead_appointed" }, { name: "Lead", role: "lead", approvals: 1, party: "lead_appointed" }, { name: "Client", role: "viewer", approvals: 1, party: "appointing" }];

describe("0050 part 3 — a party change while a round is open", () => {
  it("is refused for an owner too", () => as(db, "service", async (tx) => {
    await installChain(tx, CHAIN);
    await sharedVersion(tx, lead);
    await claims(tx, owner);
    await expect(tx.query("update public.memberships set party = 'appointed', task_team = 'ARC' where project_id = $1 and user_id = $2", [P, viewer.sub])).rejects.toThrow(/review round is open/);
  }));
});

describe("0050 part 4 — invitations are the bridge's", () => {
  it("authenticated reads none and inserts none; the service key does both", async () => {
    await as(db, "service", (tx) => tx.query("insert into public.invitations(project_id, email, user_id, role, inviter_uid, expires_at) values ($1, 'x@y.z', $2, 'viewer', $3, now() + interval '14 days')", [P, uuid(), owner.sub]));
    await as(db, owner, async (tx) => {
      await expect(refusal(tx, () => tx.query("select 1 from public.invitations"))).rejects.toThrow(/permission denied/);
      await expect(refusal(tx, () => tx.query("insert into public.invitations(project_id, email, user_id, role, inviter_uid, expires_at) values ($1, 'x@y.z', $2, 'viewer', $3, now())", [P, uuid(), owner.sub]))).rejects.toThrow(/permission denied/);
    });
  });
});

describe("0050 part 5 — review_decide with parties", () => {
  it("the client viewer decides step 3 of a chain that names the Client; the row records both parties", () => as(db, "service", async (tx) => {
    await installChain(tx, CHAIN);
    const v = await sharedVersion(tx, owner);
    expect((await decideAs(tx, contrib, v)).step).toBe(1);
    expect((await decideAs(tx, lead, v)).step).toBe(2);
    const r = await decideAs(tx, client, v);
    expect(r).toMatchObject({ step: 3, party: "appointing", published: true, state: "published" });
    const row = (await q(tx, "select new_value from public.audit_log where id = $1", [r.id]))[0].new_value;
    expect(row).toMatchObject({ party: "appointing", decider_party: "appointing", role: "viewer" });
  }));
  it("a viewer in no party, and an owner of the Lead firm, cannot decide the Client's step", () => as(db, "service", async (tx) => {
    await installChain(tx, CHAIN);
    const v = await sharedVersion(tx, owner);
    await decideAs(tx, contrib, v); await decideAs(tx, lead, v);
    await expect(refusal(tx, () => decideAs(tx, viewer, v))).rejects.toThrow(/decided by the Client — you are in no party/);
    await expect(refusal(tx, () => decideAs(tx, owner2, v))).rejects.toThrow(/decided by the Client — you are the Lead firm/);
  }));
  it("a viewer step that names no party is never decidable, in words a lead can act on", () => as(db, "service", async (tx) => {
    await installChain(tx, [{ name: "Anyone", role: "viewer", approvals: 1 }]);
    const v = await sharedVersion(tx, owner);
    await expect(decideAs(tx, client, v)).rejects.toThrow(/must name a party/);
  }));
  it("a step without a party keeps 0043's rule: any member of the role decides", () => as(db, "service", async (tx) => {
    await installChain(tx, [{ name: "Lead", role: "lead", approvals: 1 }]);
    const v = await sharedVersion(tx, owner);
    await expect(refusal(tx, () => decideAs(tx, client, v))).rejects.toThrow(/needs lead or above/);
    expect((await decideAs(tx, lead, v)).published).toBe(true);
  }));
});

describe("0050 files are valid UTF-8", () => {
  for (const f of ["0050_party_invitations.sql", "probes/0050_probe.sql"])
    it(`${f} decodes strictly`, () => {
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url)))).not.toThrow();
    });
});
