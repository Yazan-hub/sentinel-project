// Migration 0040 (SEC-3): a verdict row records the sha256 of the version it judged, cde_transition counts a verdict only for
// that content and reads it on a restore too, and the live pointer of an issued version is the bridge's. Applied by the
// controller on the founder's "apply" — never by a test. This pins the text the probe and the bridge rely on, as
// migration-0038.test.mjs and migration-0039.test.mjs do.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0040_verdict_binding.sql");
const PROBE = read("../db/migrations/probes/0040_probe.sql");
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const code = strip(SQL);
/** One function's text, from its `create or replace` to its closing `end $$;`. */
const fn = (src, name) => { const s = src.indexOf(`create or replace function public.${name}(`); return s < 0 ? "" : src.slice(s, src.indexOf("end $$;", s) + 7); };
const T32 = fn(strip(read("../db/migrations/0032_review_chain.sql")), "cde_transition");
const T40 = fn(code, "cde_transition");
const P38 = fn(strip(read("../db/migrations/0038_bridge_role_rules.sql")), "cde_protect_published");
const P40 = fn(code, "cde_protect_published");

describe("migration 0040 — a verdict is bound to its content; a restore reads it; the live pointer is the bridge's (SEC-3)", () => {
  it("records its apply and the probe's pass, and says what must hold before and after the apply", () => {
    expect(SQL).toContain("APPLIED 2026-10-06");
    expect(SQL).not.toContain("NOT YET APPLIED");
    expect(SQL).toContain('"PROBE 0040: 22 of 22 as expected."');
    expect(SQL).toContain("the 4100 bridge runs the branch");
    expect(SQL).toContain("probes/0040_probe.sql\n-- part 0");
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
    expect(code).not.toMatch(/\b(grant|create\s+policy|drop\s+policy|drop\s+table|alter\s+table)\b/i);
  });

  it("a verdict row records the database's sha256 for the version it names, before the chain hashes the row", () => {
    expect(code).toContain("create or replace function public.audit_bind_verdict() returns trigger\n  language plpgsql security definer set search_path = public as $$");
    expect(code).toContain("new.new_value := new.new_value || jsonb_build_object('sha256',\n    (select v.sha256 from public.container_versions v where v.id = new.entity_id));");
    expect(code).toContain("if jsonb_typeof(new.new_value) is distinct from 'object' then\n    raise exception 'a verdict row''s new_value is an object';");
    expect(code).toContain("create trigger trg_audit_bind_verdict before insert on public.audit_log\n  for each row when (new.entity_type = 'file_version' and new.action like 'verdict:%')\n  execute function public.audit_bind_verdict();");
    expect(code).toContain("revoke execute on function public.audit_bind_verdict() from public, anon, authenticated;");
    // Postgres fires a table's BEFORE triggers in name order: the probe reads that order from pg_trigger after the apply.
    expect(PROBE).toContain("where tgrelid = 'public.audit_log'::regclass and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 4) = 4)\n  = array['trg_audit_bind_verdict','trg_audit_chain'] as ok");
  });

  it("cde_transition is 0032's body with the binding and the restore, nothing else dropped", () => {
    const replaced = [
      "(a.new_value->'ids_ref') is not null",
      "into v_id, v_action, v_scope, v_ids_ref, v_names_ids",
      "judged := coalesce(v_action = 'verdict:accepted' and v_scope > 0 and v_ids_ref is not null, false);",
      "when v_names_ids                   then 'verdict:accepted, judged by an IDS the caller sent, ledger #' || v_id",
      "else                                    'verdict:accepted, judged by an IDS the row does not name, ledger #' || v_id",
      "if (cur.state = 'shared' and p_new_state = 'published') or review_share then",
    ];
    expect(T32.length).toBeGreaterThan(1000);
    const lines32 = T32.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const r of replaced) expect(lines32).toContain(r);
    const lines40 = new Set(T40.split("\n").map((l) => l.trim()));
    expect(lines32.filter((l) => !replaced.includes(l) && !lines40.has(l))).toEqual([]);
    expect(T40).toContain("returns public.container_versions\nlanguage plpgsql security definer set search_path = public, extensions, auth as $$");
    expect(T40).toContain("(a.new_value ? 'sha256') and (a.new_value->>'sha256') is not distinct from cur.sha256\n      into v_id, v_action, v_scope, v_ids_ref, v_names_ids, v_bound");
    expect(T40).toContain("judged := coalesce(v_action = 'verdict:accepted' and v_scope > 0 and v_ids_ref is not null and v_bound, false);");
    expect(T40).toContain("restoring := cur.state = 'archived' and p_new_state = 'published';");
    expect(T40).toContain("if (cur.state = 'shared' and p_new_state = 'published') or review_share or restoring then");
    expect(T40).toContain("else                                    'verdict:accepted, not recorded against this version''s sha256, ledger #' || v_id");
    expect(T40).toContain("if restoring then\n          raise exception 'version % has no accepted verdict that measured something (latest: %) — restoring it needs the lead''s reason',");
  });

  it("every refusal that asks for a reason ends in the words the web asks the lead with", () => {
    const asks = [...T40.matchAll(/— ([a-z ]+) needs the lead''s reason'/g)].map((m) => m[1]);
    expect(asks).toEqual(["sharing it for review", "restoring it", "publishing it"]);
    expect(read("../src/setups/cde-transition.ts")).toContain(`export const NEEDS_REASON = "needs the lead's reason";`);
  });

  it("cde_protect_published is 0038's body with a version's geometry (every state) and an issued version's live pointer frozen to signed-in writes", () => {
    const live = "  if old.state in ('published', 'archived') and new.is_live is distinct from old.is_live and auth.uid() is not null then\n    raise exception 'the live pointer of an issued version is moved by the bridge';\n  end if;\n";
    const geom40 = "  if new.platform_item_id is distinct from old.platform_item_id and auth.uid() is not null then\n    raise exception 'a version''s geometry is attached by the bridge';\n  end if;\n";
    const geom38 = "  if old.state in ('published', 'archived') and new.platform_item_id is distinct from old.platform_item_id and auth.uid() is not null then\n    raise exception 'geometry on an issued version is attached by the bridge';\n  end if;\n";
    expect(P38).toContain(geom38);
    expect(P40).toContain(live);
    expect(P40).toContain(geom40);
    expect(P40.replace(live, "").replace(geom40, geom38)).toBe(P38);
  });

  it("the probe counts the versions it changes the answer for before the apply, then checks every case, and rolls back", () => {
    for (const w of ["of those, verdicts that record no sha256 (a lead''s reason after 0040)",
      "wip versions whose accepted verdict records no sha256 (a lead''s reason to share or publish after 0040)", "cde_transition overloads (expect 1)", "archived versions (each restores with a lead''s reason after 0040, unless judged again)",
      "open review chains with no reason recorded", "verdict rows that already record a sha256 (expect 0)",
      "a verdict row is stamped before the chain hashes it", "cde_transition keeps its grants", "cde_protect_published is 0040''s",
      "V1 a verdict row records the version's sha256 from the database, whatever the writer sent", "V2 the chain hashes the verdict row as it is stored",
      "P2 a verdict written before the version's sha256 asks for the lead's reason", "R1 a lead's restore of a version with no verdict asks for the reason",
      "R4 a reason is a signed-in lead's", "L1 a contributor's direct change of an issued version's live pointer is refused",
      "L3 the bridge (service) moves it", "G1 a contributor's direct write of a version's geometry is refused",
      "G2 the controls: the bridge (service) attaches the geometry; a contributor's INSERT carries its own",
      "P5 only the latest verdict counts", "P6 a sibling version with the same sha256 is not judged by the other version's verdict", "C1 once the version's sha256 is written, the chain's last approval asks for the lead's reason",
      '"PROBE 0040: 22 of 22 as expected."', "PROBE 0040: % of %"])
      expect(PROBE).toContain(w);
    expect(PROBE.match(/^ {2}n := n \+ 1;$/gm)).toHaveLength(22);
  });
});
