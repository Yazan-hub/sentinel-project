// The Dashboard's Run gate: the browser posts only the stage; the bridge measures, records and answers; the status
// line names the ledger row only with an id and a 64-hex hash, and a check nothing measured is named, never passed.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { runStageGate, ledgerLine, gateLine, type GateReply } from "./stage-gate";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "6e7f8091a2b3c4d5".padEnd(64, "0");
const NAMES: Record<string, string> = { tender: "Tender", design: "Design", coord: "Coordination" };
const nm = (id: string) => NAMES[id] ?? id;
const NO_SOURCE = "not measured — no server source: the browser scan is not persisted";
const check = (label: string, ok: boolean, na = false, source = "ruleset artefact"): GateReply["checks"][number] =>
  ({ label, ok, na, detail: na ? "no data" : ok ? "set" : "none", source });
const reply = (over: Partial<GateReply> = {}): GateReply => ({
  stage: "tender", status: "pass", checks: [check("Standards pack selected", true)], next_stage: "design",
  ledger: { id: 901, hash: HASH }, ...over,
});

describe("runStageGate — POST /cde/:key/gate", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts only the stage and returns the bridge's reply as-is", async () => {
    const r = reply();
    bfetch.mockResolvedValue(res(200, r));
    expect(await runStageGate("http://b/", "aster-tower", "tender")).toEqual(r);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster-tower/gate", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ stage: "tender" });
  });

  it("a refusal throws the bridge's words — a role, the wrong stage, an unknown stage — and nothing is retried", async () => {
    bfetch.mockResolvedValue(res(403, { message: "this action requires the lead role (you are contributor)" }));
    await expect(runStageGate("http://b", "aster-tower", "tender")).rejects.toThrow("this action requires the lead role (you are contributor)");
    bfetch.mockResolvedValue(res(409, { message: "the gate to run is the current stage's: design" }));
    await expect(runStageGate("http://b", "aster-tower", "tender")).rejects.toThrow("the gate to run is the current stage's: design");
    bfetch.mockResolvedValue(res(400, { message: "unknown stage 'nope'" }));
    await expect(runStageGate("http://b", "aster-tower", "nope")).rejects.toThrow("unknown stage 'nope'");
    expect(bfetch).toHaveBeenCalledTimes(3);
  });

  it("a failure without a message names the status", async () => {
    bfetch.mockResolvedValue(res(502, null));
    await expect(runStageGate("http://b", "aster-tower", "tender")).rejects.toThrow("HTTP 502");
  });
});

describe("ledgerLine", () => {
  it("names the row only with an id and a 64-hex hash", () => {
    expect(ledgerLine({ id: 901, hash: HASH })).toBe("ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("is 'not confirmed' without either — an id alone, a short or upper-case hash, no id, no ledger at all", () => {
    const no = "not confirmed — the bridge returned no chain hash";
    expect(ledgerLine({ id: 901, hash: null })).toBe(no);
    expect(ledgerLine({ id: 901, hash: "abc" })).toBe(no);
    expect(ledgerLine({ id: 901, hash: HASH.toUpperCase() })).toBe(no);
    expect(ledgerLine({ id: null, hash: HASH })).toBe(no);
    expect(ledgerLine(null)).toBe(no);
  });
});

describe("gateLine", () => {
  it("PASS names the stage the project advanced to and the row", () => {
    expect(gateLine(reply(), nm)).toBe("Gate PASS — advanced to Design · ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("HOLD points at the checks below", () => {
    const r = reply({ stage: "tender", status: "hold", checks: [check("Standards pack selected", false)] });
    expect(gateLine(r, nm)).toBe("Gate HOLD — clear the failing checks below · ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("not checkable names every check nothing measured — never a pass", () => {
    const r = reply({ stage: "design", status: "not_checkable", next_stage: "coord", checks: [
      check("Model health ≥ 80%", false, true, NO_SOURCE),
      check("No 'block' violations", false, true, NO_SOURCE),
      check("Standards compliance ≥ 70%", false, true, NO_SOURCE),
    ] });
    expect(gateLine(r, nm)).toBe("Gate not checkable — Model health ≥ 80%, No 'block' violations, Standards compliance ≥ 70% · ledger #901 · receipt 6e7f8091a2b3c4d5…");
  });
  it("a reply without a chain hash says so instead of a receipt", () => {
    expect(gateLine(reply({ ledger: { id: 901, hash: null } }), nm)).toBe("Gate PASS — advanced to Design · not confirmed — the bridge returned no chain hash");
  });
});
