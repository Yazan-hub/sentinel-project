// SEC-8: judge-again's platform download (the SDK mocked) and its route's order, pinned by text where a live call is the founder's.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

const { downloadFile } = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock("./thatopen-client.mjs", () => ({ getConfig: () => ({ token: "t", projectId: "P", apiUrl: "u" }), createClient: () => ({ downloadFile }) }));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, "");

describe("SEC-8 judge-again: the platform's bytes at the tag the link recorded (downloadIfc, the SDK mocked)", () => {
  it("asks the item at the recorded version tag and answers its bytes", async () => {
    downloadFile.mockReset().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const { downloadIfc } = await import("./platform-publish.mjs");
    expect([...(await downloadIfc("item-ifc", "P07"))]).toEqual([1, 2, 3]);
    expect(downloadFile.mock.calls).toEqual([["item-ifc", { versionTag: "P07" }]]);
  });

  it("a link with no tag (made before SEC-7) asks the item's own version", async () => {
    downloadFile.mockReset().mockResolvedValue(new Response(new Uint8Array([4])));
    const { downloadIfc } = await import("./platform-publish.mjs");
    await downloadIfc("item-ifc", null);
    expect(downloadFile.mock.calls).toEqual([["item-ifc", undefined]]);
  });

  it("a download the platform refuses is said with the tag and the status — nothing is judged", async () => {
    downloadFile.mockReset().mockResolvedValue(new Response("no", { status: 404 }));
    const { downloadIfc } = await import("./platform-publish.mjs");
    await expect(downloadIfc("item-ifc", "P07")).rejects.toMatchObject({ status: 502, message: 'the platform did not serve version tag "P07" of item item-ifc (HTTP 404) — nothing was judged' });
  });
});

describe("SEC-8 judge-again's route", () => {
  it("asks the lead role and a trusted caller before a byte of the body is read, and reads it under the named model cap", () => {
    const svc = read("./bcf-service.mjs");
    const at = svc.indexOf('if (p2 === "versions" && p3 && p4 === "judge" && !seg[5] && req.method === "POST") {');
    const lead = svc.indexOf('await requireMinRole(p1, "lead");', at);
    const spend = svc.indexOf("await requireSpend(p1);", at);
    const body = svc.indexOf("const bytes = await readRaw(req, { max: uploadCap() });", at);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(lead);
    expect(lead).toBeLessThan(spend);
    expect(spend).toBeLessThan(body);
    expect(read("../../config/.env.template")).toMatch(/^# A model upload \(POST \/ifc, Governed Intake, the manifests backfill, judge-again\)/m);
  });
});
