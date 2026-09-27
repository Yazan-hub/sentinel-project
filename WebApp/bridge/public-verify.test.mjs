// The public receipt check (cohesion phase 4c): a yes/no and field names for anyone, never a ledger value, and one
// byte-identical miss for every kind of "no". publicAuditRow is driven through a stubbed fetch — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { isPublicRoute, parsePublicVerify, comparePublic, MISS, createLimiter, createKeyedLimiter, clientAddress, readCapped, PUBLIC_BODY_MAX } from "./public-verify.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

// cde-store reads SUPABASE_URL / _SERVICE_KEY / _ANON_KEY when it loads; where config/.env is absent (CI) stand-ins
// let sb() build its URL and arm JWT forwarding (so "service key only" is a real test). Nothing reaches them: fetch
// is stubbed in every test that reads.
process.env.SUPABASE_URL ||= "http://supabase.invalid";
process.env.SUPABASE_SERVICE_KEY ||= "stub-service-key";
process.env.SUPABASE_ANON_KEY ||= "stub-anon-key";
const { publicAuditRow } = await import("./cde-store.mjs");

const HASH = "9f2c".padEnd(64, "0");
const PREV = "1ab7".padEnd(64, "0");
// Receipt 702's shape on aster-office: a proposal row whose values must never come back to an anonymous caller.
const ROW = {
  id: 702, at: "2026-09-22T10:15:30.123456+00:00", hash: HASH, prev_hash: PREV, actor: "revit:aster-lead",
  new_value: { verdict: "accepted", summary: { in_scope: 41, passing: 41, failing: 0 }, agent: { claimed: true, model: "gpt-6" } },
};
const RECEIPT = {
  version: "sentinel-receipt/1", project: "aster-office", audit_id: 702, recorded_at: ROW.at, actor: ROW.actor,
  verdict: "accepted", ids_source: "project", summary: ROW.new_value.summary, agent: ROW.new_value.agent, ledger_hash: HASH, prev_hash: PREV,
};
const bare = { audit_id: 702, ledger_hash: HASH };

describe("isPublicRoute — POST and OPTIONS on /receipt/<key>/verify, nothing else", () => {
  it("is true for the check and its preflight", () => {
    expect(isPublicRoute("POST", "/receipt/aster-office/verify")).toBe(true);
    expect(isPublicRoute("OPTIONS", "/receipt/aster-office/verify")).toBe(true);
  });
  it("is false for the receipt read, every other method, a longer or shorter path, and every /cde route", () => {
    expect(isPublicRoute("GET", "/receipt/aster-office/702")).toBe(false);
    expect(isPublicRoute("GET", "/receipt/aster-office/verify")).toBe(false);
    expect(isPublicRoute("PUT", "/receipt/aster-office/verify")).toBe(false);
    expect(isPublicRoute("POST", "/receipt/aster-office/702")).toBe(false);
    expect(isPublicRoute("POST", "/receipt/aster-office/verify/x")).toBe(false);
    expect(isPublicRoute("POST", "/receipt/aster-office/verify/")).toBe(false);
    expect(isPublicRoute("POST", "/receipt//verify")).toBe(false);
    expect(isPublicRoute("POST", "/cde/aster-office/audit")).toBe(false);
    expect(isPublicRoute("POST", "/cde/aster-office/receipt/aster-office/verify")).toBe(false);
    expect(isPublicRoute("POST", undefined)).toBe(false);
  });
});

describe("parsePublicVerify — what an anonymous caller may send, refused before any database call", () => {
  it("reads only the five fields from a whole receipt, wrapped or bare", () => {
    const want = { audit_id: 702, ledger_hash: HASH, recorded_at: ROW.at, verdict: "accepted", project: "aster-office" };
    expect(parsePublicVerify({ receipt: RECEIPT })).toEqual(want);
    expect(parsePublicVerify(RECEIPT)).toEqual(want);
  });
  it("takes a bare {audit_id, ledger_hash}; a null optional is not supplied; version is not read", () => {
    expect(parsePublicVerify(bare)).toEqual(bare);
    expect(parsePublicVerify({ ...bare, verdict: null, recorded_at: null, version: "made-up/9" })).toEqual(bare);
  });
  it("refuses a missing body, a non-integer id and a hash that is not 64 lowercase hex — each a 400", () => {
    const bad = [null, "702", [], {}, { ledger_hash: HASH }, { ...bare, audit_id: "702" }, { ...bare, audit_id: 7.5 }, { ...bare, audit_id: 0 },
      { audit_id: 702 }, { ...bare, ledger_hash: HASH.toUpperCase() }, { ...bare, ledger_hash: HASH.slice(1) }, { ...bare, verdict: 1 }, { ...bare, project: {} }];
    for (const b of bad) expect(() => parsePublicVerify(b), JSON.stringify(b)).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("names the field it refuses, never the value it was sent", () => {
    expect(() => parsePublicVerify({ ...bare, ledger_hash: "zz-secret" })).toThrow("ledger_hash must be 64 lowercase hex characters");
    expect(() => parsePublicVerify({ ...bare, audit_id: -3 })).toThrow("audit_id must be a positive integer");
  });
});

describe("comparePublic — yes/no and field names, never a ledger value", () => {
  it("matches receipt 702 with every field checked", () => {
    expect(comparePublic(ROW, parsePublicVerify(RECEIPT), "aster-office")).toEqual({
      matches: true, checked: ["audit_id", "ledger_hash", "project", "recorded_at", "verdict"], mismatched: [], not_checked: [],
      note: "matches the ledger's stored hash; the chain is not recomputed",
    });
  });
  it("a bare id and hash match, and say what was not checked", () => {
    expect(comparePublic(ROW, bare, "aster-office")).toMatchObject({ matches: true, checked: ["audit_id", "ledger_hash", "project"], not_checked: ["recorded_at", "verdict"] });
  });
  it("the real hash with the verdict flipped does not match, and names only the field", () => {
    const r = comparePublic(ROW, parsePublicVerify({ ...RECEIPT, verdict: "rejected" }), "aster-office");
    expect(r).toMatchObject({ matches: false, mismatched: ["verdict"] });
    expect(r.checked).toContain("verdict");
  });
  it("a verdict claimed for a row that carries none is a mismatch, not a pass", () => {
    const gateRow = { ...ROW, new_value: { result: "pass" } };
    expect(comparePublic(gateRow, { ...bare, verdict: "accepted" }, "aster-office")).toMatchObject({ matches: false, mismatched: ["verdict"] });
  });
  it("a receipt naming another project, or another recorded_at, does not match", () => {
    expect(comparePublic(ROW, { ...bare, project: "aster-tower" }, "aster-office")).toMatchObject({ matches: false, mismatched: ["project"] });
    expect(comparePublic(ROW, { ...bare, recorded_at: "2026-09-22T10:15:30Z" }, "aster-office")).toMatchObject({ matches: false, mismatched: ["recorded_at"] });
  });
  it("no row, a wrong hash, another id and a hashless row are the one MISS", () => {
    for (const [row, claim] of [[null, bare], [ROW, { ...bare, ledger_hash: PREV }], [{ ...ROW, id: 703 }, bare], [{ ...ROW, hash: null }, bare]])
      expect(comparePublic(row, claim, "aster-office")).toBe(MISS);
    expect(JSON.stringify(MISS)).toBe('{"matches":false,"note":"no ledger entry on this key has that id and hash"}');
  });
  it("no reply carries a ledger value — not the actor, time, verdict, summary, agent, prev_hash, id or hash", () => {
    const replies = [
      comparePublic(ROW, parsePublicVerify(RECEIPT), "aster-office"),
      comparePublic(ROW, parsePublicVerify({ ...RECEIPT, verdict: "rejected", recorded_at: "x", project: "y" }), "aster-office"),
      comparePublic(ROW, bare, "aster-office"),
      comparePublic(null, bare, "aster-office"),
    ].map((r) => JSON.stringify(r));
    for (const text of replies)
      for (const v of [HASH, PREV, ROW.actor, ROW.at, "accepted", "rejected", "702", "41", "gpt-6", "aster-office"]) expect(text).not.toContain(v);
  });
});

describe("publicAuditRow — service key only, no ensureProject, the same two reads for every miss", () => {
  let calls;
  const realFetch = globalThis.fetch;
  const serve = (projects, rows) => {
    calls = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || "GET", auth: init.headers?.Authorization || "" });
      if (String(url).includes("/projects?")) return new Response(JSON.stringify(projects), { status: 200 });
      return new Response(JSON.stringify(rows), { status: 200 });
    });
  };
  beforeEach(() => serve([], []));
  afterEach(() => { globalThis.fetch = realFetch; });

  it("reads the project by key and the row by id AND project, and returns it", async () => {
    serve([{ id: "p-aster" }], [ROW]);
    expect(await publicAuditRow("aster-office", 702)).toEqual(ROW);
    expect(calls.map((c) => c.url.split("/rest/v1/")[1])).toEqual([
      "projects?key=eq.aster-office&select=id",
      "audit_log?id=eq.702&project_id=eq.p-aster&select=id,at,hash,new_value",
    ]);
  });
  it("an unknown key is null after the same two reads (the second against the nil uuid) — never a 404, never an insert", async () => {
    serve([], []);
    expect(await publicAuditRow("no-such-key", 702)).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("project_id=eq.00000000-0000-0000-0000-000000000000");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    serve([], []);
    expect(await publicAuditRow("default", 702)).toBeNull(); // "default" does not self-heal here
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
  it("an unknown id on a known key is null", async () => {
    serve([{ id: "p-aster" }], []);
    expect(await publicAuditRow("aster-office", 999999)).toBeNull();
  });
  it("uses the service key even inside a forwarded session", async () => {
    serve([{ id: "p-aster" }], [ROW]);
    const forged = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "x" })).toString("base64url") + ".sig";
    await runWithAuth(forged, () => publicAuditRow("aster-office", 702));
    expect(calls.every((c) => !c.auth.includes(forged))).toBe(true);
  });
  it("a malformed id reads nothing", async () => {
    for (const id of [0, -1, 1.5, "702", null]) expect(await publicAuditRow("aster-office", id)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("createLimiter — one global fixed window", () => {
  it("allows 60 in a minute, refuses the 61st, and opens again when the window turns", () => {
    let t = 1000;
    const l = createLimiter({ max: 60, windowMs: 60000, now: () => t });
    for (let i = 0; i < 60; i++) expect(l.take()).toBe(true);
    expect(l.take()).toBe(false);
    t += 59999;
    expect(l.take()).toBe(false);
    t += 1;
    expect(l.take()).toBe(true);
  });
});

describe("createKeyedLimiter — one window per caller, a bounded number of callers", () => {
  it("gives each key its own window", () => {
    let t = 0;
    const l = createKeyedLimiter({ max: 2, windowMs: 60000, now: () => t });
    expect([l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, false]);
    expect(l.take("b")).toBe(true); // a's flood does not starve b
    t += 60000;
    expect(l.take("a")).toBe(true);
  });
  it("keeps at most maxKeys windows: a flood of fresh keys drops the oldest, never grows memory", () => {
    const l = createKeyedLimiter({ max: 1, windowMs: 60000, maxKeys: 3, now: () => 0 });
    for (const k of ["a", "b", "c", "d"]) expect(l.take(k)).toBe(true);
    expect(l.size()).toBe(3);
    expect(l.take("a")).toBe(true); // a's window was the oldest, dropped for d: it starts again
  });
});

describe("clientAddress — the address the proxy in front of the bridge saw", () => {
  const r = (xff, remote = "127.0.0.1") => ({ headers: xff === undefined ? {} : { "x-forwarded-for": xff }, socket: { remoteAddress: remote } });
  it("is the LAST X-Forwarded-For entry: what a client wrote itself sits to its left", () => {
    expect(clientAddress(r("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(r("1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(r(" 1.2.3.4 ,203.0.113.8 "))).toBe("203.0.113.8");
  });
  it("is the socket's address when no proxy forwarded the call", () => {
    expect(clientAddress(r(undefined, "::1"))).toBe("::1");
    expect(clientAddress(r(""))).toBe("127.0.0.1");
  });
});

describe("readCapped — 8 KB, then 413", () => {
  const req = (chunks, headers = {}) => Object.assign(Readable.from(chunks.map((c) => Buffer.from(c))), { headers });
  it("returns the body as text at or under the cap", async () => {
    expect(PUBLIC_BODY_MAX).toBe(8192);
    expect(await readCapped(req(['{"audit_id":702,', '"ledger_hash":"x"}']))).toBe('{"audit_id":702,"ledger_hash":"x"}');
    expect(await readCapped(req(["a".repeat(8192)]))).toHaveLength(8192);
  });
  it("is null for a declared length over the cap, without reading", async () => {
    const r = req(["{}"], { "content-length": "8193" });
    expect(await readCapped(r)).toBeNull();
    expect(r.readableFlowing).toBeNull(); // nothing attached a reader: the stream was never consumed
    expect(r.listenerCount("data")).toBe(0);
  });
  it("is a 408 when the body has not all arrived within 10 s — a slow anonymous check cannot hold a socket", async () => {
    vi.useFakeTimers();
    try {
      const r = Object.assign(new PassThrough(), { headers: { "content-length": "100" } });
      const p = readCapped(r);
      const refused = expect(p).rejects.toMatchObject({ status: 408, message: "a receipt check must arrive within 10 s" });
      r.write("{");
      await vi.advanceTimersByTimeAsync(10_001);
      await refused;
    } finally { vi.useRealTimers(); }
  });
  it("is null for a streamed body that runs past the cap", async () => {
    const r = req(["a".repeat(5000), "a".repeat(5000), "a".repeat(5000)]);
    const ended = new Promise((ok) => r.on("end", ok));
    expect(await readCapped(r)).toBeNull();
    await ended; // drained to its end, not destroyed: the connection survives to carry the 413
  });
});
