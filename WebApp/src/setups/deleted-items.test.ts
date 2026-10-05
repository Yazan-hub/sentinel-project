// Deleted items (0035): the list is read, never assumed; a restore sends the version only for a version; the rows and the
// restore say what they are in words; Archive is offered only where something is published.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { readDeleted, restoreDeleted, deletedItemLine, restoredLine, archivable, groupDeletedModels, deletedModelWhat, type DeletedItem, type DeletedModel } from "./deleted-items";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const FILE: DeletedItem = { kind: "file", container_id: "c1", iso_name: "AST-ARC.ifc", deleted_at: "2026-09-28T09:41:12Z", deleted_by: "lead@example.test", versions: 4 };
const VER: DeletedItem = { kind: "version", container_id: "c2", iso_name: "AST-STR.ifc", version_id: "v9", revision: "v3", state: "wip", deleted_at: "2026-09-28T10:00:00Z", deleted_by: null };

describe("readDeleted — GET /cde/:key/files/deleted", () => {
  beforeEach(() => { bfetch.mockReset(); }); // a block: a returned function would run as the teardown

  it("answers the list", async () => {
    bfetch.mockResolvedValue(res(200, [FILE]));
    expect(await readDeleted("http://b/", "aster-tower")).toEqual([FILE]);
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/aster-tower/files/deleted");
  });

  it.each([
    ["a refusal", res(403, { message: "not a member" }), "not read — not a member"],
    ["an answer without a list", res(200, { rows: [] }), "not read — the bridge answered without a list"],
    ["a 500 with no body", res(500, null), "not read — HTTP 500"],
  ])("%s is 'not read — …', never an empty list", async (_w, r, msg) => {
    bfetch.mockResolvedValue(r);
    await expect(readDeleted("http://b", "k")).rejects.toThrow(msg);
  });

  it("an unreachable bridge is 'not read — …'", async () => {
    bfetch.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    await expect(readDeleted("http://b", "k")).rejects.toThrow(/^not read — Failed to fetch$/);
  });
});

describe("restoreDeleted — POST /cde/:key/files/restore", () => {
  beforeEach(() => { bfetch.mockReset(); }); // a block: a returned function would run as the teardown

  it("a file sends only its container; a version sends its id too", async () => {
    bfetch.mockResolvedValue(res(200, { restored: true, kind: "file", iso_name: "AST-ARC.ifc", versions: 4 }));
    await restoreDeleted("http://b", "k", FILE, "lead@example.test");
    expect(JSON.parse(bfetch.mock.calls[0][1].body)).toEqual({ container_id: "c1", actor: "lead@example.test" });
    await restoreDeleted("http://b", "k", VER, "lead@example.test");
    expect(JSON.parse(bfetch.mock.calls[1][1].body)).toEqual({ container_id: "c2", version_id: "v9", actor: "lead@example.test" });
  });

  it("a refusal throws the bridge's words", async () => {
    bfetch.mockResolvedValue(res(409, { message: "A file named AST-ARC.ifc is already in this project — rename or delete that file, then restore this one. Nothing was restored." }));
    await expect(restoreDeleted("http://b", "k", FILE, "x")).rejects.toThrow("A file named AST-ARC.ifc is already in this project");
  });
});

describe("the words", () => {
  it("a row names the file or the version, then who and when", () => {
    expect(deletedItemLine(FILE)).toEqual({ what: "AST-ARC.ifc — the file, with 4 version(s)", who: "deleted by lead@example.test · 2026-09-28 09:41" });
    expect(deletedItemLine(VER)).toEqual({ what: "AST-STR.ifc v3 — a wip version", who: "deleted by — · 2026-09-28 10:00" });
    expect(deletedItemLine({ ...FILE, versions: 0, deleted_versions: 4 }).what).toBe("AST-ARC.ifc — the file, with 0 version(s) (and 4 deleted version(s), restorable after the file)");
  });

  it("a restore says what came back", () => {
    expect(restoredLine({ kind: "file", iso_name: "A.ifc", versions: 2 })).toBe("✓ Restored A.ifc from Deleted items with its 2 version(s).");
    expect(restoredLine({ kind: "file", iso_name: "A.ifc", versions: 0, deleted_versions: 4 })).toBe("✓ Restored A.ifc from Deleted items with its 0 version(s). 4 deleted version(s) it held are still in Deleted items — restore each from the list.");
    expect(restoredLine({ kind: "version", iso_name: "A.ifc", revision: "v3" })).toBe("✓ Restored A.ifc v3 from Deleted items — it comes back in its state, not live.");
  });

  it("Archive is offered only where a version is published", () => {
    expect(archivable([{ state: "wip" }, { state: "shared" }])).toBe(false);
    expect(archivable([])).toBe(false);
    expect(archivable([{ state: "archived" }])).toBe(false);
    expect(archivable([{ state: "wip" }, { state: "published" }])).toBe(true);
  });
});

// The Projects window's Deleted models view (GET /cde/deleted): one group per project, in the order of its newest row;
// the search matches the file name, the project name or its key.
describe("groupDeletedModels — the Deleted models view", () => {
  const at = (p: string, n: string, k: string, t: string, o: string | null = null): DeletedModel => ({ ...FILE, project_key: k, project_name: p, office_name: o, iso_name: n, deleted_at: t });
  const rows = [at("Beta", "B2.ifc", "beta", "2026-09-30"), at("Alpha", "A1.rvt", "alpha", "2026-09-29", "Office A"), at("Beta", "B1.ifc", "beta", "2026-09-28")];

  it("groups by project, newest group first, rows kept newest first", () => {
    expect(groupDeletedModels(rows, "").map((g) => [g.key, g.name, g.office, g.rows.map((r) => r.iso_name)])).toEqual([
      ["beta", "Beta", null, ["B2.ifc", "B1.ifc"]],
      ["alpha", "Alpha", "Office A", ["A1.rvt"]],
    ]);
  });

  it.each([["b1", ["B1.ifc"]], ["ALPHA", ["A1.rvt"]], ["beta", ["B2.ifc", "B1.ifc"]], ["  ", ["B2.ifc", "B1.ifc", "A1.rvt"]], ["zzz", []]])(
    "the search %j matches file name, project name or key", (q, names) => {
      expect(groupDeletedModels(rows, q).flatMap((g) => g.rows.map((r) => r.iso_name))).toEqual(names);
    });

  it("a row says whole file or version", () => {
    expect(deletedModelWhat(FILE)).toBe("whole file (4 versions)");
    expect(deletedModelWhat({ ...FILE, versions: 1 })).toBe("whole file (1 version)");
    expect(deletedModelWhat(VER)).toBe("version v3 (wip)");
  });
});
