// The "Platform deliveries" lane: five card states and the "not read" rule (spec 2026-09-27 platform-delivery-gate, Decision 8).
import { describe, it, expect, vi } from "vitest";
import { deliveryCard, readDeliveries, deliveriesSummary, reportName, latestTag, ledgerLine, REPORT_KIND, type GateReport, type PlatformItem } from "./platform-deliveries";

const sha = "a".repeat(64);
const item = (name = "tower.ifc", tags = ["v2", "v1"]): PlatformItem => ({ _id: `id-${name}`, name, versions: tags.map((tag) => ({ tag })) });
const report = (over: Partial<GateReport> = {}): GateReport => ({ kind: REPORT_KIND, file: { id: "id-a.ifc", name: "a.ifc", versionTag: "v2" }, result: "pass", passed: true, contract: { ref: "contract@1", sha256: "c".repeat(64) }, failures: [], warnings: [], sha256: sha, run: { executionId: "exec9" }, ...over });

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

describe("latestTag — the platform lists versions newest-first", () => {
  it("takes the first entry, or the newest by createdAt when dated; none without versions", () => {
    expect(latestTag({ _id: "a", name: "a.ifc", versions: [{ tag: "v3" }, { tag: "v2" }, { tag: "v1" }] })).toBe("v3");
    expect(latestTag({ _id: "a", name: "a.ifc", versions: [{ tag: "v1", createdAt: "2026-01-01" }, { tag: "v2", createdAt: "2026-02-01" }] })).toBe("v2");
    expect(latestTag({ _id: "a", name: "a.ifc", versions: [] })).toBeNull();
  });
});

describe("readDeliveries", () => {
  const client = (items: PlatformItem[], o: { labels?: Record<string, unknown>; reportBody?: unknown; listFails?: string; downloadFails?: boolean; downloadStatus?: number; labelsFail?: string } = {}) => ({
    listFiles: vi.fn(async () => { if (o.listFails) throw new Error(o.listFails); return items; }),
    getFileVersionMetadata: vi.fn(async () => { if (o.labelsFail) throw new Error(o.labelsFail); return (o.labels ?? {}) as Record<string, string>; }),
    downloadFile: vi.fn(async () => { if (o.downloadFails) throw new Error("404"); return new Response(JSON.stringify(o.reportBody ?? report()), { status: o.downloadStatus ?? 200 }); }),
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
  it("a report that names another item or another version is not this version's report: the labels answer", async () => {
    const rep = { _id: "r", name: reportName("a.ifc"), versions: [{ tag: "v2" }] };
    const labels = { sentinel_gate: "fail", sentinel_contract: "contract@1", sentinel_failures: "1" };
    for (const file of [{ id: "id-other.ifc", name: "a.ifc", versionTag: "v2" }, { id: "id-a.ifc", name: "a.ifc", versionTag: "v1" }, null]) {
      const c = client([item("a.ifc"), rep], { reportBody: report({ file }), labels });
      expect((await readDeliveries(c, "p1"))[0].state).toBe("refused"); // the labels', not the foreign report's pass
    }
  });

  it("a download that answered a 429 (downloadFile never throws on it) or JSON of another kind is not a report: the labels answer", async () => {
    const rep = { _id: "r", name: reportName("a.ifc"), versions: [{ tag: "v2" }] };
    const labels = { sentinel_gate: "fail", sentinel_contract: "contract@1", sentinel_failures: "2" };
    const limited = client([item("a.ifc"), rep], { downloadStatus: 429, reportBody: { ...report(), statusCode: 429, code: "RATE_LIMITED" }, labels });
    expect((await readDeliveries(limited, "p1"))[0]).toMatchObject({ state: "refused", headline: "Refused — contract@1 — 2 failure(s)" });
    expect(limited.getFileVersionMetadata).toHaveBeenCalledTimes(1);
    const other = client([item("a.ifc"), rep], { reportBody: { statusCode: 429, code: "RATE_LIMITED" }, labels });
    expect((await readDeliveries(other, "p1"))[0].state).toBe("refused");
  });
  it("a labels read that failed is 'not read — <why>', never Running", async () => {
    const cards = await readDeliveries(client([item("a.ifc")], { labelsFail: "Too Many Requests (429)" }), "p1");
    expect(cards[0]).toMatchObject({ state: "not_read", headline: "not read — Too Many Requests (429)", run: null });
    expect(deliveriesSummary(cards)).toBe("1 IFC · 1 not read");
  });
  it("a name filter reads only that IFC (case-insensitive): 1 list + ≤ 2 reads", async () => {
    const c = client([item("a.ifc"), item("B.ifc"), { _id: "r", name: reportName("B.ifc"), versions: [{ tag: "v2" }] }]);
    const cards = await readDeliveries(c, "p1", "b.ifc");
    expect(cards.map((k) => k.name)).toEqual(["B.ifc"]);
    expect(c.downloadFile.mock.calls.length + c.getFileVersionMetadata.mock.calls.length).toBeLessThanOrEqual(2);
    expect(await readDeliveries(c, "p1", "none.ifc")).toEqual([]);
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

describe("ledgerLine — the card's platform_gate row (spec 2026-09-29 platform-native, Part A)", () => {
  const row = (id: number, execution_id: unknown) => ({ id, new_value: { execution_id } });
  const fileRow = (id: number, execution_id: string, name: string | null, version_tag: string | null) =>
    ({ id, new_value: { execution_id, file: name ? { name, version_tag } : null } });
  it("with the card: a row is cited only when it names this file and version; else it is said as such", () => {
    const card = { name: "tower.ifc", versionTag: "v3" };
    expect(ledgerLine("exec9", [fileRow(42, "exec9", "tower.ifc", "v3")], null, card)).toBe("ledger #42");
    expect(ledgerLine("exec9", [fileRow(42, "exec9", "tower.ifc", "v2")], null, card)).toBe("ledger #42 is the run of tower.ifc v2 — not this version");
    expect(ledgerLine("exec9", [fileRow(42, "exec9", null, null)], null, card)).toBe("ledger #42 does not name its file — not tied to this version");
    expect(ledgerLine("exec9", [], null, card)).toBe("not on this project's ledger yet");
  });
  it("a row whose execution_id is the card's run: ledger #<id>", () => {
    expect(ledgerLine("exec9", [row(41, "exec8"), row(42, "exec9")], null)).toBe("ledger #42");
  });
  it("no row for the run: not on this project's ledger yet", () => {
    expect(ledgerLine("exec9", [], null)).toBe("not on this project's ledger yet");
  });
  it("the read failed: ledger not read — the bridge's words, even with rows in hand", () => {
    expect(ledgerLine("exec9", null, "project not found")).toBe("ledger not read — project not found");
    expect(ledgerLine("exec9", [row(42, "exec9")], "HTTP 500")).toBe("ledger not read — HTTP 500");
  });
  it("a row of another run never attaches; a card without a run attaches none", () => {
    expect(ledgerLine("exec9", [row(41, "exec90"), row(40, "EXEC9"), { id: 39, new_value: null }, { id: 38 }], null)).toBe("not on this project's ledger yet");
    expect(ledgerLine(null, [row(41, null), row(40, undefined), { id: 39 }], null)).toBe("not on this project's ledger yet");
  });
});

vi.mock("./bridge-fetch", () => ({ bfetch: vi.fn() }));
describe("readGateLedger — the board's and Ask Sentinel's one ledger reader", () => {
  it("reads every page; a bridge that never answered or refused says so in words", async () => {
    const { bfetch } = await import("./bridge-fetch");
    const { readGateLedger } = await import("./platform-deliveries-panel");
    const f = vi.mocked(bfetch);
    const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: from + i }));
    f.mockResolvedValueOnce(new Response(JSON.stringify({ rows: rows(0, 1000), total: 1001 }))).mockResolvedValueOnce(new Response(JSON.stringify({ rows: rows(1000, 1), total: 1001 })));
    expect(await readGateLedger("http://b", "aster tower")).toHaveLength(1001);
    expect(f.mock.calls[1][0]).toBe("http://b/cde/aster%20tower/audit?entity_type=platform_gate&limit=1000&offset=1000");
    f.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(readGateLedger("http://b", "p")).rejects.toThrow("can't reach the bridge (Failed to fetch)");
    f.mockResolvedValueOnce(new Response(JSON.stringify({ message: "not a member of this project" }), { status: 403 }));
    await expect(readGateLedger("http://b", "p")).rejects.toThrow("not a member of this project");
  });
});
