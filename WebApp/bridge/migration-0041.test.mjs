// Migration 0041 (SEC-4): a version's record is the registration's, a signed-in INSERT carries no geometry and a new
// revision, a judged file keeps its name, an issued transmittal stays as issued, a project key is never uuid-shaped, and one
// live project links a platform project. Applied by the controller
// on the founder's "apply" — never by a test. This pins the text the probe and the bridge rely on, as
// migration-0040.test.mjs does.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0041_version_record_frozen.sql");
const PROBE = read("../db/migrations/probes/0041_probe.sql");
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const code = strip(SQL);
/** One function's text, from its `create or replace` to its closing `end $$;`. */
const fn = (src, name) => { const s = src.indexOf(`create or replace function public.${name}(`); return s < 0 ? "" : src.slice(s, src.indexOf("end $$;", s) + 7); };
const P40 = fn(strip(read("../db/migrations/0040_verdict_binding.sql")), "cde_protect_published");
const P41 = fn(code, "cde_protect_published");
const F38 = fn(strip(read("../db/migrations/0038_bridge_role_rules.sql")), "cde_container_frozen");
const F41 = fn(code, "cde_container_frozen");

describe("migration 0041 — a version's record is the registration's; geometry is the bridge's; a judged file keeps its name (SEC-4)", () => {
  it("is not applied yet, and says what must hold before and after the apply", () => {
    expect(SQL).toContain("NOT YET APPLIED");
    expect(SQL).toContain("the 4100 bridge runs the branch");
    expect(SQL).toContain("probes/0041_probe.sql\n-- part 0");
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
    expect(code).not.toMatch(/\b(grant|drop\s+table)\b/i);
  });

  it("cde_protect_published is 0040's body with one rule: a signed-in UPDATE moves only the state, the live pointer and the stamp", () => {
    const rule = "  if auth.uid() is not null\n     and (to_jsonb(new) - '{state,is_live,deleted_at,deleted_by}'::text[])\n         is distinct from (to_jsonb(old) - '{state,is_live,deleted_at,deleted_by}'::text[]) then\n    raise exception 'a version''s record is written when it is registered — a new upload is a new version';\n  end if;\n";
    expect(P40.length).toBeGreaterThan(1000);
    expect(P41).toContain(rule);
    expect(P41.replace(rule, "")).toBe(P40);
    // After the issued-version rule, so 0038's and 0040's words keep winning where they apply.
    expect(P41.indexOf(rule)).toBeGreaterThan(P41.indexOf("changes only its state, its live pointer and its geometry link"));
  });

  it("a signed-in INSERT carries no geometry (0040's update words) and takes a revision its file does not hold yet", () => {
    expect(code).toContain("create or replace function public.cde_version_on_insert() returns trigger\n  language plpgsql set search_path = public as $$\nbegin\n  if new.platform_item_id is not null and auth.uid() is not null then\n    raise exception 'a version''s geometry is attached by the bridge';\n  end if;\n  if auth.uid() is not null\n     and exists (select 1 from public.container_versions x where x.container_id = new.container_id\n                   and upper(btrim(x.revision)) = upper(btrim(new.revision))) then\n    raise exception 'a revision is registered once per file — a new upload takes a new revision';\n  end if;\n  return new;\nend $$;");
    // Deleted items included: the rule reads every version of the file.
    expect(fn(code, "cde_version_on_insert")).not.toContain("deleted_at");
    expect(code).toContain("revoke execute on function public.cde_version_on_insert() from public, anon, authenticated;");
    expect(code).toContain("create trigger trg_version_on_insert before insert on public.container_versions\n  for each row execute function public.cde_version_on_insert();");
    expect(code).not.toContain("cde_version_geometry_on_insert");
  });

  it("cde_container_frozen is 0038's body with one rule: a file a verdict judged keeps its name", () => {
    const rule = "  if new.iso_name is distinct from old.iso_name\n     and exists (select 1 from public.container_versions v\n                   join public.audit_log a on a.entity_id = v.id and a.project_id = old.project_id\n                  where v.container_id = old.id and a.entity_type = 'file_version' and a.action like 'verdict:%') then\n    raise exception 'a file whose version a verdict judged keeps its name — a new name is a new file: upload it under the new name';\n  end if;\n";
    expect(F38.length).toBeGreaterThan(300);
    expect(F41).toContain(rule);
    expect(F41.replace(rule, "")).toBe(F38);
  });

  it("transmittals are insert-only for a lead; a project key is never uuid-shaped", () => {
    expect(code).toContain("drop policy if exists transmittals_write on public.transmittals;");
    expect(code).toContain("create policy transmittals_insert on public.transmittals for insert to authenticated\n  with check (public.has_min_role(project_id, 'lead'));");
    expect(code).not.toMatch(/create policy transmittals_\w+ on public\.transmittals for (update|delete|all)/);
    expect(code).toContain("alter table public.projects add constraint projects_key_not_uuid\n  check (key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');");
  });

  it("one live project links a platform project, for every writer (the predicate part 0 counts with)", () => {
    expect(code).toContain("create unique index projects_one_live_platform_link on public.projects ((metadata->'settings'->>'platform_project_id'))\n  where metadata->'settings'->>'platform_project_id' is not null and (metadata->'settings'->>'archived') is distinct from 'true';");
    expect(PROBE).toContain("where p.metadata->'settings'->>'platform_project_id' is not null and (p.metadata->'settings'->>'archived') is distinct from 'true'");
  });

  it("the probe counts what it changes before the apply, then checks every case, and rolls back", () => {
    for (const w of ["wip versions a verdict row names", "files whose name freezes after 0041 (no issued version) — an accepted verdict row",
      "files whose name freezes after 0041 (no issued version) — only rejected verdict rows",
      "(file, revision) pairs held by more than one version, Deleted items included (expect 0)",
      "platform projects linked by more than one live Sentinel project (expect 0 — 0041''s index needs it)",
      "platform items named by versions on more than one project (expect 0)", "projects whose key is uuid-shaped (expect 0)",
      "the live bodies are 0040''s and 0038''s (expect true)", "cde_protect_published is 0041''s", "projects_key_not_uuid is in force",
      "K1 a contributor's change of a judged draft's file reference is refused", "K3 a contributor's sha256 on a version that has none is refused",
      "K9 the control: the bridge (service) keeps its writes", "I1 a contributor's INSERT that carries geometry is refused (0040's G2 control, inverted)",
      "N1 a contributor's rename of a file a verdict judged is refused", "T1 a lead's change of an issued transmittal changes nothing",
      "U1 a uuid-shaped project key is refused", "R1 a contributor's INSERT under a revision its file already holds is refused (K-c)",
      "R2 the control: a contributor's INSERT under a revision the file does not hold yet",
      "L1 a lead's direct settings write that links a platform project another live project links is refused (23505)",
      // Review C13: a look-alike label (spaces, case) is the same revision; Deleted items count; an archived project's link is no conflict.
      "R3 a look-alike of a held revision (a trailing space, another case) is refused too",
      "R4 a revision held only by a version in Deleted items is refused too",
      "L2 the control: a lead links a platform project that only an archived project still names",
      "one live project links a platform project (projects_one_live_platform_link)",
      '"PROBE 0041: 24 of 24 as expected."', "PROBE 0041: % of %"])
      expect(PROBE).toContain(w);
    expect(PROBE.match(/^ {2}n := n \+ 1;$/gm)).toHaveLength(24);
    // Its made-up users are on the reserved example.test domain.
    expect(PROBE).toContain("contributor@example.test");
    expect(PROBE).not.toContain("probe.invalid");
    // 0040's probe tells the next reader that its G2 control reads refused after 0041, by design (I1 above).
    expect(read("../db/migrations/probes/0040_probe.sql")).toContain("-- After 0041 (SEC-4): part 2's G2 control");
  });
});
