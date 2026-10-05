import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runWithAuth } from "./bridge-auth.mjs";

// setSectionBindings/complianceReport guard tests need a mocked cde-store.mjs (Supabase network layer)
// so we can assert on the 409/404 guard paths and prove complianceReport never writes. This mirrors
// bimdocs-ingest.test.mjs's vi.mock("./ai-gateway.mjs", ...) pattern, kept in its own file so it never
// interferes with bimdocs-store.test.mjs's unmocked network-rejection tests.
const sb = vi.fn();
const ensureProject = vi.fn();
const audit = vi.fn();
const __docs = new Map();
vi.mock("./cde-store.mjs", () => ({
  sb: (...args) => sb(...args),
  ensureProject: (...args) => ensureProject(...args),
  audit: (...args) => audit(...args),
  // real-shape guard: bimdocs-store now imports isUuid to 404 malformed ids before any network call
  isUuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")),
  docGet: async (s, p, id) => __docs.get(s + id) ?? null,
  docInsert: async (s, p, id, data) => {
    if (__docs.has(s + id)) throw Object.assign(new Error("duplicate"), { status: 409 });
    __docs.set(s + id, data);
  },
  docReplaceIfField: async (s, p, id, data, field, expected) => {
    const cur = __docs.get(s + id);
    if (!cur) return null;
    const actual = cur[field] === undefined ? null : String(cur[field]);
    if (actual !== expected) return null; // CAS lost
    __docs.set(s + id, data);
    return data;
  },
  getProjectMeta: vi.fn(async () => ({})),
  // The real guard's shape (cde-store requireRows): the rows, or a 403 in the caller's words.
  requireRows: (rows, what) => {
    if (Array.isArray(rows) && rows.length) return rows;
    throw Object.assign(new Error(`${what} — nothing was saved`), { status: 403 });
  },
}));
vi.mock("./members-store.mjs", () => ({
  requireMinRole: vi.fn(async (key, min) => {
    if (globalThis.__testRole && globalThis.__testRole !== "service") {
      const rank = { owner: 4, lead: 3, contributor: 2, viewer: 1 };
      if ((rank[globalThis.__testRole] || 0) < rank[min])
        throw Object.assign(new Error(`this action requires the ${min} role`), { status: 403 });
    }
  }),
  listMembers: vi.fn(async () => []),
}));
vi.mock("./office-store.mjs", () => ({
  getSnapshot: vi.fn(async () => ({ source: { kind: "template", title: "T.rte" }, at: "2026-09-10T08:00:00Z", received_at: "2026-09-10T08:00:01Z", pack: { worksets: [] }, catalog: { count: 0, types: [] }, ruleset: null })),
  getScan: vi.fn(async () => null),
}));

const { setSectionBindings, complianceReport, MAX_COMPLIANCE_CHECKS, transitionDoc, publishDoc, setSectionAnswer, setSectionPlan, readinessReport, patchSection, createDoc, createDocFromIngest, getSourceRef } = await import("./bimdocs-store.mjs");

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

describe("lead-gates on governing actions", () => {
  it("a contributor may NOT transition, publish, or set bindings (403 naming lead)", async () => {
    globalThis.__testRole = "contributor";
    await expect(transitionDoc("demo", "11111111-1111-4111-8111-111111111111", { to: "shared" })).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead/) });
    await expect(publishDoc("demo", "11111111-1111-4111-8111-111111111111", {})).rejects.toMatchObject({ status: 403 });
    await expect(setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: { checks: [] } })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });

  it("machine callers (service) pass the gates untouched", async () => {
    globalThis.__testRole = "service";
    const result = await setSectionBindings("demo", "11111111-1111-4111-8111-111111111111", "sec1", { bindings: { checks: [] }, updated_at: doc.updated_at, actor: "t" });
    expect(result).toBeTruthy();
    globalThis.__testRole = undefined;
  });
});

describe("section comments — external store, append-only, server-stamped", () => {
  it("adds a comment to a real section, audits, and lists it back", async () => {
    const { addComment, listComments } = await import("./bimdocs-store.mjs");
    const c = await addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "Looks thin on QA procedures.", "reviewer@x.com");
    expect(c).toMatchObject({ section_id: "sec1", author: "reviewer@x.com", text: "Looks thin on QA procedures." });
    expect(c.id).toBeTruthy();
    const all = await listComments("demo", "11111111-1111-4111-8111-111111111111");
    expect(all).toHaveLength(1);
    expect(audit.mock.calls.some((x) => x[3] === "comment_added")).toBe(true);
  });

  it("404s an unknown section listing available ids; 400s empty and oversized text", async () => {
    const { addComment } = await import("./bimdocs-store.mjs");
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "nope", "x", "a")).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/sec1/) });
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "   ", "a")).rejects.toMatchObject({ status: 400 });
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "y".repeat(4001), "a")).rejects.toMatchObject({ status: 400 });
  });

  it("works on a PUBLISHED document — the doc row is never touched", async () => {
    doc.status = "published";
    const { addComment } = await import("./bimdocs-store.mjs");
    await expect(addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "Reviewing the record.", "a")).resolves.toBeTruthy();
    const patched = sb.mock.calls.filter(([p, o]) => p.startsWith("bim_documents") && o?.method === "PATCH");
    expect(patched).toHaveLength(0); // comments never write the document row
  });
});

describe("comment concurrency — CAS on the bag's rev", () => {
  it("a lost CAS re-reads and retries; the comment still lands and rev advances", async () => {
    const { addComment, listComments } = await import("./bimdocs-store.mjs");
    // Seed a bag as if another reviewer just wrote rev 5.
    __docs.set("doc_comments" + "11111111-1111-4111-8111-111111111111", { comments: [{ id: "c0", section_id: "sec1", author: "other@x.com", text: "first", created_at: "t" }], rev: 5 });
    const c = await addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "second reviewer", "me@x.com");
    const all = await listComments("demo", "11111111-1111-4111-8111-111111111111");
    expect(all.map((x) => x.text)).toEqual(["first", "second reviewer"]);
    expect(__docs.get("doc_comments" + "11111111-1111-4111-8111-111111111111").rev).toBe(6);
    expect(c.author).toBe("me@x.com");
  });

  it("a legacy bag without rev (is-null CAS) still accepts appends", async () => {
    const { addComment, listComments } = await import("./bimdocs-store.mjs");
    __docs.set("doc_comments" + "11111111-1111-4111-8111-111111111111", { comments: [] }); // pre-rev shape
    await addComment("demo", "11111111-1111-4111-8111-111111111111", "sec1", "on legacy bag", "a");
    expect((await listComments("demo", "11111111-1111-4111-8111-111111111111")).some((x) => x.text === "on legacy bag")).toBe(true);
  });
});

const readinessDoc = (overrides = {}) => makeDoc({
  doc_type: "READINESS",
  sections: [
    { id: "d1", heading: "13. A BIM manager is named", pillar: "people", kind: "declared", question: "Is there…?", body: "", state: "wip", owner: null, due: null, answer: null, bindings: {} },
    { id: "m1", heading: "4. Worksets", pillar: "standards", kind: "measured", body: "", state: "wip", owner: null, due: null, answer: null, bindings: { checks: [{ id: "office.worksets" }] } },
  ],
  ...overrides,
});

describe("setSectionAnswer — a declared item's answer, by the verified identity", () => {
  beforeEach(() => { doc = readinessDoc(); sb.mockImplementation(async (path, opts) => opts?.method === "PATCH" ? [{ ...doc, sections: opts.body.sections }] : [doc]); });
  it("records value/note with author and timestamp and audits 'declared'", async () => {
    const row = await setSectionAnswer("k", doc.id, "d1", { value: "partial", note: "named, no mandate", actor: "a@x" });
    const s = row.sections.find((x) => x.id === "d1");
    expect(s.answer).toMatchObject({ value: "partial", note: "named, no mandate", by: "a@x" });
    expect(s.answer.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "declared", "a@x", expect.objectContaining({ section: "13. A BIM manager is named" }), expect.objectContaining({ value: "partial" }));
  });
  it("400s an invalid value or a note over 2000 chars; 404s a missing section; 409s a measured item", async () => {
    await expect(setSectionAnswer("k", doc.id, "d1", { value: "maybe" })).rejects.toMatchObject({ status: 400 });
    await expect(setSectionAnswer("k", doc.id, "d1", { value: "yes", note: "x".repeat(2001) })).rejects.toMatchObject({ status: 400 });
    await expect(setSectionAnswer("k", doc.id, "nope", { value: "yes" })).rejects.toMatchObject({ status: 404 });
    await expect(setSectionAnswer("k", doc.id, "m1", { value: "yes" })).rejects.toMatchObject({ status: 409 });
    expect(sb).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "PATCH" }));
  });
  it("refuses on a non-READINESS document and below contributor", async () => {
    doc = makeDoc(); sb.mockResolvedValue([doc]);
    await expect(setSectionAnswer("k", doc.id, "sec1", { value: "yes" })).rejects.toMatchObject({ status: 409 });
    doc = readinessDoc(); sb.mockResolvedValue([doc]);
    globalThis.__testRole = "viewer";
    await expect(setSectionAnswer("k", doc.id, "d1", { value: "yes" })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });
});

describe("setSectionPlan — owner + due on the item itself, lead and above", () => {
  beforeEach(() => { doc = readinessDoc(); sb.mockImplementation(async (path, opts) => opts?.method === "PATCH" ? [{ ...doc, sections: opts.body.sections }] : [doc]); });
  it("sets owner and due and audits 'plan_set' with old and new", async () => {
    const row = await setSectionPlan("k", doc.id, "m1", { owner: "lead@x", due: "2026-10-01", actor: "lead@x" });
    expect(row.sections.find((x) => x.id === "m1")).toMatchObject({ owner: "lead@x", due: "2026-10-01" });
    expect(audit).toHaveBeenCalledWith("proj1", "bim_document", doc.id, "plan_set", "lead@x", expect.objectContaining({ owner: null, due: null }), expect.objectContaining({ owner: "lead@x", due: "2026-10-01" }));
  });
  it("400s a non-ISO due date; clears with nulls; 403s below lead", async () => {
    await expect(setSectionPlan("k", doc.id, "m1", { due: "1/10/2026" })).rejects.toMatchObject({ status: 400 });
    const row = await setSectionPlan("k", doc.id, "m1", { owner: null, due: null, actor: "lead@x" });
    expect(row.sections.find((x) => x.id === "m1")).toMatchObject({ owner: null, due: null });
    globalThis.__testRole = "contributor";
    await expect(setSectionPlan("k", doc.id, "m1", { due: "2026-10-01" })).rejects.toMatchObject({ status: 403 });
    globalThis.__testRole = undefined;
  });
});

describe("readinessReport — runs the bound checks, scores, derives the plan, names the evidence", () => {
  beforeEach(() => { doc = readinessDoc(); sb.mockResolvedValue([doc]); });
  it("returns score + plan + evidence and refuses a non-READINESS document", async () => {
    const rep = await readinessReport("k", doc.id);
    expect(rep.doc_type).toBe("READINESS");
    expect(rep.evidence.snapshot.source.title).toBe("T.rte");
    expect(rep.evidence.scan).toBeNull();
    expect(rep.score.overall.measured.items.map((i) => i.section_id)).toEqual(["m1"]);
    expect(rep.score.overall.declared.unanswered).toBe(1);
    expect(rep.plan.map((r) => r.section_id).sort()).toEqual(["d1", "m1"]);
    expect(rep.sections.find((s) => s.section_id === "m1").results[0].id).toBe("office.worksets");
    doc = makeDoc(); sb.mockResolvedValue([doc]);
    await expect(readinessReport("k", doc.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("a document write the database refused (no row back) is a 403 — never a 200, never a ledger row (ledger-1, H0 D5)", () => {
  beforeEach(() => {
    globalThis.__testRole = undefined;
    doc = readinessDoc();
    sb.mockImplementation(async (path, opts) => (opts?.method === "PATCH" ? [] : [doc]));
  });
  it.each([
    ["patchSection", () => patchSection("k", doc.id, "d1", { body: "named: Yara" })],
    ["setSectionBindings", () => setSectionBindings("k", doc.id, "m1", { bindings: { checks: [] } })],
    ["setSectionAnswer", () => setSectionAnswer("k", doc.id, "d1", { value: "yes" })],
    ["setSectionPlan", () => setSectionPlan("k", doc.id, "m1", { owner: "lead@x" })],
  ])("%s: a section write that lands on no row (changed or issued meanwhile — 0038) is a 409 in words, with the service key", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ status: 409, message: "the document changed or was issued meanwhile — nothing was saved" });
    expect(audit).not.toHaveBeenCalled();
    const patch = sb.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(patch[0]).toContain(`&project_id=eq.${doc.project_id}&status=in.(wip,shared)`);
    expect(patch[1].service).toBe(true);
  });
  it.each([
    ["transitionDoc", () => transitionDoc("k", doc.id, { to: "shared" })],
    ["publishDoc", () => { doc.status = "shared"; return publishDoc("k", doc.id, {}); }],
  ])("%s", async (_name, call) => {
    await expect(call()).rejects.toMatchObject({ status: 403, message: "a document is edited by a contributor or above — nothing was saved" });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("a section edit is a contributor's (H0 D4, ledger-1)", () => {
  it("a viewer's section edit is a 403 before the document is read, and nothing reaches the ledger", async () => {
    globalThis.__testRole = "viewer";
    sb.mockClear();
    audit.mockClear();
    try {
      await expect(patchSection("k", "11111111-1111-4111-8111-111111111111", "d1", { body: "x" }))
        .rejects.toMatchObject({ status: 403, message: "this action requires the contributor role" });
      expect(sb).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    } finally { globalThis.__testRole = undefined; }
  });

  it("a contributor's section edit reaches the document read — not another 403 (H0 minor N41)", async () => {
    globalThis.__testRole = "contributor";
    sb.mockClear();
    audit.mockClear();
    try {
      // No document seeded for this id: a contributor passes requireMinRole and reaches docGet, which answers null —
      // a 404 "not found", never requireMinRole's 403. If the minimum were raised to lead by mistake, this would
      // 403 instead and catch it.
      await expect(patchSection("k", "11111111-1111-4111-8111-111111111111", "d1", { body: "x" }))
        .rejects.toMatchObject({ status: 404 });
    } finally { globalThis.__testRole = undefined; }
  });
});

describe("a document's recorded names come from the sign-in (bimdocs-3, H0 D6)", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "33333333-0000-4000-8000-000000000001", email: "lead@example.test" })).toString("base64url") + ".sig";
  const posted = (table) => sb.mock.calls.find(([p, o]) => p === table && o?.method === "POST")?.[1].body;
  beforeEach(() => { globalThis.__testRole = undefined; });

  it("publishDoc: published_by is the signed-in lead, not the body's name", async () => {
    doc.status = "shared";
    await runWithAuth(jwt, () => publishDoc("k", doc.id, { actor: "The Director" }));
    expect(posted("bim_document_versions").published_by).toBe("lead@example.test");
  });

  it("createDoc and createDocFromIngest: created_by is the signed-in caller", async () => {
    await runWithAuth(jwt, () => createDoc("k", { doc_type: "BEP", actor: "The Director" }));
    expect(posted("bim_documents").created_by).toBe("lead@example.test");
    sb.mockClear();
    await runWithAuth(jwt, () => createDocFromIngest("k", { doc_type: "BEP", sections: [{ heading: "A" }], actor: "The Director" }));
    expect(posted("bim_documents").created_by).toBe("lead@example.test");
  });

  it("the machine credential keeps its label", async () => {
    doc.status = "shared";
    await publishDoc("k", doc.id, { actor: "Revit" });
    expect(posted("bim_document_versions").published_by).toBe("Revit");
  });
});

describe("ingest commit — the original must belong to this project (H0, bimdocs-4)", () => {
  const P = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sentinel-bind-"));
    process.env.SENTINEL_BIMDOCS = dir;
    ensureProject.mockResolvedValue({ id: P });
    sb.mockResolvedValue([{ id: "d1", doc_type: "EIR", title: "t" }]);
  });
  afterEach(() => {
    delete process.env.SENTINEL_BIMDOCS;
    rmSync(dir, { recursive: true, force: true });
  });
  const put = (sub, fid) => { mkdirSync(join(dir, ...sub), { recursive: true }); writeFileSync(join(dir, ...sub, fid), "x"); return fid; };
  const commit = (file_id) => createDocFromIngest("k", { doc_type: "EIR", sections: [{ heading: "A" }], source: { file_id, name: "a.txt" } });

  it("a file uploaded to this project commits", async () => {
    await expect(commit(put([P], `${randomUUID()}.txt`))).resolves.toMatchObject({ id: "d1" });
  });

  it("another project's file, or a pre-H0 file in the flat folder, is a 400 and nothing is saved", async () => {
    for (const fid of [put([OTHER], `${randomUUID()}.txt`), put([], `${randomUUID()}.txt`)])
      await expect(commit(fid)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not uploaded to this project/) });
    expect(sb).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("getSourceRef names the document's project, so the source route reads that project's folder", async () => {
    doc = makeDoc({ source: { file_id: "f.txt", name: "a.txt" } });
    sb.mockImplementation(async () => [doc]);
    expect(await getSourceRef("k", doc.id)).toEqual({ file_id: "f.txt", name: "a.txt", project_id: "proj1" });
  });
});
