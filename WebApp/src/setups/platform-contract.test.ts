// The contract mirrored to the platform project on install (spec 2026-09-27 platform-delivery-gate, Decision 7).
import { describe, it, expect, vi } from "vitest";
import { publishContractToPlatform, mirrorLine, CONTRACT_ITEM } from "./platform-contract";

const body = { contract_key: "contract@2", ifc_schema: "IFC4", required_entities: [], forbidden_entities: [], required_psets: [], required_properties: [], require_georeference: false };
type Created = { file: File; name: string; versionTag: string; projectId: string };
const client = (items: Array<{ _id: string; name: string; versions?: Array<{ tag: string }> }>, fail?: string) => ({
  listFiles: vi.fn(async () => { if (fail === "list") throw new Error("403 STORAGE:READ"); return items; }),
  createFile: vi.fn(async (_p: Created) => { if (fail === "write") throw new Error("403 STORAGE:CREATE"); return {}; }),
  createVersion: vi.fn(async (_id: string, _b: Blob, _tag: string) => { if (fail === "write") throw new Error("403 STORAGE:CREATE"); return {}; }),
});

describe("publishContractToPlatform", () => {
  it("creates sentinel-contract.json the first time, with the ref as its version tag, in the platform project", async () => {
    const c = client([]);
    expect(await publishContractToPlatform(c, "p1", body, "contract@2")).toEqual({ status: "created", ref: "contract@2" });
    const call = c.createFile.mock.calls[0][0];
    expect([call.name, call.versionTag, call.projectId, call.file.name]).toEqual([CONTRACT_ITEM, "contract@2", "p1", CONTRACT_ITEM]);
    expect(JSON.parse(await call.file.text())).toEqual(body);
    expect(c.createVersion).not.toHaveBeenCalled();
  });

  it("adds a version when the item exists, and writes nothing when that ref is already there", async () => {
    const c = client([{ _id: "c1", name: CONTRACT_ITEM, versions: [{ tag: "contract@1" }] }]);
    expect(await publishContractToPlatform(c, "p1", body, "contract@2")).toEqual({ status: "versioned", ref: "contract@2" });
    expect(c.createVersion.mock.calls[0][0]).toBe("c1");
    expect(c.createVersion.mock.calls[0][2]).toBe("contract@2");
    const d = client([{ _id: "c1", name: CONTRACT_ITEM, versions: [{ tag: "contract@2" }] }]);
    expect(await publishContractToPlatform(d, "p1", body, "contract@2")).toEqual({ status: "already", ref: "contract@2" });
    expect(d.createVersion).not.toHaveBeenCalled();
  });

  it("a platform refusal is 'refused' with the platform's words — never a throw, never 'created'", async () => {
    expect(await publishContractToPlatform(client([], "list"), "p1", body, "contract@2")).toEqual({ status: "refused", ref: "contract@2", why: "403 STORAGE:READ" });
    expect(await publishContractToPlatform(client([], "write"), "p1", body, "contract@2")).toEqual({ status: "refused", ref: "contract@2", why: "403 STORAGE:CREATE" });
  });

  it("no client or no linked platform project: 'no-platform', nothing called", async () => {
    const c = client([]);
    expect(await publishContractToPlatform(c, undefined, body, "contract@2")).toEqual({ status: "no-platform", ref: "contract@2" });
    expect(await publishContractToPlatform(undefined, "p1", body, "contract@2")).toEqual({ status: "no-platform", ref: "contract@2" });
    expect(c.listFiles).not.toHaveBeenCalled();
  });

  it("the Settings line says what the platform holds, or why it does not", () => {
    expect(mirrorLine({ status: "created", ref: "contract@2" })).toBe("also on the platform as sentinel-contract.json contract@2");
    expect(mirrorLine({ status: "versioned", ref: "contract@3" })).toBe("also on the platform as sentinel-contract.json contract@3");
    expect(mirrorLine({ status: "already", ref: "contract@2" })).toBe("already on the platform as sentinel-contract.json contract@2");
    expect(mirrorLine({ status: "refused", ref: "contract@2", why: "403 STORAGE:CREATE" })).toBe("not copied to the platform — 403 STORAGE:CREATE");
    expect(mirrorLine({ status: "no-platform", ref: "contract@2" })).toMatch(/^not copied to the platform — this project is not linked/);
  });
});
