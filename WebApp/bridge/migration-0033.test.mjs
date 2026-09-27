// Migration 0033 (H0 trust boundaries: offices, bridge_docs, BCF topic and BIM document version writes, the 'default'
// seed) is applied by the controller after the founder
// approves it — never by a test. This pins the text the probe and the bridge rely on, so an edit that drops a rule, a
// grant, a store's floor or a refusal fails here before anyone applies the file. The bridge answers first in the same
// words (members-store requireOfficeLead, cde-store's OFFICE_BY_ADMIN); a change to one side must change both.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0033_trust_boundaries.sql");
const PROBE = read("../db/migrations/probes/0033_probe.sql");
const BRIDGE = read("./members-store.mjs") + read("./cde-store.mjs");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n"); // the statements, not the notes

describe("migration 0033 — trust boundaries (written, not applied)", () => {
  it("is marked not yet applied, runs in one transaction and drops no table, column, function or trigger", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(SQL).toMatch(/^begin;$/m);
    expect(SQL).toMatch(/^commit;$/m);
    expect(code).not.toMatch(/\bdrop\s+(table|column|function|trigger)\b/i);
  });

  it("names no user: the founder's platform_admins row is a separate approved step", () => {
    expect(code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(code).not.toMatch(/insert\s+into\s+public\.platform_admins/i);
    expect(SQL).toContain("insert into public.platform_admins(user_id, note) values ('<FOUNDER-AUTH-UID>', 'founder')");
  });

  it("platform_admins is readable and writable by no signed-in or anon caller; is_platform_admin answers for the caller", () => {
    expect(code).toContain("create table if not exists public.platform_admins (");
    expect(code).toContain("alter table public.platform_admins enable row level security;");
    expect(code).toContain("revoke all on public.platform_admins from public, anon, authenticated;");
    expect(code).toContain("create or replace function public.is_platform_admin() returns boolean\n  language sql stable security definer set search_path = public, auth as $$");
    expect(code).toContain("select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());");
    expect(code).toContain("revoke execute on function public.is_platform_admin() from public, anon;");
    expect(code).toContain("grant  execute on function public.is_platform_admin() to authenticated, service_role;");
  });

  it("projects_office_guard asks only about signed-in callers and keeps 0029's rules for everyone", () => {
    expect(code).toContain("create or replace function public.projects_office_guard() returns trigger");
    expect(code).toContain("  if auth.uid() is not null then\n");
    expect(code).toContain("new.office_key is not null and (tg_op = 'INSERT' or new.office_key is distinct from old.office_key)");
    expect(code).toContain("public.has_min_role((select p.id from public.projects p where p.key = new.office_key), 'lead')");
    expect(code).toContain("not public.has_min_role(old.id, 'owner')");
    for (const kept of ["'an office cannot belong to an office'", "'a project cannot be its own office'",
      "'office_key must name a project of kind office'", "'this office still has projects; detach them before changing its kind'"])
      expect(code).toContain(kept);
  });

  it.each([
    "attaching a project to an office needs the lead role on that office — nothing was saved",
    "an office is created by a platform admin — nothing was saved",
  ])("refuses in the bridge's own words, as a 42501 (a 403 from PostgREST): %s", (words) => {
    expect(code).toMatch(new RegExp(`raise exception '${words}'\\s+using errcode = '42501'`));
    expect(BRIDGE).toContain(`"${words}"`);
  });

  it("refuses a kind change by anyone but the owner, as a 42501", () => {
    expect(code).toContain("raise exception 'a project''s kind is changed by its owner — nothing was saved' using errcode = '42501';");
  });

  it.each([
    ["doc_comments", "viewer"], ["clash", "contributor"], ["rfi", "contributor"], ["changeset", "contributor"],
    ["office_snapshot", "contributor"], ["office_scan", "contributor"],
  ])("bridge_docs store %s is written from %s up", (store, role) => {
    expect(code).toMatch(new RegExp(`when '${store}'\\s+then '${role}'`));
  });

  it("names no other store: artefact, tender, manifest, federation, keystore, the global packs and anything new have no signed-in writer (the bridge writes them with the service key)", () => {
    const floor = code.slice(code.indexOf("function public.bridge_docs_floor"), code.indexOf("function public.bridge_docs_role"));
    expect([...floor.matchAll(/when '([a-z_]+)'/g)].map((m) => m[1]).sort())
      .toEqual(["changeset", "clash", "doc_comments", "office_scan", "office_snapshot", "rfi"]);
    expect(floor).not.toMatch(/\belse\b/);
  });

  it("bridge_docs_role looks the project up by id first over every project, and refuses a blank project or an unknown role word", () => {
    expect(code).toContain("create or replace function public.bridge_docs_role(p_project text, p_min text) returns boolean\n  language sql stable security definer set search_path = public, auth as $$");
    expect(code).toContain("select coalesce(p_project, '') <> ''\n     and public.role_rank(p_min) > 0");
    expect(code).toContain("coalesce((select p.id from public.projects p where p.id::text = p_project),\n                                      (select p.id from public.projects p where p.key = p_project))");
    for (const g of [
      "revoke execute on function public.bridge_docs_floor(text) from public, anon;",
      "revoke execute on function public.bridge_docs_role(text, text) from public, anon;",
      "grant  execute on function public.bridge_docs_floor(text) to authenticated, service_role;",
      "grant  execute on function public.bridge_docs_role(text, text) to authenticated, service_role;",
    ]) expect(code).toContain(g);
  });

  it("replaces 0028/0030's read and write policies with read, insert, update and delete", () => {
    for (const p of ["bridge_docs_read", "bridge_docs_write", "bridge_docs_insert", "bridge_docs_update", "bridge_docs_delete"])
      expect(code).toMatch(new RegExp(`drop policy if exists ${p}\\s+on public\\.bridge_docs;`));
    expect(code).toContain("using (project_id = '' or public.bridge_docs_role(project_id, 'viewer'));");
    expect(code).toContain("with check (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)));");
    expect(code).toContain("using      (public.bridge_docs_role(project_id, public.bridge_docs_floor(store)))");
    expect(code).toContain("using (public.bridge_docs_floor(store) is not null and public.bridge_docs_role(project_id, 'lead'));");
    expect(code).not.toMatch(/create policy bridge_docs_write/);
  });

  it("BCF topics: a contributor creates and edits one, a lead deletes one; 0016's member-level write policy is gone (topics-1, cde-3)", () => {
    const topicRole = (min) => `public.has_min_role((select p.id from public.projects p where p.key = bcf_topics.project_id), '${min}')`;
    expect(code).toMatch(/drop policy if exists bcf_topics_write\s+on public\.bcf_topics;/);
    expect(code).toContain(`create policy bcf_topics_insert on public.bcf_topics\n  for insert to authenticated\n  with check (${topicRole("contributor")});`);
    expect(code).toContain(`create policy bcf_topics_update on public.bcf_topics\n  for update to authenticated\n  using      (${topicRole("contributor")})\n  with check (${topicRole("contributor")});`);
    expect(code).toContain(`create policy bcf_topics_delete on public.bcf_topics\n  for delete to authenticated\n  using (${topicRole("lead")});`);
    expect(code).not.toMatch(/create policy bcf_topics_write/);
  });

  it("a BEP/EIR version is inserted by a lead only (bimdocs-3)", () => {
    expect(code).toContain("drop policy if exists bim_document_versions_ins on public.bim_document_versions;");
    expect(code).toContain("create policy bim_document_versions_ins on public.bim_document_versions for insert to authenticated\n  with check (auth.uid() is null or public.has_min_role((select d.project_id from public.bim_documents d where d.id = document_id), 'lead'));");
  });

  it("'default' is seeded with no signed-in user, so no signed-in caller can create it (slice-default-1)", () => {
    expect(code).toContain("insert into public.projects (key, name) values ('default', 'default') on conflict (key) do nothing;");
  });

  it("the probe raises its summary, so every probe write rolls back, and runs all 41 cases", () => {
    expect(PROBE).toContain("raise exception 'PROBE 0033: % of % as expected%.");
    expect(PROBE.match(/^\s*n := n \+ 1;$/gm)?.length).toBe(41);
  });
});
