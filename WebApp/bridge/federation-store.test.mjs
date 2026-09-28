// The gate on the bridge: resolve the set, load manifests and verdicts, judge, store, audit.
import { describe, it, expect } from "vitest";
import { runFederation, getFederation, raiseGate } from "./federation-store.mjs";
import { refLabel } from "./artefact-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

const NONE = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };

const mA = { schema: "IFC4", elements: [{ guid: "g1", class: "IFCWALL", type_name: "Wall 1", storey: null }], levels: [{ name: "Level 1", elevation_mm: 0 }], grids: ["A"], site: { lat: 51.5, lon: -0.1, elevation_m: 0, map_conversion: null } };
const mB = { ...mA, elements: [{ guid: "g1", class: "IFCWALL", type_name: "W-A1-Fin", storey: null }] };

function memDeps({ manifests = { "v-1": mA, "v-2": mB }, verdicts = { "v-1": "accepted", "v-2": "accepted" }, live = null } = {}) {
  const docs = new Map(), audits = [];
  const liveSet = live ?? [
    { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: !!manifests["v-1"], captured_at: null },
    { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: !!manifests["v-2"], captured_at: null },
  ];
  return {
    docs, audits,
    ensureProject: async (key) => ({ id: `uuid-${key}`, key, metadata: {} }),
    docGet: async (s, p, d) => docs.get(`${s}|${p}|${d}`) ?? null,
    docUpsert: async (s, p, d, data) => { docs.set(`${s}|${p}|${d}`, data); },
    audit: async (pid, et, eid, action, actor, oldv, newv) => { audits.push({ pid, et, eid, action, actor, newv }); },
    listManifests: async () => liveSet,
    getManifest: async (key, vid) => manifests[vid] ?? null,
    versionVerdicts: async () => verdicts,
    resolveArtefact: async () => NONE,
    requireMinRole: async () => {}, // a role that passes; the role tests below replace it
  };
}

describe("runFederation", () => {
  it("fails the S11 pair, stores the latest run and writes one audit row with entity_id null", async () => {
    const d = memDeps();
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.result.verdict).toBe("fail");
    expect(run.result.checks.find((c) => c.id === "FG-01").status).toBe("fail");
    expect(run.result.checks.find((c) => c.id === "FG-02").status).toBe("fail");
    expect(run.set.map((s) => s.version_id)).toEqual(["v-1", "v-2"]);
    expect(d.docs.get("federation|uuid-p|latest").result.verdict).toBe("fail");
    expect(d.audits).toHaveLength(1);
    expect(d.audits[0]).toMatchObject({ et: "federation_gate", eid: null, action: "Federation gate FAIL: 2 model(s)", actor: "cli" });
    expect(d.audits[0].newv.checks.map((c) => c.id)).toEqual(["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]);
  });
  it("is not checkable when only one live model carries a manifest, and says which lacks one", async () => {
    const d = memDeps({ manifests: { "v-1": mA } });
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.result.verdict).toBe("not_checkable");
    expect(run.result.models.find((m) => m.version_id === "v-2").has_manifest).toBe(false);
    expect(d.audits[0].action).toBe("Federation gate NOT CHECKABLE: 2 model(s)");
  });
  it("honours an explicit versions list", async () => {
    const d = memDeps();
    const run = await runFederation("p", { versions: ["v-1"] }, { actor: "cli" }, d);
    expect(run.set.map((s) => s.version_id)).toEqual(["v-1"]);
    expect(run.result.verdict).toBe("not_checkable");
  });
  it("uses the type rule from the resolved ruleset artefact and names it on the run, FG-02 and the audit row", async () => {
    const d = memDeps({ manifests: { "v-1": { ...mA, elements: [{ guid: "g1", class: "IFCWALL", type_name: "ZZZ_EXT_CMU_200 mm", storey: null }] }, "v-2": { ...mA, elements: [{ guid: "g2", class: "IFCWALL", type_name: "Wall 1", storey: null }] } } });
    const rs = { body: { standard_key: "k", semver: "1.0.0", org: "ZZZ", rules: [{ id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "LOC", "MATERIAL", "SIZE"], token_defs: { ORG: "{org}", LOC: "EXT|INT", MATERIAL: "[A-Z0-9]+", SIZE: "\\d+ mm" }, separator: "_", message_en: "x" }] }, source: "office", ref: "ruleset@2", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false };
    d.resolveArtefact = async (key, kind) => kind === "ruleset" ? rs : NONE;
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.type_rule).toBe("TN-01");
    expect(run.ruleset_ref).toBe(refLabel(rs));
    expect(run.ruleset_ref).toContain("ruleset@2 · office · 3f07376abcde");
    expect(run.naming_ref).toBeNull();
    const fg02 = run.result.checks.find((c) => c.id === "FG-02");
    expect(fg02.evidence).toContainEqual({ model: "B-0102.ifc", type_name: "Wall 1", rule: "TN-01" });
    expect(fg02.refs).toEqual({ ruleset: run.ruleset_ref, naming: null });
    expect(d.audits[0].newv).toMatchObject({ ruleset_ref: run.ruleset_ref, naming_ref: null });
  });
  it("with nothing installed FG-02 names neither ref and says how to install each", async () => {
    const d = memDeps();
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    const fg02 = run.result.checks.find((c) => c.id === "FG-02");
    expect(run).toMatchObject({ ruleset_ref: null, naming_ref: null, type_rule: null });
    expect(fg02.refs).toEqual({ ruleset: null, naming: null });
    expect(fg02.reason).toContain("naming shapes compared only");
    expect(fg02.warnings.join(" ")).toContain("no ruleset installed for this project or its office (PUT /cde/:key/artefacts/ruleset)");
    expect(fg02.warnings.join(" ")).toContain("no naming installed for this project or its office (PUT /cde/:key/artefacts/naming)");
  });
  it("judges container names by the resolved naming artefact and names it", async () => {
    const d = memDeps();
    const nm = { body: { standard_key: "k", semver: "1.0.0", title: "Two-part", separator: "-", enforce: "reject", strip_extensions: [".ifc"], fields: [{ key: "disc", label: "Discipline", enum: ["A"] }, { key: "num", label: "Number", pattern: "[0-9]{4}" }] }, source: "project", ref: "naming@1", sha256: "a1b2c3d4e5f60718293a4b5c", pointer_sha_mismatch: false };
    d.resolveArtefact = async (key, kind) => kind === "naming" ? nm : NONE;
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.naming_ruleset).toBe("Two-part");
    expect(run.naming_ref).toContain("naming@1 · project · a1b2c3d4e5f6");
    const fg06 = run.result.checks.find((c) => c.id === "FG-06");
    expect(fg06.status).toBe("fail");
    expect(fg06.evidence.map((e) => e.model)).toEqual(["B-0102.ifc"]);
  });
});

describe("raiseGate — the lock on the clash register", () => {
  const run = (verdict, checks = []) => ({ latest: { result: { verdict, checks } }, stale: false });
  it("opens only on a pass that is not stale, and names the one thing to do otherwise", () => {
    expect(raiseGate(run("pass"))).toEqual({ ok: true, why: null });
    expect(raiseGate({ latest: null, stale: false })).toEqual({ ok: false, why: "the Federation Gate has not been run on this project — run it first (Coordination ▸ Clash ▸ Run gate)" });
    expect(raiseGate({ ...run("pass"), stale: true })).toEqual({ ok: false, why: "the Federation Gate's last run is stale — a live model changed since; run it again" });
    expect(raiseGate(run("fail", [{ id: "FG-02", status: "fail" }, { id: "FG-03", status: "pass" }, { id: "FG-05", status: "fail" }])))
      .toEqual({ ok: false, why: "the Federation Gate failed (FG-02, FG-05) — fix those and run it again" });
    expect(raiseGate(run("not_checkable")).ok).toBe(false);
    expect(raiseGate(undefined).ok).toBe(false);
  });
});

describe("getFederation", () => {
  it("returns the latest run, flags it stale when the live set changed, and null before any run", async () => {
    const d = memDeps();
    expect(await getFederation("p", d)).toMatchObject({ latest: null, stale: false, raise: { ok: false } });
    await runFederation("p", {}, { actor: "cli" }, d);
    expect((await getFederation("p", d)).stale).toBe(false);
    d.listManifests = async () => [{ container: "A-0101.ifc", container_id: "c-1", version_id: "v-9", revision: "P02", has_manifest: false, captured_at: null }];
    const f = await getFederation("p", d);
    expect(f.stale).toBe(true);
    expect(f.live_set[0].version_id).toBe("v-9");
  });
  it("flags a run stale when a model the run never saw goes live", async () => {
    const d = memDeps();
    await runFederation("p", {}, { actor: "cli" }, d);
    d.listManifests = async () => [
      { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: true, captured_at: null },
      { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: true, captured_at: null },
      { container: "M-0103.ifc", container_id: "c-3", version_id: "v-3", revision: "P01", has_manifest: false, captured_at: null },
    ];
    expect((await getFederation("p", d)).stale).toBe(true);
  });
  it("is not stale after a partial run when the untouched live models are unchanged (3 live, run on 2)", async () => {
    const live3 = [
      { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: true, captured_at: null },
      { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: true, captured_at: null },
      { container: "C-0103.ifc", container_id: "c-3", version_id: "v-3", revision: "P01", has_manifest: true, captured_at: null },
    ];
    const d = memDeps({ manifests: { "v-1": mA, "v-2": mB, "v-3": mB }, verdicts: { "v-1": "accepted", "v-2": "accepted", "v-3": "accepted" }, live: live3 });
    await runFederation("p", { versions: ["v-1", "v-3"] }, { actor: "cli" }, d);
    expect((await getFederation("p", d)).stale).toBe(false);
  });
  it("is stale when the recorded set's manifest coverage changed, even if the version id did not (backfill)", async () => {
    const d = memDeps({ manifests: { "v-1": mA } });
    await runFederation("p", {}, { actor: "cli" }, d);
    d.listManifests = async () => [
      { container: "A-0101.ifc", container_id: "c-1", version_id: "v-1", revision: "P01", has_manifest: true, captured_at: "now" },
      { container: "B-0102.ifc", container_id: "c-2", version_id: "v-2", revision: "P01", has_manifest: true, captured_at: "now" },
    ];
    expect((await getFederation("p", d)).stale).toBe(true);
  });
});

// H0 (D4, cde-rem-6): a run writes the latest document, a federation_gate ledger row and (on a FAIL) BCF topics — a
// contributor's; the bridge then writes the document with the service key, so the store can be closed to direct writes.
describe("runFederation — who may run it", () => {
  it("a viewer runs nothing: a 403 before any read, no latest document and no ledger row", async () => {
    const d = { ...memDeps(), requireMinRole: async (_key, min) => { throw Object.assign(new Error(`this action requires the ${min} role (you are viewer)`), { status: 403 }); } };
    let read = false;
    d.listManifests = async () => { read = true; return []; };
    await expect(runFederation("p", {}, { actor: "x" }, d)).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    expect(read).toBe(false);
    expect(d.docs.size).toBe(0);
    expect(d.audits).toHaveLength(0);
  });

  it("the latest run is written with the service key, after the check", async () => {
    const d = memDeps();
    const opts = [];
    const upsert = d.docUpsert;
    d.docUpsert = async (s, p, id, data, o) => { opts.push(o); return upsert(s, p, id, data); };
    await runFederation("p", {}, { actor: "cli" }, d);
    expect(opts).toEqual([{ service: true }]);
  });
});

describe("who ran the gate comes from the sign-in (cde-rem-9, H0 D6)", () => {
  const jwt = (email) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email })).toString("base64url") + ".sig";

  it("a signed-in caller's run and row carry their verified identity, not ?actor", async () => {
    const d = memDeps();
    const run = await runWithAuth(jwt("member@example.test"), () => runFederation("p", {}, { actor: "The Director" }, d));
    expect(run.actor).toBe("member@example.test");
    expect(d.docs.get("federation|uuid-p|latest").actor).toBe("member@example.test");
    expect(d.audits[0].actor).toBe("member@example.test");
  });

  it("the machine credential keeps its label; none is web", async () => {
    expect((await runFederation("p", {}, { actor: "cli" }, memDeps())).actor).toBe("cli");
    expect((await runFederation("p", {}, {}, memDeps())).actor).toBe("web");
  });
});
