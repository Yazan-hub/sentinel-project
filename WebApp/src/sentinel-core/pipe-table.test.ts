import { describe, it, expect } from "vitest";
import { splitPipeRow, isSeparatorRow, readPipeTables } from "./pipe-table";
import { SNOWDON_6 } from "./snowdon-fixture";

describe("pipe tables", () => {
  it("splitPipeRow: outer pipes optional, \\| stays a pipe, cells trimmed", () => {
    expect(splitPipeRow("| a | b |")).toEqual(["a", "b"]); expect(splitPipeRow("a | b")).toEqual(["a", "b"]);
    expect(splitPipeRow("| a \\| b | c |")).toEqual(["a | b", "c"]); expect(splitPipeRow("| a |  |")).toEqual(["a", ""]);
  });
  it("isSeparatorRow", () => {
    for (const l of ["|---|---|", "| --- | :---: |", "---|---", "|:---|"]) expect(isSeparatorRow(l), l).toBe(true);
    for (const l of ["|--|", "| a |", "", "text"]) expect(isSeparatorRow(l), l).toBe(false);
  });
  it("reads Snowdon's section 6 table", () => {
    const [t, ...more] = readPipeTables(SNOWDON_6);
    expect(more).toEqual([]); expect(t.header).toEqual(["Field", "Values proposed"]); expect(t.rows).toHaveLength(6);
    expect(t.rows[4]).toEqual(["Role", "A architect, S structural, M mechanical, P plumbing, E electrical, L landscape"]);
  });
  it("a pipe row without a separator under it is not a table; non-text reads nothing", () => {
    expect(readPipeTables("a | b\nc | d")).toEqual([]); expect(readPipeTables(5 as unknown as string)).toEqual([]);
  });
  it("isSeparatorRow does not stall on a long run of spaces", () => {
    const t = Date.now();
    expect(isSeparatorRow(" ".repeat(40000))).toBe(false);
    expect(isSeparatorRow(" ".repeat(40000) + "x")).toBe(false);
    expect(Date.now() - t).toBeLessThan(50);
  });
  it("readPipeTables keeps a ragged row as written and ends at the first non-pipe line", () => {
    const [t, ...more] = readPipeTables("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |\n\nafter | x\nplain");
    expect(more).toEqual([]); expect(t.rows).toEqual([["1"], ["1", "2", "3"]]);
  });
});
