# Standards without JSON: forms and links in Standards in force (2026-10-19)

**Founder's rule (2026-10-19):** Sentinel users are BIM managers and architects. A standard that can only be changed with a
.json file, a command or code is not finished.
**Founder's pick:** batches 1 and 2 of the audit (side-session notes `standards-no-json-audit.md`).

## What changes

Project Settings ▸ Standards in force (`WebApp/src/setups/project-settings-panel.ts`). Each row loses "Install JSON…".
A lead or owner gets one of these instead:

| kind | control |
|---|---|
| naming, contract, layers, review, publish, roi | **Edit…**, a form under the list, filled from the standard in force (the project's own, else the office's) |
| ids | **Edit in Documents** opens the project's Documents tab (Compile to IDS) |
| ruleset | **Choose in Standards** opens the Standards sidebar (packs) |
| carbon_factors | **Edit in Carbon** opens Lifecycle ▸ Carbon 6D (type the factors, then Install factors) |
| type_catalog | text: *Revit ▸ Standards & Build ▸ Standards ▸ Build Office System* |
| protection | text: *Revit ▸ Standards & Build ▸ Protection* |
| guideline, ifc_export, lod_matrix | text: *no editor yet; import a file under Advanced* (batch 3) |
| evidence_pack | nothing (the evidence routes write it, as today) |

Below the list, a lead or owner gets a closed **Advanced ▸ Import a file from another office** section: a kind picker and
"Choose file…". It reuses `installArtefactFile` unchanged, for exchanging packs between offices.

## Rules kept

- Lead or owner only (`canInstallArtefacts`). The bridge still validates every body (`validateArtefact`) and refuses
  anyone below lead.
- Every save is a normal `PUT /cde/:key/artefacts/:kind`, so it makes `kind@n+1`, its sha, and an `artefact_installed`
  ledger row. The message names `kind@n`.
- A contract is still mirrored to the linked platform project after it installs, and the mirror line is shown.
- The provenance is `source: {form: "project-settings", edited_at}`.
- Saving always installs on the **project** in view. When the form started from the office's standard, it says so, and
  the office's standard is left as it is.
- Plain DOM, iframe-safe. No `window.prompt` and no `confirm`.

## The forms (`WebApp/src/setups/standard-forms.ts`)

One small schema-driven renderer: text, number, list (comma or new line), check, select, and row tables. Each kind gives
`fromBody(body) → model` and `toBody(model, prev) → body`. `toBody` checks the common mistakes in plain words (for example
*"Step 2 needs a name"* or *"“wall” is not an IFC class name; write it like IFCWALL"*), and the bridge stays the judge.
Keys the form does not show are kept from the body in force: the body is spread first, and a row keeps its original
object. A form never drops what another tool wrote (for example a layers body's `enforce` or `params`, or a contract's
`schema_version`).

- **naming:** title, separator (one character), parts (label, key filled from the label when blank, allowed values, or a
  pattern), on a wrong name (Refuse / Warn / Off), extensions to strip. `standard_key` is kept, or set to `<project>-naming`.
  `semver` is bumped by one patch.
- **contract:** name, IFC schema (IFC2X3 / IFC4), required classes plus minimum count, required property sets, required
  properties, forbidden classes plus maximum count and maximum share in %, georeference required, minimum coverage in %
  (blank means 100), tolerance in mm (blank means not set).
- **layers:** standard name, layer rows (layer, category, family, aliases), ignored layers, datum (level layers, grid
  layers, skipped grid letters, level and grid merge tolerances in mm).
- **review:** 0 to 6 steps, each with a name, who may approve (any member, lead or owner, owner) and approvals (1 to 5).
- **publish:** one switch.
- **roi:** currency, hourly rate, minutes saved per gate run, rename and family heal (a blank one is not counted), basis.

## Tests

`standard-forms.test.ts` (vitest, node) checks four things. A sample body read into a form and written back passes the
bridge's own `validateArtefact` and keeps the keys the form does not show. A new form for each kind, once filled, passes.
The plain-word checks fire. The constants (categories, schemas, roles) match the bridge's. The bridge tests stay unchanged.

## Drill (Session STD-F)

In the web app as a lead, on a scratch project: open each Edit… form, change one value, save, and see `kind@n+1` in the
row and on the ledger. Check that a bad value is refused in plain words, that each link opens its place, that the
Advanced import still installs a file, and that a contributor sees no controls.
