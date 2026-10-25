import { describe, it, expect } from "vitest";
import type { DocRow, VersionListRow } from "../sentinel-core/doc-blocks";
import { emptyState } from "./workspace-state";
import { fakeDocument, fakeWindow, findAll, textOf } from "./fake-dom";
import { containerIdProblem, coverLines, pickPrintSource, POPUP_BLOCKED, printDocument, PRINT_CSS, renderPrintable, revisionRows, type PrintInput } from "./print-render";

const row = (text: string, o: Partial<DocRow> = {}): DocRow => ({ id: "d1", doc_type: "BEP", title: "SNW Pre-appointment BEP", status: "wip", stage: "pre_appointment", suitability: "S0", responds_to: null, responds_to_version: null,
  template_id: "bep", template_version: 1, updated_at: "t", sections: [{ id: "s1", heading: "1. Project information", guidance: "", body: text, state: "wip", owner: null, bindings: {} }, { id: "s2", heading: "Risks", guidance: "", body: "", state: "wip", owner: null, bindings: {} }], ...o });
const v = (n: number): VersionListRow => ({ id: `v${n}`, version_no: n, label: n === 2 ? "Pre-appointment (tender)" : `v${n}`, published_by: "lead@x", published_at: `2026-10-2${n}T10:00:00Z`, revision: n === 2 ? "P02" : null, stage: "pre_appointment", suitability: "S1", sha: "ab" });
const input = (o: Partial<PrintInput>): PrintInput => ({ row: row("live text"), projectKey: "snowdon-lifecycle", version: null, versions: [v(1), v(2), v(3)], containerId: null, ctx: { respondsTo: null }, ...o });

describe("export (spec section 9)", () => {
  it("the cover of a draft says Draft, live data", () =>
    expect(coverLines(input({}), "2026-10-25")).toEqual(["SNW Pre-appointment BEP", "Project: snowdon-lifecycle", "Container ID: not assigned", "Stage: Pre-appointment (tender)", "Revision: —", "Suitability: S0", "Version: Draft", "Date: 2026-10-25", "Draft, live data"]));
  it("the cover of a version names it", () =>
    expect(coverLines(input({ version: v(2), containerId: "SNW_ARC_ZZ_XX_BP_A_0001" }), "2026-10-25")).toEqual(["SNW Pre-appointment BEP", "Project: snowdon-lifecycle", "Container ID: SNW_ARC_ZZ_XX_BP_A_0001", "Stage: Pre-appointment (tender)", "Revision: P02", "Suitability: S1", "Version: v2, Pre-appointment (tender)", "Date: 2026-10-22"]));
  it("a version recorded before 0049 (no stage or suitability anywhere) prints a dash, never 'undefined'", () => {
    const { stage, suitability, ...old } = row("frozen");
    const lines = coverLines(input({ row: old, version: { ...v(1), stage: null, suitability: null, sha: null } }), "2026-10-25");
    expect(lines).toContain("Stage: —"); expect(lines).toContain("Suitability: —"); expect(lines.join(" ")).not.toContain("undefined");
  });
  it("contents number a heading only when it has no number of its own", () => {
    const contents = findAll(renderPrintable(input({}), fakeDocument(), "2026-10-25"), "section").find((s) => s.dataset.part === "contents")!;
    expect(textOf(contents)).toBe("Contents1. Project information2. Risks");
  });
  it("a version prints its snapshot only (Review Focus 5)", () => {
    const el = renderPrintable(input({ row: row("frozen text"), version: v(2) }), fakeDocument(), "2026-10-25");
    expect(textOf(el)).toContain("frozen text"); expect(textOf(el)).not.toContain("live text"); expect(textOf(el)).not.toContain("Draft, live data");
    expect(findAll(el, "div").some((x) => x.dataset.runningHeader !== undefined)).toBe(false);
    expect(revisionRows([v(3), v(1), v(2)], 2)).toEqual([["v1", "v1", "—", "S1", "lead@x", "2026-10-21"], ["v2", "Pre-appointment (tender)", "P02", "S1", "lead@x", "2026-10-22"]]);
  });
  it("a live print carries the running header", () =>
    expect(findAll(renderPrintable(input({}), fakeDocument(), "2026-10-25"), "div").filter((x) => x.dataset.runningHeader !== undefined).map(textOf)).toEqual(["Draft, live data"]));
  it("the print source: the version viewed, else the latest version of a published document, else live", () => {
    const st = { ...emptyState("k"), doc: row("x", { status: "published" }), versions: [v(3), v(1)] };
    expect(pickPrintSource(st)).toEqual({ kind: "version", n: 3 });
    expect(pickPrintSource({ ...st, viewing: { ...v(1), document_id: "d1", snapshot: row("x") } })).toEqual({ kind: "version", n: 1 });
    expect(pickPrintSource({ ...st, doc: row("x", { status: "shared" }) })).toEqual({ kind: "live" });
  });
  it("the popup is built through its own document and printed; a blocked popup says so (Review Focus 5)", () => {
    const { win, popup } = fakeWindow();
    expect(printDocument(input({}), win)).toBe("printed"); // node has no global document: touching it would throw
    expect(popup!.printed && popup!.focused).toBe(true);
    expect(textOf(popup!.document.body)).toContain("SNW Pre-appointment BEP");
    expect(findAll(popup!.document.head, "style").map(textOf)).toEqual([PRINT_CSS]);
    expect(printDocument(input({}), fakeWindow({ blocked: true }).win)).toBe("blocked");
    expect(POPUP_BLOCKED).toBe("Popup blocked — allow popups for this page to print.");
  });
  it("the print stylesheet: 2 cm margins, page breaks, the running header", () => {
    for (const s of ["@page { margin: 2cm }", "[data-page-break]", "[data-running-header]"]) expect(PRINT_CSS).toContain(s);
  });
  it("a container ID is checked against the naming rule in force", () => {
    const rs = { title: "SNW", separator: "_", enforce: "reject" as const, fields: [{ key: "project", label: "Project", enum: ["SNW"] }, { key: "number", label: "Number", pattern: "^[0-9]{4}$" }] };
    expect(containerIdProblem("SNW_0001", rs)).toBeNull(); expect(containerIdProblem("anything", null)).toBeNull();
    expect(containerIdProblem("SNW", rs)).toMatch(/^This container ID does not follow the naming rule in force: .+\. Nothing was printed\.$/);
  });
});

describe("a popup whose document cannot be reached", () => {
  it("counts as blocked", () => {
    const popup = { focus() {}, print() {}, get document(): Document { throw new Error("denied"); } };
    expect(printDocument(input({}), { open: () => popup } as unknown as Window)).toBe("blocked");
  });
});
