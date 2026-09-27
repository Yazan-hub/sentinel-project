// The bridge's body and upload limits (H0, D8/D9), driven with plain streams — no bridge, no network.
import { describe, it, expect, afterEach } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { readBody, readRaw, uploadSlot, jsonCap, uploadCap, SMALL_JSON, startRefusal } from "./request-limits.mjs";

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
});

describe("startRefusal — when the bridge must not start", () => {
  it("starts on loopback whatever is set", () => {
    for (const h of [undefined, "127.0.0.1", "127.0.0.2", "::1", "localhost"]) expect(startRefusal({ BCF_HOST: h })).toBeNull();
  });
  it("refuses a non-loopback bind while the token, the JWT secret or the anon key is empty, naming them", () => {
    expect(startRefusal({ BCF_HOST: "0.0.0.0", BCF_TOKEN: "t" }))
      .toBe("refusing to listen on 0.0.0.0: SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY are empty — set them in config/.env, or bind 127.0.0.1");
    expect(startRefusal({ BCF_HOST: "100.64.1.2", BCF_TOKEN: "t", SUPABASE_JWT_SECRET: "s" }))
      .toBe("refusing to listen on 100.64.1.2: SUPABASE_ANON_KEY is empty — set it in config/.env, or bind 127.0.0.1");
    expect(startRefusal({ BCF_HOST: "0.0.0.0", BCF_TOKEN: "t", SUPABASE_JWT_SECRET: "s", SUPABASE_ANON_KEY: "a" })).toBeNull();
  });
});
