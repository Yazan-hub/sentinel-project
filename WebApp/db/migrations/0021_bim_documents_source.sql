-- 0021: link an ingested document to the original client file it was extracted from.
-- Nullable jsonb, 1:1 with the document and never queried independently, so a column beats a table:
--   {file_id, name, kind, pages, ingested_at}
-- Hand-authored documents leave it null. sections[].bindings stays reserved for sub-project 3.
alter table bim_documents
  add column if not exists source jsonb;
