// Roadmap item 3, part A: the platform gate's runs → one ledger row each. Pure parts first, then one tick with a fake
// platform client and a fake ledger that behaves like migration 0036's unique index (a second row of a run is 23505).
import { describe, it, expect, vi, afterEach } from "vitest";
import { resultOf, scrub, readingOf, rowOf, syncPlatformGate, watchPlatformGate } from "./platform-gate-ledger.mjs";

const V100 = "Passed — contract@1 (bds-pilot) — report written; the version labels were refused: Cannot PUT /api/item/X/version//metadata?accessToken=SECRET123";

describe("resultOf — the component's first words", () => {
  it.each([
    ["Passed — contract@1 (bds-pilot)", "pass"],
    [V100, "pass"],
    ["Passed — contract@1 — the report could not be written: 500", "pass"],
    ["Refused — contract@1 — 2 failures: IFCPROJECT missing. Schema IFC2X3.", "fail"],
    ["Not checked — no contract on the platform project — install one in Sentinel", "not_checked"],
    ["Gate did not run — fileId is required", "did_not_run"],
    ["Skipped — a.ifc.gate.json is not an IFC", "skipped"],
  ])("%s → %s", (m, r) => expect(resultOf(m)).toBe(r));

  it.each([[""], [undefined], [null], ["Execution timed out"], ["passed — lower case"], ["Passed: no dash"]])(
    "%s → did_not_run, never a pass", (m) => expect(resultOf(m)).toBe("did_not_run"));
});

describe("scrub", () => {
  it("hides the 1.0.0 run's accessToken query value, keeping the rest of the URL", () => {
    const s = scrub("Cannot PUT /api/item/X/version//metadata?accessToken=SECRET123&x=1 then");
    expect(s).not.toContain("SECRET123");
    expect(s).toBe("Cannot PUT /api/item/X/version//metadata?accessToken=[scrubbed]&x=1 then");
  });
  it("hides a bearer credential and a bare JWT", () => {
    expect(scrub("Authorization: Bearer abc.def-ghi")).toBe("Authorization: Bearer [scrubbed]");
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";
    expect(scrub(`token was ${jwt} ok`)).toBe("token was [scrubbed] ok");
  });
  it("leaves plain text alone", () => expect(scrub("Refused — contract@1 — 0 failures")).toBe("Refused — contract@1 — 0 failures"));
});

describe("readingOf — the \"Reading <name> <tag>…\" line", () => {
  it("finds it among the run's messages", () => {
    expect(readingOf([{ content: "starting" }, { content: "Reading gate-automation-test.ifc v2…" }, { content: "40 entities" }]))
      .toEqual({ name: "gate-automation-test.ifc", version_tag: "v2" });
  });
  it("keeps spaces in the name; the tag is the last word", () => {
    expect(readingOf([{ content: "Reading My Tower Model.ifc P01…" }])).toEqual({ name: "My Tower Model.ifc", version_tag: "P01" });
  });
  it("reads JSON-stringified content", () => {
    expect(readingOf([{ content: JSON.stringify("Reading a.ifc v1…") }])).toEqual({ name: "a.ifc", version_tag: "v1" });
    expect(readingOf([{ content: JSON.stringify({ message: "Reading b.ifc v3…" }) }])).toEqual({ name: "b.ifc", version_tag: "v3" });
  });
  it("null when there is no such line", () => {
    expect(readingOf([{ content: "Skipped — x" }])).toBeNull();
    expect(readingOf(undefined)).toBeNull();
    expect(readingOf("Reading a.ifc v1…")).toBeNull();
  });
});

describe("rowOf", () => {
  const exec = {
    _id: "6ab9827413cf4cfc31e03d07", createdAt: "2026-09-27T10:00:00.000Z", completedAt: "2026-09-27T10:00:09.000Z",
    toolId: "6ab97f7213cf4cfc31e03c60", toolVersion: "1.0.0", result: "WARNING", resultMessage: V100, progress: 100,
    creatingUser: "u-1", creatingToken: "TOKENVALUE-XYZ",
  };
  const detail = { ...exec, messages: [{ content: "Reading gate-automation-test.ifc v2…", createdAt: "2026-09-27T10:00:01.000Z" }] };

  it("the 1.0.0 shape: a pass, no token anywhere in the row, the record's other fields left out", () => {
    const row = rowOf(exec, detail, "6a4c4df825f9ecf5f416d4c2");
    const json = JSON.stringify(row);
    expect(json).not.toContain("SECRET123");
    expect(json).not.toContain("TOKENVALUE-XYZ");
    expect(json).not.toContain("creatingToken");
    expect(json).not.toContain("creatingUser");
    expect(row).toEqual({
      entity_type: "platform_gate",
      action: "platform gate PASS: gate-automation-test.ifc v2",
      new_value: {
        execution_id: "6ab9827413cf4cfc31e03d07", platform_project_id: "6a4c4df825f9ecf5f416d4c2",
        component: { id: "6ab97f7213cf4cfc31e03c60", version: "1.0.0" }, result: "pass", platform_result: "WARNING",
        message: V100.replace("SECRET123", "[scrubbed]"), file: { name: "gate-automation-test.ifc", version_tag: "v2" },
        ran_at: "2026-09-27T10:00:00.000Z", finished_at: "2026-09-27T10:00:09.000Z",
      },
    });
  });
  it("names the run when there is no Reading line; caps the message at 2000", () => {
    const row = rowOf({ _id: "r9", result: "ERROR", resultMessage: `Gate did not run — ${"x".repeat(5000)}` }, { messages: [] }, "p");
    expect(row.action).toBe("platform gate DID NOT RUN: run r9");
    expect(row.new_value.file).toBeNull();
    expect(row.new_value.message).toHaveLength(2000);
    expect(row.new_value.finished_at).toBeNull();
  });
  it("refuses a run without an execution id", () => {
    expect(() => rowOf({ result: "SUCCESS", resultMessage: "Passed — c" }, {}, "p")).toThrow(/execution id/);
  });
});

// ── one tick ─────────────────────────────────────────────────────────────────────────────────────────────────────
const PID = "6a4c4df825f9ecf5f416d4c2";
const ASTER = { id: "11111111-1111-4111-8111-111111111111", key: "aster-tower", archived: false };
const run = (id, minute, result = "SUCCESS") =>
  ({ _id: id, createdAt: `2026-09-27T10:${String(minute).padStart(2, "0")}:00.000Z`, result, resultMessage: result ? "Passed — contract@1" : undefined, toolId: "c", toolVersion: "1.0.3" });

function fakes({ runs, links = [ASTER], ledger = new Set(), overrides = {} } = {}) {
  const calls = [];
  const rows = [];
  const deps = {
    listExecutions: async (c, p) => { calls.push(["list", c, p]); return runs; },
    getExecution: async (id) => { calls.push(["get", id]); return { _id: id, messages: [{ content: `Reading ${id}.ifc v1…` }] }; },
    findLinkedProjects: async (p) => { calls.push(["links", p]); return links; },
    existingExecutionIds: async (projectId, ids) => { calls.push(["ledger", projectId, ids.length]); return new Set(ids.filter((i) => ledger.has(i))); },
    // Like 0036: a second row of the same run is refused with PostgREST's 23505.
    audit: async (...a) => {
      calls.push(["audit", a[6].execution_id]);
      if (ledger.has(a[6].execution_id)) throw Object.assign(new Error("Supabase 409: duplicate key"), { body: { code: "23505" } });
      ledger.add(a[6].execution_id); rows.push(a); return { id: rows.length };
    },
    ...overrides,
  };
  return { deps, calls, rows, ledger };
}
const opts = (seen = new Set()) => ({ componentId: "c", platformProjectId: PID, seen });
const names = (calls, n) => calls.filter((c) => c[0] === n);

describe("readingOf — a version tag is free text", () => {
  it("splits at '.ifc ' first, so a tag with a space stays whole", () => {
    expect(readingOf([{ content: "Reading Tower.ifc Rev A…" }])).toEqual({ name: "Tower.ifc", version_tag: "Rev A" });
    expect(readingOf([{ content: "Reading My Tower v2.IFC P01..." }])).toEqual({ name: "My Tower v2.IFC", version_tag: "P01" });
    expect(readingOf([{ content: "Reading notes.txt v1…" }])).toEqual({ name: "notes.txt", version_tag: "v1" });
  });
});

describe("syncPlatformGate", () => {
  it("one row per finished run, oldest first; a second tick writes nothing and reads nothing more", async () => {
    const f = fakes({ runs: [run("r3", 30), run("r2", 20), run("r1", 10)] }); // the platform lists newest first
    const seen = new Set();
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 3, skipped: 0 });
    expect(f.rows.map((r) => r[6].execution_id)).toEqual(["r1", "r2", "r3"]);
    const [projectId, type, entityId, action, actor, oldv] = f.rows[0];
    expect([projectId, type, entityId, action, actor, oldv]).toEqual([ASTER.id, "platform_gate", null, "platform gate PASS: r1.ifc v1", "platform gate", null]);
    expect(names(f.calls, "list")[0]).toEqual(["list", "c", PID]);
    expect(names(f.calls, "ledger")[0]).toEqual(["ledger", ASTER.id, 3]);

    f.calls.length = 0;
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 0, skipped: 3 });
    expect(f.calls.map((c) => c[0])).toEqual(["list"]);
  });

  it("a fresh process with the rows already on the ledger writes nothing", async () => {
    const f = fakes({ runs: [run("r2", 20), run("r1", 10)], ledger: new Set(["r1", "r2"]) });
    expect(await syncPlatformGate(f.deps, opts())).toEqual({ written: 0, skipped: 2 });
    expect(names(f.calls, "audit")).toEqual([]);
    expect(names(f.calls, "get")).toEqual([]);
  });

  it("an unfinished run waits for a later tick", async () => {
    const f = fakes({ runs: [run("r2", 20, null), run("r1", 10)] });
    const seen = new Set();
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 1, skipped: 0 });
    f.deps.listExecutions = async () => [run("r2", 20), run("r1", 10)];
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 1, skipped: 1 });
    expect(f.rows.map((r) => r[6].execution_id)).toEqual(["r1", "r2"]);
  });

  it("23505 counts as recorded and the tick goes on", async () => {
    const f = fakes({ runs: [run("r2", 20), run("r1", 10)] });
    f.deps.existingExecutionIds = async () => new Set(); // another bridge writes r1 between the read and the insert
    f.ledger.add("r1");
    expect(await syncPlatformGate(f.deps, opts())).toEqual({ written: 1, skipped: 1 });
    expect(f.rows.map((r) => r[6].execution_id)).toEqual(["r2"]);
  });

  it.each([
    ["no link", [], /no Sentinel project links platform project 6a4c4df825f9ecf5f416d4c2/],
    ["two links", [ASTER, { id: "u2", key: "b13-review", archived: false }], /linked by aster-tower and b13-review/],
    ["only an archived link", [{ ...ASTER, archived: true }], /no Sentinel project links/],
  ])("%s → nothing written, the reason says why", async (_n, links, why) => {
    const f = fakes({ runs: [run("r1", 10)], links });
    const r = await syncPlatformGate(f.deps, opts());
    expect(r.written).toBe(0);
    expect(r.reason).toMatch(why);
    expect(r.reason).toMatch(/nothing was written/);
    expect(names(f.calls, "audit")).toEqual([]);
    expect(names(f.calls, "get")).toEqual([]);
  });

  it("an archived link beside a live one is not a conflict", async () => {
    const f = fakes({ runs: [run("r1", 10)], links: [ASTER, { id: "u2", key: "old", archived: true }] });
    expect(await syncPlatformGate(f.deps, opts())).toEqual({ written: 1, skipped: 0 });
  });

  it("a platform throw writes nothing, and its words are scrubbed", async () => {
    const f = fakes({ runs: [], overrides: { listExecutions: async () => { throw new Error("GET /api/processor/c/progress?accessToken=SECRET123 → 403"); } } });
    const r = await syncPlatformGate(f.deps, opts());
    expect(r).toMatchObject({ written: 0, skipped: 0 });
    expect(r.reason).toMatch(/^the platform's gate runs were not read — /);
    expect(r.reason).not.toContain("SECRET123");
    expect(names(f.calls, "links")).toEqual([]);
  });

  it("a ledger read that fails writes nothing", async () => {
    const f = fakes({ runs: [run("r1", 10)], overrides: { existingExecutionIds: async () => { throw new Error("Supabase 500"); } } });
    expect(await syncPlatformGate(f.deps, opts())).toEqual({ written: 0, skipped: 0, reason: "the ledger was not read — Supabase 500" });
    expect(names(f.calls, "audit")).toEqual([]);
  });

  it("a run whose detail is not read is skipped this tick and never stalls the later ones; it is written once read", async () => {
    const f = fakes({ runs: [run("r3", 30), run("r2", 20), run("r1", 10)] });
    const get = f.deps.getExecution;
    f.deps.getExecution = async (id) => { if (id === "r2") throw new Error("platform 502"); return get(id); };
    const seen = new Set();
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 2, skipped: 0, reason: "run r2's detail was not read (try 1 of 3) — platform 502" });
    f.deps.getExecution = get;
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 1, skipped: 2 });
    expect(f.rows.map((r) => r[6].execution_id)).toEqual(["r1", "r3", "r2"]); // ran_at keeps the true order
    expect(f.rows[2][6].file).not.toBeNull();
  });

  it("a detail that stays unread for three ticks is written from the list record, the file unknown", async () => {
    const f = fakes({ runs: [run("rx", 10)] });
    f.deps.getExecution = async () => { throw new Error("403 Forbidden"); };
    const seen = new Set();
    expect(await syncPlatformGate(f.deps, opts(seen))).toMatchObject({ written: 0, reason: expect.stringContaining("try 1 of 3") });
    expect(await syncPlatformGate(f.deps, opts(seen))).toMatchObject({ written: 0, reason: expect.stringContaining("try 2 of 3") });
    expect(await syncPlatformGate(f.deps, opts(seen))).toEqual({ written: 1, skipped: 0 });
    expect(f.rows[0][6]).toMatchObject({ execution_id: "rx", file: null });
  });

  it("reads the ledger in chunks of 100 ids", async () => {
    const f = fakes({ runs: Array.from({ length: 250 }, (_, i) => ({ ...run(`r${i}`, 0), createdAt: new Date(Date.UTC(2026, 8, 27) + i * 1000).toISOString() })) });
    expect(await syncPlatformGate(f.deps, opts())).toMatchObject({ written: 250 });
    expect(names(f.calls, "ledger").map((c) => c[2])).toEqual([100, 100, 50]);
  });
});

describe("watchPlatformGate", () => {
  afterEach(() => vi.useRealTimers());

  it("is off without a component id: nothing is wired", async () => {
    const connect = vi.fn();
    expect(await watchPlatformGate({ componentId: "", connect, log: () => {} })).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it("is off, in one line, when wiring fails", async () => {
    const log = vi.fn();
    expect(await watchPlatformGate({ componentId: "c", connect: async () => { throw new Error("Missing config: THATOPEN_API_KEY"); }, log })).toBe(false);
    expect(log).toHaveBeenCalledWith("[platform-gate] off — Missing config: THATOPEN_API_KEY");
  });

  it("ticks every period without overlapping, one log line per change of reason", async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    let n = 0;
    const deps = { listExecutions: async () => { n++; throw new Error("platform 503"); } };
    await watchPlatformGate({ componentId: "c", everyMs: 60_000, log, connect: async () => ({ platformProjectId: PID, deps }) });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(n).toBe(3);
    expect(log.mock.calls.filter(([l]) => l.includes("platform 503"))).toHaveLength(1);
  });
});
