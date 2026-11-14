import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn() }));
vi.mock("../setups/ask", () => ({ askText: vi.fn(async () => null), askYesNo: vi.fn(async () => true) }));

import { capLines, summaryModel, summarySheet, summaryView, printSummary } from "./summary-view";
import { click, fakeDocument, fakeWindow, findAll, textOf } from "./fake-dom";
import { emptyState } from "./workspace-state";

const registry = { checks: [{ id: "roles.responsibility", label: "Responsibilities" }, { id: "cde.states", label: "CDE states used" }] };
const matrix = (rows: unknown[]) => ({ id: "m1", kind: "matrix", title: "", data: { preset: "detailed", show_milestone: true, show_recipient: true,
  columns: [{ key: "str", label: "Team STR", team: "STR" }, { key: "arc", label: "Team ARC", team: "ARC" }], rows } });
const row = (label: string, o: Record<string, unknown> = {}) => ({ id: label, label, milestone: null, recipient: null, marks: { str: "produces" }, ...o });
const snap = (sections: unknown[], extra: Record<string, unknown> = {}) => ({ id: "d1", doc_type: "BEP", title: "Snowdon BEP", status: "wip", stage: "confirmed", suitability: "S0", responds_to: null,
  responds_to_version: null, template_id: null, template_version: null, updated_at: "t", sections, ...extra }) as any;
const sec = (id: string, heading: string, o: Record<string, unknown> = {}) => ({ id, heading, guidance: "", body: "text", state: "wip", owner: null, bindings: {}, blocks: [], ...o });
const base = { version: null, versions: [], ex: null, round: null, live: null, registry, projectKey: "snowdon", today: "2026-11-14" } as any;

describe("capLines", () => {
  it("at most 12 lines, then and n more in the document", () => {
    const l = Array.from({ length: 13 }, (_, i) => `l${i}`);
    expect(capLines(l.slice(0, 12))).toHaveLength(12);
    expect(capLines(l)).toEqual([...l.slice(0, 12), "and 1 more in the document"]);
  });
});

describe("summaryModel", () => {
  it("a matrix row says what, who produces it, when and to whom; missing parts are left out", () => {
    const m = summaryModel(snap([sec("s1", "Roles", { blocks: [matrix([row("Structural model", { milestone: "Stage 3", recipient: "Client" }), row("Fire strategy"), row("", {}), row("Nothing", { marks: {} })])] })]), base);
    expect(m.sends).toEqual(["Structural model — STR, Stage 3, to Client", "Fire strategy — STR", "Nothing"]);
    expect(m.teams).toEqual(["Team STR (STR)", "Team ARC (ARC)"]);
  });
  it("MIDP rows of the document's live list follow the matrix rows", () => {
    const blocks = [{ id: "lv", kind: "live_view", title: "", data: { source: "midp", filter: { team: null, stage: null, register_part: null } } }];
    const live = { at: "t", blocks: { lv: { kind: "live_view", source: "midp", words: "", columns: [], edit_hint: "", rows: [{ container: "STR-MOD-001", team: "STR", due: "2026-12-01" }, { title: "Plan", team: "", due: "" }] } } };
    const m = summaryModel(snap([sec("s1", "MIDP", { blocks })]), { ...base, live });
    expect(m.sends).toEqual(["STR-MOD-001 — STR, due 2026-12-01", "Plan"]);
  });
  it("What controls the work lists sections bound to a check that runs, then the score line", () => {
    const m = summaryModel(snap([sec("s1", "Roles", { bindings: { checks: [{ id: "roles.responsibility" }, { id: "federation.breakdown" }] } }), sec("s2", "Context", {}), sec("s3", "Empty", { body: "", bindings: { checks: [{ id: "cde.states" }] } })]), base);
    expect(m.controls).toEqual(["Roles: Responsibilities", "Empty: CDE states used", "33 % controlling, 2 of 3 sections written"]);
    expect(m.open).toEqual(["Not written: Empty"]);
  });
  it("Still open: unwritten sections, EIR clauses not answered and review reasons; none for a published version", () => {
    const link = { id: "e", kind: "eir_link", title: "", data: { clauses: [{ clause_id: "c1", note: "" }] } };
    const input = { ...base, eirClauses: [{ id: "c1", heading: "Delivery" }, { id: "c2", heading: "Security" }], round: { needs_review: ["The EIR changed"] } };
    const m = summaryModel(snap([sec("s1", "A", { blocks: [link] })]), input);
    expect(m.open).toEqual(["EIR clause not answered: Security", "Needs a review: The EIR changed"]);
    const v = { version_no: 1, label: "Tender issue", revision: "P01", suitability: "S4", published_at: "2026-11-01T10:00:00Z", published_by: "x", id: "v", sha: null, stage: null };
    expect(summaryModel(snap([sec("s1", "A", { blocks: [link] })]), { ...input, version: v }).open).toEqual(["EIR clause not answered: Security"]);
    // review finding 7: a version that answered an EIR with no published version lists no clauses (today's EIR is not what it answered) and says so
    expect(summaryModel(snap([sec("s1", "A", { blocks: [link] })]), { ...input, version: v, eirClauses: null, eirNotFrozen: true }).open)
      .toEqual(["EIR clauses are not listed: the EIR had no published version when this one was published."]);
  });
  it("a draft's head ends Draft, live data; a published version reads its frozen snapshot, never live", () => {
    const blocks = [{ id: "lv", kind: "live_view", title: "", data: { source: "midp", filter: { team: null, stage: null, register_part: null } } }];
    const mk = (rows: unknown[]) => ({ at: "t", blocks: { lv: { kind: "live_view", source: "midp", words: "", columns: [], edit_hint: "", rows } } });
    const draft = summaryModel(snap([sec("s1", "A")]), base);
    expect(draft.head).toEqual(["Snowdon BEP", "Project: snowdon", "Status: Draft", "Version: Draft", "Revision: —", "Suitability: S0", "Date: 2026-11-14", "Draft, live data"]);
    const v = { version_no: 2, label: "Confirmed", revision: "P02", suitability: "A1", published_at: "2026-11-01T10:00:00Z", published_by: "x", id: "v", sha: null, stage: null };
    const frozen = summaryModel(snap([sec("s1", "A", { blocks })], { frozen: mk([{ container: "FROZEN-1", team: "ARC" }]) }), { ...base, version: v, live: mk([{ container: "LIVE-1", team: "ARC" }]) });
    expect(frozen.sends).toEqual(["FROZEN-1 — ARC"]);
    expect(frozen.head).toEqual(["Snowdon BEP", "Project: snowdon", "Status: Published", "Version: v2, Confirmed", "Revision: P02", "Suitability: A1", "Date: 2026-11-01"]);
    const noFrozen = summaryModel(snap([sec("s1", "A", { blocks })]), { ...base, version: v, live: mk([{ container: "LIVE-1", team: "ARC" }]) });
    expect(noFrozen.sends).toEqual([]);
  });
  it("a 13th line becomes and n more in the document", () => {
    const rows = Array.from({ length: 14 }, (_, i) => row(`R${i}`));
    const m = summaryModel(snap([sec("s1", "A", { blocks: [matrix(rows)] })]), base);
    expect(m.sends).toHaveLength(13);
    expect(m.sends[12]).toBe("and 2 more in the document");
  });
});

describe("the sheet", () => {
  it("shows the five parts as text only and prints through the popup", () => {
    const m = summaryModel(snap([sec("s1", "A <b>x</b>", { body: "" })]), base), d = fakeDocument(), el = summarySheet(m, d);
    expect(textOf(el)).toContain("A <b>x</b>"); // as text
    for (const t of ["Task teams", "Who sends what, when, to whom", "What controls the work", "Still open"]) expect(textOf(el)).toContain(t);
    const { win, popup } = fakeWindow();
    expect(printSummary(m, win)).toBe("printed");
    expect(popup!.printed).toBe(true);
    expect(textOf(popup!.document.body)).toContain("Snowdon BEP");
    expect(printSummary(m, fakeWindow({ blocked: true }).win)).toBe("blocked");
  });
});

describe("summaryView", () => {
  it("loads, draws the sheet and enables Print", async () => {
    const st = { ...emptyState("snowdon"), doc: snap([sec("s1", "Roles", { bindings: { checks: [{ id: "cde.states" }] } })]), role: "lead" };
    const ws = { state: () => st, get: vi.fn(async (p: string) => (p === "/bimdocs/checks" ? registry : null)) };
    const ctx = { ws, st, doc: fakeDocument(), base: "http://b" } as any;
    const el = summaryView(ctx);
    const print = findAll(el, "button").find((b) => textOf(b) === "Print the summary") as any;
    expect(print.disabled).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(textOf(el)).toContain("Roles: CDE states used");
    expect(print.disabled).toBe(false);
    void click;
  });
});
