// "Ask Sentinel" — the answering side (spec 2026-09-29 sdk-ask-sentinel, Phase 2): the ledger strings come only from
// ledgerLine, a disagreement says both, the caps hold, a signed-out tab never reads the ledger, and nothing throws.
import { describe, it, expect, vi } from "vitest";
import { answerDeliveries, answerStatus, ask, setupAskSentinel, type AskDeps } from "./ask-sentinel";
import type { DeliveryCard, GateLedgerRow } from "./platform-deliveries";

const card = (over: Partial<DeliveryCard> = {}): DeliveryCard => ({ name: "tower.ifc", versionTag: "v2", state: "refused", headline: "Refused — contract@1 — 1 failure", lines: ["✗ IFCBUILDINGELEMENTPROXY: 994 exceeds max 0."], sha256: "a".repeat(64), run: "exec9", ...over });
const row = (id: number, execution_id: string, result: string): GateLedgerRow => ({ id, new_value: { execution_id, result } });
const deps = (over: Partial<AskDeps> = {}): AskDeps => ({
  appVersion: "1.0.31", platformProjectId: () => "plat1", sentinelProject: () => "aster-tower",
  signedIn: async () => true, bridge: async () => ({ ok: true, status: 200 }),
  readDeliveries: vi.fn(async () => [card()]), readGateLedger: vi.fn(async () => [row(42, "exec9", "fail")]), ...over,
});

describe("answerDeliveries — the three ledger strings, and the row's result beside the platform's hint", () => {
  it("a cited row: ledger #N, its result, and agrees when the hint says the same", () => {
    const [a] = answerDeliveries([card()], [row(41, "exec8", "pass"), row(42, "exec9", "fail")], null).deliveries;
    expect(a).toMatchObject({ name: "tower.ifc", version_tag: "v2", platform: "the platform's hint: Refused — contract@1 — 1 failure", run: "exec9", ledger: "ledger #42", ledger_result: "fail", agrees: true });
    expect(a.failures).toEqual(["✗ IFCBUILDINGELEMENTPROXY: 994 exceeds max 0."]);
  });
  it("no row for the run: not on this project's ledger yet — no result, no agreement claimed", () => {
    const [a] = answerDeliveries([card()], [row(41, "exec8", "fail")], null).deliveries;
    expect(a.ledger).toBe("not on this project's ledger yet");
    expect(a).not.toHaveProperty("ledger_result");
    expect(a).not.toHaveProperty("agrees");
  });
  it("the read failed: ledger not read — <why>, even with rows in hand; no row is cited", () => {
    const [a] = answerDeliveries([card()], [row(42, "exec9", "fail")], "can't reach the bridge (Failed to fetch)").deliveries;
    expect(a.ledger).toBe("ledger not read — can't reach the bridge (Failed to fetch)");
    expect(a).not.toHaveProperty("ledger_result");
  });
  it("the hint and the row disagree: both are said, neither is picked", () => {
    const [a] = answerDeliveries([card({ state: "passed", headline: "Passed — contract@1", lines: [] })], [row(42, "exec9", "fail")], null).deliveries;
    expect(a).toMatchObject({ platform: "the platform's hint: Passed — contract@1", ledger: "ledger #42", ledger_result: "fail", agrees: false });
  });
});

describe("answerDeliveries — caps", () => {
  it("at most 20 IFCs (limit clamped), and says how many more", () => {
    const cards = Array.from({ length: 25 }, (_, i) => card({ name: `m${i}.ifc`, run: null }));
    expect(answerDeliveries(cards, [], null, { limit: 100 })).toMatchObject({ total: 25, more: 5, note: "5 more not shown (limit 20)" });
    expect(answerDeliveries(cards, [], null, { limit: 3 }).deliveries).toHaveLength(3);
    expect(answerDeliveries(cards, [], null).deliveries).toHaveLength(20);
  });
  it("at most 10 failure lines, plus how many more; a card that is not a refusal lists none", () => {
    const lines = Array.from({ length: 14 }, (_, i) => `✗ failure ${i}`);
    const [a] = answerDeliveries([card({ lines })], [], null).deliveries;
    expect(a.failures).toHaveLength(10);
    expect(a.more_failures).toBe(4);
    expect(answerDeliveries([card({ state: "passed", lines: ["⚠ warning"] })], [], null).deliveries[0]).toMatchObject({ failures: [], more_failures: 0 });
  });
  it("nothing to answer is said in words", () => {
    expect(answerDeliveries([], [], null, { name: "x.ifc" }).note).toBe('no IFC named "x.ifc" on the platform project');
  });
});

describe("the two commands", () => {
  it("sentinel.deliveries passes the name filter and cites the row", async () => {
    const d = deps();
    const a = (await ask("sentinel.deliveries", { name: " tower.ifc ", limit: 5 }, d)) as { deliveries: { ledger: string }[]; sentinel_project: string };
    expect(d.readDeliveries).toHaveBeenCalledWith("tower.ifc");
    expect(d.readGateLedger).toHaveBeenCalledWith("aster-tower");
    expect(a.deliveries[0].ledger).toBe("ledger #42");
    expect(a.sentinel_project).toBe("aster-tower");
  });
  it("not signed in: the ledger is not read — never a verdict", async () => {
    const d = deps({ signedIn: async () => false });
    const a = (await ask("sentinel.deliveries", undefined, d)) as { deliveries: { ledger: string }[] };
    expect(d.readGateLedger).not.toHaveBeenCalled();
    expect(a.deliveries[0].ledger).toBe("ledger not read — this tab is not signed in to Sentinel");
    expect(a.deliveries[0]).not.toHaveProperty("agrees");
  });
  it("sentinel.status: presence only", async () => {
    expect(await answerStatus(deps())).toEqual({ app_version: "1.0.31", platform_project_id: "plat1", sentinel_project: "aster-tower", signed_in: true, bridge: "reachable" });
    expect((await answerStatus(deps({ bridge: async () => ({ ok: false, status: 502 }) }))).bridge).toBe("not reachable — HTTP 502");
  });
  it("an unknown command is refused in words", async () => {
    expect(await ask("sentinel.delete", {}, deps())).toEqual({ error: 'unknown command "sentinel.delete" — Sentinel answers only "sentinel.status" and "sentinel.deliveries" (read-only)' });
  });
  it("a reader that throws becomes an answer in words, never a throw", async () => {
    const boom = () => { throw new Error("boom"); };
    expect(await ask("sentinel.deliveries", {}, deps({ readDeliveries: async () => { throw new Error("not read — 429"); } }))).toEqual({ error: "platform deliveries not read — 429" });
    const a = (await ask("sentinel.deliveries", {}, deps({ readGateLedger: async () => { throw new Error("HTTP 500"); } }))) as { deliveries: { ledger: string }[] };
    expect(a.deliveries[0].ledger).toBe("ledger not read — HTTP 500");
    const s = await answerStatus(deps({ signedIn: async () => boom(), bridge: async () => { throw new TypeError("Failed to fetch"); } }));
    expect(s).toMatchObject({ signed_in: "not read — boom", bridge: "not reachable — can't reach the bridge (Failed to fetch)" });
    expect(await ask("sentinel.status", {}, deps({ platformProjectId: boom }))).toEqual({ error: "not answered — boom" });
  });
});

describe("setupAskSentinel", () => {
  it("joins the external room and answers exactly the two commands", async () => {
    const handlers = new Map<string, (p: unknown) => unknown>();
    const room = { on: vi.fn((t: string, h: (p: unknown) => unknown) => { handlers.set(t, h); return () => {}; }), join: vi.fn(async () => {}) };
    const external = vi.fn(() => room);
    setupAskSentinel({ channel: { external } }, deps());
    expect(external).toHaveBeenCalledWith();
    expect(room.join).toHaveBeenCalled();
    expect([...handlers.keys()]).toEqual(["sentinel.status", "sentinel.deliveries"]);
    expect(await handlers.get("sentinel.status")!(undefined)).toMatchObject({ bridge: "reachable" });
  });
});
