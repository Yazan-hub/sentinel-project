// MA-4a — the Evidence section's words and calls: the attestation texts are the bridge's pins (their sha256), a folder file's
// kind is its extension, every line is pinned, and a project with no pack reads as null — any other failure says "not read — …".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));

import { ATTESTATION_CODES, ATTESTATION_TEXTS, kindOf, needsReport, itemLine, attestationLine, admitLine, recheckLine, readEvidence,
  signAttestation, evidenceControls, requestLine, isImage, jobLine, candidateLine, surveyStartLine, surveyableScans, startSurvey, readJobs,
  proposeBody, proposeFromJob, proposeLine, datasetLine, type ProposeReply, type EvidenceItem, type EvidencePack, type EvidenceRequest, type SurveyJob } from "./evidence";

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
  it("Propose posts to …/build/jobs/:id/propose; the line counts what was filed, pre-ticked and held, and how each storey met its level", async () => {
    bwrite.mockResolvedValue(REPLY);
    const r = await proposeFromJob("http://b", "demo", "job-0002", { frame: FRAME });
    expect(bwrite).toHaveBeenCalledWith("http://b/cde/demo/build/jobs/job-0002/propose", expect.objectContaining({ method: "POST", body: JSON.stringify({ frame: FRAME }) }));
    expect(proposeLine(r)).toBe("✓ Proposed job-0002 — 2 changeset(s), 7 ghost(s), 4 pre-ticked on the Review desk (Revit opens them ticked too, less what the office IDS rejects; a person clicks Apply) · " +
      "3 type-gap group(s), 6 element(s) in the Holding Area · scan-L00-level → GR-FFL (named, its height not checked); scan-L01-level → Scan L01 job-0002 (created) · " +
      "ledger #2210 · receipt abababababababab… — Review ▸ ↻");
    expect(proposeLine({ ...REPLY, already_filed: 6, overlaps: [{ changeset: "Survey job-0001 · GR-FFL", job_id: "job-0001", evidence: ["ev-0001"] }] }))
      .toContain(" · 6 already filed (not proposed again) · the same scan was placed before by Survey job-0001 · GR-FFL · ledger #2210");
    // drill MA5a K-3: a storey that files no changeset says its held doors and windows here (their reasons are on the planner's row)
    const held = [{ name: "door scan-L01-wall-3-door-1", reason: "its host wall scan-L01-wall-3 is a type gap — …" }, { name: "window scan-L01-wall-3-window-1", reason: "…" }];
    expect(proposeLine({ ...REPLY, storeys: [REPLY.storeys[0], { ...REPLY.storeys[1], changeset: null, held }] }))
      .toContain(" in the Holding Area · 2 door(s) or window(s) held on a storey with nothing to place — their level or host wall is not placed (each reason on the planner's row) · scan-L00-level");
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
