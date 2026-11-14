-- 0056_eir_version_label.sql — BIM documents workspace R2d follow-up: the version an EIR's round publishes is labelled "Accepted C0n"
--   (drill finding F-R2d-10; founder 2026-11-14: "do it").
--
--   Before: every published (C) version was labelled "Confirmed C0n". "Confirmed" is a BEP's stage word (pre-appointment, confirmed, revision);
--   an EIR never changes stage, so its accepted version read "Confirmed C01" beside the status "Accepted, A1".
--
--   One function of 0053 is replaced; every other line of it is 0053's, unchanged:
--   - doc_round_cut: the label of a C version is "Accepted C0n" for an EIR and stays "Confirmed C0n" for a BEP; a tender issue stays "Tender issue P0n".
--   The revision code (P0n, C0n), the stored copy and its sha are untouched. Versions already cut keep the label they were cut with: a version never changes.
--
-- Dry-run: PGlite with every migration (bridge/migration-0056.test.mjs). Probe: probes/0056_probe.sql.
-- APPLIED 2026-11-14 ~13:25 UTC on the founder's "do it" (Supabase migration 0056_eir_version_label). The live function body matches this file (md5). Probe: part 1 all true, "PROBE 0056: 3 of 3 as expected."
-- Rollback (never run casually): re-run 0053's doc_round_cut body.

begin;

create or replace function public.doc_round_cut(p_round uuid, p_letter text) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare r public.doc_rounds; v_rev text; v_no int; v_sha text;
begin
  select * into r from public.doc_rounds where id = p_round;
  select p_letter || lpad((count(*) + 1)::text, 2, '0') into v_rev from public.bim_document_versions where document_id = r.document_id and revision like p_letter || '%';
  select coalesce(max(version_no), 0) + 1 into v_no from public.bim_document_versions where document_id = r.document_id;
  insert into public.bim_document_versions(document_id, version_no, snapshot, label, published_by, round_id, revision)
  -- 0056: "Confirmed" is a BEP's stage word; an EIR's published version is "Accepted"
  values (r.document_id, v_no, r.render, case when p_letter = 'P' then 'Tender issue ' when lower(r.doc_type) = 'eir' then 'Accepted ' else 'Confirmed ' end || v_rev,
          coalesce(auth.jwt()->>'email', auth.uid()::text), r.id, v_rev)
  returning sha into v_sha;
  return jsonb_build_object('version_no', v_no, 'revision', v_rev, 'sha', v_sha);
end $$;
revoke execute on function public.doc_round_cut(uuid, text) from public, anon, authenticated;

commit;
