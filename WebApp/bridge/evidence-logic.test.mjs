// MA-4a — the evidence rules, pure: the pinned texts, the body, the policy, the magic bytes, the validator.
import { describe, it, expect } from "vitest";
import {
  ATTESTATIONS, ADMIT_NEEDS, MAX_ITEMS, codesSaid, readAdmitBody, newItemRefusal, policyRefusals, magicRefusal,
  nextId, newPack, newItem, flagged, readmitted, validatePack, readRequestBody, letterText, newRequest, requestedValue,
  DATASET_LICENCES, readDataset, needsOf,
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
  it("the six texts hash exactly as signed", () => {
    expect(Object.fromEntries(Object.entries(ATTESTATIONS).map(([k, v]) => [k, v.sha256]))).toEqual({
      a: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546",
      b: "a66c8e127c1f8e7217ad943f30db0dff7f9f9f025a6fc9c7a0c64afcb9288c92",
      c: "f6103bd87d440564df63796758df64fb7a0e9077aa766559a6b18f1cad041bbc",
      d: "6b4631aec9b8969a9129837fe830943418c6d1a0bc580f3f3336347592920f4a",
      e: "71656072b4e5b61196fcacd3fdf1d3f5b5ca19043cfe124159dca0cc788bc217",
      f: "be54e04879d716b63add30ab9785ded25ffd6e83817a082489b4aa062be29022",
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
    expect(() => readAdmitBody({ path: "a.jpg", kind: "dataset" })).toThrow(expect.objectContaining({ status: 400, message: "kind must be scan, photo or drawing — nothing was saved" }));
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
    expect(ADMIT_NEEDS).toEqual({ scan: ["a", "c"], photo: ["a", "c", "d"], drawing: ["a", "b"] });
  });
});

describe("policyRefusals", () => {
  it("refuses RED, third-party, drawings and wrong formats", () => {
    expect(policyRefusals({ kind: "photo", provider: "google maps", path: "a.jpg" })).toEqual(["google maps is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(policyRefusals({ kind: "photo", provider: "azure", path: "a.jpg" })).toEqual(["azure is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(policyRefusals({ kind: "photo", provider: "wikimedia-commons", path: "a.jpg" })).toEqual(["web and third-party items wait for a later stage — only your own scans and photos (provider own) are admitted now"]);
    expect(policyRefusals({ kind: "drawing", provider: "own", path: "A-101.pdf" })).toEqual([]); // MA-4b: under a request
    expect(policyRefusals({ kind: "drawing", provider: "owner", path: "scan.JPEG" })).toEqual([]);
    expect(policyRefusals({ kind: "drawing", provider: "own", path: "A-101.txt" })).toEqual(["a .txt is not admitted as a drawing — drawings are pdf, dwg, dxf, png or jpg"]);
    expect(policyRefusals({ kind: "drawing", provider: "apple", path: "A-101.pdf" })[0]).toMatch(/^apple is a RED source/);
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

describe("Ask the owner (MA-4b)", () => {
  const body = { recipient_kind: "owner", recipient: "  Ms  Owner ", documents: ["floor plans, every level", " ", "sections\nand elevations"], purpose: "a record model" };
  it("reads the request body, one line each", () => {
    expect(readRequestBody(body)).toEqual({ recipient_kind: "owner", recipient: "Ms Owner", documents: ["floor plans, every level", "sections and elevations"], purpose: "a record model" });
    expect(readRequestBody({ recipient_kind: "municipality", documents: ["approved drawings"] })).toMatchObject({ recipient: null, purpose: null });
    const no = (b, message) => expect(() => readRequestBody(b)).toThrow(expect.objectContaining({ status: 400, message }));
    no({ ...body, recipient_kind: "google" }, "recipient_kind must be owner, architect or municipality — who the letter asks — nothing was saved");
    no({ ...body, documents: "plans" }, 'documents must list what is asked for, as ["floor plans, every level", "sections"] — nothing was saved');
    no({ ...body, documents: [" "] }, "documents must list 1 to 20 documents, each at most 200 characters — nothing was saved");
    no({ ...body, documents: Array.from({ length: 21 }, (_, i) => `d${i}`) }, "documents must list 1 to 20 documents, each at most 200 characters — nothing was saved");
    no({ ...body, recipient: "x".repeat(201) }, "recipient must be text of at most 200 characters — nothing was saved");
    no({ ...body, purpose: 7 }, "purpose must be text of at most 500 characters — nothing was saved");
  });
  it("drafts the letter, pure, and keeps the recipient's name off the ledger value", () => {
    const input = readRequestBody(body);
    const letter = letterText({ asset: "Aster Tower", project: "aster-tower", request: { id: "req-0001", ...input }, by: "lead@example.test" });
    expect(letter.split("\n")[0]).toBe("Subject: Request for the drawings of Aster Tower (our reference aster-tower req-0001)");
    expect(letter).toContain("Dear Ms Owner,");
    expect(letter).toContain("we ask you, as the owner, for copies of:\n\n- floor plans, every level\n- sections and elevations\n\nWhat they are for: a record model\n");
    expect(letter).toContain("- they are not published, not passed to anyone else and not used to train software;");
    expect(letter.endsWith("[your name and title]\nContact: lead@example.test")).toBe(true);
    expect(letterText({ asset: "A", project: "a", request: { id: "req-0002", recipient_kind: "architect", recipient: null, documents: ["x"], purpose: null }, by: "b" }))
      .toContain("Dear Sir or Madam,\n\nWe are preparing a building information model of A. To build it from the record rather than from estimates, we ask you, as the architect, for copies of:\n\n- x\n\nWe also ask");
    const r = newRequest({ id: "req-0001", input, letter, who: "lead@example.test", at: "2026-10-08T12:00:00.000Z" });
    expect(r.letter_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(requestedValue("evp-0001", r)).toEqual({ pack_id: "evp-0001", request_id: "req-0001", recipient_kind: "owner", documents: 2, letter_sha256: r.letter_sha256, actor: "lead@example.test" });
  });
  it("a drawing: its kind's format table, its request's recipient as provider, (a) and (b), not surveyable", () => {
    expect(magicRefusal("pdf", Buffer.from("%PDF-1.7"), "drawing")).toBe(null);
    expect(magicRefusal("dwg", Buffer.from("AC1032\0\0"), "drawing")).toBe(null);
    expect(magicRefusal("dxf", Buffer.from("  0\nSECT"), "drawing")).toBe(null);
    expect(magicRefusal("pdf", Buffer.from("PK\x03\x04"), "drawing")).toBe("the file does not begin as a .pdf does — renamed or damaged");
    expect(readAdmitBody({ path: "d/A.pdf", kind: "drawing", request_id: " req-0001 " }).request_id).toBe("req-0001");
    expect(() => readAdmitBody({ path: "d/A.pdf", kind: "drawing", request_id: "1" })).toThrow(expect.objectContaining({ status: 400, message: "request_id must name a request of the pack, as req-0001 — nothing was saved" }));
    expect(newItemRefusal({ path: "d/A.pdf", kind: "drawing", registration: null, request_id: null })).toBe("a drawing names the Ask the owner request it answers: request_id, as req-0001 — nothing was saved");
    const input = readRequestBody(body);
    const letter = letterText({ asset: "P", project: "p", request: { id: "req-0001", ...input }, by: "lead@example.test" });
    const req = newRequest({ id: "req-0001", input, letter, who: "lead@example.test", at: "t" });
    const pack = { ...packWith(["a", "b"]), requests: [req] };
    const d = newItem({ id: "ev-0001", input: { path: "drawings/A-101.pdf", kind: "drawing", provider: "own", registration: null, request_id: "req-0001" },
      format: "pdf", sha256: SHA, size_bytes: 9, report: null, pack, who: "c@example.test", at: "t", request: req });
    expect(d).toMatchObject({ provider: "owner", licence: "holder-permission", request_id: "req-0001", attestation_ids: ["att-0001", "att-0002"], surveyable: false });
    expect(validatePack({ ...pack, items: [d] })).toBe(true);
    const fails = (p, message) => expect(() => validatePack(p)).toThrow(expect.objectContaining({ status: 400, message }));
    const drawingWords = "evidence_pack: items[0] is a drawing: licence holder-permission, request_id naming a request of this pack, provider its recipient_kind";
    fails({ ...pack, items: [{ ...d, provider: "architect" }] }, drawingWords);
    fails({ ...pack, items: [{ ...d, request_id: "req-0009" }] }, drawingWords);
    fails({ ...pack, requests: [{ ...req, letter: req.letter + "!" }], items: [] }, "evidence_pack: requests[0].letter must be the drafted letter, with its sha256");
    fails({ ...pack, requests: [req, req] }, "evidence_pack: requests[1].id must be a unique req-NNNN");
    fails({ ...pack, items: [{ ...photoItem(packWith(["a", "c", "d"])), request_id: "req-0001" }] }, "evidence_pack: items[0] is own (licence owner-supplied) — only a drawing comes from someone else, under a request");
    const { requests: _r, ...ma4a } = newPack("p", "P", {}, "C:/ev/p");
    expect(validatePack(ma4a)).toBe(true); // an MA-4a pack has no requests
  });
});

describe("MA-4h — a published dataset's pack", () => {
  const DS = { provider: "Example-Repository", source_url: "https://example.test/records/1", licence: "CC-BY-4.0", attribution: "Example scan by A. Surveyor,\n example.test, CC BY 4.0" };
  const read = { ...DS, provider: "example-repository", attribution: "Example scan by A. Surveyor, example.test, CC BY 4.0" };
  const bad = (v, message) => expect(() => readDataset(v)).toThrow(expect.objectContaining({ status: 400, message }));
  const dsPack = (codes) => ({ ...newPack("p", "P", {}, "C:/ev/p", read), attestations: signed(codes) });

  it("its record, read and normalised; anything else refused in words", () => {
    expect([readDataset(undefined), readDataset(null), readDataset(DS)]).toEqual([null, null, read]);
    expect(DATASET_LICENCES).toEqual(["CC-BY-4.0", "CC0-1.0"]);
    bad("x", "dataset must be {provider, source_url, licence, attribution} — a published dataset's pack — nothing was saved");
    bad({ ...DS, provider: "own" }, "dataset.provider must name where it was published (at most 100 characters) — nothing was saved");
    bad({ ...DS, provider: "google-earth" }, "google-earth is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted — nothing was saved");
    bad({ ...DS, source_url: "http://example.test/records/1" }, "dataset.source_url must be its https:// address (at most 500 characters) — nothing was saved");
    for (const source_url of ["https://user:pw@example.test/records/1", "https://user@example.test/records/1", "https://:pw@example.test/records/1"])
      bad({ ...DS, source_url }, "dataset.source_url carries a user name or password — give the dataset's public page — nothing was saved");
    bad({ ...DS, source_url: "https://maps.google.com/x" }, "maps.google.com is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted — nothing was saved");
    bad({ ...DS, licence: "CC-BY-NC-4.0" }, "dataset.licence must be CC-BY-4.0 or CC0-1.0 (SPDX) — a licence that allows commercial use and adaptation — nothing was saved");
    bad({ ...DS, attribution: " " }, "dataset.attribution must be the attribution its licence asks for (at most 300 characters) — nothing was saved");
  });
  it("its scans need (f) alone and carry its provider and licence; an own pack's needs are unchanged", () => {
    expect([needsOf(dsPack([]), "scan"), needsOf(packWith([]), "scan")]).toEqual([["f"], ["a", "c"]]);
    expect(policyRefusals({ kind: "scan", provider: "own", path: "scans/a.las", dataset: true })).toEqual([]);
    const pack = dsPack(["f"]);
    const s = scanItem(pack);
    expect([s.provider, s.licence, s.attestation_ids, s.allowed_uses]).toEqual(["example-repository", "CC-BY-4.0", ["att-0001"], { view_reference: true, geometry_extraction: true, texture_embed: false, redistribute: false, ml_training: false }]);
    expect(validatePack({ ...pack, items: [s] })).toBe(true);
  });
  it("the validator: its record as read, (f) on its scans, nothing own in it", () => {
    const fails = (p, message) => expect(() => validatePack(p)).toThrow(expect.objectContaining({ status: 400, message }));
    const pack = dsPack(["f"]);
    const s = scanItem(pack);
    fails({ ...pack, dataset: { ...read, licence: "CC-BY-SA-4.0" } }, "evidence_pack: dataset must be {provider, source_url, licence (CC-BY-4.0 or CC0-1.0), attribution}, as the bridge reads it");
    fails({ ...pack, items: [{ ...s, provider: "own", licence: "owner-supplied" }] }, "evidence_pack: items[0] is the published dataset's scan: its provider and licence, no request");
    fails({ ...pack, items: [{ ...s, attestation_ids: [] }] }, "evidence_pack: items[0].attestation_ids must name attestations of this pack, (f) at least for a scan");
    // the attestation split, as the sign route keeps it: (f) alone on a dataset's pack, never (f) on an own pack
    fails(dsPack(["f", "a"]), "evidence_pack: attestations[1].code must be (f) on a published dataset's pack — (a) to (e) speak for an owner or one's own capture");
    fails(packWith(["a", "f"]), "evidence_pack: attestations[1].code must not be (f) on an own pack — (f) is signed on a published dataset's pack only");
  });
});
