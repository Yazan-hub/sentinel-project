// Migration 0043 (SEC-6): a signed-in caller is answered only about its own projects, linked rows stay in one project, a
// deleted project's side rows go with it. Applied by the controller on the founder's "apply" — never by a test. This pins
// the text the probe relies on, as migration-0042.test.mjs does, and that the two re-created bodies are 0040's and 0032's
// but for 0043's lines.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0043_one_project_answers.sql");
const PROBE = read("../db/migrations/probes/0043_probe.sql");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
/** A function's whole definition: from its `create or replace function` line to its `end $$;`. */
const fn = (text, name) => {
  const a = text.indexOf(`create or replace function public.${name}(`);
  const b = text.indexOf("\nend $$;", a);
  return a < 0 || b < 0 ? "" : text.slice(a, b + 8);
};

describe("migration 0043 — one project's answers, linked rows in one project, a deleted project's side rows (SEC-6)", () => {
  it("records its apply and the probe's pass, and says what must hold before and after the apply", () => {
    expect(SQL).toContain("APPLIED 2026-10-07");
    expect(SQL).not.toContain("NOT YET APPLIED");
    expect(SQL).toContain('"PROBE 0043: 18 of 18 as expected."');
    expect(SQL).toContain("probes/0043_probe.sql\n-- part 0");
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
    expect(code).not.toMatch(/\b(grant|alter|drop (table|function|policy|index))\b/i);
  });

  it("project_of_container answers the service key and a member of the file's project only", () => {
    expect(code).toContain("create or replace function public.project_of_container(c uuid) returns uuid\n  language sql stable security definer set search_path = public as $$\n  select ic.project_id from public.information_containers ic\n   where ic.id = c and (auth.uid() is null or public.is_member(ic.project_id));\n$$;");
  });

  it("cde_transition is 0040's body but for one check: a non-member is answered as a missing version", () => {
    const was = fn(read("../db/migrations/0040_verdict_binding.sql"), "cde_transition");
    expect(was).not.toBe("");
    const pid = "  pid := public.project_of_container(cur.container_id);\n";
    expect(fn(SQL, "cde_transition")).toBe(was.replace(pid, pid
      + "  -- 0043: a signed-in caller who is not a member of the version's project is answered as for a version that does not exist.\n"
      + "  if pid is null then\n    raise exception 'version % not found', p_version using errcode = 'no_data_found';\n  end if;\n"));
  });

  it("review_decide is 0032's body but for its order: the project is read, and a non-member answered, before the decision is read", () => {
    const was = fn(read("../db/migrations/0032_review_chain.sql"), "review_decide");
    expect(was).not.toBe("");
    const shape = "  if coalesce(p_decision, '') not in ('approve', 'reject') then\n    raise exception 'decision must be approve or reject';\n  end if;\n";
    const pid = "  pid := public.project_of_container(cur.container_id);\n";
    expect(fn(SQL, "review_decide")).toBe(was.replace(shape + pid,
      "  -- 0043: the project first — a caller who is not a member of it is answered as for a version that does not exist, before\n"
      + "  -- any other check.\n" + pid
      + "  if pid is null then\n    raise exception 'version % not found', p_version using errcode = 'no_data_found';\n  end if;\n" + shape));
  });

  it("the same-project rule on the three tables, checked when a link is written; the side rows on delete; neither callable", () => {
    for (const w of ["a folder stays in its project", "a folder and its parent folder are in one project", "a file and its folder are in one project",
      "a linked model and its host file are in one project", "a model revision and its version are in one project"]) expect(code).toContain(`raise exception '${w}';`);
    expect(code).toContain("create trigger trg_same_project before insert or update of project_id, parent_id on public.folders");
    expect(code).toContain("create trigger trg_same_project before insert or update of folder_id, parent_id on public.information_containers");
    expect(code).toContain("create trigger trg_same_project before insert or update of project_id, container_version_id on public.model_revisions");
    // review C1: only the rows filed under the deleted project's key — a document filed under its id is evidence and stays.
    expect(code).toContain("  delete from public.bcf_topics where project_id = old.key;\n  delete from public.bridge_docs where project_id = old.key;");
    expect(code).not.toContain("old.id::text");
    expect(code).toContain("create trigger trg_project_side_rows after delete on public.projects");
    expect(code).toContain("revoke execute on function public.cde_same_project() from public, anon, authenticated;");
    expect(code).toContain("revoke execute on function public.cde_project_side_rows() from public, anon, authenticated;");
  });

  it("the probe: part 0 read-only with the four link counts first, part 1 the bodies and triggers, part 2 eighteen cases that always roll back", () => {
    const part0 = PROBE.split("-- Part 1 (after the apply)")[0];
    expect(part0).toContain("-- Part 0 (before the apply)");
    expect(part0).not.toMatch(/\b(insert|update|delete|create|drop|alter)\b(?![^\n]*--)/i);
    expect(part0.indexOf("folders whose parent folder is in another project")).toBeLessThan(part0.indexOf("BCF topics whose key no project holds"));
    expect(part0).toContain("the live bodies are the ones 0043 replaces");
    for (const k of ["O1", "O2", "O3", "T1", "T2", "T3", "R1", "R2", "R3", "R4", "F1", "F2", "K1", "C1", "F3", "C2", "M1", "D1"]) expect(PROBE).toContain(`  -- ${k} `);
    expect(PROBE).toContain("raise exception 'PROBE 0043: % of % as expected%.");
    expect(PROBE).toContain("('changeset', pd::text, 'probe-' || sfx, '{}')");
    expect(PROBE).toContain("or not exists (select 1 from public.bridge_docs where store = 'changeset' and doc_id = 'probe-' || sfx and project_id = pd::text)");
    expect(PROBE).toContain("lead@example.test");
    expect(PROBE).not.toContain(".invalid");
  });
});
