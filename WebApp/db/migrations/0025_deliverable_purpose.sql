-- 0025: the third leg of a real delivery plan. A deliverable that does not say WHICH DECISION it
-- supports is a document register entry, not a plan (ISO 19650's proposed rename of the BEP to
-- "Information Production Plan" makes the same point). Nullable so existing rows stay valid — the
-- midp.plan_completeness check reports the gap rather than the schema rejecting it.
alter table public.deliverables
  add column if not exists purpose text;
