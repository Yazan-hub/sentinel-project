// Migration 0037 (MA-3a, review amendment C1): the changeset store is the bridge's alone. A web decline binds Revit through the
// changeset doc, so a member must not be able to write that doc straight through PostgREST with the public anon key and their own
// JWT (re-open a decline, delete a review, forge review.by). Applied by the controller on the founder's "apply" — never by a test.
// This pins the text the probe and the bridge rely on, as migration-0033.test.mjs does for 0033.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0037_changeset_bridge_only.sql");
const PROBE = read("../db/migrations/probes/0037_probe.sql");
const STORE = read("./changesets-store.mjs");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

describe("migration 0037 — the changeset store is written by the bridge alone (applied 2026-10-04, probe 3 of 3)", () => {
  it("records its apply and the probe's pass, and redefines bridge_docs_floor only — no table, policy, grant or drop", () => {
    expect(SQL).toContain("APPLIED 2026-10-04");
    expect(SQL).toContain('"PROBE 0037: 3 of 3 as expected."');
    expect(SQL).not.toContain("NOT YET APPLIED");
    expect(code).toContain("create or replace function public.bridge_docs_floor(p_store text) returns text\n  language sql immutable set search_path = public as $$");
    expect(code).not.toMatch(/\b(drop|grant|revoke|create\s+table|create\s+policy|alter\s+table)\b/i);
  });

  it("names every store 0034 named except changeset, at the same floors, with no else", () => {
    const floor = code.slice(code.indexOf("function public.bridge_docs_floor"));
    expect([...floor.matchAll(/when '([a-z_]+)'\s+then '([a-z]+)'/g)].map((m) => `${m[1]}=${m[2]}`))
      .toEqual(["doc_comments=viewer", "rfi=contributor", "office_snapshot=contributor", "office_scan=contributor"]);
    expect(floor).not.toMatch(/\belse\b/);
    expect(floor).not.toContain("'changeset'");
  });

  it("the probe checks the floors, a contributor's refused direct write of a changeset doc and the rfi control, and rolls back", () => {
    for (const w of ["changeset has no signed-in writer", "rfi still contributor", "doc_comments still viewer", "office_snapshot still contributor", "office_scan still contributor",
      "a contributor's direct update of a changeset doc patches 0 rows", "a contributor's direct insert of a changeset doc is refused", "the control rfi update patches 1 row", "PROBE 0037:"])
      expect(PROBE).toContain(w);
    expect(PROBE).toContain("set local role authenticated;");
  });

  it("the bridge writes every changeset doc with the service key, so it is safe on either side of the apply", () => {
    expect(STORE).toContain("await d.docInsert(STORE, proj.id, changeset.id, changeset, { service: true });");
    expect(STORE).toContain('await d.docReplaceIfField(STORE, pid, id, out.updated, "review_rev", Number.isInteger(cs.review_rev) ? cs.review_rev : null, { service: true })');
    expect(STORE).not.toContain("docReplaceIfStatus");
  });
});
