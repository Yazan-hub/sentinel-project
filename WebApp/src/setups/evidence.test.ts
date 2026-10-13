// MA-4a — the Evidence section's words and calls: the attestation texts are the bridge's pins (their sha256), a folder file's
// kind is its extension, every line is pinned, and a project with no pack reads as null — any other failure says "not read — …".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));

import { ATTESTATION_CODES, ATTESTATION_TEXTS, kindOf, needsReport, itemLine, attestationLine, admitLine, recheckLine, readEvidence,
  signAttestation, evidenceControls, requestLine, isImage, jobLine, candidateLine, surveyStartLine, surveyableScans, startSurvey, readJobs,
  photoProvider, MAP_SERVICES, PHOTO_SOURCES, proposeBody, frameDraft, proposeFromJob, proposeLine, choosablePhotos, choiceLine, datasetLine, type ProposeReply, type EvidenceItem, type EvidencePack, type EvidenceRequest, type SurveyJob,
  isDrawingJob, readableDrawings, drawingStartLine, startDrawing, isIfcJob, readableIfc, ifcStartLine, startIfc, startRecipe, webLine, noticeLine, readNotice, ifcHintLine, alignBody, alignPreview, drawingSvg, snapPaper, type AlignDraft } from "./evidence";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "ab".repeat(32);
const ITEM: EvidenceItem = {
  id: "ev-0001", kind: "scan", format: "las", sha256: "76c6b5e940d1" + "0".repeat(52), size_bytes: 2048, path: "scans/tiny.las", surveyable: true,
  admitted_by: "contributor@example.test", admitted_at: "2026-10-08T10:05:00.000Z", registration: { method: "registered in source" },
};
const PACK: EvidencePack = {
  pack_id: "evp-0001", storage_root: "evidence/demo", items: [ITEM],
  attestations: [{ id: "att-0001", code: "a", text_sha256: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546", by: "lead@example.test", role: "lead", at: "2026-10-08T10:00:00.000Z" }],
};

beforeEach(() => { bfetch.mockReset(); bwrite.mockReset(); });

describe("the attestation texts — the bridge's pins", () => {
  it("each text's sha256 is the one bridge/evidence-logic.test.mjs pins", () => {
    const pins: Record<string, string> = {
      a: "e5fdcf84d2436de3076c8153c4c1cf5748dfab29cbea6f76cdbdb36202782546",
      b: "a66c8e127c1f8e7217ad943f30db0dff7f9f9f025a6fc9c7a0c64afcb9288c92",
      c: "f6103bd87d440564df63796758df64fb7a0e9077aa766559a6b18f1cad041bbc",
      d: "6b4631aec9b8969a9129837fe830943418c6d1a0bc580f3f3336347592920f4a",
      e: "71656072b4e5b61196fcacd3fdf1d3f5b5ca19043cfe124159dca0cc788bc217",
    };
    expect([...ATTESTATION_CODES]).toEqual(["a", "b", "c", "d", "e"]);
    for (const c of ATTESTATION_CODES) expect(createHash("sha256").update(ATTESTATION_TEXTS[c]).digest("hex")).toBe(pins[c]);
    expect(createHash("sha256").update(ATTESTATION_TEXTS.f).digest("hex")).toBe("be54e04879d716b63add30ab9785ded25ffd6e83817a082489b4aa062be29022"); // MA-4h
    expect(createHash("sha256").update(ATTESTATION_TEXTS.g).digest("hex")).toBe("c86b607f02f44de7217f197596b985e43369bd724148007d628865e88b4e6afc"); // MA-7-12
  });
});

describe("kindOf and needsReport — by extension", () => {
  it("scans, photos, anything else; an RCP needs its report", () => {
    expect(kindOf("a/b.LAS")).toBe("scan");
    expect(kindOf("x.jpeg")).toBe("photo");
    expect(kindOf("r.txt")).toBeNull();
    expect(needsReport("s.RCP")).toBe(true);
    expect(needsReport("s.las")).toBe(false);
  });
});

describe("the lines", () => {
  it("itemLine: a flagged RCP says not surveyable and CHANGED", () => {
    const rcp: EvidenceItem = { ...ITEM, id: "ev-0003", format: "rcp", path: "scans/site.rcp", sha256: "0123456789ab" + "c".repeat(52), size_bytes: 900,
      surveyable: false, state: "changed", changed_at: "2026-10-08T11:00:00.000Z" };
    expect(itemLine(rcp)).toBe("ev-0003 · scans/site.rcp · rcp · 1 KB · sha 0123456789ab… · not surveyable (no ReCap here) · CHANGED since admitted — on hold; restore the file and Admit it again, or put the new file in under a new name");
    expect(itemLine(ITEM)).toBe("ev-0001 · scans/tiny.las · las · 2 KB · sha 76c6b5e940d1…");
  });
  it("itemLine (MA-7-5): a delete-by day, an expired scan the office keeps, a web item whose copies were removed", () => {
    expect(itemLine({ ...ITEM, delete_by: "2026-12-31" })).toBe("ev-0001 · scans/tiny.las · las · 2 KB · sha 76c6b5e940d1… · delete by 2026-12-31");
    const gone: EvidenceItem = { ...ITEM, delete_by: "2026-10-13", state: "expired", expired_at: "2026-10-13T10:00:00.000Z", removed: [] };
    expect(itemLine(gone)).toBe("ev-0001 · scans/tiny.las · las · 2 KB · sha 76c6b5e940d1… · EXPIRED 2026-10-13 — not read by any job; its record and sha stay; the office's file is not touched (delete it by hand if the owner asked)");
    expect(itemLine({ ...gone, removed: [".sentinel/view/ev-0001.jpg"] })).toBe("ev-0001 · scans/tiny.las · las · 2 KB · sha 76c6b5e940d1… · EXPIRED 2026-10-13 — Sentinel's copies removed; its record and sha stay; the office's file is not touched (delete it by hand if the owner asked)");
    expect(itemLine({ ...gone, role: "context", removed: ["photos/web.jpg"] })).toBe("ev-0001 · scans/tiny.las · las · 2 KB · sha 76c6b5e940d1… · EXPIRED 2026-10-13 — Sentinel's copies removed; its record and sha stay");
    expect(itemLine({ ...gone, not_removed: [{ path: ".sentinel/view/ev-0001.jpg", why: "x" }] })).toContain("1 could not be deleted yet — the next sweep tries again; its record and sha stay");
  });
  it("itemLine (MA-7-12): a Commons photo is a web photo, context only, with its author, licence, page and the drill note", () => {
    const web: EvidenceItem = { ...ITEM, kind: "photo", format: "jpg", path: "web/commons-1.jpg", role: "context", provider: "wikimedia-commons", licence: "CC-BY-4.0", delete_by: "2026-10-09",
      web: { source_url: "https://commons.wikimedia.org/wiki/File:A.jpg", author: "A. Author", attribution_text: "Photo: A. Author, CC BY 4.0", retrieved_at: "2026-10-08", terms_path: "web/commons-1.html", terms_sha256: "d".repeat(64), freedom_of_panorama: "yes", web_mode: "drill" } };
    const line = itemLine(web);
    expect(line).toContain(" · web photo, context only (assumed) · A. Author · CC-BY-4.0 · https://commons.wikimedia.org/wiki/File:A.jpg · retrieved 2026-10-08 · drill: counsel has not reviewed web evidence");
    expect(line).toContain(" · delete by 2026-10-09");
    expect(itemLine({ ...web, web: { ...web.web!, web_mode: "on" } })).not.toContain("drill");
  });
  it("attestationLine: signed and not signed", () => {
    expect(attestationLine("a", PACK)).toBe("(a) signed by lead@example.test (lead) · 2026-10-08 10:00");
    expect(attestationLine("b", PACK)).toBe("(b) not signed");
  });
  it("admitLine: admitted and refused", () => {
    expect(admitLine({ verdict: "admitted", item: ITEM, ledger: { id: 1201, hash: HASH } }))
      .toBe("✓ Admitted scans/tiny.las as ev-0001 · sha 76c6b5e940d1… · ledger #1201 · receipt abababababababab…");
    expect(admitLine({ verdict: "refused", path: "photos/x.jpg", reasons: ["google is a RED source — use your own photos", "the file is not a JPEG"], ledger: { id: 1202, hash: HASH } }))
      .toBe("Refused photos/x.jpg — google is a RED source — use your own photos; the file is not a JPEG · on hold · ledger #1202 · receipt abababababababab…");
  });
  it("recheckLine: one change, and none", () => {
    expect(recheckLine({ checked: 2, changed: [{ item_id: "ev-0001", path: "scans/tiny.las", reason: "changed since admitted" }], still_changed: 0, pack_version: 4 }))
      .toBe("Re-checked 2 item(s): 1 changed — scans/tiny.las (changed since admitted). On hold until the file is restored and admitted again.");
    expect(recheckLine({ checked: 2, changed: [], still_changed: 0, pack_version: 3 })).toBe("Re-checked 2 item(s): every file matches its admitted sha.");
    expect(recheckLine({ checked: 2, changed: [], still_changed: 1, pack_version: 3 }))
      .toBe("Re-checked 2 item(s): none newly changed; 1 still changed — on hold until admitted again under Evidence.");
  });
  it("evidenceControls: Make and Sign a lead's (Sign never the machine session's), Admit and Re-check a contributor's, Run survey a contributor's, never the machine session's", () => {
    const all = { make: true, sign: true, admit: true, recheck: true, ask: true, survey: true, propose: true };
    expect(evidenceControls("owner")).toEqual(all);
    expect(evidenceControls("lead")).toEqual(all);
    expect(evidenceControls("contributor")).toEqual({ make: false, sign: false, admit: true, recheck: true, ask: false, survey: true, propose: false });
    expect(evidenceControls("viewer")).toEqual({ make: false, sign: false, admit: false, recheck: false, ask: false, survey: false, propose: false });
    expect(evidenceControls("service")).toEqual({ ...all, sign: false, ask: false, survey: false, propose: false });
  });
});

describe("the calls", () => {
  it("signAttestation POSTs {code} to …/evidence/evp-0001/attest", async () => {
    bwrite.mockResolvedValue({ attestation: PACK.attestations[0], ledger: { id: 1, hash: HASH } });
    await signAttestation("http://b/", "demo", "a");
    expect(bwrite).toHaveBeenCalledTimes(1);
    expect(bwrite.mock.calls[0][0]).toBe("http://b/cde/demo/evidence/evp-0001/attest");
    expect(bwrite.mock.calls[0][1].method).toBe("POST");
    expect(bwrite.mock.calls[0][1].body).toBe('{"code":"a"}');
  });
  it("readEvidence: no pack yet is null; another 404 and a throw say not read; a 200 is the body", async () => {
    bfetch.mockResolvedValue(res(404, { message: "demo has no evidence pack yet — a lead makes it (POST /cde/demo/evidence) — nothing was saved" }));
    await expect(readEvidence("http://b", "demo")).resolves.toBeNull();
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/demo/evidence/evp-0001");
    bfetch.mockResolvedValue(res(404, { message: "project not found" }));
    await expect(readEvidence("http://b", "demo")).rejects.toThrow("not read — project not found");
    const body = { pack: PACK, ref: "evidence_pack@2", folder: { path: "evidence/demo", exists: true, files_not_admitted: [], truncated: false } };
    bfetch.mockResolvedValue(res(200, body));
    await expect(readEvidence("http://b", "demo")).resolves.toEqual(body);
    bfetch.mockResolvedValue(res(409, { message: "loose belongs to no office — evidence is kept for office projects (a lead of the office attaches it in Project settings ▸ Office)" }));
    await expect(readEvidence("http://b", "loose")).rejects.toThrow(/^loose belongs to no office — evidence is kept for office projects/);
    bfetch.mockRejectedValue(new Error("Failed to fetch"));
    await expect(readEvidence("http://b", "demo")).rejects.toThrow("not read — Failed to fetch");
  });
});

describe("Ask the owner (MA-4b)", () => {
  const REQ: EvidenceRequest = { id: "req-0001", recipient_kind: "owner", recipient: "Ms Owner", documents: ["plans", "sections"], purpose: null,
    letter: "Subject: …", letter_sha256: "a".repeat(64), drafted_by: "lead@example.test", drafted_at: "2026-10-08T12:00:00.000Z" };
  it("a pdf, dwg or dxf is a drawing; an image is a photo that may be admitted as a drawing", () => {
    expect(kindOf("drawings/A-101.PDF")).toBe("drawing");
    expect(kindOf("d/x.dwg")).toBe("drawing");
    expect(kindOf("d/x.dxf")).toBe("drawing");
    expect(kindOf("d/scan.jpg")).toBe("photo");
    expect(isImage("d/scan.png")).toBe(true);
    expect(isImage("d/x.pdf")).toBe(false);
  });
  it("requestLine and a drawing's itemLine", () => {
    expect(requestLine(REQ)).toBe("req-0001 · to the owner (Ms Owner) · 2 document(s) · drafted by lead@example.test · 2026-10-08 12:00");
    expect(requestLine({ ...REQ, recipient: null, recipient_kind: "municipality" })).toBe("req-0001 · to the municipality · 2 document(s) · drafted by lead@example.test · 2026-10-08 12:00");
    expect(itemLine({ ...ITEM, id: "ev-0004", kind: "drawing", format: "pdf", path: "drawings/A-101.pdf", surveyable: false, provider: "owner", request_id: "req-0001" }))
      .toBe("ev-0004 · drawings/A-101.pdf · pdf · 2 KB · sha 76c6b5e940d1… · drawing from the owner under req-0001");
  });
});

describe("the survey (MA-4c)", () => {
  const JOB: SurveyJob = {
    id: "job-0001", status: "done", stage: "done", pct: 100, items: [{ id: "ev-0001", path: "scans/two-storey.las", sha256: "a".repeat(64) }], read: ["ev-0001"],
    refused: [{ id: "ev-0002", reason: "a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS" }], started_by: "contributor@example.test",
    started_at: "2026-10-08T10:00:00.000Z", counts: { level: 2, wall: 8, floor: 2, ceiling: 2, door: 0, window: 0 }, candidates_total: 14, ledger: { id: 2201, hash: HASH },
  };
  it("surveyableScans: admitted scans that are surveyable and not changed — no photo, no RCP, no flagged scan", () => {
    const pack: EvidencePack = { ...PACK, items: [ITEM, { ...ITEM, id: "ev-0002", format: "rcp", surveyable: false }, { ...ITEM, id: "ev-0003", state: "changed" },
      { ...ITEM, id: "ev-0004", kind: "photo", format: "jpg" }] };
    expect(surveyableScans(pack).map((i) => i.id)).toEqual(["ev-0001"]);
  });
  it("jobLine: the state, what was read (never a file the service refused) and refused, what was found, who, when and the ledger row", () => {
    expect(jobLine(JOB)).toBe("job-0001 · done · read ev-0001 · refused ev-0002 (a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS) · 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s), 0 door(s), 0 window(s) · by contributor@example.test · 2026-10-08 10:00 · ledger #2201 · receipt abababababababab…");
    // MA-5a: a 0.4.0 job never looked for doors or windows — its counts name none, and the line says none
    expect(jobLine({ ...JOB, counts: { level: 2, wall: 8, floor: 2, ceiling: 2 } })).toContain(" · 2 level(s), 8 wall(s), 2 floor(s), 2 ceiling(s) · by contributor@example.test");
    const lazBit = { id: "ev-0003", reason: "its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g" };
    expect(jobLine({ ...JOB, items: [...JOB.items, { id: "ev-0003", path: "scans/compressed.las", sha256: "c".repeat(64) }], refused: [lazBit], counts: undefined, ledger: undefined }))
      .toBe("job-0001 · done · read ev-0001 · refused ev-0003 (its points are compressed (LAZ) — sentinel-survey 0.1 reads plain LAS; LAZ is read from MA-4g) · by contributor@example.test · 2026-10-08 10:00");
    expect(jobLine({ ...JOB, status: "running", stage: "walls", pct: 60, read: undefined, refused: [], counts: undefined, ledger: undefined }))
      .toBe("job-0001 · running · walls 60% · reading ev-0001 · by contributor@example.test · 2026-10-08 10:00");
    expect(jobLine({ ...JOB, status: "failed", read: [], refused: [], counts: undefined, error: "the bridge stopped while it ran — nothing it found was kept; run it again" }))
      .toBe("job-0001 · failed · given ev-0001 · the bridge stopped while it ran — nothing it found was kept; run it again · by contributor@example.test · 2026-10-08 10:00 · ledger #2201 · receipt abababababababab…");
  });
  it("candidateLine is generic over what was measured, and says when one face was seen", () => {
    expect(candidateLine({ cid: "scan-L00-wall-1", kind: "wall", geometry: { faces: [[0, 0, 8000, 0], [250, 300, 7700, 300]] }, measured: { length_mm: 8003, height_mm: 2800, thickness_mm: 300 }, evidence: ["ev-0001#slice-L00"], fit: { inliers: 934, rmse_mm: 2.2, coverage: 1 } }))
      .toBe("scan-L00-wall-1 · wall · length mm 8003, height mm 2800, thickness mm 300 · fit 2.2 mm rms, 100% covered · from ev-0001#slice-L00");
    expect(candidateLine({ cid: "scan-L00-wall-5", kind: "wall", geometry: { faces: [[0, 0, 900, 0]] }, measured: { length_mm: 900, height_mm: 2800 }, evidence: ["ev-0001#slice-L00"] }))
      .toBe("scan-L00-wall-5 · wall · length mm 900, height mm 2800 · one face seen: its thickness is unknown · from ev-0001#slice-L00");
    // MA-5a-2: two faces too close for their scatter — the thickness withheld, said so
    expect(candidateLine({ cid: "scan-L00-wall-4", kind: "wall", geometry: { faces: [[0, 0, 3400, 0], [0, 40, 3400, 40]] }, measured: { length_mm: 3400, height_mm: 2900, faces_apart_mm: 40 },
      evidence: ["ev-0001#slice-L00"], fit: { inliers: 200, rmse_mm: 9.6, coverage: 0.8 } }))
      .toBe("scan-L00-wall-4 · wall · length mm 3400, height mm 2900, faces apart mm 40 · fit 9.6 mm rms, 80% covered · its two faces 40 mm apart against a 9.6 mm scatter: its thickness is not trusted · from ev-0001#slice-L00");
    // MA-5a (review): a door or window has no fit of its own — its hole's border share and the faces that saw it
    expect(candidateLine({ cid: "scan-L00-wall-1-door-1", kind: "door", geometry: { host: "scan-L00-wall-1" }, measured: { width_mm: 1000, height_mm: 2100, sill_mm: 0, head_mm: 2100 },
      evidence: ["ev-0001#slice-L00"], fit: { inliers: 48, rmse_mm: 0, coverage: 0.75, faces_seen: 2 } }))
      .toBe("scan-L00-wall-1-door-1 · door · width mm 1000, height mm 2100, sill mm 0, head mm 2100 · hole border 75%, 2 face(s) seen; a hole is an opening or an occluder · from ev-0001#slice-L00");
  });
  it("files-panel's Survey line names what sentinel-survey reads and how the bridge types it (MA-5a)", () => {
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8");
    expect(src).toContain(`line("Survey — sentinel-survey reads the admitted LAS, LAZ and E57 scans on this PC: levels, walls, floors, ceilings, doors and windows, LOD 200 as found (never survey grade). A lead proposes a done job: the bridge types walls, floors and ceilings exactly and doors and windows by size (within 100 mm) from the office's catalogue into one changeset per storey for review, and holds the rest as type gaps.", "#9ca3af")`);
  });
  it("Run survey posts {pack: evp-0001} to …/build/jobs; the line names what it reads and refused", async () => {
    bwrite.mockResolvedValue({ job: { ...JOB, status: "queued" } });
    const r = await startSurvey("http://b", "demo");
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ method: "POST", body: JSON.stringify({ pack: "evp-0001" }) }));
    expect(surveyStartLine(r.job)).toBe("✓ Started job-0001 — sentinel-survey reads ev-0001 (scans/two-storey.las); refused ev-0002 (a .laz is read from MA-4g — sentinel-survey 0.1 reads plain LAS) — ↻ for its progress.");
  });
  it("readJobs: the list, or 'not read — …'", async () => {
    bfetch.mockResolvedValue(res(200, { jobs: [JOB] }));
    expect(await readJobs("http://b", "demo")).toEqual([JOB]);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/demo/build/jobs");
    bfetch.mockResolvedValue(res(403, { message: "this action requires the viewer role (you are not a member)" }));
    await expect(readJobs("http://b", "demo")).rejects.toThrow("not read — this action requires the viewer role (you are not a member)");
    bfetch.mockRejectedValue(new Error("bridge offline"));
    await expect(readJobs("http://b", "demo")).rejects.toThrow("not read — bridge offline");
  });
});

describe("survey proposals (MA-4d)", () => {
  const FRAME = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 0 };
  const REPLY: ProposeReply = { job: "job-0002", survey_row: { id: 2201, hash: HASH }, frame: FRAME,
    storeys: [{ cid: "scan-L00-level", level: "GR-FFL", how: "named", elevation_mm: 0, delta_mm: null, checked: false, from: null, changeset: "c1" },
      { cid: "scan-L01-level", level: "Scan L01 job-0002", how: "created", elevation_mm: 3000, delta_mm: 0, checked: true, from: null, changeset: "c2" }],
    changesets: [{ id: "c1", name: "Survey job-0002 · GR-FFL", elements: 3, preticked: 0 }, { id: "c2", name: "Survey job-0002 · Scan L01 job-0002", elements: 4, preticked: 4 }],
    gaps: { groups: 3, elements: 6, ledger: { id: 2209, hash: HASH } }, already_filed: 0, overlaps: [], ledger: { id: 2210, hash: HASH } };
  it("proposeBody: numbers as typed (a blank is 0; anything else the bridge refuses in words), a level only where one is named", () => {
    expect(proposeBody({ dx: "40000", dy: "", dz: " 0 ", rot: "0", levels: [["scan-L00-level", " GR-FFL "], ["scan-L01-level", "  "]] }))
      .toEqual({ frame: FRAME, levels: { "scan-L00-level": "GR-FFL" } });
    expect(proposeBody({ dx: "4 m", dy: "0", dz: "0", rot: "0", levels: [] })).toEqual({ frame: { ...FRAME, dx_mm: NaN } });
  });
  it("MA-7-9: Choose by photo - the body carries the material only; only an own, blurred, live photo is offered; the line says whose word the material is", () => {
    const body = proposeBody({ dx: "40000", dy: "0", dz: "0", rot: "0", levels: [], materials: [{ cid: "scan-L00-wall-2", item: "ev-000C", material: " Concrete " }] });
    expect(body).toEqual({ frame: FRAME, materials: { "scan-L00-wall-2": { item: "ev-000C", material: "Concrete" } } }); // no thickness, no size
    expect(proposeBody({ dx: "0", dy: "0", dz: "0", rot: "0", levels: [], materials: [] })).not.toHaveProperty("materials");
    const copy = { sha256: "e".repeat(64), size_bytes: 1, width: 1, height: 1, areas: 0, faces: 0, plates: 0, method: "person-marked" as const, marked_by: "a", marked_at: "t", tool: "x" };
    const ph = (id: string, over: Partial<EvidenceItem> = {}): EvidenceItem => ({ id, kind: "photo", format: "jpg", sha256: "f".repeat(64), size_bytes: 1, path: `p/${id}.jpg`, surveyable: false, admitted_by: "a", admitted_at: "t", view_copy: copy, ...over });
    expect(choosablePhotos([ph("ev-1"), ph("ev-2", { view_copy: undefined }), ph("ev-3", { state: "changed" }), ph("ev-4", { state: "expired" }), ph("ev-5", { role: "context" }), ph("ev-6", { kind: "scan" })]).map((i) => i.id)).toEqual(["ev-1"]);
    expect(choiceLine({ cid: "w1", item: "ev-000C", material: " Block " })).toBe("w1: Block from photo ev-000C");
    expect(proposeLine({ ...REPLY, materials: [{ cid: "scan-L00-wall-2", item: "ev-000C", copy_sha256: "e".repeat(64), material: "Concrete", chosen_by: "lead@example.test" }] }))
      .toContain(" · 1 wall(s) typed by a material a person chose from a photo (scan-L00-wall-2: Concrete from ev-000C, chosen by lead@example.test) — not pre-ticked · scan-L00-level");
  });
  it("MA-7-9 (amendment 25): Choose by photo opens with the frame of the job's first proposal; a choice that placed nothing is said", () => {
    const f = { dx_mm: 40000, dy_mm: 0, dz_mm: 0, rotation_deg: 90 };
    const cs = [{ status: "withdrawn", created_at: "3", job: { id: "job-0002", frame: { ...f, dx_mm: 1 } } }, { status: "proposed", created_at: "2", job: { id: "job-0002", frame: f } },
      { status: "applied", created_at: "1", job: { id: "job-0009", frame: { ...f, dx_mm: 7 } } }, { status: "proposed", created_at: "4" }];
    expect(frameDraft(cs, "job-0002")).toEqual({ dx: "40000", dy: "0", dz: "0", rot: "90" });
    expect(frameDraft(cs, "job-0003")).toBeNull();
    expect(proposeLine({ ...REPLY, materials_unused: ["scan-L00-wall-3"] })).toContain(" · 1 choice(s) by photo placed nothing (scan-L00-wall-3)");
  });
  it("Propose posts to …/build/jobs/:id/propose; the line counts what was filed, pre-ticked and held, and how each storey met its level", async () => {
    bwrite.mockResolvedValue(REPLY);
    const r = await proposeFromJob("http://b", "demo", "job-0002", { frame: FRAME });
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs/job-0002/propose", expect.objectContaining({ method: "POST", body: JSON.stringify({ frame: FRAME }) }));
    expect(proposeLine(r)).toBe("✓ Proposed job-0002 — 2 changeset(s), 7 ghost(s), 4 pre-ticked on the Review desk (a level the scan created — a person ticks every scan wall, door and window; Revit leaves unticked what the office IDS rejects) · " +
      "3 type-gap group(s), 6 element(s) in the Holding Area · scan-L00-level → GR-FFL (named, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · " +
      "ledger #2210 · receipt abababababababab… — Review ▸ ↻");
    expect(proposeLine({ ...REPLY, already_filed: 6, overlaps: [{ changeset: "Survey job-0001 · GR-FFL", job_id: "job-0001", evidence: ["ev-0001"] }] }))
      .toContain(" · 6 already filed (not proposed again) · the same scan was placed before by Survey job-0001 · GR-FFL · ledger #2210");
    // drill MA5a K-3: a storey that files no changeset says its held doors and windows here (their reasons are on the planner's row)
    const held = [{ name: "door scan-L01-wall-3-door-1", reason: "its host wall scan-L01-wall-3 is a type gap — …" }, { name: "window scan-L01-wall-3-window-1", reason: "…" }];
    expect(proposeLine({ ...REPLY, storeys: [REPLY.storeys[0], { ...REPLY.storeys[1], changeset: null, held }] }))
      .toContain(" in the Holding Area · 2 door(s) or window(s) held on a storey with nothing to place — their level or host wall is not placed (each reason on the planner's row) · scan-L00-level");
    // MA-5b-3 review: a revision's rows on a storey with nothing new are said as revision rows, never as held doors
    expect(proposeLine({ ...REPLY, storeys: [REPLY.storeys[0], { ...REPLY.storeys[1], changeset: null, held: [{ name: "wall drawing-ev-0007-p1-wall-1", reason: "on ev-0007, not on ev-0008 — …" }] }] }))
      .toContain(" · 1 revision row(s) — changed since, or no longer drawn — with nothing new to place: each on the planner's row (Sentinel never deletes) · ");
    // MA-5b-1 review: a held room on such a storey is said too, in its own words
    expect(proposeLine({ ...REPLY, storeys: [REPLY.storeys[0], { ...REPLY.storeys[1], changeset: null, held: [...held, { name: "room drawing-ev-0007-p1-room-1", reason: "bounded by …" }] }] }))
      .toContain(" · 2 door(s) or window(s) held on a storey with nothing to place — their level or host wall is not placed (each reason on the planner's row) · 1 room(s) held on a storey with nothing to place — a wall round each is not placed (each reason on the planner's row) · ");
    // MA-5a-2: the doors seen on one face only — not proposed, counted
    expect(proposeLine({ ...REPLY, storeys: [{ ...REPLY.storeys[0], doors_seen_once: ["a", "b", "c"] }, REPLY.storeys[1]] }))
      .toContain(" in the Holding Area · 3 door hole(s) seen on one face only — not proposed (a closed door or furniture reads the same; a person draws a door the scan missed) · scan-L00-level");
  });
  it("evidenceControls: Propose is a lead's, never the machine session's", () => {
    expect(["viewer", "contributor", "lead", "owner", "service"].map((r) => evidenceControls(r).propose)).toEqual([false, false, true, true, false]);
  });
});

describe("MA-4h — a published dataset's pack", () => {
  it("one line: where it came from, its licence and the attribution it asks for", () => {
    expect(datasetLine({ provider: "example-repository", source_url: "https://example.test/records/1", licence: "CC-BY-4.0", attribution: "Example scan, CC BY 4.0" }))
      .toBe("Published dataset — example-repository · CC-BY-4.0 · https://example.test/records/1 · attribution: Example scan, CC BY 4.0. A lead signs (f), then admits its scans.");
  });
});

describe("drawing jobs (MA-5a-3) — sentinel-drawing on the admitted PDF plans", () => {
  const DJOB: SurveyJob = {
    id: "job-0007", status: "done", stage: "done", pct: 100, items: [{ id: "ev-0010", path: "drawings/drill-plan-L00.pdf", sha256: "d".repeat(64) }], read: ["ev-0010"],
    refused: [{ id: "ev-0009", reason: "a .dwg is read by Ghost Builder in Revit (Model from Drawings) — sentinel-drawing reads PDF" }], started_by: "contributor@example.test",
    started_at: "2026-10-11T10:00:00.000Z", counts: { wall: 5, door: 2 }, candidates_total: 7, ledger: { id: 2400, hash: HASH }, reader: { name: "sentinel-drawing", version: "0.1.0" },
  };
  it("jobLine names the drawing reader and what it found; a survey job's line is unchanged", () => {
    expect(isDrawingJob(DJOB)).toBe(true);
    expect(isDrawingJob({ ...DJOB, reader: { name: "sentinel-survey", version: "0.6.0" } })).toBe(false);
    expect(isDrawingJob({ ...DJOB, reader: undefined })).toBe(false); // a job from before MA-5a-3 names no reader: a survey
    expect(jobLine(DJOB)).toBe("job-0007 · sentinel-drawing · done · read ev-0010 · refused ev-0009 (a .dwg is read by Ghost Builder in Revit (Model from Drawings) — sentinel-drawing reads PDF) · 5 wall(s), 2 door(s) · by contributor@example.test · 2026-10-11 10:00 · ledger #2400 · receipt abababababababab…");
    expect(jobLine({ ...DJOB, reader: { name: "sentinel-survey", version: "0.6.0" } })).toMatch(/^job-0007 · done · /);
    expect(jobLine({ ...DJOB, counts: { ...DJOB.counts, room: 2 } })).toContain(" · 5 wall(s), 2 door(s), 2 room(s) · "); // MA-5b-1
    // review: a drawing read with nothing found says why, on the line itself (no Candidates button for a job of 0)
    expect(jobLine({ ...DJOB, counts: { wall: 0, door: 0 }, candidates_total: 0, notes: [{ id: "ev-0010", why: "one line weight on the page — walls are not told from the rest" }] }))
      .toContain(" · 0 wall(s), 0 door(s) · ev-0010: one line weight on the page — walls are not told from the rest · by contributor@example.test");
  });
  it("readableDrawings: admitted PDF drawings not changed — no DWG, no raster drawing, no scan", () => {
    const it_ = (id: string, kind: EvidenceItem["kind"], format: string, over: Partial<EvidenceItem> = {}) =>
      ({ id, kind, format, path: `drawings/${id}.${format}`, sha256: HASH, size_bytes: 1, surveyable: false, ...over }) as EvidenceItem;
    const pack = { pack_id: "evp-0001", storage_root: "x", attestations: [], items: [it_("ev-0010", "drawing", "pdf"), it_("ev-0009", "drawing", "dwg"), it_("ev-0008", "drawing", "png"),
      it_("ev-0007", "drawing", "pdf", { state: "changed" }), it_("ev-0001", "scan", "las", { surveyable: true })] } as EvidencePack;
    expect(readableDrawings(pack).map((i) => i.id)).toEqual(["ev-0010"]);
  });
  it("Read drawings posts {pack: evp-0001, readers: [sentinel-drawing]}; the line names what it reads and refused", async () => {
    bwrite.mockResolvedValue({ job: { ...DJOB, status: "queued", read: undefined, counts: undefined } });
    const r = await startDrawing("http://b", "demo");
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ method: "POST", body: JSON.stringify({ pack: "evp-0001", readers: ["sentinel-drawing"] }) }));
    expect(drawingStartLine(r.job)).toBe("✓ Started job-0007 — sentinel-drawing reads ev-0010 (drawings/drill-plan-L00.pdf); refused ev-0009 (a .dwg is read by Ghost Builder in Revit (Model from Drawings) — sentinel-drawing reads PDF) — ↻ for what it found.");
  });
  it("candidateLine reads a drawing's door in paper mm with its tag", () => {
    expect(candidateLine({ cid: "drawing-ev-0010-p1-wall-1-door-1", kind: "door", geometry: { host: "drawing-ev-0010-p1-wall-1", units: "paper_mm" },
      measured: { width_paper_mm: 18, tag_width_mm: 900, tag_height_mm: 2100 }, evidence: ["ev-0010#page-1"] }))
      .toBe("drawing-ev-0010-p1-wall-1-door-1 · door · width paper mm 18, tag width mm 900, tag height mm 2100 · from ev-0010#page-1");
  });
  it("files-panel: Read drawings beside Run survey, the drawings' words, and Propose… on a drawing job opens the alignment form (MA-5a-4)", () => {
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8");
    expect(src).toContain(`<button id="fv-ev-drawing"`);
    expect(src).toContain("readableDrawings(pack).length");
    expect(src).toContain(`j.status === "done" && j.candidates_total && can.propose ? `);
    expect(src).toContain(`(proposing === j.id ? (isDrawingJob(j) ? alignForm(j) : proposeForm(proposeLevels ?? [], isIfcJob(j) ? "IFC" : "scan")) : "")`);
    expect(src).toContain(`line("Drawings — sentinel-drawing reads page 1 of the admitted vector PDF plans on this PC: walls (two faces in the page's heaviest line weight), doors (swing arcs, with any W x H tag) and room labels (a name, and its number when one is written), in paper millimetres. A lead proposes a done drawing job by two marks (a 2-point alignment): the bridge types its walls exactly and its doors by size, as a scan's, every ghost inferred and unticked; a room is placed where its label stands, and only when the walls round it close; a DWG is Ghost Builder's, in Revit.", "#9ca3af")`);
    expect(src).toContain(`drawingStartLine((await startDrawing(base, pid())).job)`);
    // one press, one proposal; only a 201 closes the form; what was typed is kept across a refusal
    expect(src).toContain(`const body = alignBody((alignDraft = readAlign())), id = proposing!;`);
    expect(src).toContain(`proposing = null; proposeLevels = null; proposeDraft = null; alignDraft = null; alignView = null; alignPick = null; // only a 201 closes the form`);
  });
});

describe("drawing proposals (MA-5a-4) — the lead's two points, level and height; the bridge computes the alignment", () => {
  const D: AlignDraft = { item: "ev-0007", pa: "60, 40", ma: "40000, 0", pb: "220 160", mb: "48000,6000", pc: "", mc: "", level: "", z: "0" };
  it("alignBody: the points as typed (a comma, a space or both), a check point only when typed, a level only when named; anything else goes as null for the bridge to refuse", () => {
    expect(alignBody(D)).toEqual({ item: "ev-0007", points: [{ paper: [60, 40], model: [40000, 0] }, { paper: [220, 160], model: [48000, 6000] }], elevation_mm: 0 });
    expect(alignBody({ ...D, pc: "220, 40", mc: "48000, 0", level: " GR-FFL ", z: "3000" })).toMatchObject({ check: { paper: [220, 40], model: [48000, 0] }, level: "GR-FFL", elevation_mm: 3000 });
    // MA-5b-3: revises only when typed
    expect([alignBody({ ...D, revises: " ev-0007 " }).revises, "revises" in alignBody({ ...D, revises: "  " })]).toEqual(["ev-0007", false]);
    expect(JSON.parse(JSON.stringify(alignBody({ ...D, pa: "60", z: "" })))).toMatchObject({ points: [{ paper: [null, null] }, {}], elevation_mm: null });
  });
  it("alignPreview: the scale, the turn, where the paper's corner lands and the check point's miss — the bridge decides", () => {
    expect(alignPreview(D)).toBe("1:50 · turned 0° · the paper's corner at 37000, -2000 mm in the model · no check point (two points fix it exactly; a third catches a misread one)");
    expect(alignPreview({ ...D, pc: "220, 40", mc: "48000, 150" })).toContain(" · the check point lands 150 mm from where you said (the bridge refuses over 100)");
    expect(alignPreview({ ...D, pa: "40000, 0", ma: "60, 40", pb: "48000, 6000", mb: "220, 160" })).toBe("1:0.02 — no plan is drawn at that scale (the bridge takes 1:1 to 1:2000): check paper against model, and that both name the same marks");
    expect(alignPreview({ ...D, mb: "" })).toBe("");
  });
  it("MA-5a-6: the drawing as read, to click its marks — the page, each wall's faces, the doors, the marks typed; a click snaps to a wall corner within 3 paper mm", () => {
    const R = JSON.parse(readFileSync(new URL("../../bridge/fixtures/drawing/drill-plan-L00-result.json", import.meta.url), "utf8"));
    const svg = drawingSvg(R.candidates, "ev-0007", [297.039, 209.903], { ...D, pc: "220, 40" });
    expect(svg).toMatch(/^<svg id="fv-al-svg" viewBox="0 0 297 209.9" data-h="209.9" role="img" /);
    expect([(svg.match(/<line /g) ?? []).length, (svg.match(/<circle /g) ?? []).length]).toEqual([16, 2 + 3]); // the walls' 16 face pieces (doors split them); 2 doors + the A, B, C marks
    expect(svg).toContain(`<line vector-effect="non-scaling-stroke" x1="60" y1="169.9" x2="60" y2="49.9"><title>drawing-ev-0007-p1-wall-3</title></line>`);
    // review: marks sized from the page (r = W/120), strokes in screen px; a page of no size is drawn from its walls
    expect(svg).toContain(`cx="220" cy="169.9" r="2.5" fill="none" stroke="#d97706" stroke-width="2"/>`);
    expect(drawingSvg(R.candidates, "ev-0007", [0, 0], D)).toMatch(/^<svg id="fv-al-svg" viewBox="0 0 230 170" data-h="170" /); // y up on the paper, flipped
    expect(svg).toContain(`>A</text>`); expect(svg).toContain(`>C</text>`);
    expect(drawingSvg(R.candidates, "ev-0009", null, D)).not.toContain("<line "); // another drawing's walls are not drawn
    const evil = [{ ...R.candidates[0], cid: `<img src=x onerror=alert(1)>` }];
    expect(drawingSvg(evil, "ev-0007", null, D)).toContain("<title>&lt;img src=x onerror=alert(1)&gt;</title>");
    expect([snapPaper(R.candidates, "ev-0007", [61.2, 41.4]), snapPaper(R.candidates, "ev-0007", [221.5, 158.9]), snapPaper(R.candidates, "ev-0007", [100.04, 100.06])])
      .toEqual([[60, 40], [220, 160], [100, 100.1]]);
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8");
    expect(src).toContain("const [x, y] = snapPaper(alignView.cands, alignDraft.item, [at.x, Number(svg.dataset.h) - at.y], 8 / Math.hypot(m.a, m.b));"); // review: 8 screen px
    expect(src).toContain("if (!svg || !m || !alignDraft || !alignView || !alignPick || pressed()) return;"); // review: nothing changed under a Propose on its way
    expect(src).toContain(`alignPick = alignPick === "pa" ? "pb" : alignPick === "pb" ? "pc" : null;`);
  });
  it("proposeLine on a drawing: the alignment, the counts, none pre-ticked", () => {
    const r: ProposeReply = { job: "job-0005", drawing_row: { id: 3001, hash: HASH },
      alignment: { method: "2-point similarity", item: "ev-0007", scale: 50, rotation_deg: 0, dx_mm: 37000, dy_mm: -2000, dz_mm: 0, check_mm: 0, rmse_mm: null, confirmed_by: "lead@example.test" },
      storeys: [{ cid: "drawing-ev-0007-p1-level", level: "Drawing ev-0007 job-0005", how: "created", elevation_mm: 0, delta_mm: 0, checked: true, from: null, changeset: "c1" }],
      changesets: [{ id: "c1", name: "Drawing job-0005 · ev-0007 · Drawing ev-0007 job-0005", elements: 5, preticked: 0 }],
      gaps: { groups: 3, elements: 3, ledger: { id: 3103, hash: HASH } }, already_filed: 0, overlaps: [], ledger: { id: 3104, hash: HASH } };
    expect(proposeLine(r)).toBe("✓ Proposed job-0005 — ev-0007 at 1:50, turned 0°, checked to 0 mm · 1 changeset(s), 5 ghost(s), none pre-ticked (a drawing is what someone drew, not what was built — a person ticks each in Revit) · " +
      "3 type-gap group(s), 3 element(s) in the Holding Area · drawing-ev-0007-p1-level → Drawing ev-0007 job-0005 (created) · ledger #3104 · receipt abababababababab… — Review ▸ ↻");
    // MA-5a-5: against the scan — said only when there was one to compare with
    const none = { agree: 0, differ: 0, drawn_only: 0, scanned_only: 0, doors_agree: 0, doors_from_drawing: 0, topics: { raised: [], skipped: 0 } };
    expect(proposeLine({ ...r, differences: none })).toBe(proposeLine(r));
    expect(proposeLine({ ...r, differences: { ...none, agree: 3, drawn_only: 1, doors_from_drawing: 1, topics: { raised: [{ guid: "t1", title: "Drawing vs scan: …", key: "k" }], skipped: 1 } } }))
      .toContain("none pre-ticked (a drawing is what someone drew, not what was built — a person ticks each in Revit) · against the scan: 3 wall(s) agree (not proposed again), 0 differ, 1 drawn only, 0 scanned only, 1 door(s) from the drawing in the scan's walls — 1 BCF topic(s) raised, 1 raised before · 3 type-gap group(s)");
    // MA-5b-3: against the drawing it revises — the same left as placed, the rest a person's rows
    const rv = { revises: "ev-0007", unchanged: 3, changed: 0, removed: 1, doors_unchanged: 0, doors_removed: 0, rooms_unchanged: 1, rooms_removed: 0 };
    expect(proposeLine({ ...r, revision: rv })).toContain(" · against ev-0007: 3 wall(s) the same (left as placed), 0 changed, 1 no longer drawn; rooms 1 the same, 0 no longer drawn — each a person's row on the changeset (Sentinel never deletes) · ");
    expect(proposeLine({ ...r, revision: { ...rv, removed: 0, rooms_unchanged: 0 } })).toContain(" · against ev-0007: 3 wall(s) the same (left as placed), 0 changed, 0 no longer drawn · ");
    // MA-5b-4: a reshape is said with what Revit does to a wall edited by hand
    expect(proposeLine({ ...r, revision: { ...rv, reshaped: 2 } })).toContain(" · against ev-0007: 3 wall(s) the same (left as placed), 2 reshaped to ev-0007's line (Revit keeps one edited by hand since), 0 changed, 1 no longer drawn");
    expect(proposeLine({ ...r, differences: { ...none, topics: { raised: [], skipped: 0, error: "the project's topics could not be read (down) — none raised; propose the drawing again to raise them" } } }))
      .toContain(" — 0 BCF topic(s) raised (the project's topics could not be read (down) — none raised; propose the drawing again to raise them) · ");
  });
});

describe("a concept IFC (MA-6-8) — Read IFC, the third reader", () => {
  const model = (id: string, over: Partial<EvidenceItem> = {}) => ({ id, kind: "model", format: "ifc", path: `model/${id}.ifc`, sha256: HASH, size_bytes: 1048576, surveyable: false, admitted_by: "a@example.test", admitted_at: "2026-10-12T10:00:00.000Z", ...over }) as EvidenceItem;
  const IJOB: SurveyJob = { id: "job-0009", status: "done", stage: "done", pct: 100, items: [{ id: "ev-0021", path: "model/ev-0021.ifc", sha256: HASH }], read: ["ev-0021"],
    refused: [{ id: "ev-0020", reason: "an older concept — one IFC a job: the newest admitted is read" }], started_by: "lead@example.test", started_at: "2026-10-12T10:00:00.000Z",
    counts: { level: 2, wall: 8, floor: 3 }, candidates_total: 13, reader: { name: "sentinel-ifc", version: "0.1.0" } };
  it("kindOf maps .ifc to a model; the item line says a concept model (own)", () => {
    expect(kindOf("model/Concept.IFC")).toBe("model");
    expect(itemLine(model("ev-0021"))).toBe("ev-0021 · model/ev-0021.ifc · ifc · 1.0 MB · sha abababababab… · concept model (own)");
    // MA-8-3: a third party's model names its provider and the order it was bought under
    expect(itemLine(model("ev-0022", { provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" }))).toBe("ev-0022 · model/ev-0022.ifc · ifc · 1.0 MB · sha abababababab… · model from acme scans (commercial, ref PO-2026-114)");
  });
  it("readableIfc is the admitted, unchanged models; Read IFC posts {pack, readers: [sentinel-ifc]}; the lines name the reader and what it found", async () => {
    expect(readableIfc({ pack_id: "evp-0001", storage_root: "x", attestations: [], items: [model("ev-0020"), model("ev-0021", { state: "changed" }), ITEM] }).map((i) => i.id)).toEqual(["ev-0020"]);
    bwrite.mockResolvedValue({ job: { ...IJOB, status: "queued", read: undefined, counts: undefined } });
    const r = await startIfc("http://b", "demo");
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ method: "POST", body: JSON.stringify({ pack: "evp-0001", readers: ["sentinel-ifc"] }) }));
    await startIfc("http://b", "demo", "ev-0020"); // MA-8-3: the model named
    expect(bwrite).toHaveBeenLastCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ body: JSON.stringify({ pack: "evp-0001", readers: ["sentinel-ifc"], item: "ev-0020" }) }));
    expect(ifcStartLine(r.job)).toBe("✓ Started job-0009 — sentinel-ifc reads ev-0021 (model/ev-0021.ifc); refused ev-0020 (an older concept — one IFC a job: the newest admitted is read) — ↻ for what it found.");
    expect(isIfcJob(IJOB)).toBe(true);
    expect(jobLine(IJOB)).toContain("job-0009 · sentinel-ifc · done · read ev-0021 · refused ev-0020");
    expect(jobLine(IJOB)).toContain("2 level(s), 8 wall(s), 3 floor(s)");
    // MA-8-4: a 0.2.0 job names its openings, doors, windows and columns; a 0.1.0 job (counts of three kinds) never says "0 opening(s)"
    expect(jobLine(IJOB)).not.toMatch(/opening|column/);
    expect(jobLine({ ...IJOB, reader: { name: "sentinel-ifc", version: "0.2.0" }, counts: { level: 2, wall: 8, floor: 3, opening: 5, door: 1, window: 0, column: 4 } }))
      .toContain("2 level(s), 8 wall(s), 3 floor(s), 1 door(s), 0 window(s), 5 opening(s), 4 column(s)");
  });
  it("the hint line says where the IFC sits and that it is never applied; the Propose line says nothing is pre-ticked", () => {
    expect(ifcHintLine({ site: { at_mm: [1000, 2000, 0], rotation_deg: 15 }, map_conversion: null, storey_elevation_mismatch: [], context_wcs_not_origin: false, length_unit_assumed: false }))
      .toBe("the IFC says its site at 1000, 2000, 0 mm turned 15° — a hint, never applied (D5): state the frame yourself");
    const r = { job: "job-0009", ifc_row: { id: 3301, hash: HASH }, frame: { dx_mm: 0, dy_mm: 0, dz_mm: 0, rotation_deg: 0 }, storeys: [{ cid: "L02", level: "IFC L02 job-0009", how: "created", elevation_mm: 0, delta_mm: 0, checked: true, from: null, changeset: "c1",
        held: [{ name: "IfcRoof G", reason: "an IfcRoof" }] }], changesets: [{ id: "c1", name: "IFC job-0009 · IFC L02 job-0009", elements: 7, preticked: 0 }], gaps: { groups: 0, elements: 0, ledger: null },
      ledger: { id: 3305, hash: HASH }, already_filed: 0, overlaps: [] } as unknown as ProposeReply;
    expect(proposeLine(r)).toContain("✓ Proposed job-0009 — 1 changeset(s), 7 ghost(s), none pre-ticked (an IFC is what a model says, not what was built or measured");
    expect(proposeLine({ ...r, storeys: [{ ...r.storeys[0], changeset: null }] })).toContain("1 IFC element(s) held or not read (each reason on the planner's row)");
    expect(proposeLine({ ...r, off_storey: [{ ifc_class: "IFCROOF", count: 2, name: "IfcRoof × 2", reason: "x" }] })).toContain("2 IFC element(s) on no storey that is placed — not read (IfcRoof × 2)");
  });
  it("files-panel: a model is admitted with no form (kind from the extension, not a photo); Read IFC beside Read drawings; the form says IFC", () => {
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8");
    expect(src).toContain(`else if (back || kindOf(path) === "model")`); // MA-7-4: a NEW photo asks its source first (photoFor)
    expect(src).toContain(`if (!back && kindOf(path) === "photo") { photoFor = path;`);
    expect(src).toContain('admitEvidence(base, pid(), { path, kind: "photo", ...(provider ? { provider } : {}) })'); // own sends no provider
    expect(src).toContain("const provider = photoProvider(photoSource, photoService);");
    expect(src).toContain('drawingFor = path; drawingReq = ""; admitting = null; photoFor = null;'); // one form open at a time
    expect(src).toContain(`kind: back?.kind ?? kindOf(path)!`);
    expect(src).toContain(`<button id="fv-ev-ifc"`);
    expect(src).toContain("readableIfc(pack).length");
    expect(src).toContain(`ifcStartLine((await startIfc(base, pid())).job)`);
    expect(src).toContain("line(\"IFC — sentinel-ifc reads an admitted .ifc inside the bridge");
    // MA-8 nits (F-B3-5): since 8-9 a boxed IfcStair is a flag row, not a "does not read"
    expect(src).toContain("(roofs, curved walls, proxies, members, plates, railings) it lists by GlobalId; a stair is boxed and flagged for a person (Propose a stair… in Revit).");
    expect(src).not.toContain("curved walls, stairs,");
    expect(src).toContain("data-evvendor"); // MA-8-3: a third party's model opens its provider + licence-ref form (a lead's)
    expect(src).toContain("data-evifc"); // MA-8-3: one Read IFC a model when several are admitted
    expect(src).toContain("{ path, kind: \"model\", provider, licence_ref }");
    expect(src).toContain("a concept model ifc</span>");
    expect(src).toContain("and (a) before a concept IFC");
    expect(src).toContain('(what === "IFC" && proposeHint ? line(esc(proposeHint), "#c4b5fd") : "")');
  });
});

describe("recipe runs (MA-8-13, D13)", () => {
  const JOB: SurveyJob = { id: "job-0001", status: "done", stage: "done", pct: 100, items: [{ id: "ev-0001", path: "scans/a.las", sha256: "a".repeat(64) }], read: ["ev-0001"], refused: [],
    started_by: "contributor@example.test", started_at: "2026-10-13T10:00:00.000Z" };
  it("startRecipe posts {pack, recipe: {version, scope}} - no reader, no params: the recipe names them; an item rides along for an IFC recipe", async () => {
    bwrite.mockResolvedValue({ job: JOB });
    await startRecipe("http://b", "demo", { version: 2, scope: "office" });
    expect(bwrite).toHaveBeenLastCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ method: "POST", body: JSON.stringify({ pack: "evp-0001", recipe: { version: 2, scope: "office" } }) }));
    await startRecipe("http://b", "demo", { version: 1, scope: "project" }, "ev-0020");
    expect(bwrite).toHaveBeenLastCalledWith("http://b/cde/demo/build/jobs", expect.objectContaining({ body: JSON.stringify({ pack: "evp-0001", recipe: { version: 1, scope: "project" }, item: "ev-0020" }) }));
  });
  it("jobLine names the recipe and the approvals that let it run (and nothing for a job without one)", () => {
    const l = jobLine({ ...JOB, recipe: { ref: "recipe@1", approvals: [{ id: 950 }, { id: 951 }] } });
    expect(l).toContain(" · from recipe@1 (approvals #950, #951) · by contributor@example.test");
    expect(jobLine({ ...JOB, recipe: { ref: "recipe@3" } })).toContain(" · from recipe@3 · by ");
    expect(jobLine(JOB)).not.toContain("from recipe");
  });
});

describe("MA-7-2: the web switch line", () => {
  it("webLine says off, drill and on in the plan's words", () => {
    expect(webLine({ mode: "off", counsel_ref: null })).toBe("Web evidence: off — counsel has not reviewed it yet (D5). Your own photos and scans are admitted as before.");
    expect(webLine({ mode: "drill", counsel_ref: null })).toBe("Web evidence: DRILL — the founder's switch; counsel has not reviewed web evidence.");
    expect(webLine({ mode: "off", counsel_ref: null, why: "web evidence is off until counsel has reviewed it (design D5) — the founder's switch SENTINEL_WEB_EVIDENCE; nothing" })).toContain("counsel has not reviewed it yet");
    expect(webLine({ mode: "off", counsel_ref: null, why: "SENTINEL_WEB_EVIDENCE=on needs SENTINEL_WEB_COUNSEL_REF" })).toBe("Web evidence: off — SENTINEL_WEB_EVIDENCE=on needs SENTINEL_WEB_COUNSEL_REF");
    expect(webLine({ mode: "off", counsel_ref: null, why: "drill mode names its project(s): SENTINEL_WEB_EVIDENCE=drill:<project key>" })).toMatch(/^Web evidence: off — drill mode/);
    expect(webLine({ mode: "on", counsel_ref: "abcdef012345" })).toBe("Web evidence: on (counsel ref abcdef012345…)");
  });
});

// MA-7-4 — where a photo came from, and the camera line.
describe("photo source and capture (MA-7-4)", () => {
  it("photoProvider: own sends none, a map service its lower-cased name, a website 'website'", () => {
    expect(photoProvider("own")).toBeUndefined();
    expect(photoProvider("map", "Google Street View")).toBe("google street view");
    expect(photoProvider("map")).toBe(MAP_SERVICES[0].toLowerCase());
    expect(photoProvider("web")).toBe("website");
    expect(PHOTO_SOURCES.map((p) => p.id)).toEqual(["own", "map", "web"]);
  });
  it("itemLine adds the camera, the time and the location note for a photo with capture", () => {
    const p: EvidenceItem = { ...ITEM, id: "ev-0002", kind: "photo", format: "jpg", path: "photos/a.jpg", surveyable: true, capture: { make: "Example", model: "Cam 1", taken_at: "2026-10-13 09:30", gps: true } };
    expect(itemLine(p)).toMatch(/ · Example Cam 1 · taken 2026-10-13 09:30 · EXIF GPS block in the original \(not copied\)/);
    expect(itemLine({ ...p, capture: { make: "Example", model: null, taken_at: null, gps: false } })).toMatch(/ · Example · taken \? · no EXIF GPS block/);
    expect(itemLine({ ...p, capture: undefined })).not.toMatch(/taken/);
  });
});

describe("MA-7-6: the NOTICE", () => {
  it("noticeLine says what was saved; readNotice returns the bridge's text or throws not read", async () => {
    expect(noticeLine({ credits: 2, tools: 7, sha256: "ab".repeat(32) })).toBe("NOTICE saved \u00b7 2 credit(s) \u00b7 7 tool(s) \u00b7 sha abababababab\u2026");
    const n = { text: "NOTICE", sha256: HASH, pack_version: 1, credits: 0, tools: 0 };
    bfetch.mockResolvedValueOnce(res(200, n));
    expect(await readNotice("http://b", "demo")).toEqual(n);
    expect(String(bfetch.mock.calls[bfetch.mock.calls.length - 1][0])).toMatch(/\/cde\/demo\/evidence\/evp-0001\/notice$/);
    bfetch.mockResolvedValueOnce(res(503, { message: "the NOTICE needs the build:run rows and the ledger could not be read \u2014 nothing was made" }));
    await expect(readNotice("http://b", "demo")).rejects.toThrow(/^not read \u2014 the NOTICE needs/);
  });
});

// MA-7-7 — the blurred copy: its line, the marker's boxes, the calls, and the panel's wiring.
import { viewCopyLine, markViewCopy, blurredLine, photoUrl, type ViewCopy } from "./evidence";
import { boxFromDrag, markSummary } from "./photo-marker";
describe("blurred copy (MA-7-7)", () => {
  const VC: ViewCopy = { sha256: "cd".repeat(32), size_bytes: 5000, width: 2048, height: 1365, areas: 2, faces: 1, plates: 1, method: "person-marked", marked_by: "lead@example.test", marked_at: "2026-10-13T10:00:00.000Z", tool: "sentinel-blur 0.1.0" };
  const PH: EvidenceItem = { ...ITEM, id: "ev-0002", kind: "photo", format: "jpg", path: "photos/a.jpg", surveyable: true };
  it("viewCopyLine / itemLine: no copy says where the original is shown; a copy says its areas; none seen says so; an expired photo says neither", () => {
    expect(viewCopyLine(PH)).toBe(" · no blurred copy yet — the original is shown on the office PC only, to mark it");
    expect(itemLine(PH)).toMatch(/ · no blurred copy yet/);
    expect(itemLine({ ...PH, view_copy: VC })).toContain(" · blurred copy 2048×1365: 2 area(s) filled (1 face, 1 number plate) · marked by lead@example.test");
    expect(viewCopyLine({ view_copy: { ...VC, areas: 0, faces: 0, plates: 0, none_seen: true } })).toContain("no faces or number plates seen");
    expect(itemLine({ ...PH, state: "expired", expired_at: "2026-10-13T00:00:00.000Z" })).not.toMatch(/blurred copy/);
    expect(itemLine(ITEM)).not.toMatch(/blurred copy/); // a scan has none
  });
  it("boxFromDrag: fractions of the shown photo, any drag direction, clamped; a click is no box", () => {
    const near = (m: ReturnType<typeof boxFromDrag>) => JSON.parse(JSON.stringify(m, (_k, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v)));
    expect(near(boxFromDrag(100, 50, 300, 150, 1000, 500, "face"))).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2, what: "face" });
    expect(near(boxFromDrag(300, 150, 100, 50, 1000, 500, "plate"))).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2, what: "plate" });
    expect(near(boxFromDrag(-50, 400, 2000, 900, 1000, 500, "face"))).toEqual({ x: 0, y: 0.8, w: 1, h: 0.2, what: "face" });
    expect(boxFromDrag(100, 100, 102, 102, 1000, 500, "face")).toBeNull();
    expect(boxFromDrag(0, 0, 10, 10, 0, 0, "face")).toBeNull();
  });
  it("markSummary: counts what is marked, or asks for a mark or the explicit answer", () => {
    expect(markSummary([])).toMatch(/Nothing marked yet/);
    expect(markSummary([{ x: 0, y: 0, w: .1, h: .1, what: "face" }, { x: 0, y: 0, w: .1, h: .1, what: "plate" }, { x: 0, y: 0, w: .1, h: .1, what: "plate" }])).toMatch(/^3 area\(s\) marked \(1 face, 2 number plate\)/);
  });
  it("markViewCopy posts the boxes (or the none answer) to the item's view-copy route; blurredLine is one line with the ledger", async () => {
    bfetch.mockClear(); bwrite.mockClear();
    bwrite.mockResolvedValueOnce({ item: { ...PH, view_copy: VC }, copy: VC, pack_version: 7, ledger: { id: 9, hash: HASH } });
    const r = await markViewCopy("http://b", "demo", "ev-0002", { boxes: [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1, what: "face" }] });
    expect(String(bwrite.mock.calls[0][0])).toMatch(/\/cde\/demo\/evidence\/evp-0001\/items\/ev-0002\/view-copy$/);
    expect(bwrite.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(bwrite.mock.calls[0][1].body)).toEqual({ boxes: [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1, what: "face" }] });
    bwrite.mockResolvedValueOnce({ item: { ...PH, view_copy: VC }, copy: VC, pack_version: 8, ledger: { id: 10, hash: HASH } });
    await markViewCopy("http://b", "demo", "ev-0002", { none_seen: true, shown: { w: 400, h: 600 } }); // MA-7-7 review: the size the marker showed rides along
    expect(JSON.parse(bwrite.mock.calls[1][1].body)).toEqual({ none_seen: true, shown: { w: 400, h: 600 } });
    expect(blurredLine(r)).toBe(`✓ Blurred copy of ev-0002 · blurred copy 2048×1365: 2 area(s) filled (1 face, 1 number plate) · marked by lead@example.test · sha ${"cd".repeat(6)}… · ledger #9 · receipt abababababababab…`);
  });
  it("photoUrl: the copy or the original as an object URL; the bridge's own words come through when it refuses", async () => {
    const make = vi.fn(() => "blob:copy");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: make }));
    bfetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(["x"]) } as unknown as Response);
    expect(await photoUrl("http://b", "demo", "ev-0002", "view")).toBe("blob:copy");
    expect(String(bfetch.mock.calls[bfetch.mock.calls.length - 1][0])).toMatch(/\/cde\/demo\/evidence\/evp-0001\/items\/ev-0002\/view$/);
    bfetch.mockResolvedValueOnce(res(403, { message: "the unblurred original is shown on the office PC only (the local app) — mark faces and number plates there; nothing was shown" }));
    await expect(photoUrl("http://b", "demo", "ev-0002", "original")).rejects.toThrow("the unblurred original is shown on the office PC only");
    vi.unstubAllGlobals();
  });
  it("files-panel: Mark faces and plates for a contributor on a photo with no copy; the original loads through photoUrl; the explicit none answer is a button; a refresh never reloads under an open marker", () => {
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8");
    expect(src).toContain('can.survey && markFor !== i.id ? ` <button data-evmark=');
    expect(src).toContain('photoUrl(base, pid(), id, "original")');
    expect(src).toContain("No faces or number plates in this photo");
    expect(src).toContain('saveMark({ none_seen: true })');
    expect(src).toContain("marker?.shown()"); // the shown size is sent with the marks
    expect(src).toContain("drawingFor || vendorFor || photoFor || markFor)) return;");
    expect(src).toContain("{ markClose(); thumbsClear(); renaming = null;"); // a project or person switch drops the open marker and frees the thumbnails
  });
});
