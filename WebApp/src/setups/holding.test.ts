// The Versions upload goes through Governed Intake and the Holding Area is read, never assumed: an accepted or recorded
// file is uploaded and registered by the bridge, a rejected one uploads nothing and is held; a list that was not read
// says so; a lead's dismissal carries a reason; a ledger line names a row only with an id and a 64-hex hash.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { uploadThroughIntake, uploadFailedLine, intakeLine, readHolding, dismissHold, resubmitFor, type IntakeReply, type Holding,
  typeGapLine, typeGapClosedLine, dismissTypeGap, type TypeGap } from "./holding";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const HASH = "6e7f8091a2b3c4d5".padEnd(64, "0");
const HOLD = "a1b2c3d4e5f60718".padEnd(64, "9");
const reply = (over: Partial<IntakeReply> = {}): IntakeReply => ({
  verdict: "accepted", stage: "published", gate: { failures: [] }, naming: null, failures: [],
  summary: { in_scope: 3, passing: 3 }, ids_ref: "ids@1", audit_id: 812, receipt: { ledger_hash: HASH },
  version: { revision: "v2" }, hold: null, ...over,
});
const rejected = (over: Partial<IntakeReply>): IntakeReply =>
  reply({ verdict: "rejected", stage: "ids", version: null, hold: { id: 915, hash: HOLD }, ...over });
// MA-2c: one type-gap group as the bridge's GET /cde/:key/holding sends it.
const GAP: TypeGap = {
  id: "3c5d7e9f0a1b", category: "Walls", want: "BDS_EXT_ARC_CMU_125 mm", size: "125 mm", key: "Function Exterior", elements: 2,
  labels: ["GR-FFL · W 2051449", "GR-FFL · W 2051450"], nearest: ["BDS_EXT_ARC_CMU_100 mm", "BDS_EXT_ARC_CMU_200 mm", "BDS_EXT_ARC_CMU_300 mm", "BDS_EXT_ARC_CMU_400 mm"],
  at: "2026-10-03T10:00:00Z", actor: "lead@example.com", ledger: { id: 950, hash: HOLD }, runs: 1, source: "revit", claimed: true,
};

describe("uploadThroughIntake — POST /cde/:key/intake", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts the file once, to intake only, with the name, source=web, the next revision and who uploaded it", async () => {
    bfetch.mockResolvedValue(res(200, reply()));
    const file = new Blob(["ISO-10303-21;"]);
    expect(await uploadThroughIntake("http://b/", "aster-tower", file, { name: "B12-W.ifc", revision: "v2", who: "lead@example.com" })).toEqual(reply());
    expect(bfetch).toHaveBeenCalledTimes(1);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/aster-tower/intake?name=B12-W.ifc&source=web&revision=v2&note=uploaded%20via%20web%20by%20lead%40example.com");
    expect(bfetch.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/x-step" }, body: file });
  });

  it("a refusal throws the bridge's words with its status; one without words names the status", async () => {
    bfetch.mockResolvedValue(res(400, { message: "name must be the container's ISO name ending in .ifc" }));
    await expect(uploadThroughIntake("http://b", "k", new Blob(["x"]), { name: "a.txt", revision: "v1", who: "web" })).rejects.toMatchObject({ message: "name must be the container's ISO name ending in .ifc", status: 400 });
    bfetch.mockResolvedValue(res(502, null));
    await expect(uploadThroughIntake("http://b", "k", new Blob(["x"]), { name: "a.ifc", revision: "v1", who: "web" })).rejects.toMatchObject({ message: "HTTP 502", status: 502 });
  });

  it("an upload that threw is 'Not uploaded' only on an answer given before anything is stored; else not confirmed", () => {
    for (const status of [400, 401, 403, 404, 408, 413, 429, 503]) expect(uploadFailedLine(Object.assign(new Error("refused"), { status }))).toBe("Not uploaded — refused");
    const unsure = "Not confirmed — HTTP 500 (the bridge may have stored it; ↻ to check)";
    expect(uploadFailedLine(Object.assign(new Error("HTTP 500"), { status: 500 }))).toBe(unsure);
    expect(uploadFailedLine(Object.assign(new Error("HTTP 500"), { status: 200 }))).toBe(unsure);
    expect(uploadFailedLine(new TypeError("Failed to fetch"))).toBe("Not confirmed — Failed to fetch (the bridge may have stored it; ↻ to check)");
  });
});

describe("intakeLine — what the upload did", () => {
  it("accepted: uploaded and registered, the IDS that judged, the proposal row", () => {
    expect(intakeLine("B12-W.ifc", reply())).toBe("Uploaded B12-W.ifc v2 — accepted (ids@1: 3/3 passed) · ledger #812 · receipt 6e7f8091a2b3c4d5…");
  });

  it("recorded: says the IDS did not judge it and carries the bridge's note", () => {
    const r = reply({ verdict: "recorded", ids_ref: null, version: { revision: "v1" }, note: "No contract and no IDS installed for b12-hold or its office — nothing was judged." });
    expect(intakeLine("B12-R.ifc", r)).toBe("Uploaded B12-R.ifc v1 — recorded (the IDS did not judge it) · No contract and no IDS installed for b12-hold or its office — nothing was judged. · ledger #812 · receipt 6e7f8091a2b3c4d5…");
  });

  it("a gate FAIL uploads nothing and is held, with the hold row's line", () => {
    const r = rejected({ stage: "gate", gate: { failures: ["Schema IFC2X3 — the contract asks IFC4", "Proxy ratio 12% — the cap is 5%"] }, audit_id: null, receipt: null });
    expect(intakeLine("B12-G.ifc", r)).toBe("Not uploaded — the delivery gate refused B12-G.ifc (2 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
  });

  it("a naming reject is the naming standard's (rejected under enforce reject) — intake's stage naming", () => {
    const r = rejected({ stage: "naming", naming: { ok: false, enforce: "reject", failures: [{ field: "*", reason: "expected 11 '-'-separated fields" }] }, failures: [{}, {}] });
    expect(intakeLine("B12-N.ifc", r)).toBe("Not uploaded — the naming standard refused B12-N.ifc (1 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
  });

  it("an IDS reject names the IDS and counts its failures; a naming warning does not make it a naming refusal", () => {
    const r = rejected({ naming: { ok: false, enforce: "warn", failures: [{}] }, failures: [{}, {}, {}, {}] });
    expect(intakeLine("B12-W.ifc", r)).toBe("Not uploaded — the IDS refused B12-W.ifc (4 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
    // the referee cuts its list at 200: the count is its failures_total, never the list's length
    expect(intakeLine("B12-W.ifc", { ...r, failures_total: 250 })).toBe("Not uploaded — the IDS refused B12-W.ifc (250 failure(s)) · On hold · ledger #915 · receipt a1b2c3d4e5f60718…");
  });

  it("a refusal the bridge did not hold says so; a hold row without a chain hash is not confirmed", () => {
    expect(intakeLine("B12-W.ifc", rejected({ failures: [{}], hold: null }))).toBe("Not uploaded — the IDS refused B12-W.ifc (1 failure(s)) · not on hold — the bridge returned no hold row");
    expect(intakeLine("B12-W.ifc", rejected({ failures: [{}], hold: { id: 915, hash: null } }))).toBe("Not uploaded — the IDS refused B12-W.ifc (1 failure(s)) · On hold · not confirmed — the bridge returned no chain hash");
  });

  it("an upload that failed after the verdict: judged, not uploaded, nothing registered", () => {
    expect(intakeLine("B12-W.ifc", reply({ stage: "upload_failed", version: null, error: "platform upload HTTP 503" })))
      .toBe("B12-W.ifc accepted (ids@1: 3/3 passed) — not uploaded: platform upload HTTP 503. Nothing was registered · ledger #812 · receipt 6e7f8091a2b3c4d5…");
  });
});

describe("readHolding — GET /cde/:key/holding", () => {
  beforeEach(() => bfetch.mockReset());

  it("returns the held items and the recent clearances as the bridge sent them", async () => {
    const h: Holding = {
      items: [{ container_name: "B12-W.ifc", stage: "ids", verdict: "rejected", failures: [{ requirement: "Doors carry a FireRating", detail: "Pset_DoorCommon.FireRating missing" }],
        source: "web", actor: "lead@example.com", at: "2026-09-27T10:00:00Z", ledger: { id: 915, hash: HOLD }, refusals: 2 }],
      cleared_recent: [{ container_name: "B12-G.ifc", by: "recorded", version_id: "v-1", at: "2026-09-27T11:00:00Z" }],
      type_gaps: null,
    };
    bfetch.mockResolvedValue(res(200, { items: h.items, cleared_recent: h.cleared_recent })); // a bridge before MA-2c sends no type_gaps
    expect(await readHolding("http://b/", "b12-hold")).toEqual(h);
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b12-hold/holding");
  });

  it("MA-2c: the type-gap groups ride beside the holds, open and closed, with the catalogue the close rule read", async () => {
    const gaps = { open: [GAP], closed: [{ ...GAP, id: "0f0f0f0f0f0f", closed_by: "catalogue", type: "BDS_EXT_ARC_CMU_125 mm", catalog: "type_catalog@3 · office · 0f0f0f0f0f0f…" }], catalog: "type_catalog@3 · office · 0f0f0f0f0f0f…" };
    bfetch.mockResolvedValue(res(200, { items: [], cleared_recent: [], type_gaps: gaps }));
    expect((await readHolding("http://b", "ma2c")).type_gaps).toEqual(gaps);
    bfetch.mockResolvedValue(res(200, { items: [], cleared_recent: [], type_gaps: { open: [GAP] } }));
    expect((await readHolding("http://b", "ma2c")).type_gaps).toEqual({ open: [GAP], closed: [], catalog: null });
  });

  it("a failed read is 'not read — …', never an empty list — the bridge's 502, a status without words, a transport failure, a reply without a list", async () => {
    bfetch.mockResolvedValue(res(502, { message: "not read — the ledger did not answer" }));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — the ledger did not answer$/);
    bfetch.mockResolvedValue(res(500, null));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — HTTP 500$/);
    bfetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — Failed to fetch$/);
    bfetch.mockResolvedValue(res(200, { rows: [] }));
    await expect(readHolding("http://b", "k")).rejects.toThrow(/^not read — the bridge answered without a list$/);
  });
});

describe("dismissHold — POST /cde/:key/holding/dismiss", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts the name and the trimmed reason and returns the hold:dismissed row", async () => {
    bfetch.mockResolvedValue(res(201, { id: 930, hash: HOLD }));
    expect(await dismissHold("http://b", "b12-hold", "B12-N.ifc", "  renamed and registered as BDS20268-…  ")).toEqual({ id: 930, hash: HOLD });
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/b12-hold/holding/dismiss", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ container_name: "B12-N.ifc", reason: "renamed and registered as BDS20268-…" });
  });

  it("a blank reason is never sent", async () => {
    await expect(dismissHold("http://b", "k", "B12-N.ifc", "   ")).rejects.toThrow("a dismissal needs a reason — the ledger records it");
    expect(bfetch).not.toHaveBeenCalled();
  });

  it("a role below lead is refused with the bridge's words", async () => {
    bfetch.mockResolvedValue(res(403, { message: "this action requires the lead role (you are contributor)" }));
    await expect(dismissHold("http://b", "k", "B12-N.ifc", "why")).rejects.toThrow("this action requires the lead role (you are contributor)");
  });
});

// MA-2c (design §6.4): Promote's type-gap groups in words — the add-in's TypeGaps.Line — and a lead's dismissal with a reason.
describe("type gaps — the Holding Area's own section (MA-2c)", () => {
  beforeEach(() => bfetch.mockReset());

  it("typeGapLine says what is missing, how many, from what facts and the nearest types — as the add-in's dialog does", () => {
    expect(typeGapLine(GAP)).toBe('Walls: "BDS_EXT_ARC_CMU_125 mm" is not in the catalogue — 2 element(s) (Function Exterior); nearest: BDS_EXT_ARC_CMU_100 mm, BDS_EXT_ARC_CMU_200 mm, BDS_EXT_ARC_CMU_300 mm');
    expect(typeGapLine({ ...GAP, want: null, size: "915 x 2134 mm", key: null, nearest: [], elements: 1, category: "Doors" })).toBe("Doors: no type named at 915 x 2134 mm — 1 element(s)");
  });

  it("typeGapClosedLine says how a group was closed: a lead's reason, or the catalogue that now holds the type", () => {
    expect(typeGapClosedLine({ ...GAP, closed_by: "dismissed", reason: "a template sample" })).toBe("dismissed — a template sample");
    expect(typeGapClosedLine({ ...GAP, closed_by: "catalogue", type: "BDS_EXT_ARC_CMU_125 mm", catalog: "type_catalog@3 · office · 0f0f0f0f0f0f…" }))
      .toBe("closed — type_catalog@3 · office · 0f0f0f0f0f0f… has BDS_EXT_ARC_CMU_125 mm");
  });

  it("dismissTypeGap posts the trimmed reason to the group's route and returns the row; a blank reason is never sent; a refusal says the bridge's words", async () => {
    bfetch.mockResolvedValue(res(201, { id: 960, hash: HOLD }));
    expect(await dismissTypeGap("http://b/", "ma2c", GAP.id, "  a template sample  ")).toEqual({ id: 960, hash: HOLD });
    expect(bfetch).toHaveBeenCalledWith(`http://b/cde/ma2c/holding/type-gaps/${GAP.id}/dismiss`, expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ reason: "a template sample" });
    bfetch.mockReset();
    await expect(dismissTypeGap("http://b", "ma2c", GAP.id, " ")).rejects.toThrow("a dismissal needs a reason — the ledger records it");
    expect(bfetch).not.toHaveBeenCalled();
    bfetch.mockResolvedValue(res(409, { message: `type-gap group ${GAP.id} is not open on ma2c` }));
    await expect(dismissTypeGap("http://b", "ma2c", GAP.id, "why")).rejects.toThrow(`type-gap group ${GAP.id} is not open on ma2c`);
  });
});

describe("resubmitFor — how a held file is sent again", () => {
  it("web and intake: the picker, through intake; Revit and auto-publish: the model in Revit", () => {
    expect(resubmitFor("web")).toEqual({ upload: true, text: "Upload the corrected file" });
    expect(resubmitFor("intake")).toEqual({ upload: true, text: "Upload the corrected file" });
    expect(resubmitFor("revit")).toEqual({ upload: false, text: "Fix the model in Revit, then Sentinel ▸ Publish ▸ Governed Publish again." });
    expect(resubmitFor("auto-publish")).toEqual({ upload: false, text: "Fix the model in Revit and save — auto-publish judges it again (or run Governed Publish)." });
  });
});
