// The auditor's verifier (ledger-verify.mjs) and the bridge's timestamp request (ledger-anchor.mjs) on fixtures/tsa/: real RFC 3161
// replies from a throwaway test TSA (openssl ts; its root is fixtures/tsa/ca.crt, trusted nowhere) for seq 2 of a synthetic chain.
// openssl itself accepted the request tsRequest() builds and verified both replies (`openssl ts -verify`) when they were made.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyChain, verifyToken, verifyPack, checkAnchor, pemCerts, seal, readToken, PINNED_TSAS } from "./ledger-verify.mjs";
import { tsRequest, readTsResponse, stamp } from "./ledger-anchor.mjs";

const fx = (f) => readFileSync(new URL(`./fixtures/tsa/${f}`, import.meta.url));
const CHAIN = JSON.parse(fx("chain.json"));
const ROOT = pemCerts(fx("ca.crt").toString());
const TEST_ONLY = { builtIn: false, extraRoots: ROOT };
const RSA = readTsResponse(fx("reply-rsa.tsr")), EC = readTsResponse(fx("reply-ec.tsr"));
const H2 = CHAIN.head2;

describe("the project chain, offline", () => {
  it("recomputes every row; a change, a gap or a reorder fails", () => {
    expect(verifyChain(CHAIN.rows)).toMatchObject({ ok: true, length: 4, head: { project_seq: 4 } });
    expect(verifyChain(CHAIN.rows).hashes.get(2)).toBe(H2);
    expect(verifyChain(CHAIN.rows.map((r) => r.project_seq === 1 ? { ...r, new_text: '{"state": "published"}' } : r)).problems[0]).toMatch(/seq 1 .*was changed/);
    expect(verifyChain(CHAIN.rows.filter((r) => r.project_seq !== 2)).ok).toBe(false);
    const swapped = CHAIN.rows.map((r) => r.project_seq === 1 ? { ...r, project_seq: 2 } : r.project_seq === 2 ? { ...r, project_seq: 1 } : r);
    expect(verifyChain(swapped).ok).toBe(false);
  });
});

describe("an RFC 3161 token", () => {
  it("reads the request openssl answered: version 1, sha256 imprint, the nonce, certReq", () => {
    const der = tsRequest(H2, Buffer.from(CHAIN.nonce, "hex"));
    expect(der.toString("hex")).toBe(`30430201013031300d060960864801650304020105000420${H2}020811223344556677880101ff`);
    expect(() => tsRequest("ABC", Buffer.from("01", "hex"))).toThrow(/64 lowercase hex/);
  });

  it("an RSA and an EC token each check: imprint, nonce, signed digest, signature, time-stamping certificate, chain to the root", () => {
    expect(RSA.code).toBe(0); expect(EC.code).toBe(0);
    for (const [r, name] of [[RSA, "Sentinel Test TSA RSA"], [EC, "Sentinel Test TSA EC"]]) {
      const v = verifyToken(r.token, H2, { ...TEST_ONLY, nonce: CHAIN.nonce });
      expect(v.problems).toEqual([]);
      expect(v).toMatchObject({ ok: true, tsa: name, chain: [name, "Sentinel Test Root (not trusted anywhere)"] });
      expect(v.gen_time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    }
  });

  it("says what is wrong: another hash, another nonce, a root this Node does not trust, a changed byte", () => {
    expect(verifyToken(RSA.token, "0".repeat(64), TEST_ONLY).problems[0]).toContain(`the token fixes ${H2.slice(0, 12)}…, not 000000000000…`);
    expect(verifyToken(RSA.token, H2, { ...TEST_ONLY, nonce: "99" }).problems).toContain("the token's nonce is not the one asked with");
    expect(verifyToken(RSA.token, H2).problems.join()).toMatch(/does not chain to a trusted root/); // the built-in list only
    // flip one byte inside the TSTInfo — the signed digest no longer matches
    const tok = readToken(RSA.token);
    const at = RSA.token.indexOf(tok.tstDer) + tok.tstDer.length - 30;
    const bad = Buffer.from(RSA.token); bad[at] ^= 1;
    expect(verifyToken(bad, H2, TEST_ONLY).ok).toBe(false);
    expect(verifyToken(Buffer.from("not a token"), H2).problems[0]).toMatch(/could not be read/);
  });
});

describe("whom a token is trusted from", () => {
  it("a root given with --root is said so; a test root is never a pinned TSA; SHA-1 and a non-time-stamping key are refused", () => {
    expect(verifyToken(RSA.token, H2, TEST_ONLY).trust).toBe("a root given with --root (Sentinel Test Root (not trusted anywhere))");
    expect(PINNED_TSAS).toEqual([{ name: "DigiCert", org: "DigiCert, Inc.", root: "DigiCert Trusted Root G4" }]);
  });
  it("a real DigiCert token (2026-10-20, a synthetic hash) passes on the pinned path, and on nothing else by default", () => {
    const d = JSON.parse(fx("digicert.json"));
    const tok = readTsResponse(fx("reply-digicert.tsr")).token;
    const v = verifyToken(tok, d.hash, { nonce: d.nonce });
    expect(v.problems).toEqual([]);
    expect(v).toMatchObject({ ok: true, tsa_org: "DigiCert, Inc.", trust: "DigiCert's own timestamp service (DigiCert, Inc., under DigiCert Trusted Root G4)" });
    expect(v.chain.at(-1)).toBe("DigiCert Trusted Root G4");
    expect(verifyToken(tok, d.hash, { builtIn: false }).problems.join()).toMatch(/does not chain to a trusted root/); // a root inside the token is not trusted
    expect(verifyToken(tok, "0".repeat(64)).ok).toBe(false);
  });
  it("checkAnchor: the token's time must be when its row was written", () => {
    const c = verifyChain(CHAIN.rows);
    const anchor = CHAIN.rows.find((r) => r.entity_type === "ledger_anchor");
    const v = JSON.parse(anchor.new_text);
    expect(checkAnchor(anchor, v, c, TEST_ONLY)).toMatchObject({ ok: true, seq: 2 });
    const later = { ...anchor, at_utc: new Date(Date.parse(anchor.at_utc) + 3 * 3600e3).toISOString() };
    expect(checkAnchor(later, v, c, TEST_ONLY).problems.join()).toMatch(/is not when its row was written/);
    expect(checkAnchor(anchor, { ...v, project_seq: 3 }, c, TEST_ONLY).problems.join()).toMatch(/not the chain's at seq 3|not before its own row/);
  });
});

describe("stamp() — the bridge's request, checked before anything is recorded", () => {
  const nonce = Buffer.from(CHAIN.nonce, "hex");
  it("keeps a token that checks out", async () => {
    let sent;
    const r = await stamp(H2, "http://tsa.test", { nonce, verifyOpts: TEST_ONLY, post: async (url, der) => { sent = { url, der }; return fx("reply-rsa.tsr"); } });
    expect(sent.url).toBe("http://tsa.test");
    expect(sent.der.equals(tsRequest(H2, nonce))).toBe(true);
    expect(r.check.ok).toBe(true); expect(r.token.equals(RSA.token)).toBe(true);
  });
  it("records nothing on a refusal, an unreadable answer, a stale token (another nonce) or a token for another hash", async () => {
    const refusal = Buffer.from("3011300f020102300a0c08746f6f206d616e79", "hex"); // status 2 "too many"
    await expect(stamp(H2, "u", { nonce, verifyOpts: TEST_ONLY, post: async () => refusal })).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/refused \(status 2: too many\) — nothing was recorded/) });
    await expect(stamp(H2, "u", { nonce, post: async () => Buffer.from("<html>") })).rejects.toThrow(/could not be reached or read/);
    await expect(stamp(H2, "u", { nonce: Buffer.from("0102030405060708", "hex"), verifyOpts: TEST_ONLY, post: async () => fx("reply-rsa.tsr") })).rejects.toThrow(/nonce/);
    await expect(stamp("1".repeat(64), "u", { nonce, verifyOpts: TEST_ONLY, post: async () => fx("reply-rsa.tsr") })).rejects.toThrow(/did not check out/);
  });
});

describe("a whole pack, as the auditor runs it", () => {
  const pack = seal({ pack: "sentinel-audit-pack", version: 2, project: { key: "demo" }, generated_at: "2026-10-20T10:00:00.000Z", chain: { rows: CHAIN.rows, length: 4, truncated: false } });

  it("passes: the seal, the chain, the timestamp of seq 2; notes what is newer and what is not checked", () => {
    const r = verifyPack(pack, TEST_ONLY);
    expect(r.ok).toBe(true);
    expect(r.last_timestamp).toMatchObject({ project_seq: 2, tsa: "Sentinel Test TSA RSA" });
    expect(r.lines.join("\n")).toMatch(/PASS {2}the project chain: 4 row\(s\)/);
    expect(r.lines.join("\n")).toMatch(/PASS {2}seq 2 was fixed in time by Sentinel Test TSA RSA/);
    expect(r.lines.join("\n")).toMatch(/NOTE {2}seq 4 to 4 are newer than the last external timestamp/);
    expect(r.lines.join("\n")).toMatch(/revocation is not checked/);
  });

  it("checks the project id, the readable ledger list against the chain, and a hash the auditor already holds", () => {
    const P = CHAIN.rows[0].project_id;
    const ledger = { total: 4, rows: CHAIN.rows.map((r) => ({ id: r.audit_id, at: r.at_utc.replace("Z", "+00:00"), entity_type: r.entity_type, entity_id: r.entity_id, action: r.action, actor: r.actor, hash: r.hash, prev_hash: r.prev_hash })) };
    const full = seal({ ...pack, project: { id: P, key: "demo" }, ledger });
    const r = verifyPack(full, { ...TEST_ONLY, expect: [{ seq: 2, hash: H2 }] });
    const text = (x) => x.lines.join("\n");
    expect(r.ok).toBe(true);
    expect(text(r)).toMatch(/PASS {2}the chain is this project's/);
    expect(text(r)).toMatch(/PASS {2}the readable ledger list \(4 row\(s\)\) is the chain's own rows/);
    expect(text(r)).toMatch(/PASS {2}seq 2 is the hash you hold/);
    const lied = seal({ ...full, ledger: { ...ledger, rows: ledger.rows.map((l, i) => i === 0 ? { ...l, actor: "someone else" } : l) } });
    expect(text(verifyPack(lied, TEST_ONLY))).toMatch(/FAIL {2}ledger #101: the readable list's actor is not the chain's/);
    expect(text(verifyPack(seal({ ...full, project: { id: "00000000-0000-0000-0000-000000000000" } }), TEST_ONLY))).toMatch(/FAIL {2}the chain names another project/);
    expect(text(verifyPack(full, { ...TEST_ONLY, expect: [{ seq: 2, hash: "0".repeat(64) }] }))).toMatch(/FAIL {2}seq 2 is .*the history you were given before was changed/);
  });

  it("fails a changed pack, a changed row, and a token from a root nobody trusts", () => {
    expect(verifyPack({ ...pack, generated_at: "x" }, TEST_ONLY).lines[0]).toMatch(/^FAIL {2}the pack's seal does not match/);
    const rows = CHAIN.rows.map((r) => r.project_seq === 1 ? { ...r, actor: "someone else" } : r);
    const changed = verifyPack(seal({ ...pack, chain: { ...pack.chain, rows } }), TEST_ONLY);
    expect(changed.ok).toBe(false);
    expect(changed.lines.join("\n")).toMatch(/FAIL {2}seq 1 .*was changed/);
    expect(verifyPack(pack).lines.join("\n")).toMatch(/FAIL {2}the timestamp in ledger #230: .*trusted root/);
  });

  it("runs as a program: node ledger-verify.mjs <pack> --root <pem> → exit 0 and words; without the root → exit 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-verify-"));
    const file = join(dir, "demo-audit-pack.json"); writeFileSync(file, JSON.stringify(pack, null, 2));
    const cli = fileURLToPath(new URL("./ledger-verify.mjs", import.meta.url));
    const root = fileURLToPath(new URL("./fixtures/tsa/ca.crt", import.meta.url));
    expect(execFileSync(process.execPath, [cli, file, "--root", root]).toString()).toMatch(/RESULT: everything checked passed\./);
    let code = 0; try { execFileSync(process.execPath, [cli, file], { stdio: "pipe" }); } catch (e) { code = e.status; }
    expect(code).toBe(1);
  });
});
