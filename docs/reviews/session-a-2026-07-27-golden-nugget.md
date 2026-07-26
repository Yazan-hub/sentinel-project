# Session A — Onboard a foreign model (Golden Nugget, 2026-07-27)

Protocol: `docs/TESTING_PROTOCOL.md` Session A. Model: Autodesk's German sample
`BIM_Projekt_Golden_Nugget-Architektur_und_Ingenieurbau.rvt` (Revit 2024) —
HOAI phases, German parameter names, zero BDS overlap. Run late-night,
owner-as-user, ~15 minutes for the harvest half.

## Build Office System — PASS (harvest half)

- Harvested **171 items**: 109 shared parameters (all German — `Verfasser
  Firma 1`, `Aussparung Breite/Höhe/Länge/Tiefe`, `Bauherr`,
  `Katastralgemeinde` …) each typed (`Text-instance`, `Length-instance`,
  `YesNo-type`) at honest 1.0 confidence, **60 view templates**, 2 browser
  organizations.
- **Type catalogue auto-exported: 947 types** to `%AppData%\Sentinel\
  type-catalog.json` — verified on disk. Umlauts and German names intact.
- **Save pack** wrote `packs\bim-projekt-golden-nugget-…-1.0.0.json` with
  schema version, pack key, semver, timestamp, and source-model provenance —
  verified on disk.
- **ISO 19650 gap analysis** on the harvested pack: "0/6 fundamentals present
  (8%)" — correctly reports a German HOAI project has no container naming
  rule, no S0–S7 suitability code, no Uniclass classification, and flags
  `SOFiSTiK_Revision` as "looks related — confirm it carries the revision
  code." Specific, honest, actionable on fully foreign data. This button is
  quietly one of the strongest demo moments in the product.

## Findings

1. **MEDIUM — Worksets (0) needs a why.** The dialog reports zero worksets
   with no explanation. If the model isn't workshared (likely for this
   sample), say so ("model is not workshared — no worksets to harvest");
   if it is, this is a harvest bug. As shown, a user can't tell gap from
   fact. (Verify against a workshared model in the next sitting.)
2. **LOW — pack dialog shows params only.** The review list surfaces
   worksets + shared parameters, but the pack also captured 60 view
   templates and browser organization — invisible in the dialog, so the
   user can't review or untick them. Surface every provisioned category.
3. **LOW — `provision.type_catalog` is empty in the pack** while the real
   catalogue goes to a separate file. Either populate it or drop the field —
   an empty array in a saved pack reads as a failed export.
4. **Window management note (env, not product):** Revit opened on a
   disabled/black laptop display; had to be moved via Win32 to the active
   monitor. Not a Sentinel issue.

## Not yet run (rest of Session A)

Build-ticked-into-blank-doc (Apply Standard round-trip), Project Setup
persistence re-check, Ingest Docs with a public PDF, Rule Set display.
Continue next sitting — the harvested Golden Nugget pack is saved and ready
to be applied.
