// The "Platform deliveries" lane: five card states and the "not read" rule (spec 2026-09-27 platform-delivery-gate, Decision 8).
import { describe, it, expect, vi } from "vitest";
import { deliveryCard, readDeliveries, deliveriesSummary, reportName, REPORT_KIND, type GateReport, type PlatformItem } from "./platform-deliveries";

const sha = "a".repeat(64);
const item = (name = "tower.ifc", tags = ["v1", "v2"]): PlatformItem => ({ _id: `id-${name}`, name, versions: tags.map((tag) => ({ tag })) });
const report = (over: Partial<GateReport> = {}): GateReport => ({ kind: REPORT_KIND, result: "pass", passed: true, contract: { ref: "contract@1", sha256: "c".repeat(64) }, failures: [], warnings: [], sha256: sha, run: { executionId: "exec9" }, ...over });

describe("deliveryCard", () => {
  it("a pass: Passed with the contract, the sha and the run; warnings as lines", () => {
    const c = deliveryCard(item(), "v2", null, report({ warnings: ["No georeference detected on IFCSITE (RefLatitude/RefLongitude)."] }));
    expect(c).toMatchObject({ state: "passed", headline: "Passed — contract@1", sha256: sha, run: "exec9", versionTag: "v2", name: "tower.ifc" });
    expect(c.lines).toEqual(["⚠ No georeference detected on IFCSITE (RefLatitude/RefLongitude)."]);
  });
  it("a refusal: every failure sentence, as the bridge and Revit print it", () => {
    const c = deliveryCard(item(), "v2", null, report({ result: "fail", passed: false, failures: ["IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.", "Required property set 'Pset_WallCommon' not found in the file."] }));
    expect(c.state).toBe("refused");
    expect(c.headline).toBe("Refused — contract@1 — 2 failures");
    expect(c.lines).toEqual(["✗ IFCBUILDINGELEMENTPROXY: 994 exceeds max 0.", "✗ Required property set 'Pset_WallCommon' not found in the file."]);
  });
  it("not checked: the reason, no contract named", () => {
    const c = deliveryCard(item(), "v1", null, report({ result: "not_checked", passed: null, contract: null, reason: "no contract on the platform project — install one in Sentinel" }));
    expect(c).toMatchObject({ state: "not_checked", headline: "Not checked", lines: ["no contract on the platform project — install one in Sentinel"] });
  });
  it("labels only (the report could not be read): the verdict from the labels, the sha from its two halves — an error label is never a pass", () => {
    const labels = { sentinel_gate: "fail", sentinel_contract: "contract@1", sentinel_failures: "1", sentinel_sha256_a: sha.slice(0, 32), sentinel_sha256_b: sha.slice(32), sentinel_run: "exec1" };
    expect(deliveryCard(item(), "v2", labels, null)).toMatchObject({ state: "refused", headline: "Refused — contract@1 — 1 failure(s)", sha256: sha, run: "exec1" });
    expect(deliveryCard(item(), "v2", { ...labels, sentinel_gate: "pass" }, null)).toMatchObject({ state: "passed", headline: "Passed — contract@1" });
    expect(deliveryCard(item(), "v2", { sentinel_gate: "not_checked", sentinel_contract: "none" }, null)).toMatchObject({ state: "not_checked" });
    expect(deliveryCard(item(), "v2", { sentinel_gate: "error", sentinel_run: "exec2" }, null)).toMatchObject({ state: "did_not_run", headline: "Gate did not run", run: "exec2" });
  });
  it("nothing yet: Running — no verdict is claimed", () => {
    expect(deliveryCard(item(), "v2", null, null)).toMatchObject({ state: "running", headline: "Running", sha256: null, run: null });
    expect(deliveryCard(item(), "v2", {}, null).state).toBe("running");
  });
  it("a report of another kind is ignored, not trusted", () => {
    expect(deliveryCard(item(), "v2", null, report({ kind: "something.else" })).state).toBe("running");
  });
});

describe("readDeliveries", () => {
  const client = (items: PlatformItem[], o: { labels?: Record<string, unknown>; reportBody?: unknown; listFails?: string; downloadFails?: boolean } = {}) => ({
    listFiles: vi.fn(async () => { if (o.listFails) throw new Error(o.listFails); return items; }),
    getFileVersionMetadata: vi.fn(async () => (o.labels ?? {}) as Record<string, string>),
    downloadFile: vi.fn(async () => { if (o.downloadFails) throw new Error("404"); return new Response(JSON.stringify(o.reportBody ?? report())); }),
  });

  it("lists every .ifc of the platform project with its latest version; the report version for that tag wins over labels", async () => {
    const c = client([item("a.ifc"), item("b.ifc", ["v1"]), { _id: "r", name: reportName("a.ifc"), versions: [{ tag: "v2" }] }, { _id: "x", name: "notes.txt", versions: [{ tag: "v1" }] }], { labels: { sentinel_gate: "fail" } });
    const cards = await readDeliveries(c, "p1");
    expect(cards.map((k) => [k.name, k.versionTag, k.state])).toEqual([["a.ifc", "v2", "passed"], ["b.ifc", "v1", "refused"]]);
    expect(c.listFiles).toHaveBeenCalledWith({ projectId: "p1" });
    expect(c.downloadFile).toHaveBeenCalledWith("r", { versionTag: "v2" });
    expect(c.getFileVersionMetadata).toHaveBeenCalledTimes(1); // only b.ifc, which has no report version
  });
  it("a report item without a version for this tag falls back to the labels, then to running", async () => {
    const c = client([item("a.ifc"), { _id: "r", name: reportName("a.ifc"), versions: [{ tag: "v1" }] }]);
    expect((await readDeliveries(c, "p1"))[0].state).toBe("running");
    expect(c.downloadFile).not.toHaveBeenCalled();
  });
  it("a report download that fails falls back to the labels, never to an invented verdict", async () => {
    const c = client([item("a.ifc"), { _id: "r", name: reportName("a.ifc"), versions: [{ tag: "v2" }] }], { downloadFails: true, labels: { sentinel_gate: "pass", sentinel_contract: "contract@1" } });
    expect((await readDeliveries(c, "p1"))[0]).toMatchObject({ state: "passed", lines: ["the report file could not be read — the labels say pass"] });
  });
  it("the list itself failing, or no linked platform project, is 'not read — …' — never an empty lane", async () => {
    await expect(readDeliveries(client([], { listFails: "403 STORAGE:READ" }), "p1")).rejects.toThrow("not read — 403 STORAGE:READ");
    await expect(readDeliveries(client([]), undefined)).rejects.toThrow(/^not read — this project is not linked/);
    await expect(readDeliveries(undefined, "p1")).rejects.toThrow(/^not read — /);
  });
  it("the summary counts each state and says when there is no IFC", async () => {
    expect(deliveriesSummary([])).toBe("no IFC on the platform project yet");
    const cards = await readDeliveries(client([item("a.ifc"), item("b.ifc", ["v1"])], { labels: { sentinel_gate: "not_checked" } }), "p1");
    expect(deliveriesSummary(cards)).toBe("2 IFC · 2 not checked");
  });
});
