import { describe, it, expect } from "vitest";
import { classifyNominated, classifyOneProducer, classifyDocSuitability, classifyLoin } from "./doc-checks.mjs";
import { CHECKS, PLANNED_CHECKS, getCheck } from "./check-registry.mjs";

const bep = (blocks, title = "BEP") => [{ id: "d1", title, status: "wip", sections: [{ id: "s1", heading: "Team", blocks }] }];
const people = (...cells) => bep([{ id: "b", kind: "table", title: "People", data: { columns: [{ key: "who", label: "Person", type: "person" }, { key: "fn", label: "Function", type: "text" }], rows: cells.map((c, i) => ({ id: `r${i}`, cells: { who: c, fn: "x" } })) } }]);
const members = [{ email: "a@x.com", state: "active" }, { email: "b@x.com", state: "invited" }];

describe("people.nominated", () => {
  it("flags an invited member and a stranger; case and spaces match; empty cells are not counted", () => {
    const r = classifyNominated(people("A@x.com ", "b@x.com", "", "Sam"), members);
    expect([r.status, r.count]).toEqual(["violations", 2]);
    expect(r.evidence.map((e) => e.detail)).toEqual(["b@x.com is invited and has not signed in yet", "Sam is not a member of this project"]);
  });
  it("is met when every named person is active (singular and plural)", () => {
    expect(classifyNominated(people(" a@X.com"), members)).toMatchObject({ status: "met", summary: "All 1 nominated person is an active member." });
    expect(classifyNominated(people("a@x.com", "c@x.com"), [...members, { email: "c@x.com", state: "active" }]).summary).toBe("All 2 nominated people are active members.");
  });
  it("is not checkable with no person column or only empty cells", () => {
    const reason = "No table names people yet: add them to a table with a Person column in the BEP.";
    expect(classifyNominated(people("", " "), members)).toMatchObject({ status: "not_checkable", reason });
    expect(classifyNominated(bep([{ id: "b", kind: "table", title: "T", data: { columns: [{ key: "a", label: "A", type: "text" }], rows: [{ id: "r", cells: { a: "x" } }] } }]), members).status).toBe("not_checkable");
    expect(classifyNominated([], members).status).toBe("not_checkable");
  });
  it("is not checkable when the members' e-mails could not be read (the list falls back to ids), never 'not a member' for everyone", () => {
    expect(classifyNominated(people("a@x.com"), [{ email: "6f1c0c1e-0000-4000-8000-000000000001", state: "active" }]))
      .toMatchObject({ status: "not_checkable", reason: "The members' e-mail addresses could not be read just now. Try again in a minute." });
  });
});

describe("roles.one_producer", () => {
  const matrix = (rows, cols = [{ key: "c1", label: "STR", team: "STR" }, { key: "c2", label: "X", team: null }, { key: "c3", label: "Y", team: "ZZZ" }]) =>
    bep([{ id: "m", kind: "matrix", title: "M", data: { preset: null, columns: cols, show_milestone: false, show_recipient: false, rows } }]);
  const teams = [{ code: "str" }];
  it("flags a row with no produces mark and a producer column that names no declared team; ignores unlabeled rows", () => {
    const r = classifyOneProducer(matrix([
      { id: "1", label: "Walls", marks: { c1: "contributes" } },
      { id: "2", label: "Slabs", marks: { c2: "produces" } },
      { id: "3", label: "Doors", marks: { c3: "produces" } },
      { id: "4", label: "Roofs", marks: { c1: "produces" } },
      { id: "5", label: "  ", marks: {} },
    ]), teams);
    expect([r.status, r.count]).toEqual(["violations", 3]);
    expect(r.evidence.map((e) => e.detail)).toEqual(["Walls has no task team that produces it", "Slabs is produced by a column that names no declared task team", "Doors is produced by a column that names no declared task team"]);
  });
  it("is met when every row has one declared producer; not checkable with no rows", () => {
    expect(classifyOneProducer(matrix([{ id: "1", label: "Walls", marks: { c1: "produces" } }]), teams).status).toBe("met");
    expect(classifyOneProducer(matrix([{ id: "1", label: "", marks: {} }]), teams)).toMatchObject({ status: "not_checkable", reason: "No responsibility matrix has rows yet." });
  });
  it("F-RUN-2: a column with no team whose name is a declared team code counts as that team; a named team wins over the name", () => {
    const cols = [{ key: "c1", label: " Str ", team: null }, { key: "c2", label: "STR", team: "ZZZ" }];
    expect(classifyOneProducer(matrix([{ id: "1", label: "Walls", marks: { c1: "produces" } }], cols), teams).status).toBe("met");
    expect(classifyOneProducer(matrix([{ id: "1", label: "Walls", marks: { c2: "produces" } }], cols), teams).status).toBe("violations");
  });
});

describe("docs.suitability", () => {
  it("flags a disallowed code on the latest version; a version with no code (published with no review chain) is not judged", () => {
    const r = classifyDocSuitability([
      { title: "A", latest: { version_no: 2, suitability: null } }, { title: "B", latest: { version_no: 1, suitability: "S0" } },
      { title: "C", latest: { version_no: 3, suitability: "S9" } }, { title: "D", latest: { version_no: 1, suitability: "A1" } }, { title: "E", latest: null },
    ]);
    expect([r.status, r.count]).toEqual(["violations", 1]);
    expect(r.evidence.map((e) => e.detail)).toEqual(["C v3 is S9, which is not an allowed code"]);
    expect(r.summary).toBe("1 of 2 issued documents without an allowed suitability code.");
    expect(classifyDocSuitability([{ title: "A", latest: { version_no: 1, suitability: null } }, { title: "B", latest: { version_no: 1, suitability: "S0" } }]))
      .toMatchObject({ status: "not_checkable", reason: "No document has been issued through a review round yet: a suitability code is given when a round issues a version." });
  });
  it("honours params.allowed; not checkable with nothing issued", () => {
    expect(classifyDocSuitability([{ title: "D", latest: { version_no: 1, suitability: "A1" } }], ["S3"]).status).toBe("violations");
    expect(classifyDocSuitability([{ title: "D", latest: { version_no: 1, suitability: "S3" } }], ["S3"]).status).toBe("met");
    expect(classifyDocSuitability([{ title: "D", latest: null }])).toMatchObject({ status: "not_checkable", reason: "No document has been issued or published yet." });
  });
});

describe("loin.levels", () => {
  const loin = (rows) => bep([{ id: "l", kind: "loin", title: "L", data: { rows: rows.map((r, i) => ({ id: `r${i}`, element: "Walls", milestone: "Stage 3", property: "Pset_WallCommon.FireRating", value: "", used_by: "", why: "", ...r })) } }]);
  it("names a missing field and an unmappable row; met when all map", () => {
    const r = classifyLoin(loin([{}, { milestone: "" }, { element: "Widgets" }, { element: "", property: "" }]));
    expect([r.status, r.count]).toEqual(["violations", 3]);
    expect(r.evidence.map((e) => e.detail)).toEqual(["Row 2: no milestone", 'Row 3: No IFC class is known for "Widgets".', "Row 4: no element, no property"]);
    expect(classifyLoin(loin([{}, { element: "IfcDoor", property: "FireRating" }]))).toMatchObject({ status: "met", summary: "2 rows, complete and mapped to data requirements." });
  });
  it("is not checkable with no rows", () => {
    expect(classifyLoin(loin([]))).toMatchObject({ status: "not_checkable", reason: "No level of information need table has rows yet." });
  });
});

describe("registry", () => {
  it("registers the four checks; loin.levels is no longer planned; exchanges.scheduled is", () => {
    for (const id of ["people.nominated", "roles.one_producer", "docs.suitability", "loin.levels"]) expect(getCheck(id)).toBeTruthy();
    expect(CHECKS.find((c) => c.id === "docs.suitability").params_schema.allowed.default).toEqual(["S1", "S2", "S3", "S4", "S5", "A1", "A2", "A3"]);
    expect(CHECKS.find((c) => c.id === "people.nominated").label).toBe("Nominated people are project members");
    expect(CHECKS.find((c) => c.id === "roles.one_producer").label).toBe("One responsible task team per element");
    expect(PLANNED_CHECKS.some((p) => p.id === "loin.levels")).toBe(false);
    expect(PLANNED_CHECKS.find((p) => p.id === "exchanges.scheduled")).toMatchObject({ label: "Exchanges made as scheduled", reason: "Exchanges are not compared with files uploaded to the project yet." });
  });
});
