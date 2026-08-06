// Pins the resolveActor WIRING at the real sinks (audit, recordAudit, transition): a future edit that
// silently un-wires one of them fails here, not in production. globalThis.fetch is stubbed — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runWithAuth } from "./bridge-auth.mjs";
import { audit, recordAudit, transition } from "./cde-store.mjs";

const jwt = (payload) =>
  "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify(payload)).toString("base64url") + ".sig";

let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    // ensureProject's reads: authoritative lookup + (when forwarding) the RLS visibility check.
    if (String(url).includes("projects?")) return new Response(JSON.stringify([{ id: "p1", key: "demo" }]), { status: 200 });
    return new Response("[]", { status: 200 });
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

const lastBody = () => calls[calls.length - 1].body;

describe("actor wiring at the sinks", () => {
  it("audit(): JWT identity overrides the claimed actor", async () => {
    await runWithAuth(jwt({ email: "real@x.com" }), () => audit("p1", "event", null, "t", "SPOOFED", null, null));
    expect(lastBody().actor).toBe("real@x.com");
  });

  it("audit(): machine path keeps the claim", async () => {
    await audit("p1", "event", null, "t", "outbox", null, null);
    expect(lastBody().actor).toBe("outbox");
  });

  it("recordAudit(): the previously-raw sink now overrides too", async () => {
    await runWithAuth(jwt({ email: "real@x.com" }), () => recordAudit("demo", { action: "t", actor: "SPOOFED" }));
    const auditPost = calls.find((c) => c.url.includes("audit_log"));
    expect(auditPost.body.actor).toBe("real@x.com");
  });

  it("recordAudit(): machine path keeps the claim", async () => {
    await recordAudit("demo", { action: "t", actor: "bcf-sync" });
    expect(calls.find((c) => c.url.includes("audit_log")).body.actor).toBe("bcf-sync");
  });

  it("transition(): JWT identity overrides; claim survives machine path; default is web", async () => {
    await runWithAuth(jwt({ email: "real@x.com" }), () => transition("22222222-2222-4222-8222-222222222222", "shared", "SPOOFED", "n"));
    expect(lastBody().p_actor).toBe("real@x.com");
    await transition("22222222-2222-4222-8222-222222222222", "shared", "revit-pilot", "n");
    expect(lastBody().p_actor).toBe("revit-pilot");
    await transition("22222222-2222-4222-8222-222222222222", "shared", undefined, "n");
    expect(lastBody().p_actor).toBe("web");
  });
});
