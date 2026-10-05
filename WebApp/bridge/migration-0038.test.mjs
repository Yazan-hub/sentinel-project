// Migration 0038 (SEC-1): the database holds the bridge's write rules for bridge_docs, bim_documents, deliverables, bcf_topics,
// container_versions / information_containers and element_snapshots / model_revisions. Applied by the controller on the
// founder's "apply" — never by a test. This pins the text the probe and the bridge rely on, as migration-0037.test.mjs does.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, ""); } catch { return ""; } };
const SQL = read("../db/migrations/0038_bridge_role_rules.sql");
const PROBE = read("../db/migrations/probes/0038_probe.sql");
const code = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

describe("migration 0038 — the database holds the bridge's write rules (SEC-1)", () => {
  it("records its apply and the probe's pass, and says what must hold before and after the apply", () => {
    expect(SQL).toContain("APPLIED 2026-10-05");
    expect(SQL).not.toContain("NOT YET APPLIED");
    expect(SQL).toContain('"PROBE 0038: 28 of 28 as expected."');
    expect(SQL).toContain("probes/0038_probe.sql part 0");
    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
  });

  it("every bridge_docs store is the bridge's alone: the floor is null for all", () => {
    const floor = code.slice(code.indexOf("function public.bridge_docs_floor"), code.indexOf("$$;"));
    expect(floor).toContain("select null::text;");
    expect(floor).not.toMatch(/\bwhen\b/);
  });

  it("bim_documents, bcf_topics, element_snapshots and model_revisions lose their signed-in writes; deliverables are a lead's", () => {
    for (const p of ["bim_documents_update on public.bim_documents", "bcf_topics_insert on public.bcf_topics", "bcf_topics_update on public.bcf_topics",
      "elem_snap_insert on public.element_snapshots", "elem_snap_delete on public.element_snapshots", "model_rev_insert on public.model_revisions",
      "model_rev_update on public.model_revisions", "bim_documents_insert on public.bim_documents"])
      expect(code).toContain(`drop policy if exists ${p};`);
    expect(code).toContain("create policy deliverables_update on public.deliverables for update to authenticated\n  using (public.has_min_role(project_id, 'lead'))\n  with check (public.has_min_role(project_id, 'lead'));");
    // a signed-in insert of a document is a contributor's, in wip (C3)
    expect(code).toContain("create policy bim_documents_insert on public.bim_documents for insert to authenticated\n  with check (public.has_min_role(project_id, 'contributor') and status = 'wip');");
    expect(code.match(/create policy/g)).toHaveLength(2);
    expect(code).not.toMatch(/\b(grant|create\s+table|drop\s+table|drop\s+function)\b/i);
  });

  it("a version stays in its file; a published or archived one and the file holding one: frozen but for state, live pointer, bin stamp and the bridge's once-only geometry link", () => {
    expect(code).toContain("if new.container_id is distinct from old.container_id then\n    raise exception 'a version stays in its file';");
    expect(code).toContain("if old.state in ('published', 'archived') and new.platform_item_id is distinct from old.platform_item_id and auth.uid() is not null then\n    raise exception 'geometry on an issued version is attached by the bridge';");
    expect(code).toContain("create or replace function public.cde_container_frozen() returns trigger\n  language plpgsql security definer set search_path = public as $$");
    expect(code).toContain("revoke execute on function public.cde_container_frozen() from public, anon, authenticated;");
    expect(code).toContain("'{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[]");
    expect(code).toContain("if old.state in ('published', 'archived')");
    expect(code).toContain("if old.platform_item_id is not null and new.platform_item_id is distinct from old.platform_item_id then");
    expect(code).toContain("if old.sha256 is not null and new.sha256 is distinct from old.sha256 then");
    // each rule whole, condition and words together, so a switched-off condition fails here (not only in the live probe)
    expect(code).toContain("if old.state = 'published' and new.state not in ('published', 'archived') then\n    raise exception 'a published version can only move to archived';");
    expect(code).toContain("if old.state in ('published', 'archived')\n     and (to_jsonb(new) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[])\n         is distinct from (to_jsonb(old) - '{state,is_live,deleted_at,deleted_by,platform_item_id}'::text[]) then\n    raise exception 'a version that is % changes only its state, its live pointer and its geometry link', old.state;");
    expect(code).toContain("if new.project_id is distinct from old.project_id then\n    raise exception 'a file stays in its project';");
    expect(code).toContain("if new.iso_name is distinct from old.iso_name\n     and exists (select 1 from public.container_versions v where v.container_id = old.id and v.state in ('published', 'archived')) then\n    raise exception 'a file that holds a published or archived version keeps its name';");
    expect(code).toContain("if old.platform_item_id is not null and new.platform_item_id is distinct from old.platform_item_id then\n    raise exception 'a version''s geometry is attached once — its platform item is already set';");
    expect(code).toContain("if old.sha256 is not null and new.sha256 is distinct from old.sha256 then\n    raise exception 'a version''s sha256 is written once';");
    // the bridge's deleteProject reads this refusal's words (a 409 "archive it instead")
    expect(code).toContain("if old.state = 'published' then raise exception 'published versions are immutable (cannot delete)'; end if;");
    expect(code).toContain("create trigger trg_container_frozen before update of project_id, iso_name on public.information_containers");
  });

  it("a snapshot row's project is its revision's project", () => {
    expect(code).toContain("alter table public.model_revisions add constraint model_rev_id_project unique (id, project_id);");
    expect(code).toContain("foreign key (revision_id, project_id) references public.model_revisions (id, project_id) on delete cascade;");
  });

  it("the probe checks the rows already there before the apply, the schema after it, and every refused and allowed write, and rolls back", () => {
    for (const w of ["every snapshot row''s project is its revision''s project", "container_versions has exactly the columns 0038 freezes and exempts",
      "container_versions has exactly the triggers 0038 was written against", "every bridge_docs store is the bridge''s alone",
      "a document is inserted in wip", "model_revisions has no signed-in insert or update", "and policyname <> 'deliverables_update'",
      "B1 a viewer''s direct update of a document''s comments patches 0 rows", "B2 a viewer''s direct insert of a comments document is refused",
      "B7 a contributor''s direct insert of a topic is refused", "B8 a published version moved to another file is refused",
      "B10 a contributor''s direct geometry attach on a published version is refused", "B10s the bridge (service role) attaches geometry once",
      "B13 the bridge sets the live pointer", "B14 a file that holds a published version renamed is refused",
      "B17 a contributor''s direct insert of an element snapshot is refused", "B19 the control: a lead''s direct update of a deliverable patches 1 row",
      "B20 a snapshot row whose project is not its revision''s is refused", "B21 a contributor''s direct insert of a published document is refused",
      "B22 a shared version moved to another file is refused", "B23 a lead archives a published version through cde_transition",
      "B24 a lead restores it to published", "B25 a contributor''s direct insert of a revision header is refused",
      '"PROBE 0038: 28 of 28 as expected."', "PROBE 0038: % of %"])
      expect(PROBE).toContain(w);
    // a refusal that expects 0 rows passes only when the caller saw the row (C2): never "OK 0" alone
    expect(PROBE.match(/is distinct from 'OK 0 seen 1'/g)).toHaveLength(7);
    expect(PROBE).not.toMatch(/is distinct from 'OK 0' then/);
    expect(PROBE).not.toMatch(/a signed-in caller may/i);
    expect(PROBE).toContain("set local role authenticated;");
  });

  it("the bridge writes every table 0038 closes with the service key, after its own role check — safe on either side of the apply", () => {
    const count = (text, s) => text.split(s).length - 1;
    const DOCS = read("./bimdocs-store.mjs"), OFFICE = read("./office-store.mjs"), ROUTES = read("./bcf-service.mjs"), CDE = read("./cde-store.mjs");
    // every document write lands only on the document as it was read, with the service key; no row back is a 409 in words
    expect(DOCS).toContain("const rows = await sb(`bim_documents?id=eq.${enc(doc.id)}&project_id=eq.${enc(doc.project_id)}${where}`,");
    expect(count(DOCS, "bim_documents?id=eq.")).toBe(2); // writeDoc, and getDoc's read
    // the transition and the publish: the status and the updated_at it was read with (the publish's version after it)
    expect(DOCS).toContain("const writeStatus = (doc, status) => writeDoc(doc, { status }, `&status=eq.${enc(doc.status)}&updated_at=eq.${enc(doc.updated_at)}`);");
    expect(DOCS).toContain("const row = await writeStatus(doc, to);");
    expect(DOCS).toContain('const issued = await writeStatus(doc, "published");');
    expect(DOCS.indexOf('const issued = await writeStatus(doc, "published");')).toBeLessThan(DOCS.indexOf('await sb("bim_document_versions", { method: "POST"'));
    // the four section writers land only on the document as it was read (C7)
    expect(count(DOCS, "const row = await patchSections(doc, sections, updated_at);")).toBe(4);
    expect(DOCS).toContain("writeDoc(doc, { sections }, `&status=in.(wip,shared)${updated_at ? `&updated_at=eq.${enc(doc.updated_at)}` : \"\"}`);");
    expect(DOCS).toContain('prefer: "return=representation", service: true });\n  if (!Array.isArray(rows) || !rows.length) throw err(409, "the document changed or was issued meanwhile — nothing was saved");');
    expect(DOCS).toContain('await requireMinRole(key, "viewer"); // 0038');
    expect(DOCS).toContain("{ comments: [comment], rev: 1 }, { service: true });");
    expect(DOCS).toContain("bag.rev === undefined ? null : String(bag.rev), { service: true });");
    expect(OFFICE).toContain("await docUpsert(SNAPSHOT_STORE, proj.id, LATEST, stored, { service: true });");
    expect(OFFICE).toContain("await docUpsert(SCAN_STORE, proj.id, LATEST, stored, { service: true });");
    expect(count(ROUTES, 'cde.docUpsert("rfi", rpid, rfi.guid, rfi, { service: true })')).toBe(2);
    expect(count(ROUTES, 'cde.docUpsert("rfi", rpid, rfi.guid, rfi)')).toBe(0);
    expect(CDE).toContain('await sb(`bcf_topics`, { method: "POST", body: bcfRow(topic), prefer: "return=minimal", service: true });');
    expect(CDE).toContain('await sb(`element_snapshots`, { method: "POST", body: chunk, prefer: "return=minimal", service: true });');
    expect(count(CDE, 'await requireMinRole(topic.project_id, "contributor"); // 0038')).toBe(2);
    // the take-off's header and its link (C8), and geometry on a file's live version (C1)
    expect(CDE).toContain("? (await versionOnKey(key, b.container_version_id)).version.id");
    expect(CDE).toContain("service: true, // 0038: model_revisions has no signed-in insert");
    expect(CDE).toContain('&platform_item_id=is.null`, { method: "PATCH", body: { platform_item_id: b.platform_item_id }, prefer: "return=representation", service: true })');
  });
});
