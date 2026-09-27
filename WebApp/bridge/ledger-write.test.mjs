// The ledger's writers (cohesion phase 5a, spec Decision 7): audit() returns the row the ledger stored, and the open
// audit route cannot write the rows Sentinel reads as its own (verdict:, gate:, roi:, state:, stage_gate; since phase 6a
// hold:, hold and delivery_gate; since phase 6b review: and review).
// globalThis.fetch is a fake PostgREST — no network.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import. config/.env wins where it exists; without one (CI) these make the store
  // "configured". fetch is faked either way, so neither is ever called.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { audit, recordAudit } from "./cde-store.mjs";

const P = "11111111-1111-4111-8111-111111111111";
const V = "aaaaaaaa-0000-4000-8000-000000000001";
const HASH = "ab".repeat(32);

let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method, prefer: init.headers?.Prefer ?? null, body });
    if (path === "projects") return new Response(JSON.stringify([{ id: P, key: "aster-tower" }]), { status: 200 });
    // PostgREST answers an insert with the stored row only when asked (return=representation); else an empty 201.
    if (path === "audit_log" && method === "POST")
      return /return=representation/.test(init.headers?.Prefer || "")
        ? new Response(JSON.stringify([{ id: 812, at: "2026-09-26T09:00:00+00:00", hash: HASH, ...body }]), { status: 201 })
        : new Response("", { status: 201 });
    return new Response("[]", { status: 200 });
  });
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("audit() — every writer gets the row the ledger stored", () => {
  it("asks for the row back and returns it: the id a line can name as ledger #", async () => {
    const row = await audit(P, "file_version", V, "geometry linked", "outbox", null, { platform_item_id: "item-42" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "audit_log", method: "POST", prefer: "return=representation" });
    expect(row).toMatchObject({ id: 812, hash: HASH, project_id: P, entity_type: "file_version", entity_id: V, action: "geometry linked", actor: "outbox" });
  });

  it("a reply with no row is null, never a made-up id", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 201 }));
    expect(await audit(P, "event", null, "t", "outbox", null, null)).toBeNull();
    globalThis.fetch = vi.fn(async () => new Response("[]", { status: 201 }));
    expect(await audit(P, "event", null, "t", "outbox", null, null)).toBeNull();
  });
});

describe("POST /cde/:key/audit (recordAudit) — Sentinel's own rows are refused, before any read", () => {
  it.each([
    [{ entity_type: "file_version", entity_id: V, action: "verdict:accepted", new_value: { summary: { in_scope: 41 } } }, "verdict: rows are written by Sentinel, not through this route"],
    [{ entity_type: "container_version", entity_id: V, action: "state:shared->published" }, "state: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", action: "gate:pass design" }, "gate: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", action: "roi:assumption" }, "roi: rows are written by Sentinel, not through this route"],
    [{ entity_type: "stage_gate", action: "Stage advanced to coord" }, "stage_gate rows are written by Sentinel, not through this route"],
    [{ entity_type: "file_version", entity_id: V, action: "  Verdict:accepted" }, "verdict: rows are written by Sentinel, not through this route"],
    [{ entity_type: " Stage_Gate ", action: "recorded" }, "stage_gate rows are written by Sentinel, not through this route"],
    // The Holding Area (phase 6a): a hold is the bridge's own row, and Revit's gate row goes through the machine-only route.
    [{ entity_type: "event", action: "hold:ids Tower.ifc" }, "hold: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", action: " HOLD:dismissed Tower.ifc" }, "hold: rows are written by Sentinel, not through this route"],
    [{ entity_type: "hold", action: "recorded" }, "hold rows are written by Sentinel, not through this route"],
    [{ entity_type: " Hold ", action: "recorded" }, "hold rows are written by Sentinel, not through this route"],
    [{ entity_type: "delivery_gate", action: "IFC delivery gate PASS: tower.ifc" }, "delivery_gate rows are written by Sentinel, not through this route"],
    [{ entity_type: " Delivery_Gate", action: "IFC delivery gate FAIL: tower.ifc" }, "delivery_gate rows are written by Sentinel, not through this route"],
    // The review chain (phase 6b): review:start is cde_transition's, review:approve and review:reject are review_decide's.
    [{ entity_type: "event", entity_id: V, action: "review:approve 1" }, "review: rows are written by Sentinel, not through this route"],
    [{ entity_type: "event", entity_id: V, action: " Review:start" }, "review: rows are written by Sentinel, not through this route"],
    [{ entity_type: "review", entity_id: V, action: "recorded" }, "review rows are written by Sentinel, not through this route"],
    [{ entity_type: " REVIEW ", action: "recorded" }, "review rows are written by Sentinel, not through this route"],
  ])("%j → 400", async (body, message) => {
    await expect(recordAudit("aster-tower", body)).rejects.toMatchObject({ status: 400, message });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["clash", "Clash raised: Wall ↔ Duct"],
    ["ids_validation", "Issue raised: Pset_WallCommon.FireRating"],
    ["naming", "Naming Manager renamed 3 item(s) in Revit"],
    ["family_heal", "Family heal: 2 healed, 0 for a human, 0 failed of 5"],
    ["model", "Model published from Revit: tower"],
    ["event", "verdicts reviewed"],
    ["event", "reviewed: the drawing register"],
  ])("today's writers still land: %s %s", async (entity_type, action) => {
    const row = await recordAudit("aster-tower", { entity_type, action, actor: "Revit" });
    expect(row).toMatchObject({ id: 812, project_id: P, entity_type, action });
  });
});
