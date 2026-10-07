// The web Publish on a version the database will not publish unasked (migration 0031): the refusal comes back as a
// question for the lead, the lead's reason goes out as `override` — never blank, never on any other refusal.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));

import { readFileSync } from "node:fs";
import { transitionVersion, unarchiveFile, NEEDS_REASON, nextAttachRevision, boardLockedWords } from "./cde-transition";

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

// SEC-3 (0040): a restore reads the version's verdict as a publish does — Unarchive asks the lead for a reason the same way.
describe("unarchiveFile — POST /cde/:key/files/unarchive", () => {
  const C = "cccccccc-0000-4000-8000-000000000001";
  const RESTORE = `version ${V} has no accepted verdict that measured something (latest: none) — restoring it needs the lead's reason`;
  beforeEach(() => bfetch.mockReset());

  it("posts the file and the actor, and answers how many versions were restored", async () => {
    bfetch.mockResolvedValue(res(200, { ok: true, restored: 2 }));
    expect(await unarchiveFile("http://b/", "aster tower", C, { actor: "lead@example.test" })).toEqual({ ok: true, restored: 2 });
    expect(bfetch).toHaveBeenCalledWith("http://b/cde/aster%20tower/files/unarchive", expect.objectContaining({ method: "POST" }));
    expect(sent()).toEqual({ container_id: C, actor: "lead@example.test" });
  });

  it("a 409 that needs the lead's reason is a question; the reason then goes out trimmed as override, never blank", async () => {
    bfetch.mockResolvedValue(res(409, { message: RESTORE }));
    expect(await unarchiveFile("http://b", "p", C, { actor: "w" })).toEqual({ needsReason: RESTORE });
    expect(await unarchiveFile("http://b", "p", C, { actor: "w", override: "   " })).toEqual({ needsReason: RESTORE });
    expect(sent(1)).not.toHaveProperty("override");
    bfetch.mockResolvedValue(res(200, { ok: true, restored: 1 }));
    expect(await unarchiveFile("http://b", "p", C, { actor: "w", override: " client sign-off " })).toEqual({ ok: true, restored: 1 });
    expect(sent(2)).toEqual({ container_id: C, actor: "w", override: "client sign-off" });
  });

  it("a partial restore's refusal (how many were restored, then the database's words) is the same question", async () => {
    const partial = `1 of 2 archived versions restored — ${RESTORE}`;
    bfetch.mockResolvedValue(res(409, { message: partial }));
    expect(await unarchiveFile("http://b", "p", C, { actor: "w" })).toEqual({ needsReason: partial });
  });

  it("any other refusal throws its words", async () => {
    bfetch.mockResolvedValue(res(403, { message: "insufficient role to transition (needs lead or owner)" }));
    await expect(unarchiveFile("http://b", "p", C, { actor: "w" })).rejects.toThrow("insufficient role to transition (needs lead or owner)");
  });

  it("the Files window's Unarchive asks for the reason inline and sends it", () => {
    const src = readFileSync(new URL("./files-panel.ts", import.meta.url), "utf8");
    expect(src).toContain("const r = await unarchiveFile(base, pid(), f.id, { actor: await whoami(), override: reason });");
    // the list is read again before the question shows: a partial restore changed it
    expect(src).toContain('if ("needsReason" in r) { unarchiveAsk = { id: f.id, message: r.needsReason }; await load();');
    expect(src).toContain("} catch (e) { await load(); status(`unarchive failed: ");
    expect(src).toContain("data-funarchiveok=");
    expect(src).not.toContain('fileAction("unarchive"');
  });
});

describe("nextAttachRevision — the CDE panel's label for an encrypted attach (SEC-4 K-c, review C13)", () => {
  it("counts the file's versions and Deleted items, and steps past a label the file already holds (trimmed, any case)", () => {
    expect(nextAttachRevision({ container_versions: [{ revision: "P01" }], deleted_versions: 0 })).toBe("P02");
    expect(nextAttachRevision({ container_versions: [{ revision: "P01" }, { revision: "P03" }], deleted_versions: 0 })).toBe("P04");
    expect(nextAttachRevision({ container_versions: [{ revision: "p02 " }], deleted_versions: 0 })).toBe("P03");
    expect(nextAttachRevision({ container_versions: [], deleted_versions: 1 })).toBe("P02");
    expect(nextAttachRevision({})).toBe("P01");
  });

  it("the encrypted attach sends the stored file's reference, its author and its notes in the body, outside any comment (review, SEC-5)", () => {
    const src = readFileSync(new URL("./cde-panel.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const code = src.split("\n").map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");
    expect(code).toContain("revision: nextAttachRevision(c),");
    expect(code).toContain('author: "web",');
    expect(code).toContain("file_ref: JSON.stringify(stored),");
    expect(code).toContain("notes: `attached ${file.name} (encrypted)`,");
  });
});

describe("boardLockedWords (W-2 G3): the board draws every control for a lead, words for anyone else", () => {
  it("a lead, an owner and the machine get the controls", () => {
    for (const role of ["lead", "owner", "service"]) expect(boardLockedWords({ role, read: true })).toBeNull();
  });
  it("a contributor is told what is a lead's; a read-only caller gets its role words alone, one dash", () => {
    expect(boardLockedWords({ role: "contributor", read: true })).toBe("your role: contributor — sharing, publishing, archiving, deleting folders and key rotation are a lead's");
    expect(boardLockedWords({ role: "viewer", read: true })).toBe("your role: viewer — read-only");
    expect(boardLockedWords({ role: "not-member", read: true })).toBe("not a member of this project (or it was not found) — read-only");
    expect(boardLockedWords({ role: "viewer", read: false })).toBe("role not read — read-only");
  });
});
