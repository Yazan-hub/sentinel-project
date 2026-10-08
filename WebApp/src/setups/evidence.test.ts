// MA-4a — the Evidence section's words and calls: the attestation texts are the bridge's pins (their sha256), a folder file's
// kind is its extension, every line is pinned, and a project with no pack reads as null — any other failure says "not read — …".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const { bfetch, bwrite } = vi.hoisted(() => ({ bfetch: vi.fn(), bwrite: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch, bwrite }));

import { ATTESTATION_CODES, ATTESTATION_TEXTS, kindOf, needsReport, itemLine, attestationLine, admitLine, recheckLine, readEvidence,
  signAttestation, evidenceControls, type EvidenceItem, type EvidencePack } from "./evidence";

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
  it("evidenceControls: Make and Sign a lead's (Sign never the machine session's), Admit and Re-check a contributor's", () => {
    const all = { make: true, sign: true, admit: true, recheck: true };
    expect(evidenceControls("owner")).toEqual(all);
    expect(evidenceControls("lead")).toEqual(all);
    expect(evidenceControls("contributor")).toEqual({ make: false, sign: false, admit: true, recheck: true });
    expect(evidenceControls("viewer")).toEqual({ make: false, sign: false, admit: false, recheck: false });
    expect(evidenceControls("service")).toEqual({ ...all, sign: false });
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
