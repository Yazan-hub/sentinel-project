// Migration 0032 (the review chain, phase 6b) is applied by the controller after the founder approves it — never by a
// test. This pins the text the probe, the bridge (reviewDecide's error mapping) and the web rely on, so an edit that
// drops a rule, a grant or a refusal fails here before anyone applies the file.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0032_review_chain.sql");
const PROBE = read("../db/migrations/probes/0032_probe.sql");

describe("migration 0032 — the review chain (written, not applied)", () => {
  it("is marked not yet applied, runs in one transaction and drops nothing", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(SQL).toMatch(/^begin;$/m);
    expect(SQL).toMatch(/^commit;$/m);
    expect(SQL).not.toMatch(/^\s*drop /im);
  });

  it.each([
    "create or replace function public.review_template(p_project uuid) returns jsonb",
    "create or replace function public.cde_transition(p_version uuid, p_new_state public.container_state,",
    "create or replace function public.review_decide(p_version uuid, p_decision text, p_note text default null)",
  ])("defines %s", (head) => expect(SQL).toContain(head));

  it("grants: review_decide to signed-in users only (the machine never decides), review_template to no signed-in or anon caller", () => {
    expect(SQL).toContain("revoke execute on function public.review_decide(uuid, text, text) from public, anon, service_role;");
    expect(SQL).toContain("grant  execute on function public.review_decide(uuid, text, text) to authenticated;");
    expect(SQL).toContain("revoke execute on function public.review_template(uuid) from public, anon, authenticated;");
  });

  it("review_decide marks the one move it makes, and cde_transition reads the mark", () => {
    expect(SQL).toContain("in_review boolean := coalesce(current_setting('sentinel.review', true), '') = p_version::text;");
    expect(SQL).toContain("perform set_config('sentinel.review', p_version::text, true);");
    expect(SQL).toContain("perform set_config('sentinel.review', '', true);");
  });

  it.each([
    // cde_transition's four new refusals
    "'version % is under review (chain ledger #%) — it is published by its last approval, not by this call'",
    "'version % is under review — only a signed-in lead can send it back to wip'",
    "'this project requires review (%) — a version is shared by a signed-in lead, not by this call'",
    "'version % has no accepted verdict that measured something (latest: %) — sharing it for review needs the lead''s reason'",
    // 0031's own, kept
    "'version % has no accepted verdict that measured something (latest: %) — publishing it needs the lead''s reason'",
    // review_decide's
    "'a review decision is a signed-in person''s'",
    "'decision must be approve or reject'",
    "'version % is not under review'",
    "'step % (%) needs % or above'",
    "'the submitter does not review their own share'",
    "'you already approved step % of this chain'",
    "'a rejection says why'",
    // a malformed template refuses the share (the 2026-09-27 dry run)
    "'the review template in force (%) is malformed — its steps are a JSON %, not a list; a lead installs a corrected review@n'",
  ])("refuses in its own words: %s", (message) => expect(SQL).toContain(message));

  it("the probe raises its summary, so every probe write rolls back", () => {
    expect(PROBE).toContain("raise exception 'PROBE 0032: % of % as expected%.");
  });
});
