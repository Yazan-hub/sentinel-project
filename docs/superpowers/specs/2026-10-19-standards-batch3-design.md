# Standards without JSON, batch 3: guideline, ifc_export and lod_matrix (2026-10-19)

**Founder's rule (2026-10-19):** no setting may need a .json file or a command. Batches 1 and 2 shipped the same day
(spec `2026-10-19-standards-forms-design.md`, merge 14e40371). Three kinds still read "No editor yet" in Project Settings ▸
Standards in force: guideline, ifc_export and lod_matrix. This batch gives each one a screen.
**Split (the audit's recommendation, taken on the founder's standing "proceed with the recommendation" rule):** Revit
windows for guideline and ifc_export, because family, type, title-block, workset, level and parameter names come from the
model as pick-lists; a web form for lod_matrix, because it has no model names in it.

## Rules kept (as batches 1 and 2)

- Lead or owner only. The web form is drawn only for `canInstallArtefacts`; the Revit windows enable Save only when
  `ChangesetClient.CoordinatorFrom` says lead (the Protection window's rule). The bridge refuses anyone below lead anyway.
- The bridge validates every body (`validateArtefact`). Each screen also checks the common mistakes first, in plain words,
  with the add-in's twin of the bridge check where there is one (`GuidelineMatcher.FromBodies`, `IfcExportMapping.FromBody`).
- Every save is one `PUT /cde/:key/artefacts/:kind`: `kind@n+1`, its sha and one `artefact_installed` ledger row. The
  message names `kind@n`.
- Keys a screen does not show are kept: the web form spreads the body in force and each row keeps its original object; the
  guideline window edits the body in force as a JSON tree and changes only the fields it shows.
- The Revit windows open at once and read off Revit's thread (the Protection idiom). They save for **this project** or
  **every project in the office**, as Protection does; the web form installs on the project in view, as every web form.

## lod_matrix — web form (`WebApp/src/setups/standard-forms.ts`)

Body (`sentinel-core/lod-matrix.ts parseLodMatrix`): `{standard_key, semver, status?, stage_map?, rows: [{category, DD}]}`.

- **Status:** Approved / Draft (absent reads as approved).
- **Stage map:** four selects — Concept, SD, DD, CD → Tender … Operate. Blank in the body = the default (D18: concept, SD and
  DD → Design; CD → Coordination). Only a stage that differs from the default, or that the body already named, is written.
  A later matrix stage mapped before an earlier one is said in words before the bridge.
- **Rows, one per class** (Walls, Floors, Roofs, Ceilings, Doors, Windows): *on its storey level* (`level: story_level`),
  *top attached to the next storey level* (`top: next_story_level`), *hosted in a wall* (`host: wall`), *properties DD asks
  for* (list, e.g. `Pset_WallCommon.FireRating`), *type snap in mm* (0–50; doors and windows 0). `type: guideline_rule` is
  always written (DD means typed by a guideline rule; it is the only value). A class twice is refused in words.
- `standard_key` is kept, or set to `<project>-lod`; `semver` is bumped by one patch (as naming).

## ifc_export — Revit window (Standards & Build ▸ Standards ▸ IFC Export Mapping)

Body (`validateArtefact`, `IfcExportMapping.FromBody`): `{label, psets: [{name, level, classes, properties: [{name, type,
revit_parameter?}]}], common_psets?}`. The body admits no other key, so the window's model is the whole body
(`IfcExportMapping`, which gains `ToJson`).

- **Name of this mapping** (label, 1–300 characters).
- **IFC common property sets:** the exporter's default / Yes / No (`common_psets` absent / true / false).
- **Property sets:** a list on the left (Add, Remove); for the selected set: its name, *for each element* or *for its type*
  (`level`), the IFC classes it applies to (ticks for the common classes in the exporter's spelling, plus a box for others),
  and its properties as rows: name, data type (a list of the exporter's types, Text first), Revit parameter (an editable
  list of this model's parameter names, gathered from its bound and element parameters; blank = the property's own name).
- Limits said before saving: 1–64 sets, 1–64 properties each, names as the bridge reads them, no repeats (case ignored).

## guideline — Revit window (Standards & Build ▸ Standards ▸ Modelling Guideline)

Body (`validateArtefact`, `GuidelineMatcher.CheckGuideline`): `{standard, elements: [{category, rules: [{when, use, why?}],
default?}], sheets?, placement?, …}`. The window shows and edits:

- **Name of the guideline** (`standard`).
- **Rules for a category:** a category picker (the guideline's categories, plus *Add a category* from the ones Sentinel
  types: Walls, Floors, Roofs, Ceilings, Doors, Windows, Columns, Furniture, Stairs, Structural Framing). The category's rules
  are cards with ↑ ↓ and Remove (the resolvers try a rule with more conditions first; ↑ ↓ orders rules with as many). A card: **when** layer, level (this model's levels),
  discipline, parameters (`Material = STONE; Fire = 60`); **use** family (this model's families of that category), type (that
  family's types), or a type pattern (`BDS_EXT_{thickness} mm`), and the stair run width in mm for Stairs; **why** (optional).
  A rule with no condition is refused in words (*use the default*). Then the category's **default** (family, type or
  pattern; stair width). *Remove this category* drops its entry.
- **Sheets** (optional): title block (this model's title blocks as `Family : Type`), sheet number and name patterns with
  `{level}`, `{use}`, `{prefix}`, `{n}`; the number must hold `{level}`. All three blank = no sheets block.
- **Placement** (optional): for each category Sentinel places, the workset (this model's worksets; blank = the active
  workset); *place in the phase of the view* (`phase: view`).

A blank condition read from an old body (before MA-2a) is taken out on save, as the bridge refuses it. Kept as they are: views, viewNaming, graphics, office, status, references and any other key; a rule's other `use.params`
and keys; a `when` field the card leaves blank is removed from that rule (blank is never written: the bridge refuses it).

## Settings rows (`STANDARD_LINKS`)

- guideline: *Edit in Revit ▸ Standards & Build ▸ Standards ▸ Modelling Guideline*
- ifc_export: *Edit in Revit ▸ Standards & Build ▸ Standards ▸ IFC Export Mapping*
- lod_matrix: moves to `STANDARD_FORMS` (**Edit…**).

## Tests

- vitest `standard-forms.test.ts`: the pilot LOD matrix round-trips and installs; a new matrix filled by hand installs; the
  plain-word checks fire; every select value installs.
- Cross-language: `tools/guideline-check` (GuidelineEdit) and `tools/publish-check` (`IfcExportMapping.ToJson`/`Problem`) read
  every repository guideline and every accepted ifc-export fixture case and write it back unchanged (deep-equal), check the
  plain-word refusals, and build a new body each that must equal `WebApp/bridge/fixtures/standard-windows/*.json`; vitest runs
  those same files through `validateArtefact` (the promote-body.json idiom). `SENTINEL_WRITE_FIXTURES=1` rewrites them.
- The windows refuse to save over a version saved since they opened (the target's sha — the project's, or the office's for an office
  save — is read again before the PUT), and a
  copy read from the machine cache or a none the bridge did not confirm is read-only.
- The add-in builds for 2021–2027.

## Drill (Session STD-3)

Web, as a lead on a scratch project: Edit… the LOD matrix, change a value, save → `lod_matrix@n+1` on the row and the ledger;
a bad value refused in words. Revit 2024, a model bound to the scratch project: open each window, check the pick-lists
come from the model, change a value, save → `guideline@n+1` / `ifc_export@n+1` on the ledger; the web row names the window.
