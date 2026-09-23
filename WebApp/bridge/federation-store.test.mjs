// The gate on the bridge: resolve the set, load manifests and verdicts, judge, store, audit.
import { describe, it, expect } from "vitest";
import { runFederation, getFederation } from "./federation-store.mjs";

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
    projectNamingRuleset: async () => ({ ruleset: null }),
    getArtefact: async () => null,
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
  it("uses the project's type rule from the ruleset artefact when installed", async () => {
    const d = memDeps({ manifests: { "v-1": { ...mA, elements: [{ guid: "g1", class: "IFCWALL", type_name: "ZZZ_EXT_CMU_200 mm", storey: null }] }, "v-2": { ...mA, elements: [{ guid: "g2", class: "IFCWALL", type_name: "Wall 1", storey: null }] } } });
    d.getArtefact = async (key, kind) => kind === "ruleset" ? { body: { org: "ZZZ", rules: [{ id: "TN-01", target: "type", mode: "monitor", tokens: ["ORG", "LOC", "MATERIAL", "SIZE"], token_defs: { ORG: "{org}", LOC: "EXT|INT", MATERIAL: "[A-Z0-9]+", SIZE: "\\d+ mm" }, separator: "_", message_en: "x" }] } } : null;
    const run = await runFederation("p", {}, { actor: "cli" }, d);
    expect(run.type_rule).toBe("TN-01");
    expect(run.result.checks.find((c) => c.id === "FG-02").evidence).toContainEqual({ model: "B-0102.ifc", type_name: "Wall 1", rule: "TN-01" });
  });
});

describe("getFederation", () => {
  it("returns the latest run, flags it stale when the live set changed, and null before any run", async () => {
    const d = memDeps();
    expect(await getFederation("p", d)).toMatchObject({ latest: null, stale: false });
    await runFederation("p", {}, { actor: "cli" }, d);
    expect((await getFederation("p", d)).stale).toBe(false);
    d.listManifests = async () => [{ container: "A-0101.ifc", container_id: "c-1", version_id: "v-9", revision: "P02", has_manifest: false, captured_at: null }];
    const f = await getFederation("p", d);
    expect(f.stale).toBe(true);
    expect(f.live_set[0].version_id).toBe("v-9");
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
