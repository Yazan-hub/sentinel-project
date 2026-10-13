// MA-7-1 — licence gate verdicts, the weights table's refusal and checkAll's exit code. Pure: no file is read.
import { describe, it, expect } from "vitest";
import { verdict, modelRefusal, checkAll } from "./licence-logic.mjs";

const v = (e, row) => verdict(e, row).v;

describe("verdict", () => {
  it("allows the open licences, OR taking the best part and AND the worst", () => {
    for (const e of ["MIT", "(MIT OR GPL-3.0-or-later)", "(MIT AND Zlib)", "MIT License", "BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0"]) expect(v(e)).toBe("allowed");
  });
  it("bans GPL, AGPL, NC, and the Llama community licence", () => {
    for (const e of ["GPL-3.0-only", "AGPL-3.0", "CC-BY-NC-4.0", "Llama-3.2-Community", "MIT AND GPL-2.0-only", "UNLICENSED"]) expect(v(e)).toBe("banned");
  });
  it("bans LGPL unless it runs as a separate process", () => {
    expect(v("LGPL-2.1-only")).toBe("banned");
    expect(v("LGPL-2.1-only", { process: "separate" })).toBe("allowed");
  });
  it("marks ISC pending and an unreadable field unknown", () => {
    expect(v("ISC")).toBe("pending");
    expect(v("SEE LICENSE IN LICENSE")).toBe("unknown");
    expect(v("")).toBe("unknown");
  });
  it("bans a package by name whatever its field says", () => {
    expect(v("MIT", { name: "ultralytics" })).toBe("banned");
  });
  it("reads a banned name in any PEP 503 spelling and under an npm scope", () => {
    for (const name of ["diff_gaussian_rasterization", "Diff.Gaussian.Rasterization", "@scope/ultralytics"]) expect(v("MIT", { name })).toBe("banned");
  });
});

describe("modelRefusal", () => {
  it("lets a listed model with its digest through, bare names read as :latest", () => {
    expect(modelRefusal("qwen3.6:latest", "3899b1c0e7c5")).toBeNull();
    expect(modelRefusal("llava", "8dd30f6b0cb1")).toBeNull();
  });
  it("refuses a model whose licence is not allowed", () => {
    const m = modelRefusal("llama3.2-vision:latest", "6f2f9757ae97");
    expect(m).toContain("Llama-3.2-Community");
    expect(m).toContain("nothing was read");
  });
  it("refuses a listed name with no digest, a bad one, and takes a sha256: prefix", () => {
    for (const d of [undefined, null, "", "xyz"]) expect(modelRefusal("qwen3.6", d)).toContain("not in Sentinel's weights table");
    expect(modelRefusal("qwen3.6:latest")).toContain("not in Sentinel's weights table");
    expect(modelRefusal("qwen3.6:latest", "sha256:3899b1c0e7c5aabbcc")).toBeNull();
  });
  it("MA-7-16: YuNet 2023mar (MIT) is in the weights table, by its digest; a changed file is not", () => {
    expect(modelRefusal("yunet:2023mar", "8f2383e4dd3c")).toBeNull();
    expect(modelRefusal("yunet:2023mar", "sha256:8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4")).toBeNull();
    expect(modelRefusal("yunet:2023mar", "000000000000")).toContain("not in Sentinel's weights table");
  });
  it("refuses a digest mismatch and an unlisted model in the unknown words", () => {
    expect(modelRefusal("qwen3.6:latest", "000000000000")).toContain("not in Sentinel's weights table");
    expect(modelRefusal("foo:1")).toContain("not in Sentinel's weights table");
  });
});

describe("checkAll", () => {
  const row = (o) => ({ source: "npm", name: "a", version: "1.0.0", licence: "MIT", ...o });
  it("fails on a planted GPL package", () => {
    const r = checkAll({ npm: [row({ licence: "GPL-3.0-only" })] });
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatch(/^BANNED a@1\.0\.0 GPL-3\.0-only \(npm\)/);
  });
  it("fails on a pinned python name with no licence row", () => {
    const r = checkAll({ python: [row({ source: "python", name: "laspy", licence: "" })] });
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatch(/^UNKNOWN laspy/);
  });
  it("warns, never fails, on pending rows, allow.pending and model names with no weights row", () => {
    const r = checkAll({ npm: [row({ licence: "ISC" }), row({ name: "m", licence: "SEE LICENSE IN LICENSE" })], models: ["llama3", "llava"], allow: { pending: { m: {} } } });
    expect(r.code).toBe(0);
    expect(r.pending).toBe(3);
  });
  it("lets allow.accepted clear an unknown but never a banned row", () => {
    expect(checkAll({ npm: [row({ licence: "weird" })], allow: { accepted: { a: {} } } }).code).toBe(0);
    expect(checkAll({ npm: [row({ licence: "GPL-3.0-only" })], allow: { accepted: { a: {} } } }).code).toBe(1);
  });
  it("lets accepted clear neither a banned row (process or not) nor an inherited Object key", () => {
    expect(checkAll({ npm: [row({ licence: "GPL-3.0-only", process: "separate" })], allow: { accepted: { a: {} } } }).code).toBe(1);
    expect(checkAll({ npm: [row({ name: "constructor", licence: "Commercial" })], allow: { accepted: {}, pending: {} } }).code).toBe(1);
  });
  it("reports a weights row the table refuses as information, and checks what a wheel carries", () => {
    const r = checkAll({ weights: [{ source: "weights", name: "llama3.2-vision:latest", version: "", licence: "Llama-3.2-Community" }] });
    expect(r.code).toBe(0);
    expect(r.lines[0]).toMatch(/^refused /);
    expect(checkAll({ python: [row({ source: "python", carries: [{ name: "x", licence: "AGPL-3.0" }] })] }).code).toBe(1);
  });
});
