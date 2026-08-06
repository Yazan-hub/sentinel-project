import { describe, it, expect, vi, beforeEach } from "vitest";

// setSectionBindings/complianceReport guard tests need a mocked cde-store.mjs (Supabase network layer)
// so we can assert on the 409/404 guard paths and prove complianceReport never writes. This mirrors
// bimdocs-ingest.test.mjs's vi.mock("./ai-gateway.mjs", ...) pattern, kept in its own file so it never
// interferes with bimdocs-store.test.mjs's unmocked network-rejection tests.
const sb = vi.fn();
const ensureProject = vi.fn();
const audit = vi.fn();
vi.mock("./cde-store.mjs", () => ({
  sb: (...args) => sb(...args),
  ensureProject: (...args) => ensureProject(...args),
  audit: (...args) => audit(...args),
  // real-shape guard: bimdocs-store now imports isUuid to 404 malformed ids before any network call
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")),
}));

const { setSectionBindings, complianceReport, MAX_COMPLIANCE_CHECKS } = await import("./bimdocs-store.mjs");

const makeDoc = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  project_id: "proj1",
  status: "wip",
  updated_at: "2026-01-01T00:00:00Z",
  title: "Doc",
  doc_type: "BEP",
  sections: [{ id: "sec1", heading: "H1", body: "", state: "wip", owner: null, bindings: {} }],
  ...overrides,
});

let doc;
beforeEach(() => {
  sb.mockReset();
  ensureProject.mockReset();
  audit.mockReset();
  doc = makeDoc();
  ensureProject.mockResolvedValue({ id: "proj1" });
  // getDoc issues a plain GET (no opts.method); a PATCH carries opts.method === "PATCH". Route both
  // off the same canned doc so callers only need to mutate `doc` before invoking.
  sb.mockImplementation((path, opts) => Promise.resolve([doc]));
});

describe("setSectionBindings guards (409/404, all pre-mocked network)", () => {
  it("refuses a published document with 409", async () => {
    doc.status = "published";
    await expect(setSectionBindings("k", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: {} })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an archived document with 409", async () => {
    doc.status = "archived";
    await expect(setSectionBindings("k", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: {} })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a stale write (updated_at mismatch) with 409", async () => {
    await expect(
      setSectionBindings("k", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: {}, updated_at: "2020-01-01T00:00:00Z" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an unknown sectionId with 404", async () => {
    await expect(setSectionBindings("k", "11111111-1111-4111-8111-111111111111", "nope", { bindings: {} })).rejects.toMatchObject({ status: 404 });
  });

  it("a valid wip document + matching updated_at + real section succeeds and persists bindings", async () => {
    const row = await setSectionBindings("k", "11111111-1111-4111-8111-111111111111", "sec1", {
      bindings: { checks: [{ id: "midp.milestones" }] },
      updated_at: doc.updated_at,
    });
    expect(row).toBeDefined();
    expect(audit).toHaveBeenCalledTimes(1);
  });
});

describe("complianceReport is read-only", () => {
  it("never calls audit and never issues a write method against sb", async () => {
    doc.sections = [{ id: "sec1", heading: "H1", body: "", state: "wip", owner: null, bindings: { checks: [{ id: "midp.milestones" }] } }];
    const report = await complianceReport("k", "11111111-1111-4111-8111-111111111111");
    expect(report.sections[0].results).toHaveLength(1);
    expect(audit).not.toHaveBeenCalled();
    for (const call of sb.mock.calls) {
      const opts = call[1];
      expect(["POST", "PATCH", "PUT", "DELETE"]).not.toContain(opts?.method);
    }
  });
});

describe("complianceReport bounds total checks at MAX_COMPLIANCE_CHECKS", () => {
  it("marks checks beyond the cap as not_checkable naming the limit, instead of silently dropping them", async () => {
    const over = MAX_COMPLIANCE_CHECKS + 5;
    doc.sections = [{
      id: "sec1", heading: "H1", body: "", state: "wip", owner: null,
      bindings: { checks: Array.from({ length: over }, (_, i) => ({ id: "midp.milestones", params: { i } })) },
    }];
    const report = await complianceReport("k", "11111111-1111-4111-8111-111111111111");
    const results = report.sections[0].results;
    expect(results).toHaveLength(over);
    const uncapped = results.filter((r) => r.status === "not_checkable" && r.reason?.includes(`${MAX_COMPLIANCE_CHECKS}-check limit`));
    expect(uncapped).toHaveLength(5);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("setSectionBindings — missing-wrapper guard", () => {
  it("rejects a payload with no bindings key (400) instead of silently wiping", async () => {
    await expect(setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { updated_at: doc.updated_at }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/bindings is required/) });
    expect(sb).not.toHaveBeenCalled(); // validation-before-network held
  });

  it("names the common mistake when checks is sent at the top level", async () => {
    await expect(setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { checks: [{ id: "naming.ruleset" }] }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/missing the 'bindings' wrapper/) });
    expect(sb).not.toHaveBeenCalled();
  });

  it("an EXPLICIT empty bindings object still clears (that path must keep working)", async () => {
    doc.sections[0].bindings = { checks: [{ id: "naming.ruleset", params: {} }] };
    const result = await setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: { checks: [] }, updated_at: doc.updated_at, actor: "t" });
    expect(result).toBeTruthy();
    const patch = sb.mock.calls.find(([, opts]) => opts?.method === "PATCH");
    expect(patch[1].body.sections[0].bindings).toEqual({ checks: [] });
  });
});
