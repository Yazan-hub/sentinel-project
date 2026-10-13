// MA-4a — the evidence rules, pure: the pinned texts, the body, the policy, the magic bytes, the validator.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  ATTESTATIONS, ADMIT_NEEDS, MAX_ITEMS, codesSaid, readAdmitBody, newItemRefusal, policyRefusals, magicRefusal,
  nextId, newPack, newItem, flagged, readmitted, validatePack, readRequestBody, letterText, newRequest, requestedValue,
  DATASET_LICENCES, readDataset, needsOf, sizeRefusal, USES, ITEM_FIELDS, cameraOf, photoRefusal,
  readDeleteBy, due, removable, expire, expiredValue, noticeText, toolsOf, creditCount,
  FORMATS, splatHeaderRefusal, splatUsable, readPlacement, placedValue, admittedValue,
} from "./evidence-logic.mjs";
import { jpegWithExif } from "./fixtures/jpeg-exif.mjs";
import { usable, readBoxes, blurredValue } from "./evidence-logic.mjs";
const VC = (over = {}) => ({ sha256: "b".repeat(64), size_bytes: 5000, width: 2048, height: 1365, areas: 2, faces: 1, plates: 1, method: "person-marked", marked_by: "contributor@example.test", marked_at: "2026-10-13T10:00:00.000Z", tool: "sentinel-blur 0.1.0", ...over });

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
      g: "c86b607f02f44de7217f197596b985e43369bd724148007d628865e88b4e6afc", // MA-7-12
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
    expect(() => readAdmitBody({ path: "a.jpg", kind: "dataset" })).toThrow(expect.objectContaining({ status: 400, message: "kind must be scan, photo, drawing, model or splat — nothing was saved" }));
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
    expect(ADMIT_NEEDS).toEqual({ scan: ["a", "c"], photo: ["a", "c", "d"], drawing: ["a", "b"], model: ["a"], splat: ["a", "c", "d"] });
  });
});

describe("policyRefusals", () => {
  it("refuses RED, third-party, drawings and wrong formats", () => {
    expect(policyRefusals({ kind: "photo", provider: "google maps", path: "a.jpg" })).toEqual(["google maps is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(policyRefusals({ kind: "photo", provider: "azure", path: "a.jpg" })).toEqual(["azure is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    const OFF_WORDS = "a photo from a website waits for counsel's review — web evidence is off (the founder's switch SENTINEL_WEB_EVIDENCE); only your own photos (provider own) are admitted now";
    expect(policyRefusals({ kind: "photo", provider: "wikimedia-commons", path: "a.jpg" })).toEqual([OFF_WORDS]); // MA-7-4, MA-7-12: switch off is the default
    expect(policyRefusals({ kind: "photo", provider: "wikimedia-commons", path: "a.jpg", webMode: "off" })).toEqual([OFF_WORDS]);
    expect(policyRefusals({ kind: "photo", provider: "wikimedia-commons", path: "a.jpg", webMode: "drill" })).toEqual([]); // MA-7-12: then the web path (webPhotoRefusals) decides
    expect(policyRefusals({ kind: "photo", provider: "wikimedia-commons", path: "a.jpg", webMode: "on" })).toEqual([]);
    expect(policyRefusals({ kind: "photo", provider: "flickr", path: "a.jpg", webMode: "drill" })).toEqual(["flickr is not a source Sentinel admits photos from yet — Wikimedia Commons only (provider wikimedia-commons)"]);
    expect(policyRefusals({ kind: "scan", provider: "wikimedia-commons", path: "a.las" })).toEqual(["web and third-party items wait for a later stage — only your own scans and photos (provider own), drawings under a request and third-party models with (e) are admitted now"]);
    expect(policyRefusals({ kind: "photo", provider: "street view", path: "a.jpg" })).toEqual(["street view is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(policyRefusals({ kind: "photo", provider: "google street view", path: "a.jpg" })[0]).toMatch(/^google street view is a RED source/);
    expect(policyRefusals({ kind: "photo", provider: "website", path: "a.jpg", webMode: "drill" })[0]).toMatch(/^website is not a source Sentinel admits photos from yet/);
    expect(policyRefusals({ kind: "drawing", provider: "own", path: "A-101.pdf" })).toEqual([]); // MA-4b: under a request
    expect(policyRefusals({ kind: "drawing", provider: "owner", path: "scan.JPEG" })).toEqual([]);
    expect(policyRefusals({ kind: "drawing", provider: "own", path: "A-101.txt" })).toEqual(["a .txt is not admitted as a drawing — drawings are pdf, dwg, dxf, png or jpg"]);
    expect(policyRefusals({ kind: "drawing", provider: "apple", path: "A-101.pdf" })[0]).toMatch(/^apple is a RED source/);
    expect(policyRefusals({ kind: "photo", provider: "own", path: "a.txt" })).toEqual(["a .txt is not admitted — scans are e57, las, laz or rcp; photos are jpg or png; a concept model is ifc; a Gaussian splat is a ply"]);
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
    fails({ ...pack, items: [{ ...photoItem(packWith(["a", "c", "d"])), request_id: "req-0001" }] }, "evidence_pack: items[0] is own (licence owner-supplied) — only a drawing comes from someone else, under a request, and a model from a vendor, under a licence_ref");
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

// MA-6-8 — the office's own concept model: an .ifc, the owner's authority (a) alone, read inside the bridge (a size cap).
describe("a concept model (MA-6-8)", () => {
  const MB = 1048576;
  it("the body, the magic (12 bytes), the size and the policy", () => {
    expect(readAdmitBody({ path: "model/concept.ifc", kind: "model" })).toMatchObject({ kind: "model", provider: "own" });
    expect(newItemRefusal({ path: "model/concept.ifc", kind: "model", registration: null })).toBe(null);
    expect(magicRefusal("ifc", Buffer.from("ISO-10303-21;\nHEAD"), "model")).toBe(null);
    expect(magicRefusal("ifc", Buffer.from("%PDF-1.7\n1 0 obj"), "model")).toBe("the file does not begin as a .ifc does — renamed or damaged");
    expect(magicRefusal("ifc", Buffer.from("ISO-1030"), "model")).toBe("the file does not begin as a .ifc does — renamed or damaged");
    expect(sizeRefusal("ifc", 64 * MB, "model")).toBe(null); // MA-8-3 (D3): a 25 MB vendor export is read
    expect(sizeRefusal("ifc", 64 * MB + 1, "model")).toBe("a .ifc is read inside the bridge — at most 64 MB (this one is 65537 KB); export it without its site, links and furniture");
    expect(sizeRefusal("ifc", 70.3 * MB, "model")).toContain("(this one is 70.3 MB)");
    expect(sizeRefusal("las", 9e9, "scan")).toBe(null);
    expect(sizeRefusal("jpg", 64 * MB, "photo")).toBe(null); // MA-7-7 (R18)
    expect(sizeRefusal("png", 64 * MB + 1, "photo")).toBe("a .png photo is at most 64 MB (this one is 65537 KB) — it is not admitted; a camera's own file is smaller");
    expect(policyRefusals({ kind: "model", provider: "own", path: "a.ifc" })).toEqual([]);
    expect(policyRefusals({ kind: "model", provider: "architect", path: "a.ifc" })).toEqual([]); // MA-8-3: a vendor's model (e) and a licence_ref are the body's and the pack's
    expect(policyRefusals({ kind: "model", provider: "google maps", path: "a.ifc" })[0]).toMatch(/^google maps is a RED source/);
    expect(policyRefusals({ kind: "model", provider: "bingham geomatics", path: "a.ifc" })).toEqual([]); // whole words: Bingham is not Bing
    expect(policyRefusals({ kind: "model", provider: "big apple scanning", path: "a.ifc" })[0]).toMatch(/RED source/);
    expect(readAdmitBody({ path: "a.ifc", kind: "model", provider: "Google/Maps", licence_ref: "x" }).provider).toBe("google/maps"); // refused with a row, not a 400
    expect(policyRefusals({ kind: "model", provider: "google/maps", path: "a.ifc" })[0]).toMatch(/RED source/);
    expect(policyRefusals({ kind: "scan", provider: "vendor", path: "a.las" })[0]).toMatch(/^web and third-party items wait/);
    expect(policyRefusals({ kind: "scan", provider: "own", path: "a.ifc" })).toEqual(["a .ifc is a model, not a scan"]);
    expect(policyRefusals({ kind: "model", provider: "own", path: "a.las" })).toEqual(["a .las is a scan, not a model"]);
  });
  it("validatePack takes a model item with (a) alone", () => {
    const item = { id: "ev-0001", kind: "model", format: "ifc", path: "model/concept.ifc", sha256: SHA, size_bytes: 1000, provider: "own", licence: "owner-supplied",
      attestation_ids: ["att-0001"], allowed_uses: { ...USES }, surveyable: false, admitted_by: "lead@example.test", admitted_at: "2026-10-12T10:00:00.000Z" };
    expect(validatePack(packWith(["a"], [item]))).toBe(true);
    expect(() => validatePack(packWith(["c"], [{ ...item, attestation_ids: ["att-0001"] }]))).toThrow(/\(a\) at least for a model/);
  });
});

// MA-8-3 — a third party's model: a purchase (not a request), (a) + (e), a provider and the order it was bought under.
describe("a third party's model (MA-8-3)", () => {
  const body = { path: "model/vendor.ifc", kind: "model", provider: "Acme Scans", licence_ref: " PO-2026-114 " };
  const packOf = (codes) => packWith(codes);
  const vendorItem = (pack, over = {}) => newItem({ id: "ev-0001", input: readAdmitBody(body), format: "ifc", sha256: SHA, size_bytes: 1000, report: null, pack, who: "lead@example.test", at: "t", ...over });
  it("the body names its licence_ref: required for a vendor, refused anywhere else", () => {
    expect(readAdmitBody(body)).toMatchObject({ kind: "model", provider: "acme scans", licence_ref: "PO-2026-114" });
    expect(() => readAdmitBody({ ...body, licence_ref: undefined })).toThrow(/names the order or contract it was bought under: licence_ref/);
    expect(() => readAdmitBody({ ...body, licence_ref: "a\nb" })).toThrow(/licence_ref must be one line/);
    expect(() => readAdmitBody({ ...body, licence_ref: "x".repeat(101) })).toThrow(/1 to 100 characters/);
    expect(() => readAdmitBody({ path: "scans/a.las", kind: "scan", licence_ref: "PO-1" })).toThrow(/belongs to a third-party model only/);
    expect(() => readAdmitBody({ path: "model/a.ifc", kind: "model", licence_ref: "PO-1" })).toThrow(/belongs to a third-party model only/);
    expect(() => readAdmitBody({ ...body, provider: "acme/../x" })).toThrow(/plain name/);
    expect(readAdmitBody({ path: "model/a.ifc", kind: "model" })).toMatchObject({ provider: "own" });
  });
  it("needsOf: (a) + (e) for a vendor's model, (a) for the office's own, a dataset's (f)", () => {
    expect(needsOf(packOf([]), "model", "acme")).toEqual(["a", "e"]);
    expect(needsOf(packOf([]), "model")).toEqual(["a"]);
    expect(needsOf(packOf([]), "scan", "acme")).toEqual(["a", "c"]);
    expect(needsOf({ ...packOf([]), dataset: {} }, "model", "acme")).toEqual(["f"]);
  });
  it("newItem and validatePack: commercial, with the order; a vendor's scan stays refused", () => {
    const pack = packOf(["a", "e"]);
    const m = vendorItem(pack);
    expect(m).toMatchObject({ provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114", attestation_ids: ["att-0001", "att-0002"], surveyable: false });
    expect(validatePack({ ...pack, items: [m] })).toBe(true);
    expect(() => validatePack({ ...packOf(["a"]), items: [{ ...m, attestation_ids: ["att-0001"] }] })).toThrow(/\(a\) and \(e\) at least for a model/);
    const fails = (item) => expect(() => validatePack({ ...pack, items: [item] })).toThrow(/is a third party's model/);
    fails({ ...m, licence: "owner-supplied" });
    fails({ ...m, licence_ref: undefined });
    fails({ ...m, request_id: "req-0001" });
    fails({ ...m, provider: "google maps" });
    fails({ ...m, provider: "Bad Name" });
    const own = packOf(["a", "c"]);
    expect(() => validatePack({ ...own, items: [{ ...scanItem(own), provider: "acme", licence: "commercial", licence_ref: "PO-1" }] })).toThrow(/is own/);
    expect(() => validatePack({ ...own, items: [{ ...scanItem(own), licence_ref: "PO-1" }] })).toThrow(/is own/);
  });
  it("admittedValue carries the licence_ref; a vendor's model is not a RED source", async () => {
    const { admittedValue } = await import("./evidence-logic.mjs");
    expect(admittedValue("evp-0001", vendorItem(packOf(["a", "e"])), 3, false)).toMatchObject({ provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" });
    expect(admittedValue("evp-0001", photoItem(packWith(["a", "c", "d"])), 3, false)).not.toHaveProperty("licence_ref");
  });
});

// MA-7-3 — the item-field whitelist, and the replay guard: every item shape stored before it must still validate unchanged (a stored pack
// is never rewritten to fit — a failure here widens ITEM_FIELDS).
describe("the item-field whitelist (MA-7-3)", () => {
  const DS = { provider: "example-repository", source_url: "https://example.test/records/1", licence: "CC-BY-4.0", attribution: "Example scan by A. Surveyor" };
  const req = { id: "req-0001", recipient_kind: "owner", recipient: null, documents: ["plans"], purpose: null, letter: "L", letter_sha256: "", drafted_by: "lead@example.test", drafted_at: "t" };
  const reqs = [{ ...req, letter_sha256: newRequest({ id: "r", input: { documents: [] }, letter: "L", who: "w", at: "t" }).letter_sha256 }];
  const mk = (pack, input, format, over = {}) => newItem({ id: "ev-0001", input, format, sha256: SHA, size_bytes: 9, report: null, pack, who: "lead@example.test", at: "2026-10-08T10:01:00.000Z", ...over });
  const REG = { method: "registered in source", report_path: null };
  const shapes = () => {
    const rcpPack = packWith(["a", "c"]);
    const photoPack = packWith(["a", "c", "d"]);
    const drawPack = { ...packWith(["a", "b"]), requests: reqs };
    const dsPack = { ...newPack("p", "P", {}, "C:/ev/p", DS), attestations: signed(["f"]) };
    const vendPack = packWith(["a", "e"]);
    const rcp = mk(rcpPack, { path: "scans/s.rcp", kind: "scan", provider: "own", registration: { ...REG, report_path: "scans/s.txt" } }, "rcp", { report: { sha256: SHA } });
    return [
      ["own scan with registration", packWith(["a", "c"]), (p) => mk(p, { path: "scans/a.las", kind: "scan", provider: "own", registration: REG }, "las")],
      ["RCP with report path + sha", rcpPack, () => rcp],
      ["flagged photo", photoPack, (p) => flagged(mk(p, { path: "photos/a.jpg", kind: "photo", provider: "own", registration: null }, "jpg"), SHA, "2026-10-09T10:00:00.000Z")],
      ["photo with capture (7-4)", photoPack, (p) => mk(p, { path: "photos/c.jpg", kind: "photo", provider: "own", registration: null, capture: { make: "Example", model: "Cam", taken_at: null, gps: false } }, "jpg")],
      ["photo with blurred copy (7-7)", photoPack, (p) => ({ ...mk(p, { path: "photos/b.jpg", kind: "photo", provider: "own", registration: null }, "jpg"), view_copy: VC() })],
      ["drawing under a request", drawPack, (p) => mk(p, { path: "drawings/A.pdf", kind: "drawing", provider: "own", registration: null, request_id: "req-0001" }, "pdf", { request: p.requests[0] })],
      ["dataset scan", dsPack, (p) => mk(p, { path: "scans/d.las", kind: "scan", provider: "own", registration: REG }, "las")],
      ["vendor model with licence_ref", vendPack, (p) => mk(p, { path: "model/v.ifc", kind: "model", provider: "acme", licence_ref: "PO-1", registration: null }, "ifc")],
      ["own concept IFC", packWith(["a"]), (p) => mk(p, { path: "model/c.ifc", kind: "model", provider: "own", registration: null }, "ifc")],
      ["splat with the person's answer (7-11)", photoPack, (p) => mk(p, { path: "splats/s.ply", kind: "splat", provider: "own", registration: null, no_people_or_plates: true }, "ply")],
      ["splat made in Sentinel (7-11)", photoPack, (p) => ({ ...mk(p, { path: "splats/m.ply", kind: "splat", provider: "own", registration: null, no_people_or_plates: true }, "ply"), no_people_or_plates: undefined, made_with: { tool: "gsplat", version: "1.0.0", licence: "Apache-2.0" } })],
    ];
  };
  it("lists the 19 fields the bridge wrote before MA-7, then capture (7-4), 7-5's four, view_copy (7-7), 7-12's role, web and original record and 7-11's made_with and no_people_or_plates", () => { expect(ITEM_FIELDS).toEqual(["id", "kind", "format", "sha256", "size_bytes", "path", "provider", "licence", "licence_ref", "request_id", "attestation_ids", "allowed_uses", "registration", "surveyable", "admitted_by", "admitted_at", "state", "changed_sha256", "changed_at", "capture", "delete_by", "delete_why", "expired_at", "removed", "not_removed", "view_copy", "role", "web", "original_sha256", "original_size_bytes", "made_with", "no_people_or_plates"]); });
  it.each(shapes().map((s) => [s[0], s]))("replay: %s validates unchanged", (_n, [, pack, make]) => {
    const item = make(pack);
    expect(Object.keys(item).every((k) => ITEM_FIELDS.includes(k))).toBe(true);
    expect(validatePack({ ...pack, items: [item] })).toBe(true);
  });
  it("a stray item field is a 400 naming it", () => {
    const pack = packWith(["a", "c"]);
    const item = scanItem(pack);
    expect(() => validatePack({ ...pack, items: [{ ...item, foo: 1 }] })).toThrow(expect.objectContaining({
      status: 400, message: "evidence_pack: items[0].foo is not an item field — the bridge writes items; an unknown field is never stored" }));
  });
});

// MA-7-4 — a photo's camera record from its EXIF, and what a new own photo must carry.
describe("cameraOf and photoRefusal (MA-7-4)", () => {
  it("reads make, model, taken and a GPS flag; little- and big-endian; coordinates are never read", () => {
    for (const endian of ["II", "MM"]) {
      expect(cameraOf(jpegWithExif({ endian, gps: true }))).toEqual({ make: "Example", model: "Test Cam 1", taken_at: "2026-10-13 09:30", gps: true });
    }
    const c = cameraOf(jpegWithExif({ gps: true }));
    expect(JSON.stringify(c)).not.toMatch(/lat|lon|coord/i);
    expect(cameraOf(jpegWithExif({ taken: null }))).toEqual({ make: "Example", model: "Test Cam 1", taken_at: null, gps: false });
    expect(cameraOf(jpegWithExif({ make: "A".repeat(80), model: "" }))).toMatchObject({ make: "A".repeat(64), model: null });
  });
  it("a bad Exif sub-IFD pointer keeps make/model with taken_at null; control characters (C0, C1) are removed", () => {
    // jpegWithExif: JPEG 2 + APP1 4 + "Exif  " 6 + TIFF; IFD0 entries at TIFF 10, sorted 010f, 0110, 8769 -> the 3rd entry's value at TIFF 10+24+8
    const bad = Buffer.from(jpegWithExif({})); bad.writeUInt32LE(0x7fffffff, 2 + 4 + 6 + 10 + 24 + 8);
    expect(cameraOf(bad)).toEqual({ make: "Example", model: "Test Cam 1", taken_at: null, gps: false });
    expect(cameraOf(jpegWithExif({ make: "Example" }))).toMatchObject({ make: "Example" });
  });
  it("is null for no APP1, no make/model, a bad header or a truncated IFD", () => {
    expect(cameraOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
    expect(cameraOf(jpegWithExif({ make: "", model: "" }))).toBeNull();
    expect(cameraOf(Buffer.from("not a jpeg at all"))).toBeNull();
    expect(cameraOf(null)).toBeNull();
    const full = jpegWithExif({ gps: true });
    for (const n of [30, 40, 60, 90]) expect(cameraOf(full.subarray(0, n))).toBeNull();
    const bad = Buffer.from(full); bad.writeUInt32LE(0x00ffffff, 4 + 2 + 2 + 6 + 4 - 2); // IFD0 offset (TIFF offset 4) far outside
    expect(cameraOf(bad)).toBeNull();
  });
  it("photoRefusal: a PNG and a file without camera data are refused in words; a camera's JPEG is not", () => {
    expect(photoRefusal({ format: "png", camera: { make: "A", model: null, taken_at: null, gps: false } })).toMatch(/^a \.png photo is a screenshot or an export/);
    expect(photoRefusal({ format: "jpg", camera: null })).toBe("this photo carries no camera data (EXIF make and model) — a screenshot or a saved web image is not admitted as your own photo (attestation d); admit the camera's original file");
    expect(photoRefusal({ format: "jpg", camera: { make: "A", model: null, taken_at: null, gps: false } })).toBeNull();
  });
  it("validatePack: capture is exactly {make, model, taken_at, gps}, on a photo only", () => {
    const pack = packWith(["a", "c", "d"]);
    const item = (cap, over = {}) => ({ ...photoItem(pack), capture: cap, ...over });
    const ok = { make: "A", model: null, taken_at: null, gps: false };
    expect(validatePack({ ...pack, items: [item(ok)] })).toBe(true);
    const fails = (cap, over) => expect(() => validatePack({ ...pack, items: [item(cap, over)] })).toThrow(/items\[0\]\.capture is a photo's/);
    fails({ ...ok, lat: 1 }); fails({ ...ok, make: null }); fails({ ...ok, gps: "yes" }); fails({ ...ok, taken_at: "x".repeat(17) }); fails("A");
    expect(() => validatePack({ ...packWith(["a", "c"]), items: [{ ...scanItem(packWith(["a", "c"])), capture: ok }] })).toThrow(/capture is a photo's/);
  });
});

describe("delete-by, expiry and retire (MA-7-5)", () => {
  const TODAY = "2026-10-13";
  const words = "delete_by must be a date from today (today retires it now) to ten years ahead, as 2026-12-31 — nothing was saved";
  it("readDeleteBy: a real date from today to ten years ahead; why is one line of at most 300", () => {
    expect(readDeleteBy({ date: "2026-12-31" }, TODAY)).toEqual({ delete_by: "2026-12-31", why: null });
    expect(readDeleteBy({ date: TODAY, why: " owner asked " }, TODAY)).toEqual({ delete_by: TODAY, why: "owner asked" });
    expect(readDeleteBy({ date: "2036-10-10" }, TODAY).delete_by).toBe("2036-10-10");
    for (const date of ["31/12/2026", "2026-02-30", "2026-10-11", "2036-10-11", "", undefined, 20261231]) expect(() => readDeleteBy({ date }, TODAY), String(date)).toThrow(words);
    expect(readDeleteBy({ date: "2026-10-12" }, TODAY).delete_by).toBe(TODAY); // review: a client one UTC day behind means today
    expect(() => readDeleteBy({ date: TODAY, why: "x".repeat(301) }, TODAY)).toThrow(/why must be one line/);
    expect(() => readDeleteBy({ date: TODAY, why: "a\nb" }, TODAY)).toThrow(/why must be one line/);
  });
  it("due: the dated items whose day has come and that are not expired", () => {
    const items = [{ id: "a", delete_by: "2026-10-13" }, { id: "b", delete_by: "2026-10-14" }, { id: "c" }, { id: "d", delete_by: "2026-01-01", state: "expired" }, { id: "e", delete_by: "2026-01-01" }];
    expect(due({ items }, TODAY).map((i) => i.id)).toEqual(["a", "e"]);
  });
  it("removable: never an own file — a blurred copy and a web item's own file only", () => {
    const own = { id: "ev-0001", path: "photos/own.jpg", sha256: SHA };
    expect(removable(own)).toEqual([]);
    expect(removable({ ...own, view_copy: { sha256: "b".repeat(64) } })).toEqual([{ path: ".sentinel/view/ev-0001.jpg", sha256: "b".repeat(64) }]);
    expect(removable({ ...own, role: "context", view_copy: { sha256: "b".repeat(64) } }).map((r) => r.path)).toEqual([".sentinel/view/ev-0001.jpg", "photos/own.jpg"]);
    for (const kind of ["scan", "drawing", "model"]) expect(removable({ ...own, kind })).toEqual([]);
  });
  it("expire keeps the record and the sha; the row says the office's file is not touched; an expired item validates, a bad state or date does not", () => {
    const pack = packWith(["a", "c"]), it0 = { ...scanItem(pack), delete_by: TODAY, delete_why: "owner asked" };
    const gone = expire(it0, "2026-10-13T10:00:00.000Z", []);
    expect(gone).toMatchObject({ state: "expired", sha256: it0.sha256, provider: "own", licence: "owner-supplied", removed: [] });
    expect(validatePack({ ...pack, items: [gone] })).toBe(true);
    expect(expiredValue("evp-0001", gone, 9)).toMatchObject({ item_id: "ev-0001", sha256: gone.sha256, delete_by: TODAY, removed: [], kept: "hash and record", office_file: "not touched — delete it by hand if the owner asked", pack_version: 9 });
    expect(expiredValue("evp-0001", { ...gone, role: "context" }, 9).office_file).toBeNull();
    expect(() => validatePack({ ...pack, items: [{ ...it0, state: "gone" }] })).toThrow(/state is "changed", "expired" or absent/);
    expect(() => validatePack({ ...pack, items: [{ ...it0, delete_by: "31/12/2026" }] })).toThrow(/delete_by is a date/);
    expect(() => validatePack({ ...pack, items: [{ ...it0, state: "expired" }] })).toThrow(/removed/);
    expect(() => validatePack({ ...pack, items: [{ ...gone, removed: ["../x"] }] })).toThrow(/removed/);
    expect(() => validatePack({ ...pack, items: [{ ...gone, removed: ["a", "b", "c"] }] })).toThrow(/removed/);
  });
  it("readAdmitBody: .sentinel/ is Sentinel's own folder", () => {
    expect(() => readAdmitBody({ path: ".sentinel/view/x.jpg", kind: "photo" })).toThrow(".sentinel/ is Sentinel's own folder (blurred copies) — nothing was saved");
    expect(() => readAdmitBody({ path: ".Sentinel/x.jpg", kind: "photo" })).toThrow(/own folder/);
    expect(readAdmitBody({ path: "photos/.sentinel.jpg", kind: "photo" }).path).toBe("photos/.sentinel.jpg");
  });
});

describe("MA-7-6: the NOTICE text", () => {
  const T = (name, version, licence) => ({ name, version, ...(licence ? { licence } : {}) });
  const R = (tools, claimed = false) => ({ id: 1, action: "build:run job-1 \u00b7 done", new_value: { claimed, tools } });
  const base = () => {
    const pack = packWith(["a", "b", "c"]);
    pack.requests = [{ id: "req-0001", recipient_kind: "architect", recipient: "Name", documents: ["plans"], purpose: null, letter: "L", letter_sha256: createHash("sha256").update("L", "utf8").digest("hex"), drafted_by: "x@example.test", drafted_at: "2026-10-08T10:00:00.000Z" }];
    const own = scanItem(pack), own2 = { ...scanItem(pack, { id: "ev-0002" }), path: "scans/b.las" };
    const dwg = newItem({ id: "ev-0003", input: { path: "d/a.pdf", kind: "drawing", provider: "own" }, format: "pdf", sha256: SHA, size_bytes: 9, report: null, pack, who: "c@example.test", at: "2026-10-08T10:01:00.000Z", request: pack.requests[0] });
    const ven = { ...own, id: "ev-0009", kind: "model", format: "ifc", path: "m/v.ifc", provider: "Acme Models", licence: "commercial", licence_ref: "PO-7" };
    return { ...pack, items: [own, own2, dwg, ven] };
  };
  const args = (rows) => ({ pack: base(), version: 3, rows, today: "2026-10-13" });
  const rowsA = [R([T("numpy", "2.4.6", "BSD-3-Clause"), T("sentinel-survey", "0.6.0", "LicenseRef-Sentinel")]), R([T("numpy", "2.4.6", "BSD-3-Clause"), T("laspy", "2.7.0", "BSD-2-Clause")])];
  it("same input, same text; rows in another order, the same text; LF only", () => {
    const t = noticeText(args(rowsA));
    expect(noticeText(args(rowsA))).toBe(t);
    expect(noticeText(args([...rowsA].reverse()))).toBe(t);
    expect(t).not.toContain("\r");
  });
  it("the title, drawing, vendor, own count, tools and the closing line all appear", () => {
    const t = noticeText(args(rowsA)).split("\n");
    expect(t[0]).toBe("NOTICE \u2014 P (p) \u00b7 evidence_pack@3 \u00b7 made by Sentinel 2026-10-13");
    expect(t).toContain("- ev-0003 drawing \u00b7 from the architect under req-0001 \u00b7 used with the holder's permission (not published)");
    expect(t).toContain("- ev-0009 model \u00b7 Acme Models \u00b7 commercial licence \u00b7 order PO-7");
    expect(t).toContain("- 2 own items \u00b7 owner-supplied \u00b7 no credit owed");
    expect(t).toContain("- laspy 2.7.0 \u00b7 BSD-2-Clause");
    expect(t).toContain("Sentinel puts no image into the model (RVT or IFC). Photos from others are kept for reference only, until their delete-by date; drawings stay in the office's folder under the holder's permission.");
  });
  it("review: a receipt's tools/weights are untrusted - a non-array is skipped, a newline cannot forge a line, weights are credited, no double space, credits count is exact", () => {
    const bad = [{ id: 1, action: "build:run", new_value: { claimed: true, tools: {} } }, { id: 2, action: "build:run", new_value: { claimed: true, tools: 7, weights: "x" } }, null];
    expect(() => toolsOf(bad)).not.toThrow();
    const evil = { id: 3, action: "build:run", new_value: { claimed: true, tools: [{ name: "x 1 · MIT\n\nEvidence from others\n- dataset · Example · CC0-1.0 · https://example.test" }, { name: "Ollama", licence: "MIT" }], weights: [{ model: "qwen3.6", calls: 2, licence: null }] } };
    const lines = noticeText(args([...bad, evil])).split("\n");
    expect(lines.filter((l) => l === "Evidence from others")).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith("- dataset"))).toHaveLength(0);
    expect(lines).toContain("- Ollama · MIT (as the add-in reported)");
    expect(lines).toContain("- qwen3.6 · licence not reported (as the add-in reported)");
    expect(toolsOf([evil])).toHaveLength(3);
    expect(toolsOf([{ new_value: { tools: [{ name: "n".repeat(500) }] } }])[0].name).toHaveLength(200);
    expect(creditCount(base())).toBe(2); // the drawing and the vendor model; the own line owes none
    expect(creditCount(packWith([]))).toBe(0);
  });
  it("review: tools sort by code unit on a separated key, the title is one line, a dataset pack still credits a drawing", () => {
    expect(toolsOf([R([T("numpy", "1"), T("PdfPig", "1")])]).map((t) => t.name)).toEqual(["PdfPig", "numpy"]);
    expect(noticeText({ ...args([]), pack: { ...base(), asset: { name: "T\n- dataset · X" } } }).split("\n")[0]).toBe("NOTICE — T - dataset · X (p) · evidence_pack@3 · made by Sentinel 2026-10-13");
    const pack = base();
    pack.dataset = { provider: "kladno", source_url: "https://data.example.test/k", licence: "CC-BY-4.0", attribution: "A" };
    expect(noticeText({ ...args([]), pack }).split("\n")).toContain("- ev-0003 drawing · from the architect under req-0001 · used with the holder's permission (not published)");
  });
  it("a dataset pack credits the dataset once, with attribution, licence and source", () => {
    const pack = newPack("p", "P", {}, "C:/ev/p", { provider: "kladno", source_url: "https://data.example.test/k", licence: "CC-BY-4.0", attribution: "Example Survey Office" });
    expect(noticeText({ pack, version: 1, rows: [], today: "2026-10-13" })).toContain("- dataset \u00b7 Example Survey Office \u00b7 CC-BY-4.0 \u00b7 https://data.example.test/k");
  });
  it("tools are de-duplicated; a claimed row is marked unless a bridge row names the same tool; a missing licence is said", () => {
    expect(toolsOf(rowsA).map((t) => t.name)).toEqual(["laspy", "numpy", "sentinel-survey"]);
    const t = noticeText(args([R([T("revit-addin", "1.0.0", "proprietary")], true), R([T("numpy", "2.4.6")], true), R([T("numpy", "2.4.6")]), R([T("nolicence", "1")])]));
    expect(t).toContain("- revit-addin 1.0.0 \u00b7 proprietary (as the add-in reported)");
    expect(t).toContain("- numpy 2.4.6 \u00b7 licence not reported\n");
    expect(t).toContain("- nolicence 1 \u00b7 licence not reported\n");
  });
  it("an empty section says (none yet); an expired item stays credited; a web photo's credit carries its author and the drill words", () => {
    const empty = noticeText({ pack: packWith([]), version: 1, rows: [], today: "2026-10-13" });
    expect(empty.match(/\(none yet\)/g)).toHaveLength(2);
    const pack = base();
    const gone = expire({ ...pack.items[2] }, "2026-10-12T10:00:00.000Z", []);
    expect(noticeText({ ...args([]), pack: { ...pack, items: [gone] } })).toContain("(not published)");
    const web = { ...pack.items[0], id: "ev-0010", role: "context", licence: "CC-BY-4.0", state: "expired", expired_at: "2026-10-13T00:00:00.000Z", web: { source_url: "https://commons.example.test/x", author: "A. Author", attribution_text: "Photo by A", retrieved_at: "2026-10-12T08:00:00.000Z", web_mode: "drill" } };
    expect(noticeText({ ...args([]), pack: { ...pack, items: [web] } })).toContain('- ev-0010 photo \u00b7 "Photo by A" \u00b7 A. Author \u00b7 CC-BY-4.0 \u00b7 https://commons.example.test/x \u00b7 retrieved 2026-10-12 \u00b7 drill: counsel has not reviewed web evidence \u00b7 expired 2026-10-13');
  });
});

describe("MA-7-7: a photo's blurred copy", () => {
  const ph = (over = {}) => ({ id: "ev-0004", kind: "photo", state: undefined, view_copy: VC(), ...over });
  it("usable(): a copy-bearing own photo is usable for every use; each refusal says why", () => {
    for (const u of ["view", "read", "type", "cite", "train", "register"]) expect(usable(ph(), u)).toBeNull();
    expect(usable(ph({ state: "expired", expired_at: "2026-10-12T00:00:00.000Z" }), "read")).toBe("ev-0004 expired on 2026-10-12 (delete-by) — it is not used; nothing was read");
    expect(usable(ph({ state: "changed" }), "view")).toContain("ev-0004 changed since it was admitted");
    expect(usable({ id: "ev-0001", kind: "scan" }, "read")).toBe("ev-0001 is a scan, not a photo; nothing was read");
    expect(usable(ph({ view_copy: undefined }), "read")).toBe("ev-0004 has no blurred copy yet — mark its faces and number plates first (Mark faces and plates); nothing was read");
    expect(usable(ph({ view_copy: undefined }), "view")).toContain("has no blurred copy yet");
    expect(() => usable(ph(), "edit")).toThrow("unknown use");
  });
  it("usable(): a web (context) photo is viewable only with the switch on, and never read, typed, trained or registered", () => {
    const web = ph({ role: "context" });
    for (const u of ["read", "type", "train", "register"]) expect(usable(web, u)).toContain("web photo — context only");
    expect(usable(web, "view")).toBe("web evidence is off until counsel has reviewed it — this web photo is kept, not shown; nothing was shown");
    expect(usable(web, "view", { webMode: "drill" })).toBeNull();
    expect(usable(web, "cite")).toBeNull();
  });
  it("readBoxes(): boxes, or the explicit none answer — never a default; fractions inside the photo", () => {
    expect(readBoxes({ boxes: [{ x: 0.1, y: 0.2, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5, what: "plate" }] }))
      .toEqual({ boxes: [{ x: 0.1, y: 0.2, w: 0.1, h: 0.1, what: "face" }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5, what: "plate" }], none_seen: false });
    expect(readBoxes({ none_seen: true })).toEqual({ boxes: [], none_seen: true });
    expect(() => readBoxes({})).toThrow('mark the faces and number plates, or answer "No faces or number plates in this photo" — nothing was saved');
    expect(() => readBoxes({ none_seen: true, boxes: [{ x: 0, y: 0, w: 1, h: 1 }] })).toThrow("cannot be true with boxes marked");
    for (const bad of [{ x: 0.9, y: 0, w: 0.3, h: 0.1 }, { x: 0, y: 0, w: 0, h: 0.1 }, { x: "0", y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1, what: "car" }, null])
      expect(() => readBoxes({ boxes: [bad] }), JSON.stringify(bad)).toThrow(/boxes\[0\]/);
    expect(readBoxes({ none_seen: true, shown: { w: 400, h: 600 } })).toEqual({ boxes: [], none_seen: true, shown: { w: 400, h: 600 } }); // MA-7-7 review: the size the marker showed
    for (const bad of [{ w: 0, h: 5 }, { w: 1.5, h: 5 }, "400x600", { w: 400 }, null]) expect(() => readBoxes({ none_seen: true, shown: bad }), JSON.stringify(bad)).toThrow(/shown must be/);
    expect(() => readBoxes({ boxes: Array(201).fill({ x: 0, y: 0, w: 1, h: 1 }) })).toThrow("at most 200");
  });
  it("validatePack: view_copy is a photo's, with its counts agreeing; none_seen exactly when no area was marked", () => {
    const pack = packWith(["a", "c", "d"]);
    const item = photoItem(pack), ok = (vc, it = item) => validatePack({ ...pack, items: [{ ...it, view_copy: vc }] });
    expect(ok(VC())).toBe(true);
    expect(ok(VC({ areas: 0, faces: 0, plates: 0, none_seen: true }))).toBe(true);
    for (const [why, vc] of [["areas != faces + plates", VC({ areas: 3 })], ["no areas without none_seen", VC({ areas: 0, faces: 0, plates: 0 })], ["none_seen with areas", VC({ none_seen: true })],
      ["a long side over 2048", VC({ width: 4000 })], ["a bad sha", VC({ sha256: "x" })], ["another method", VC({ method: "detector" })]]) expect(() => ok(vc), why).toThrow(/view_copy/);
    expect(() => validatePack({ ...pack, items: [{ ...scanItem(pack), view_copy: VC() }] })).toThrow(/view_copy/);
  });
  it("blurredValue(): counts and tools only — no coordinates; gps_removed follows the camera record", () => {
    const i = { id: "ev-0004", path: "photos/a.jpg", sha256: SHA, capture: { make: "E", model: "C", taken_at: null, gps: true } };
    const v = blurredValue("evp-0001", i, { ...VC(), tools: [{ name: "pillow", version: "12.3.0", licence: "MIT-CMU" }] }, 7);
    expect(v).toMatchObject({ item_id: "ev-0004", original_sha256: SHA, copy_sha256: "b".repeat(64), areas: 2, faces: 1, plates: 1, gps_removed: true, metadata_removed: true, pack_version: 7 });
    expect(JSON.stringify(v)).not.toMatch(/"(x|y|w|h|boxes)"/);
    expect(blurredValue("evp-0001", { ...i, capture: { ...i.capture, gps: false } }, VC(), 7).gps_removed).toBe(false);
    expect(blurredValue("evp-0001", { ...i, capture: undefined }, VC(), 7).gps_removed).toBe(null); // admitted before 7-4: never looked for, so not claimed
    expect(blurredValue("evp-0001", i, VC({ areas: 0, faces: 0, plates: 0, none_seen: true }), 7).none_seen).toBe(true);
  });
});

// MA-7-12 — Wikimedia Commons admission behind the switch (pure rules)
import { readWebBody, webPhotoRefusals, webDeleteBy, newWebItem, fopOf, WEB_ADMITTED, admittedValue, creditLines } from "./evidence-logic.mjs";
import { SOURCES } from "./web-sources.mjs";

describe("a web photo (MA-7-12)", () => {
  const W = (over = {}) => ({ licence: "CC-BY-4.0", source_url: "https://commons.wikimedia.org/wiki/File:Example_building.jpg", author: "Example Author", attribution_text: "Photo: Example Author, CC BY 4.0", retrieved_at: "2026-10-08", terms_path: "web/commons-1.html", ...over });
  const TODAY = "2026-10-08";
  const refusals = (web = {}, over = {}) => webPhotoRefusals({ provider: "wikimedia-commons", web: W(web), jurisdiction: "GB", format: "jpg", ...over });
  const webPack = (over = {}) => ({ ...newPack("p", "P", { jurisdiction: "GB" }, "C:/ev/p"), attestations: signed(["a", "c", "d", "g"]), ...over });
  const webItem = (pack, over = {}) => {
    const vc = { sha256: "b".repeat(64), size_bytes: 5000, width: 1024, height: 768, areas: 0, faces: 0, plates: 0, none_seen: true, method: "person-marked", marked_by: "lead@example.test", marked_at: "2026-10-08T10:00:00.000Z", tool: "sentinel-blur 0.1.0" };
    return { ...newWebItem({ id: "ev-0001", input: { path: "web/commons-1.jpg", provider: "wikimedia-commons" }, web: { ...readWebBody(W(), TODAY), terms_sha256: "c".repeat(64) }, original: { sha256: SHA, size_bytes: 9000 }, vc, delete_by: "2026-10-09", mode: "drill", pack, who: "lead@example.test", at: "2026-10-08T10:01:00.000Z" }), ...over };
  };

  it("a web photo needs (a), (d) and (g) - not (c); an own photo still (a), (c), (d); a dataset pack (f) alone", () => {
    expect(needsOf(packWith([]), "photo", "wikimedia-commons")).toEqual(["a", "d", "g"]);
    expect(needsOf(packWith([]), "photo", "own")).toEqual(["a", "c", "d"]);
    expect(needsOf(packWith([]), "photo")).toEqual(["a", "c", "d"]);
    expect(needsOf({ dataset: {} }, "photo", "wikimedia-commons")).toEqual(["f"]);
  });

  it("readAdmitBody carries web and blur only for a website photo, as objects", () => {
    const b = readAdmitBody({ path: "web/a.jpg", kind: "photo", provider: "Wikimedia-Commons", web: W(), blur: { none_seen: true } });
    expect(b).toMatchObject({ provider: "wikimedia-commons", web: W(), blur: { none_seen: true } });
    expect(readAdmitBody({ path: "web/a.jpg", kind: "photo" })).not.toHaveProperty("web");
    for (const bad of [{ kind: "photo", web: W() }, { kind: "scan", provider: "x", web: W() }, { kind: "photo", provider: "wikimedia-commons", web: "x" }, { kind: "photo", provider: "wikimedia-commons", blur: [] }])
      expect(() => readAdmitBody({ path: "web/a.jpg", ...bad })).toThrow(/belongs to a website photo only/);
  });

  it("readWebBody: the page's record, one line each; a 400 names the field", () => {
    expect(readWebBody(W({ author: "  Example\n Author " }), TODAY)).toEqual({ ...W({ author: "Example Author" }), delete_by: null });
    const bad = (web, re) => expect(() => readWebBody(web, TODAY)).toThrow(re);
    bad(null, /^web must be/);
    bad(W({ licence: "" }), /web\.licence must be one line/);
    bad(W({ author: "x".repeat(201) }), /web\.author/);
    bad(W({ attribution_text: 5 }), /web\.attribution_text/);
    bad(W({ source_url: "http://commons.wikimedia.org/wiki/File:A.jpg" }), /web\.source_url must be the photo's page address/);
    bad(W({ source_url: "https://user:pw@commons.wikimedia.org/wiki/File:A.jpg" }), /user name or password/);
    bad(W({ retrieved_at: "2026-10-09" }), /web\.retrieved_at/); // tomorrow
    bad(W({ retrieved_at: "2026-02-30" }), /web\.retrieved_at/);
    bad(W({ terms_path: "../x.html" }), /web\.terms_path/);
    bad(W({ terms_path: ".sentinel/view/a.html" }), /web\.terms_path/);
    bad(W({ delete_by: "soon" }), /web\.delete_by/);
    expect(readWebBody(W({ delete_by: "2026-12-31" }), TODAY).delete_by).toBe("2026-12-31");
  });

  it("webPhotoRefusals: CC0, PDM and CC BY pass; SA is held; NC and ND are never admitted (CM-3)", () => {
    for (const l of ["CC0-1.0", "PDM-1.0", "CC-BY-2.0", "CC-BY-2.5", "CC-BY-3.0", "CC-BY-4.0"]) expect(refusals({ licence: l })).toEqual([]);
    for (const l of ["CC-BY-NC-4.0", "CC-BY-SA-4.0", "CC-BY-ND-4.0", "All rights reserved"])
      expect(refusals({ licence: l })).toEqual([`${l} is not admitted — a web photo's licence must allow commercial use: CC0, public domain or CC BY (CC BY-SA waits for counsel)`]);
  });

  it("webPhotoRefusals: only Commons (commons.wikimedia.org, upload.wikimedia.org/wikipedia/commons/); RED by label; English Wikipedia's files are not Commons", () => {
    expect(refusals({ source_url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg" })).toEqual([]);
    expect(refusals({ source_url: "https://www.flickr.com/photos/x/1" })[0]).toBe("www.flickr.com is Flickr, not Wikimedia Commons — a lead admits Commons photos only for now");
    expect(refusals({ source_url: "https://www.google.com/maps" })).toEqual(["www.google.com is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(refusals({ source_url: "https://upload.wikimedia.org/wikipedia/en/a/ab/x.jpg" })).toEqual(["that file is on English Wikipedia, not Wikimedia Commons — Commons files only (upload.wikimedia.org/wikipedia/commons/…)"]);
    expect(refusals({ source_url: "https://example.test/photo.jpg" })[0]).toMatch(/^example\.test is not Wikimedia Commons/);
    expect(refusals({}, { provider: "flickr" })).toEqual(["flickr is not a source Sentinel admits photos from yet — Wikimedia Commons only (provider wikimedia-commons)"]);
    expect(refusals({}, { format: "png" })).toEqual(["a web photo is admitted as a JPEG (.jpg) — save the Commons file as a JPEG"]);
    expect(WEB_ADMITTED).toEqual(["wikimedia-commons"]);
  });

  it("freedom of panorama: yes only where a statute stands behind it; no and unknown refuse, in 'not legal advice' words (D-7-13, amendment 6)", () => {
    expect(fopOf("GB")).toEqual({ fop: "yes", statute: "CDPA s.62", code: "GB" });
    expect(fopOf("US").statute).toBe("17 USC §120(a), buildings");
    expect(fopOf("DE").statute).toBe("§59 UrhG, views from public ground");
    for (const j of ["JO", "FR", "IT"]) expect(fopOf(j).fop).toBe("no");
    for (const j of ["SA", "AE", "EG", "Jordan", "gb", "", null, undefined, "constructor", "__proto__"]) expect(fopOf(j).fop).toBe("unknown");
    expect(refusals({}, { jurisdiction: "JO" })).toEqual(["freedom of panorama does not cover JO — a photo of a building there may infringe its architect's copyright, so a web photo of this asset is not admitted (not legal advice; counsel confirms)"]);
    expect(refusals({}, { jurisdiction: "AE" })[0]).toMatch(/^freedom of panorama is not known for "AE" .*not legal advice; counsel confirms/);
    expect(refusals({}, { jurisdiction: null })[0]).toMatch(/^freedom of panorama is not known for this asset \(the pack names no jurisdiction\)/);
    expect(refusals({ licence: "CC-BY-NC-4.0" }, { jurisdiction: "JO" })).toHaveLength(2); // every reason is said
  });

  it("webDeleteBy: a drill expires the next day; otherwise the day asked for, never past the source's limit (365 days for Commons)", () => {
    const src = SOURCES.find((s) => s.id === "wikimedia-commons");
    expect(webDeleteBy({ mode: "drill", today: TODAY, source: src, asked: "2027-01-01" })).toBe("2026-10-09");
    expect(webDeleteBy({ mode: "on", today: TODAY, source: src, asked: null })).toBe("2027-10-08");
    expect(webDeleteBy({ mode: "on", today: TODAY, source: src, asked: "2026-12-31" })).toBe("2026-12-31");
    for (const asked of [TODAY, "2027-10-09", "2020-01-01"]) expect(() => webDeleteBy({ mode: "on", today: TODAY, source: src, asked })).toThrow(/web\.delete_by must be after today and no later than 2027-10-08/);
  });

  it("a web item validates: context only, the page's record exactly, the copy is the file (amendment 18)", () => {
    const pack = webPack();
    const item = webItem(pack);
    expect(item).toMatchObject({ role: "context", provider: "wikimedia-commons", licence: "CC-BY-4.0", surveyable: false, format: "jpg", sha256: "b".repeat(64), original_sha256: SHA, delete_by: "2026-10-09" });
    expect(item.allowed_uses).toEqual({ ...USES, geometry_extraction: false });
    expect(item.attestation_ids).toEqual(["att-0001", "att-0003", "att-0004"]); // a, d, g
    expect(Object.keys(item).every((k) => ITEM_FIELDS.includes(k))).toBe(true);
    expect(validatePack({ ...pack, items: [item] })).toBe(true);
    const no = (over, re) => expect(() => validatePack({ ...pack, items: [{ ...item, ...over }] })).toThrow(re);
    no({ web: { ...item.web, extra: 1 } }, /items\[0\]\.web is the page's record exactly/);
    no({ web: { ...item.web, freedom_of_panorama: "no" } }, /items\[0\]\.web/);
    no({ web: { ...item.web, web_mode: "off" } }, /items\[0\]\.web/);
    no({ web: { ...item.web, terms_sha256: "x" } }, /items\[0\]\.web/);
    no({ allowed_uses: { ...item.allowed_uses, geometry_extraction: true } }, /context only: geometry_extraction false/);
    no({ view_copy: { ...item.view_copy, sha256: "d".repeat(64) } }, /its blurred copy/);
    no({ view_copy: undefined }, /its blurred copy/);
    no({ delete_by: undefined }, /carries a delete-by day/);
    no({ original_sha256: undefined }, /original's sha256/);
    no({ licence: "CC-BY-SA-4.0" }, /is a web photo: a JPEG/);
    no({ provider: "google" }, /is a web photo: a JPEG/);
    no({ provider: "openverse" }, /is a web photo: a JPEG/); // a finder, never evidence
    no({ format: "png", path: "web/a.png" }, /is a web photo: a JPEG|format/);
    no({ request_id: "req-0001" }, /is a web photo/);
    no({ surveyable: true }, /surveyable/);
    no({ attestation_ids: ["att-0001", "att-0002", "att-0003"] }, /attestation_ids/); // (g) missing
    no({ role: "other" }, /is own|role/);
    expect(() => validatePack({ ...packWith(["a", "c", "d"], []), items: [{ ...photoItem(packWith(["a", "c", "d"])), web: item.web }] })).toThrow(/is own/);
    expect(() => validatePack({ ...packWith(["a", "c", "d"]), items: [{ ...photoItem(packWith(["a", "c", "d"])), role: "context" }] })).toThrow(/is a web photo: a JPEG/);
  });

  it("(g) is signable on an own pack and never on a dataset pack; a pack holds up to 8 attestations", () => {
    expect(() => validatePack(packWith(["a", "b", "c", "d", "e", "g"]))).not.toThrow();
    expect(() => validatePack({ ...packWith(["g"]), dataset: { provider: "x", source_url: "https://example.test/d", licence: "CC0-1.0", attribution: "x" } })).toThrow(/must be \(f\) on a published dataset's pack/);
  });

  it("the ledger row holds the page's record and the author only as a sha256 of the attribution (amendment 5); a drill row says so", () => {
    const pack = webPack(), item = webItem(pack);
    const v = admittedValue("evp-0001", item, 6, false);
    expect(v).toMatchObject({ role: "context", licence: "CC-BY-4.0", web: { source_url: item.web.source_url, retrieved_at: "2026-10-08", terms_sha256: "c".repeat(64), freedom_of_panorama: "yes", delete_by: "2026-10-09", web_mode: "drill",
      attribution_sha256: createHash("sha256").update("Photo: Example Author, CC BY 4.0", "utf8").digest("hex") }, counsel: "counsel has not reviewed web evidence" });
    expect(JSON.stringify(v)).not.toContain("Example Author");
    const on = admittedValue("evp-0001", { ...item, web: { ...item.web, web_mode: "on" } }, 6, false);
    expect(on.counsel).toBeUndefined();
    expect(admittedValue("evp-0001", photoItem(packWith(["a", "c", "d"])), 3, false)).not.toHaveProperty("web"); // an own photo's row is unchanged
  });

  it("the NOTICE credits a web photo with author, licence, URL and retrieved date, and says it was a drill", () => {
    const pack = webPack(), item = webItem(pack);
    const { from } = creditLines({ ...pack, items: [item] });
    expect(from).toEqual([`- ev-0001 photo · "Photo: Example Author, CC BY 4.0" · Example Author · CC-BY-4.0 · https://commons.wikimedia.org/wiki/File:Example_building.jpg · retrieved 2026-10-08 · drill: counsel has not reviewed web evidence`]);
  });

  it("every consumer refuses a web photo for read, type, train and register; it is viewed only while the switch is not off (amendments 11, 14)", () => {
    const item = webItem(webPack());
    for (const use of ["read", "type", "train", "register"]) expect(usable(item, use, { webMode: "drill" })).toMatch(/is a web photo — context only/);
    expect(usable(item, "view", { webMode: "off" })).toBe("web evidence is off until counsel has reviewed it — this web photo is kept, not shown; nothing was shown");
    expect(usable(item, "view", { webMode: "drill" })).toBe(null);
  });
});

// MA-7-11 - a Gaussian splat: the evidence kind (format ply, a 3DGS header, 256 MB), the explicit answer an uploaded one needs, and a placement.
const plyHead = (props, fmt = "binary_little_endian 1.0") => Buffer.from(`ply\nformat ${fmt}\nelement vertex 1\n${props.map((p) => `property float ${p}`).join("\n")}\nend_header\n`, "latin1");
const GS = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
describe("a Gaussian splat (MA-7-11)", () => {
  const splatItem = (pack, over = {}) => newItem({ id: "ev-0001", input: { path: "splats/s.ply", kind: "splat", provider: "own", registration: null, no_people_or_plates: true }, format: "ply", sha256: SHA, size_bytes: 99, report: null, pack, who: "contributor@example.test", at: "2026-10-13T10:00:00.000Z", ...over });
  const splatPack = () => packWith(["a", "c", "d"]);
  it("the format table: ply is a splat, 256 MB, not surveyable; it needs (a), (c) and (d); the body carries the answer for a splat only", () => {
    expect(FORMATS.ply).toMatchObject({ kind: "splat", magic: "706c79", surveyable: false, max_bytes: 256 * 1024 * 1024 });
    expect(ADMIT_NEEDS.splat).toEqual(["a", "c", "d"]);
    expect(needsOf(splatPack(), "splat")).toEqual(["a", "c", "d"]);
    expect(readAdmitBody({ path: "splats/s.ply", kind: "splat", no_people_or_plates: true })).toMatchObject({ kind: "splat", no_people_or_plates: true });
    expect(readAdmitBody({ path: "splats/s.ply", kind: "splat" })).not.toHaveProperty("no_people_or_plates");
    expect(() => readAdmitBody({ path: "p/a.jpg", kind: "photo", no_people_or_plates: true })).toThrow("no_people_or_plates is true or false and belongs to a splat only — nothing was saved");
    expect(() => readAdmitBody({ path: "splats/s.ply", kind: "splat", no_people_or_plates: "yes" })).toThrow(/true or false/);
    expect(policyRefusals({ kind: "splat", provider: "own", path: "splats/s.ply" })).toEqual([]);
    expect(policyRefusals({ kind: "splat", provider: "google", path: "splats/s.ply" })[0]).toMatch(/^google is a RED source/);
    expect(policyRefusals({ kind: "splat", provider: "acme", path: "splats/s.ply" })[0]).toMatch(/^web and third-party items wait for a later stage/);
    expect(policyRefusals({ kind: "photo", provider: "own", path: "p/a.ply" })).toEqual(["a .ply is a splat, not a photo"]);
    expect(magicRefusal("ply", Buffer.from("ply\nformat"), "splat")).toBe(null);
    expect(magicRefusal("ply", Buffer.from("PK\x03\x04junk"), "splat")).toBe("the file does not begin as a .ply does — renamed or damaged");
    expect(sizeRefusal("ply", 256 * 1024 * 1024, "splat")).toBe(null);
    expect(sizeRefusal("ply", 257 * 1048576, "splat")).toBe("a .ply splat is at most 256 MB (this one is 257.0 MB) — it is not admitted; reduce it (fewer gaussians, SH degree 0)");
  });
  it("amendment 2: an uploaded splat needs the person's explicit answer, in the amendment's words", () => {
    const words = "a splat cannot be blurred after it is trained — train it in Sentinel from blurred photos (7-19), or confirm that no face or number plate is visible in it; nothing was saved";
    expect(newItemRefusal({ path: "splats/s.ply", kind: "splat" })).toBe(words);
    expect(newItemRefusal({ path: "splats/s.ply", kind: "splat", no_people_or_plates: false })).toBe(words);
    expect(newItemRefusal({ path: "splats/s.ply", kind: "splat", no_people_or_plates: true })).toBe(null);
  });
  it("splatHeaderRefusal: opacity, scale_0 and rot_0 in the header; a point cloud, a partial header, a headerless or non-ply file are refused in words", () => {
    expect(splatHeaderRefusal(plyHead(GS))).toBe(null);
    expect(splatHeaderRefusal(Buffer.concat([plyHead(GS), Buffer.alloc(40, 1)]))).toBe(null); // the body follows the header
    expect(splatHeaderRefusal(plyHead(["x", "y", "z", "red", "green", "blue"]))).toBe("this .ply is not a Gaussian splat (no opacity, scale_0, rot_0 in its header)");
    expect(splatHeaderRefusal(plyHead(GS.filter((p) => p !== "rot_0")))).toBe("this .ply is not a Gaussian splat (no rot_0 in its header)");
    expect(splatHeaderRefusal(Buffer.from("ply\nformat binary_little_endian 1.0\nproperty float opacity\n"))).toMatch(/^this \.ply has no header Sentinel can read/);
    expect(splatHeaderRefusal(Buffer.from("PK\x03\x04"))).toMatch(/^this \.ply has no header/);
    expect(splatHeaderRefusal(Buffer.from(plyHead(GS).toString("latin1").replace(/\n/g, "\r\n"), "latin1"))).toBe(null); // CRLF header lines
  });
  it("newItem and validatePack: looked at only (geometry_extraction false), the answer on the item and the row; made_with is the bridge's", () => {
    const pack = splatPack(), item = splatItem(pack);
    expect(item).toMatchObject({ kind: "splat", format: "ply", surveyable: false, no_people_or_plates: true, provider: "own", licence: "owner-supplied", attestation_ids: ["att-0001", "att-0002", "att-0003"],
      allowed_uses: { ...USES, geometry_extraction: false } });
    expect(validatePack({ ...pack, items: [item] })).toBe(true);
    expect(admittedValue("evp-0001", item, 4, false)).toMatchObject({ kind: "splat", format: "ply", no_people_or_plates: true, surveyable: false });
    const fails = (i, m) => expect(() => validatePack({ ...pack, items: [i] })).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining(m) }));
    const { no_people_or_plates: _n, ...bare } = item;
    fails(bare, "a splat carries the admitting person's answer");
    expect(validatePack({ ...pack, items: [{ ...bare, made_with: { tool: "gsplat", version: "1.0.0" } }] })).toBe(true);
    fails({ ...bare, made_with: { tool: "gsplat", version: "1.0.0", extra: 1 } }, "made_with");
    fails({ ...bare, made_with: { tool: "", version: "1" } }, "made_with");
    fails({ ...item, no_people_or_plates: false }, "is true or absent");
    fails({ ...item, allowed_uses: { ...item.allowed_uses, geometry_extraction: true } }, "a splat is for looking only");
    const photo = photoItem(packWith(["a", "c", "d"]));
    expect(() => validatePack({ ...packWith(["a", "c", "d"]), items: [{ ...photo, no_people_or_plates: true }] })).toThrow(/belongs to a splat only/);
  });
  it("splatUsable: a splat may be shown and placed unless expired or changed; a photo is not a splat", () => {
    const item = splatItem(splatPack());
    expect(splatUsable(item)).toBe(null);
    expect(splatUsable({ ...item, state: "expired", expired_at: "2026-10-14T00:00:00.000Z" }, "shown")).toBe("ev-0001 expired on 2026-10-14 (delete-by) — it is not used; nothing was shown");
    expect(splatUsable({ ...item, state: "changed" }, "saved")).toMatch(/changed since it was admitted.*nothing was saved$/);
    expect(splatUsable(photoItem(packWith(["a", "c", "d"])), "saved")).toBe("ev-0001 is a photo, not a splat; nothing was saved");
  });
  it("readPlacement (SP-5): 16 finite numbers, a bottom row of 0 0 0 1, a determinant above zero - a mirror, NaN, a flat or skewed matrix is a 400 in words", () => {
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const at = (over) => I.map((v, i) => (i in over ? over[i] : v));
    expect(readPlacement({ matrix: I })).toEqual({ matrix: I });
    expect(readPlacement({ matrix: at({ 12: 12.5, 13: -3, 14: 0.2, 0: 2, 5: 2, 10: 2 }) }).matrix[12]).toBe(12.5); // moved and scaled
    const c = Math.cos(0.7), s = Math.sin(0.7);
    expect(readPlacement({ matrix: at({ 0: c, 1: s, 4: -s, 5: c }) }).matrix).toHaveLength(16); // turned
    const bad = (b, m) => expect(() => readPlacement(b)).toThrow(expect.objectContaining({ status: 400, message: m }));
    bad({ matrix: at({ 0: -1 }) }, "matrix mirrors the splat (its determinant is below zero) — a placement moves, turns and scales — nothing was saved");
    bad({ matrix: at({ 0: 0, 5: 0 }) }, "matrix flattens the splat (its determinant is zero) — a placement keeps it solid — nothing was saved");
    bad({ matrix: at({ 3: 0.5 }) }, "matrix is not a placement: its bottom row must be 0 0 0 1 (move, turn, scale - no skew to a point) — nothing was saved");
    bad({ matrix: at({ 15: 2 }) }, "matrix is not a placement: its bottom row must be 0 0 0 1 (move, turn, scale - no skew to a point) — nothing was saved");
    for (const b of [{}, { matrix: I.slice(1) }, { matrix: at({ 12: NaN }) }, { matrix: at({ 12: Infinity }) }, { matrix: at({ 12: null }) }, { matrix: at({ 12: "1" }) }, { matrix: at({ 12: 2e9 }) }, { matrix: "x" }])
      bad(b, "matrix must be 16 finite numbers (a 4×4, column-major), none past 1e9 — nothing was saved");
    expect(JSON.parse(JSON.stringify({ matrix: at({ 12: NaN }) })).matrix[12]).toBe(null); // over the wire a NaN is a null: also refused
  });
  it("placedValue: the matrix, the splat's sha256, who and in what role; from_registration is null", () => {
    const item = splatItem(splatPack());
    expect(placedValue("evp-0001", item, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1], "lead@example.test", "lead")).toEqual({
      pack_id: "evp-0001", item_id: "ev-0001", matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1], sha256: SHA, actor: "lead@example.test", role: "lead", from_registration: null });
  });
});
