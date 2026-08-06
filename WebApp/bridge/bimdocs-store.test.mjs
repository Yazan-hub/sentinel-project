import { describe, it, expect } from "vitest";
import { createDocFromIngest, validateSections, normalizeSource } from "./bimdocs-store.mjs";

// createDocFromIngest hits Supabase (via ensureProject/sb) after validation. These cases must all
// reject with status 400 before any network call — asserted here by never providing a real `key`/
// network, so a pass proves validation ran first (a network attempt would throw/hang differently).
describe("createDocFromIngest input validation (rejects before network)", () => {
  it("rejects missing doc_type", async () => {
    await expect(createDocFromIngest("k", { sections: [{ heading: "A" }] })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects non-array sections", async () => {
    await expect(createDocFromIngest("k", { doc_type: "BEP", sections: "nope" })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects empty sections", async () => {
    await expect(createDocFromIngest("k", { doc_type: "BEP", sections: [] })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a null section element", async () => {
    await expect(createDocFromIngest("k", { doc_type: "BEP", sections: [null] })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a non-object section element", async () => {
    await expect(createDocFromIngest("k", { doc_type: "BEP", sections: ["heading text"] })).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a section missing heading", async () => {
    await expect(createDocFromIngest("k", { doc_type: "BEP", sections: [{ body: "x" }] })).rejects.toMatchObject({ status: 400 });
  });
});

describe("validateSections", () => {
  it("names the bad index in the error message", () => {
    expect(() => validateSections([{ heading: "ok" }, { body: "no heading" }])).toThrowError(/sections\[1\]/);
  });

  it("assigns ids and defaults for valid input", () => {
    const out = validateSections([{ heading: "A", guidance: "g", body: "b" }]);
    expect(out[0].heading).toBe("A");
    expect(out[0].guidance).toBe("g");
    expect(out[0].body).toBe("b");
    expect(out[0].state).toBe("wip");
    expect(out[0].owner).toBeNull();
    expect(out[0].bindings).toEqual({});
    expect(out[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("normalizeSource", () => {
  it("returns null for missing/null source", () => {
    expect(normalizeSource(undefined)).toBeNull();
    expect(normalizeSource(null)).toBeNull();
  });

  it("rejects a non-object source", () => {
    expect(() => normalizeSource("nope")).toThrowError();
  });

  it("strips unknown/extra keys, keeping only the documented five", () => {
    const out = normalizeSource({
      file_id: "f1",
      name: "spec.pdf",
      kind: "pdf",
      pages: 12,
      ingested_at: "2026-08-06T00:00:00Z",
      evil: "dropped",
      __proto__: "dropped too",
    });
    expect(out).toEqual({
      file_id: "f1",
      name: "spec.pdf",
      kind: "pdf",
      pages: 12,
      ingested_at: "2026-08-06T00:00:00Z",
    });
  });
});
