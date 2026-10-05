// Migration 0039 (SEC-2): the database checks the shape of a project's key, a topic's guid, a project's snapshot and a
// document's sections — the rules the bridge already holds. Applied by the controller on the founder's "apply" — never by
// a test. This pins the text the probe and the bridge rely on, as migration-0038.test.mjs does.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SNAPSHOT_NUMBERS, SNAPSHOT_TEXT, snapshotWhy } from "./cde-store.mjs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0039_value_checks.sql");
const PROBE = read("../db/migrations/probes/0039_probe.sql");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
/** The `case … end` a check function selects — part 0 of the probe must hold the same text, so it reads the rows as the check will. */
const rule = (fn) => { const body = code.slice(code.indexOf(`function public.${fn}(`)); return body.slice(body.indexOf("case when"), body.indexOf("end;") + 3); };

describe("migration 0039 — the database checks four value shapes (SEC-2)", () => {
  it("records its apply and the probe's pass, and says what must hold before and after the apply", () => {
    expect(SQL).toContain("APPLIED 2026-10-05");
    expect(SQL).not.toContain("NOT YET APPLIED");
    expect(SQL).toContain('"PROBE 0039: 16 of 16 as expected."');
    expect(SQL).toContain("probes/0039_probe.sql part 0");
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
    expect(code).not.toMatch(/\b(grant|drop\s+table|drop\s+policy|create\s+policy|security\s+definer)\b/i);
  });

  it("a project's key is a slug and never changes", () => {
    expect(code).toContain("alter table public.projects add constraint projects_key_slug check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$');");
    expect(code).toContain("if new.key is distinct from old.key then\n    raise exception 'a project''s key never changes';");
    expect(code).toContain("create trigger trg_project_key_frozen before update of key on public.projects\n  for each row execute function public.project_key_frozen();");
    expect(code).toContain("revoke execute on function public.project_key_frozen() from public, anon, authenticated;");
  });

  it("a topic's guid is a UUID, the same in the topic it holds", () => {
    expect(code).toContain("check (guid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and data->>'guid' is not distinct from guid);");
  });

  it("a snapshot holds the fields the bridge keeps, each of its shape — the same lists as snapshotWhy", () => {
    const snap = rule("project_snapshot_ok");
    expect(snap).toContain("(k = 'currency' and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[A-Z]{3}$')");
    const lists = [...snap.matchAll(/k in \(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, " ").split(", ").map((s) => s.replace(/'/g, "")));
    expect(lists).toEqual([SNAPSHOT_NUMBERS, SNAPSHOT_TEXT]);
    expect(snap).toContain("and length(v #>> '{}') <= 300 and (v #>> '{}') !~ '[<>]')))");
    expect(snapshotWhy({ carbon_basis: "x".repeat(300) })).toBeNull();
    expect(code).toContain("language sql immutable set search_path = public as $$\n  select case when not (m ? 'snapshot') then true");
    expect(code).toContain("alter table public.projects add constraint projects_snapshot_ok check (public.project_snapshot_ok(metadata));");
  });

  it("a document's sections are an array of objects, each in a known state, each id one path segment", () => {
    const sec = rule("bim_sections_ok");
    expect(sec).toContain("case when jsonb_typeof(s) <> 'array' then false");
    expect(sec).toContain("or coalesce(x->>'state', '') not in ('wip', 'shared', 'published', 'archived')");
    expect(sec).toContain("or coalesce(x->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')");
    expect(code).toContain("alter table public.bim_documents add constraint bim_documents_sections_ok check (public.bim_sections_ok(sections));");
  });

  it("the probe reads the rows already there with the checks' own text, then the schema, then every case, and rolls back", () => {
    expect(PROBE).toContain(rule("project_snapshot_ok"));
    expect(PROBE).toContain(rule("bim_sections_ok"));
    for (const w of ["every project key is a slug", "every topic guid is a UUID, the same in the topic it holds", "every project''s snapshot fits",
      "every document''s sections fit", "a project''s key never changes", "the two checks are immutable functions",
      "K1 a project key with a capital is refused", "K3 a project''s key changed is refused", "K4 the control: a project''s name changes",
      "T1 a topic guid that is not a UUID is refused", "T2 a topic whose object holds another guid is refused", "T3 the control: a topic with one UUID in both is kept",
      "S1 a snapshot field the web does not write is refused", "S2 a currency that is not three capitals is refused", "S5 the control: the web''s twelve fields are kept",
      "D2 a section id that is not one path segment is refused", "D4 the control: the bridge''s sections are kept",
      '"PROBE 0039: 16 of 16 as expected."', "PROBE 0039: % of %"])
      expect(PROBE).toContain(w);
    expect(PROBE.match(/^ {2}n := n \+ 1;$/gm)).toHaveLength(16);
  });
});
