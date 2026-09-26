// The web Publish on a version the database will not publish unasked (migration 0031): the refusal comes back as a
// question for the lead, the lead's reason goes out as `override` — never blank, never on any other refusal.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { transitionVersion, NEEDS_REASON } from "./cde-transition";

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const ASK = `version ${V} has no accepted verdict that measured something (latest: verdict:recorded, ledger #812) — publishing it needs the lead's reason`;
const NO_USER = `version ${V} has no accepted verdict that measured something (latest: verdict:recorded, ledger #812) — the lead's reason is taken only from a signed-in lead, and this call has no signed-in user`;
const sent = (i = 0) => JSON.parse(bfetch.mock.calls[i][1].body);

describe("transitionVersion — POST /cde/versions/:vid/transition", () => {
  beforeEach(() => bfetch.mockReset());

  it("posts state, actor and note, and no override when none is given", async () => {
    bfetch.mockResolvedValue(res(200, { id: V, state: "shared" }));
    expect(await transitionVersion("http://b/", V, "shared", { actor: "web", note: "Share →" })).toEqual({ ok: true });
    expect(bfetch).toHaveBeenCalledWith(`http://b/cde/versions/${V}/transition`, expect.objectContaining({ method: "POST" }));
    expect(sent()).toEqual({ state: "shared", actor: "web", note: "Share →" });
  });

  it("a 409 that needs the lead's reason is a question, not a failure — and nothing is retried", async () => {
    bfetch.mockResolvedValue(res(409, { message: ASK }));
    expect(NEEDS_REASON).toBe("needs the lead's reason");
    expect(await transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).toEqual({ needsReason: ASK });
    expect(bfetch).toHaveBeenCalledTimes(1);
  });

  it("sends the lead's reason trimmed as override", async () => {
    bfetch.mockResolvedValue(res(200, { id: V, state: "published" }));
    expect(await transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "  client sign-off 2026-09-26  " })).toEqual({ ok: true });
    expect(sent()).toEqual({ state: "published", actor: "web", note: "Publish →", override: "client sign-off 2026-09-26" });
  });

  it("a blank reason is never sent: the question comes back", async () => {
    bfetch.mockResolvedValue(res(409, { message: ASK }));
    expect(await transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "   " })).toEqual({ needsReason: ASK });
    expect(sent()).not.toHaveProperty("override");
  });

  it("a reason the database refuses (no signed-in lead behind it) throws its words", async () => {
    bfetch.mockResolvedValue(res(409, { message: NO_USER }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →", override: "because" }))
      .rejects.toThrow(NO_USER);
  });

  it("any other refusal throws — a role (403) or an illegal move (409) is never answered with a reason", async () => {
    bfetch.mockResolvedValue(res(403, { message: "insufficient role to transition (needs lead or owner)" }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).rejects.toThrow("insufficient role to transition (needs lead or owner)");
    bfetch.mockResolvedValue(res(409, { message: "illegal ISO 19650 transition: wip -> published" }));
    await expect(transitionVersion("http://b", V, "published", { actor: "web", note: "Publish →" })).rejects.toThrow("illegal ISO 19650 transition: wip -> published");
  });

  it("a failure without a message names the status", async () => {
    bfetch.mockResolvedValue(res(502, null));
    await expect(transitionVersion("http://b", V, "archived", { actor: "web", note: "Archive" })).rejects.toThrow("HTTP 502");
  });
});
