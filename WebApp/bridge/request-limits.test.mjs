// The bridge's body and upload limits (H0, D8/D9), driven with plain streams — no bridge, no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable, PassThrough } from "node:stream";
import { readBody, readRaw, uploadSlot, holdUpload, jsonCap, uploadCap, SMALL_JSON, startRefusal, SERVER_LIMITS } from "./request-limits.mjs";
import { runWithAuth } from "./bridge-auth.mjs";

const MB = 1024 * 1024;
const req = (chunks, headers = {}) => Object.assign(Readable.from(chunks.map((c) => Buffer.from(c))), { headers });
/** A request whose body arrives only when the test writes it. */
const open = (headers = {}) => Object.assign(new PassThrough(), { headers });

afterEach(() => { delete process.env.BCF_MAX_JSON_MB; delete process.env.BCF_MAX_UPLOAD_MB; });

describe("the caps — 16 MB JSON, 2 GB uploads, 1 MB for prompts; env overrides", () => {
  it("defaults", () => {
    expect(jsonCap()).toBe(16 * MB);
    expect(uploadCap()).toBe(2048 * MB);
    expect(SMALL_JSON).toBe(1 * MB);
  });
  it("BCF_MAX_JSON_MB and BCF_MAX_UPLOAD_MB still override, read when a body is read", () => {
    process.env.BCF_MAX_JSON_MB = "64";
    process.env.BCF_MAX_UPLOAD_MB = "100";
    expect(jsonCap()).toBe(64 * MB);
    expect(uploadCap()).toBe(100 * MB);
  });
});

describe("readBody — parsed JSON, or a refusal in words", () => {
  it("parses a body split across chunks, a multi-byte character included", async () => {
    const text = JSON.stringify({ name: "Wand – Außen" });
    const bytes = Buffer.from(text);
    const cut = bytes.indexOf(Buffer.from("ß")) + 1; // inside the two bytes of ß
    expect(await readBody(req([bytes.subarray(0, cut), bytes.subarray(cut)]))).toEqual({ name: "Wand – Außen" });
  });
  it("is {} for an empty body and for text that is not JSON (as before)", async () => {
    expect(await readBody(req([]))).toEqual({});
    expect(await readBody(req(["not json"]))).toEqual({});
  });
  it("is {} for JSON that parses but is not an object — null, a string, a number, an array (H0 minor N19/N48)", async () => {
    expect(await readBody(req(["null"]))).toEqual({});
    expect(await readBody(req(['"x"']))).toEqual({});
    expect(await readBody(req(["5"]))).toEqual({});
    expect(await readBody(req(["[1,2]"]))).toEqual({});
  });
  it("refuses a declared length over the cap with a 413 before reading a byte", async () => {
    const r = req(["{}"], { "content-length": String(SMALL_JSON + 1) });
    await expect(readBody(r, { max: SMALL_JSON })).rejects.toMatchObject({ status: 413, message: "the request body is over the 1 MB limit for this route — nothing was read or saved" });
    expect(r.listenerCount("data")).toBe(0);
  });
  it("refuses a streamed body (no length) the moment it passes the cap — never {} for the route to carry on with", async () => {
    const r = req(["a".repeat(600 * 1024), "a".repeat(600 * 1024)]);
    await expect(readBody(r, { max: SMALL_JSON })).rejects.toMatchObject({ status: 413 });
  });
  it("refuses a body cut off before its end with a 400", async () => {
    const r = open();
    const p = readBody(r);
    r.write('{"a":');
    r.destroy();
    await expect(p).rejects.toMatchObject({ status: 400 });
  });
  it("answers 503 once four bodies at the cap are being read at once, and frees the budget as they finish", async () => {
    process.env.BCF_MAX_JSON_MB = "1"; // cap 1 MB → budget 4 MB
    const held = [open(), open(), open(), open()];
    const reads = held.map((r) => readBody(r));
    for (const r of held) r.write(Buffer.alloc(MB - 10, 32)); // spaces: valid JSON padding
    const fifth = open();
    const refused = readBody(fifth);
    fifth.write(Buffer.alloc(64 * 1024, 32));
    await expect(refused).rejects.toMatchObject({ status: 503 });
    for (const r of held) r.end("{}");
    expect(await Promise.all(reads)).toEqual([{}, {}, {}, {}]);
    expect(await readBody(req([" ".repeat(MB - 10), "{}"]))).toEqual({}); // the budget came back
  });

  it("charges each signed-in sub at most one jsonCap() in flight, so one account cannot fill the shared budget alone (H0 minor N3); the machine credential is exempt", async () => {
    process.env.BCF_MAX_JSON_MB = "1"; // cap 1 MB, so 0.6 + 0.6 MB from the same sub is over it
    const as = (sub, fn) => runWithAuth(`h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`, fn);
    const a = open(), b = open();
    const readA = as("u1", () => readBody(a));
    a.write(Buffer.alloc(0.6 * MB, 32));
    const refused = as("u1", () => readBody(b));
    b.write(Buffer.alloc(0.6 * MB, 32));
    await expect(refused).rejects.toMatchObject({ status: 429, message: expect.stringContaining("too much JSON in flight") });
    // another account, and the machine credential, are unaffected by u1's in-flight bytes
    expect(await as("u2", () => readBody(req([" ".repeat(Math.round(0.6 * MB)), "{}"])))).toEqual({});
    expect(await readBody(req([" ".repeat(Math.round(0.6 * MB)), "{}"]))).toEqual({});
    a.end("{}");
    expect(await readA).toEqual({});
    expect(await as("u1", () => readBody(req(["{}"])))).toEqual({}); // u1's held bytes came back
  });
});

describe("readRaw — the bytes, capped on what actually arrives", () => {
  it("returns the bytes", async () => {
    expect((await readRaw(req(["ab", "cd"]))).toString()).toBe("abcd");
  });
  it("refuses a chunked upload past a per-route cap (the 32 MB ingest cap, scaled down)", async () => {
    await expect(readRaw(req(["x".repeat(700), "x".repeat(400)]), { max: 1024 })).rejects.toMatchObject({ status: 413 });
  });
  it("refuses a declared length over the cap unread", async () => {
    await expect(readRaw(req(["x"], { "content-length": String(2048 * MB + 1) }))).rejects.toMatchObject({ status: 413, message: expect.stringContaining("2048 MB limit") });
  });
  it("refuses at once a request whose caller already went away (its events have fired: nothing would end the read)", async () => {
    const r = open();
    r.destroy();
    await new Promise((ok) => r.once("close", ok));
    await expect(readRaw(r)).rejects.toMatchObject({ status: 400 });
  });
});

describe("slow bodies — 30 s without a byte is a 408; a JSON body arrives whole within 2 min", () => {
  afterEach(() => vi.useRealTimers());
  /** The read's state as the test sees it: "pending", "resolved", or the refusal's status. */
  const watch = (p) => { const w = { v: "pending" }; p.then(() => { w.v = "resolved"; }, (e) => { w.v = e.status; }); return w; };

  it("a body that sends nothing for 30 s is refused with a 408, JSON and raw alike; each byte restarts the clock", async () => {
    vi.useFakeTimers();
    for (const read of [(r) => readBody(r), (r) => readRaw(r)]) {
      const r = open();
      const w = watch(read(r));
      r.write('{"a":');
      await vi.advanceTimersByTimeAsync(29_000);
      r.write(" ");
      await vi.advanceTimersByTimeAsync(29_000);
      expect(w.v).toBe("pending");
      await vi.advanceTimersByTimeAsync(1_001);
      expect(w.v).toBe(408);
    }
    const r = open();
    const p = readBody(r);
    r.write("{");
    const refused = expect(p).rejects.toThrow("the request body stopped arriving (nothing for 30 s) — nothing was saved");
    await vi.advanceTimersByTimeAsync(30_001);
    await refused;
  });

  it("a JSON body dripped a byte every 20 s is a 408 at 2 min; a raw upload at a steady rate may take longer (the server's 30 min)", async () => {
    vi.useFakeTimers();
    const json = open(), raw = open();
    const wj = watch(readBody(json)), wr = watch(readRaw(raw));
    const chunk = Buffer.alloc(400 * 1024, 120); // 400 KB every 20 s: 20 KB/s, over SEC-6's 16 KB/s floor
    for (let t = 0; t < 9; t++) { json.write(" "); raw.write(chunk); await vi.advanceTimersByTimeAsync(20_000); } // 3 min
    expect(wj.v).toBe(408);
    expect(wr.v).toBe("pending");
    raw.end("y");
    await vi.advanceTimersByTimeAsync(0);
    expect(wr.v).toBe("resolved");
  });
});

describe("raw uploads keep an average rate after a grace period, and each is measured (SEC-6, S21)", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete process.env.BCF_MIN_UPLOAD_KBPS; delete process.env.BCF_UPLOAD_GRACE_S; });
  const watch = (p) => { const w = { v: "pending", e: null }; p.then(() => { w.v = "resolved"; }, (e) => { w.v = e.status; w.e = e; }); return w; };

  it("a raw upload slower than 16 KB/s on average is a 408 once its first 120 s are over, in words; nothing is kept", async () => {
    vi.useFakeTimers();
    const r = open();
    const w = watch(readRaw(r));
    for (let t = 0; t < 6; t++) { r.write(Buffer.alloc(1024)); await vi.advanceTimersByTimeAsync(20_000); } // 6 KB in 120 s
    expect(w.v).toBe("pending"); // the grace period
    await vi.advanceTimersByTimeAsync(1_000);
    r.write(Buffer.alloc(1024)); // 7 KB in 121 s
    await vi.advanceTimersByTimeAsync(0);
    expect(w.v).toBe(408);
    expect(w.e.message).toBe("the upload arrived slower than 16 KB/s on average after its first 120 s — nothing was saved; try again on a faster connection");
  });

  it("BCF_MIN_UPLOAD_KBPS and BCF_UPLOAD_GRACE_S set the floor and the grace, read when the upload is read", async () => {
    process.env.BCF_MIN_UPLOAD_KBPS = "64";
    process.env.BCF_UPLOAD_GRACE_S = "10";
    vi.useFakeTimers();
    const r = open();
    const w = watch(readRaw(r));
    for (let t = 0; t < 4; t++) { r.write(Buffer.alloc(32 * 1024)); await vi.advanceTimersByTimeAsync(5_000); } // 32 KB every 5 s
    expect(w.v).toBe(408);
    expect(w.e.message).toContain("slower than 64 KB/s on average after its first 10 s");
  });

  it("JSON bodies keep their own 2-minute deadline, not the upload floor", async () => {
    vi.useFakeTimers();
    const r = open();
    const w = watch(readBody(r));
    for (let t = 0; t < 5; t++) { r.write(" "); await vi.advanceTimersByTimeAsync(20_000); } // 100 s, a byte every 20 s
    r.end("{}");
    await vi.advanceTimersByTimeAsync(0);
    expect(w.v).toBe("resolved");
  });

  it("every raw upload that lands is measured in the bridge log — its size, its time and its rate, nothing else", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await readRaw(req(["abc"]))).toString()).toBe("abc");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^\[upload\] 0\.0 MB in \d+\.\d s \(\d+ KB\/s\)$/);
    await readBody(req(['{"a":1}']));
    expect(log).toHaveBeenCalledTimes(1); // a JSON body is not an upload
  });
});

describe("readBody — at most 8 bodies at once per signed-in account (the machine is not counted)", () => {
  /** Runs `fn` as a signed-in caller whose JWT names `sub` (only its payload is read here). */
  const as = (sub, fn) => runWithAuth(`h.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`, fn);
  it("a ninth body from the same account is a 429 before a byte is read; another account and the machine still read", async () => {
    const held = Array.from({ length: 8 }, () => open());
    const reads = held.map((r) => as("u1", () => readBody(r)));
    const ninth = open();
    await expect(as("u1", () => readBody(ninth))).rejects.toMatchObject({ status: 429, message: expect.stringContaining("more than 8 requests at once") });
    expect(ninth.listenerCount("data")).toBe(0);
    expect(await as("u2", () => readBody(req(['{"a":1}'])))).toEqual({ a: 1 });
    expect(await readBody(req(['{"b":2}']))).toEqual({ b: 2 }); // the machine credential: no sub
    for (const r of held) r.end("{}");
    expect(await Promise.all(reads)).toEqual(Array(8).fill({}));
    expect(await as("u1", () => readBody(req(["{}"])))).toEqual({}); // the count came back
  });
});

describe("uploadSlot — two uploads at once, one per caller", () => {
  it("refuses a second upload from the same caller, and a third caller while two run", () => {
    const a = uploadSlot("user-a");
    expect(() => uploadSlot("user-a")).toThrow(expect.objectContaining({ status: 429, message: expect.stringContaining("you already have an upload running") }));
    const b = uploadSlot("user-b");
    expect(() => uploadSlot("user-c")).toThrow(expect.objectContaining({ status: 429, message: expect.stringContaining("already taking 2 uploads") }));
    a();
    a(); // twice is harmless: it must not free b's slot
    const c = uploadSlot("user-c");
    expect(() => uploadSlot("user-d")).toThrow(expect.objectContaining({ status: 429 }));
    b(); c();
  });
  it("counts every machine caller (no sub) as one caller, service", () => {
    const m = uploadSlot(null);
    expect(() => uploadSlot(undefined)).toThrow(expect.objectContaining({ status: 429 }));
    m();
  });
  it("SEC-6 (S21): the machine credential has its own slot — it uploads while two signed-in uploads run; a third account still waits", () => {
    const a = uploadSlot("user-a"), b = uploadSlot("user-b");
    const m = uploadSlot(null);
    expect(() => uploadSlot("user-c")).toThrow(expect.objectContaining({ status: 429, message: expect.stringContaining("already taking 2 uploads") }));
    a();
    const c = uploadSlot("user-c"); // the machine's slot is not one of the two
    b(); c(); m();
  });
});

describe("holdUpload — the slot is held until the answer is done, never by a caller that already went away", () => {
  const pair = () => ({ req: new EventEmitter(), res: new EventEmitter() });
  it("holds the caller's slot until the answer closes", () => {
    const { req, res } = pair();
    holdUpload(req, res, "user-a");
    expect(() => uploadSlot("user-a")).toThrow(expect.objectContaining({ status: 429 }));
    res.emit("close");
    uploadSlot("user-a")();
  });
  it("refuses, and frees the slot, when the caller left while the route was still checking its role", () => {
    const gone = { req: Object.assign(new EventEmitter(), { destroyed: true }), res: Object.assign(new EventEmitter(), { destroyed: true }) };
    expect(() => holdUpload(gone.req, gone.res, null)).toThrow(expect.objectContaining({ status: 400 }));
    uploadSlot(null)(); // the machine's one slot is free
  });
});

describe("startRefusal — when the bridge must not start", () => {
  it("refuses to start while BCF_TOKEN is empty, whatever the bind — loopback included (SEC-1)", () => {
    const words = "refusing to start: BCF_TOKEN is empty — set it in config/.env (every route but GET /health needs it or a sign-in)";
    for (const h of [undefined, "127.0.0.1", "::1", "localhost", "0.0.0.0", "100.64.1.2"]) {
      expect(startRefusal({ BCF_HOST: h })).toBe(words);
      expect(startRefusal({ BCF_HOST: h, BCF_TOKEN: "", SUPABASE_JWT_SECRET: "s", SUPABASE_ANON_KEY: "a" })).toBe(words);
      expect(startRefusal({ BCF_HOST: h, BCF_TOKEN: " \t ", SUPABASE_JWT_SECRET: "s", SUPABASE_ANON_KEY: "a" })).toBe(words); // blank after trim
    }
  });
  it("starts on loopback with the token set", () => {
    for (const h of [undefined, "127.0.0.1", "127.0.0.2", "::1", "localhost"]) expect(startRefusal({ BCF_HOST: h, BCF_TOKEN: "t" })).toBeNull();
  });
  it("refuses a non-loopback bind while the token, the JWT secret or the anon key is empty, naming them", () => {
    expect(startRefusal({ BCF_HOST: "0.0.0.0", BCF_TOKEN: "t" }))
      .toBe("refusing to listen on 0.0.0.0: SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY are empty — set them in config/.env, or bind 127.0.0.1");
    expect(startRefusal({ BCF_HOST: "100.64.1.2", BCF_TOKEN: "t", SUPABASE_JWT_SECRET: "s" }))
      .toBe("refusing to listen on 100.64.1.2: SUPABASE_ANON_KEY is empty — set it in config/.env, or bind 127.0.0.1");
    expect(startRefusal({ BCF_HOST: "0.0.0.0", BCF_TOKEN: "t", SUPABASE_JWT_SECRET: "s", SUPABASE_ANON_KEY: "a" })).toBeNull();
  });
});

describe("SERVER_LIMITS — the http server's own limits (D8)", () => {
  it("headers in 20 s, a request in 30 min (a 2 GB IFC over the Funnel), 256 sockets", () => {
    expect(SERVER_LIMITS).toEqual({ headersTimeout: 20000, requestTimeout: 1800000, maxConnections: 256 });
  });
});
