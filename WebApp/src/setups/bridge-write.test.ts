// bwrite — a panel's write to the bridge says the bridge's refusal instead of "done" (H0: a viewer's or a contributor's
// write the bridge refuses comes back as a 403 in its words, and bfetch alone never looked).
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./auth", () => ({ accessToken: async () => null }));

import { bwrite } from "./bridge-fetch";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const answer = (status: number, body: string) => { globalThis.fetch = vi.fn(async () => new Response(body, { status })) as typeof fetch; };

describe("bwrite", () => {
  it("returns the parsed reply of a 2xx, null for an empty one", async () => {
    answer(201, JSON.stringify({ guid: "g1" }));
    expect(await bwrite<{ guid: string }>("http://bridge/x", { method: "POST" })).toEqual({ guid: "g1" });
    answer(200, "");
    expect(await bwrite("http://bridge/x", { method: "POST" })).toBeNull();
  });

  it("throws the bridge's words on a refusal", async () => {
    answer(403, JSON.stringify({ message: "this action requires the contributor role (you are viewer)" }));
    await expect(bwrite("http://bridge/x", { method: "POST" })).rejects.toThrow("this action requires the contributor role (you are viewer)");
  });

  it("names the status when a refusal has no words", async () => {
    answer(502, "");
    await expect(bwrite("http://bridge/x", { method: "PUT" })).rejects.toThrow("HTTP 502");
  });
});
