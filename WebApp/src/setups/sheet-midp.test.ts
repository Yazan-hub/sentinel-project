import { describe, it, expect } from "vitest";
import { sheetMidpLine } from "./sheet-midp";

const rows = [{ container_name: "ASTR26-AST-ZZ-00-DR-A-0100", status: "in_wip", due_date: "2027-01-31" }];

describe("sheetMidpLine", () => {
  it("matches the sheet's container to its MIDP row (extension and case ignored) and says the status", () => {
    expect(sheetMidpLine("astr26-ast-zz-00-dr-a-0100.PDF", rows, null)).toEqual({ text: "MIDP: in WIP — not published · due 2027-01-31", color: "#eab308" });
    expect(sheetMidpLine("X.pdf", [{ container_name: "X", status: "delivered", due_date: null }], null).text).toBe("MIDP: delivered");
  });
  it("a container no row plans, a failed read and a sheet never proposed are each said as such", () => {
    expect(sheetMidpLine("OTHER.pdf", rows, null).text).toBe("not in the MIDP");
    expect(sheetMidpLine("OTHER.pdf", null, "HTTP 500").text).toBe("MIDP not read — HTTP 500");
    expect(sheetMidpLine(undefined, rows, null).text).toBe("not proposed — exported before Publish Sheets proposed each sheet");
  });
});
