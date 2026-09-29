// The take-off revisions store (item 6 step 0): a failed read or save throws its reason — never an empty list or a
// null the panels took for "saved locally" — and a revision whose rows carry no quantity is never handed out to price.
import { describe, it, expect, vi, beforeEach } from "vitest";

const answer = vi.hoisted(() => ({ fn: (_url: string, _init?: RequestInit): Promise<Response> => Promise.reject(new Error("unset")) }));
vi.mock("./bridge-fetch", () => ({ bfetch: (url: string, init?: RequestInit) => answer.fn(url, init) }));
const { fetchRevisionSnapshots, fetchRevisions, postRevision, NO_QUANTITIES } = await import("./snapshot-store");

const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
beforeEach(() => { answer.fn = () => json([]); });

describe("snapshot-store", () => {
  it("rows with quantities are handed out; rows of identities only throw — never priced as count 1, area 0", async () => {
    answer.fn = () => json([{ guid: "w1", category: "IFCWALL", count: 1, area: 12 }]);
    expect((await fetchRevisionSnapshots("b", "p", "r"))[0].quantities).toEqual({ count: 1, area: 12 });
    answer.fn = () => json([{ guid: "w1", category: "IFCWALL", count: null, area: null }]);
    await expect(fetchRevisionSnapshots("b", "p", "r")).rejects.toThrow(NO_QUANTITIES);
  });

  it("a refused or unreached read throws its reason — never an empty history", async () => {
    answer.fn = () => json({ message: "this action requires membership" }, 403);
    await expect(fetchRevisions("b", "p")).rejects.toThrow("this action requires membership");
    answer.fn = () => Promise.reject(new Error("Failed to fetch"));
    await expect(fetchRevisionSnapshots("b", "p", "r")).rejects.toThrow("can't reach the bridge (Failed to fetch)");
  });

  it("a save answers its id, or throws why it was not saved", async () => {
    answer.fn = () => json({ revision_id: "rev-1" }, 201);
    expect(await postRevision("b", "p", [])).toBe("rev-1");
    answer.fn = () => json({ message: "CDE not configured" }, 503);
    await expect(postRevision("b", "p", [])).rejects.toThrow("CDE not configured");
  });
});
