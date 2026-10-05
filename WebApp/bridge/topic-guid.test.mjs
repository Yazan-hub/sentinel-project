// SEC-1 (A): a topic's, a viewpoint's or a comment's viewpoint guid is a UUID — the one a caller sent, or one the bridge makes; anything else is a
// 400 before anything is saved. Pure: no network.
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  // cde-store reads its config at import; without config/.env (CI) these make the store "configured". Nothing is fetched.
  process.env.SUPABASE_URL ||= "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_KEY ||= "fixture-service-key";
});

import { readFileSync } from "node:fs";
import { guidOrNew, newTopicObject } from "./cde-store.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const G = "0f8fad5b-d9cb-469f-a165-70867728950e";
const refusal = (f) => { try { f(); } catch (e) { return { status: e.status, message: e.message }; } return null; };
const WORDS = { status: 400, message: "a guid is a UUID (8-4-4-4-12 hex) — nothing was saved" };

describe("guidOrNew — a topic's or a viewpoint's guid", () => {
  it("keeps a UUID the caller sent, and makes one when none was sent", () => {
    expect(guidOrNew(G)).toBe(G);
    expect(guidOrNew(undefined)).toMatch(UUID);
    expect(guidOrNew("")).toMatch(UUID);
  });

  it("refuses anything else with a 400 in words", () => {
    for (const g of ["x", `${G}"`, 42, {}]) expect(refusal(() => guidOrNew(g))).toEqual(WORDS);
  });

  it("a new topic, a new viewpoint and a comment's viewpoint_guid take their guid through it", () => {
    expect(refusal(() => newTopicObject("demo", { title: "T", guid: "not-a-guid" }))).toEqual(WORDS);
    expect(newTopicObject("demo", { title: "T" }).guid).toMatch(UUID);
    const routes = readFileSync(new URL("./bcf-service.mjs", import.meta.url), "utf8");
    expect(routes).toContain("const v = { guid: cde.guidOrNew(b.guid),");
    // a comment's viewpoint_guid is null, or a UUID, or the same 400 (C12)
    expect(routes).toContain("viewpoint_guid: b.viewpoint_guid ? cde.guidOrNew(b.viewpoint_guid) : null };");
  });
});
