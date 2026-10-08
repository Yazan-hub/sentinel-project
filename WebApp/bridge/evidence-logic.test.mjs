// MA-4a — the evidence rules, pure: the pinned texts, the body, the policy, the magic bytes, the validator.
import { describe, it, expect } from "vitest";
import {
  ATTESTATIONS, ADMIT_NEEDS, MAX_ITEMS, codesSaid, readAdmitBody, newItemRefusal, policyRefusals, magicRefusal,
  nextId, newPack, newItem, flagged, readmitted, validatePack,
} from "./evidence-logic.mjs";

const PATH_WORDS = "path must name a file inside the project's evidence folder, relative to it (no drive, no leading slash, no ..) — nothing was saved";
const SHA = "a".repeat(64);
const signed = (codes) => codes.map((code, i) => ({ id: `att-${String(i + 1).padStart(4, "0")}`, code, text_sha256: ATTESTATIONS[code].sha256, by: "lead@example.test", role: "lead", at: "2026-10-08T10:00:00.000Z" }));
const packWith = (codes, items = []) => ({ ...newPack("p", "P", {}, "C:/ev/p"), attestations: signed(codes), items });
const scanItem = (pack, over = {}) => newItem({
  id: "ev-0001", input: { path: "scans/a.las", kind: "scan", provider: "own", registration: { method: "registered in source", report_path: null } },
  format: "las", sha256: SHA, size_bytes: 1234, report: null, pack, who: "contributor@example.test", at: "2026-10-08T10:01:00.000Z", ...over,
});
const photoItem = (pack) => newItem({
  id: "ev-0001", input: { path: "photos/a.jpg", kind: "photo", provider: "own", registration: null },
  format: "jpg", sha256: SHA, size_bytes: 99, report: null, pack, who: "contributor@example.test", at: "2026-10-08T10:01:00.000Z",
});

describe("the attestations (pinned)", () => {
  it("the five texts hash exactly as signed", () => {
    expect(Object.fromEntries(Object.entries(ATTESTATIONS).map(([k, v]) => [k, v.sha256]))).toEqual({
      a: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546",
      b: "a66c8e127c1f8e7217ad943f30db0dff7f9f9f025a6fc9c7a0c64afcb9288c92",
      c: "f6103bd87d440564df63796758df64fb7a0e9077aa766559a6b18f1cad041bbc",
      d: "6b4631aec9b8969a9129837fe830943418c6d1a0bc580f3f3336347592920f4a",
      e: "71656072b4e5b61196fcacd3fdf1d3f5b5ca19043cfe124159dca0cc788bc217",
    });
    expect(ATTESTATIONS.a.text).toBe("I am the owner, or authorised by the owner, of this asset.");
  });
});

describe("readAdmitBody and newItemRefusal", () => {
  it.each(["../x", "/x", "C:/x", "a//b", "./a", "photos/a.jpg:x.las"])("refuses the path %s", (path) => {
    expect(() => readAdmitBody({ path, kind: "photo" })).toThrow(expect.objectContaining({ status: 400, message: PATH_WORDS }));
  });
  it("reads the body's shape", () => {
    expect(readAdmitBody({ path: "scans\\a.las", kind: "scan", registration: { method: "m" } }).path).toBe("scans/a.las");
    expect(readAdmitBody({ path: "scans/a.las", kind: "scan" }).registration).toBe(null);
    expect(readAdmitBody({ path: "a.jpg", kind: "photo" }).provider).toBe("own");
    expect(readAdmitBody({ path: "a.jpg", kind: "photo", provider: "Google Maps" }).provider).toBe("google maps");
    expect(() => readAdmitBody({ path: "a.jpg", kind: "dataset" })).toThrow(expect.objectContaining({ status: 400, message: "kind must be scan or photo — nothing was saved" }));
  });
  it("a new item's own needs", () => {
    expect(newItemRefusal({ path: "a.las", kind: "scan", registration: null })).toMatch(/registration\.method/);
    expect(newItemRefusal({ path: "site.rcp", kind: "scan", registration: { method: "m", report_path: null } }))
      .toBe("an RCP is admitted with its registration report: registration.report_path, a file in the evidence folder — nothing was saved");
    expect(newItemRefusal({ path: "a.jpg", kind: "photo", registration: null })).toBe(null);
  });
  it("names the codes and what each kind needs", () => {
    expect(codesSaid(["a", "c", "d"])).toBe("(a), (c) and (d)");
    expect(codesSaid(["d"])).toBe("(d)");
    expect(ADMIT_NEEDS).toEqual({ scan: ["a", "c"], photo: ["a", "c", "d"] });
  });
});

describe("policyRefusals", () => {
  it("refuses RED, third-party, drawings and wrong formats", () => {
    expect(policyRefusals({ kind: "photo", provider: "google maps", path: "a.jpg" })).toEqual(["google maps is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(policyRefusals({ kind: "photo", provider: "azure", path: "a.jpg" })).toEqual(["azure is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(policyRefusals({ kind: "photo", provider: "wikimedia-commons", path: "a.jpg" })).toEqual(["web and third-party items wait for a later stage — only your own scans and photos (provider own) are admitted now"]);
    expect(policyRefusals({ kind: "drawing", provider: "own", path: "A-101.pdf" })).toEqual(["drawings come through Ask the owner (MA-4b)"]);
    expect(policyRefusals({ kind: "photo", provider: "own", path: "a.txt" })).toEqual(["a .txt is not admitted — scans are e57, las, laz or rcp; photos are jpg or png"]);
    expect(policyRefusals({ kind: "scan", provider: "own", path: "a.jpg" })).toEqual(["a .jpg is a photo, not a scan"]);
    expect(policyRefusals({ kind: "photo", provider: "own", path: "a.JPEG" })).toEqual([]);
  });
});

describe("magicRefusal", () => {
  it("checks the first bytes", () => {
    expect(magicRefusal("las", Buffer.from("LASF\0\0\0\0"))).toBe(null);
    expect(magicRefusal("laz", Buffer.from("LASF\0\0\0\0"))).toBe(null);
    expect(magicRefusal("e57", Buffer.from("ASTM-E57"))).toBe(null);
    expect(magicRefusal("jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(null);
    expect(magicRefusal("png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(null);
    expect(magicRefusal("las", Buffer.from("PK\x03\x04"))).toBe("the file does not begin as a .las does — renamed or damaged");
    expect(magicRefusal("rcp", Buffer.from("anything"))).toBe(null);
  });
});

describe("nextId", () => {
  it("is one past the highest", () => {
    expect(nextId("ev", [])).toBe("ev-0001");
    expect(nextId("ev", [{ id: "ev-0002" }, { id: "ev-0009" }])).toBe("ev-0010");
  });
});

describe("validatePack", () => {
  const fails = (p, message) => expect(() => validatePack(p)).toThrow(expect.objectContaining({ status: 400, ...(message ? { message } : {}) }));
  it("a new pack passes", () => { expect(validatePack(newPack("p", "P", {}, "C:/ev/p"))).toBe(true); });
  it("refuses texture_embed, a stranger attestation id, a wrong text sha and a stray field", () => {
    const pack = packWith(["a", "c"]);
    const item = scanItem(pack);
    fails({ ...pack, items: [{ ...item, allowed_uses: { ...item.allowed_uses, texture_embed: true } }] }, "evidence_pack: items[0].allowed_uses texture_embed and redistribute are always false (policy)");
    fails({ ...pack, items: [{ ...item, attestation_ids: ["att-0009"] }] }, expect.stringMatching(/^evidence_pack: items\[0\]\.attestation_ids /));
    fails({ ...pack, attestations: [{ ...pack.attestations[0], text_sha256: SHA }, pack.attestations[1]] });
    fails({ ...newPack("p", "P", {}, "C:/ev/p"), note: "x" });
  });
  it("caps the items at 100", () => {
    expect(MAX_ITEMS).toBe(100);
    const pack = packWith(["a", "c"]);
    const items = Array.from({ length: 101 }, (_, i) => scanItem(pack, { id: `ev-${String(i + 1).padStart(4, "0")}`, input: { path: `scans/${i}.las`, kind: "scan", provider: "own", registration: { method: "m", report_path: null } } }));
    fails({ ...pack, items }, "evidence_pack: items must be an array of at most 100");
  });
  it("a scan names (a) and (c); a photo (a), (c) and (d), and needs (d)", () => {
    const scanPack = packWith(["a", "c"]);
    const s = scanItem(scanPack);
    expect(s.attestation_ids).toEqual(["att-0001", "att-0002"]);
    expect(validatePack({ ...scanPack, items: [s] })).toBe(true);
    const photoPack = packWith(["a", "c", "d"]);
    const ph = photoItem(photoPack);
    expect(ph.attestation_ids).toEqual(["att-0001", "att-0002", "att-0003"]);
    expect(validatePack({ ...photoPack, items: [ph] })).toBe(true);
    fails({ ...photoPack, items: [{ ...ph, attestation_ids: ph.attestation_ids.filter((a) => a !== "att-0003") }] },
      "evidence_pack: items[0].attestation_ids must name attestations of this pack, (a), (c) and (d) at least for a photo");
  });
  it("a flagged item admitted again is the item it was", () => {
    const item = scanItem(packWith(["a", "c"]));
    expect(readmitted(flagged(item, null, "t"))).toEqual(item);
  });
});
