import { describe, it, expect } from "vitest";
import { sheetMidpLine } from "./sheet-midp";

const rows = [{ container_name: "ASTR26-AST-ZZ-00-DR-A-0100", status: "in_wip", due_date: "2027-01-31" }];
const proposed = (container_name: string) => ({ container_name, verdict: "recorded" });

describe("sheetMidpLine", () => {
  it("matches a proposed sheet's container to its MIDP row (extension and case ignored) and says the status", () => {
    expect(sheetMidpLine(proposed("astr26-ast-zz-00-dr-a-0100.PDF"), rows, null)).toEqual({ text: "MIDP: in WIP — not published · due 2027-01-31", color: "#eab308" });
    expect(sheetMidpLine(proposed("X.pdf"), [{ container_name: "X", status: "delivered", due_date: null }], null).text).toBe("MIDP: delivered");
  });
  it("a container no row plans, a failed read and a sheet never proposed are each said as such", () => {
    expect(sheetMidpLine(proposed("OTHER.pdf"), rows, null).text).toBe("not in the MIDP");
    expect(sheetMidpLine(proposed("OTHER.pdf"), null, "HTTP 500").text).toBe("MIDP not read — HTTP 500");
    expect(sheetMidpLine({}, rows, null).text).toBe("not proposed — exported before Publish Sheets proposed each sheet");
  });
  it("a refused name and an unreached bridge are said in their own words — never looked up in the MIDP", () => {
    expect(sheetMidpLine({ container_name: "A-101.pdf", verdict: "rejected", refusal: "expected 7 fields — held on the web" }, rows, null))
      .toEqual({ text: "refused — expected 7 fields — held on the web", color: "#f87171" });
    expect(sheetMidpLine({ container_name: "A-101.pdf", proposal_error: "not proposed — bridge returned HTTP 503" }, rows, null).text).toBe("not proposed — bridge returned HTTP 503");
  });
});
