# Roadmap item 5 — 2D: sheets checked against the MIDP, plans on the Views engine

Status: written 2026-09-29 on the founder's "do everything by yourself" (asleep; defaults chosen as below). The ground
was mapped by workflow `wf_1339ab41-75e` (web 2D, Revit sheets, the MIDP/TIDP tracker, the engine's 2D APIs) and the
facts this rests on were re-read in `cde-store.mjs` (adjudicateProposal, readRegister, registerFileVersion).

## Today

- 2D is Revit PNGs: Publish Sheets / Publish Views write PNGs + `manifest.json` to `%AppData%\Sentinel\{sheets,views}`
  on the bridge's machine; the web shows them in a lightbox (admins only, H3) and a plan hotspot isolates its level.
- A sheet is never a container, so it can never deliver a MIDP row; a sheet that fails to export is dropped silently.
- A MIDP row is delivered when a container of exactly its name (`containerKey`: one extension stripped, case ignored)
  has a published or archived version; `expected_revision` is compared to the version's revision — which a registered
  version gets as `v{N+1}`, never the drawing's own (P01…).
- Nothing reports a registered container nobody planned.
- The engine's 2D (`OBC.Views.createFromIfcStoreys/open/close`, `OBF.ClipStyler.createFromView`) is installed and unused;
  the Project Browser's 2D button points at a "Plans tab" that does not exist.

## Phase A — a sheet is proposed like a model: named, registered, checked against the MIDP (no migration)

**Bridge.**
- `register` takes an optional `revision` (a string ≤ 16 characters, trimmed): the registered version carries the
  drawing's own revision instead of `v{N+1}`. Any other type is a 400 before any row.
- Every proposal that names a container (`container_name`) records `midp` on its proposal row, computed from the
  project's deliverables and the same `containerKey`:
  - `{planned: true, row_id, due_date, expected_revision, revision: "met" | "mismatch" | "not_specified"}` — `met`/
    `mismatch` only when both the plan and the register name a revision (case ignored);
  - `{planned: false}` — no row plans this name (said, never an error);
  - `{not_read: "<why>"}` — the deliverables read failed; never `planned: false` on a failed read.
  Several rows planning the same name: the first by due date, and `rows: n` says how many.
  The reply carries the same `midp`. IFC publishes get it for free.

**Revit (Publish Sheets).**
- Each sheet is also exported as one PDF (Revit 2022+ `PDFExportOptions`, one file per sheet, named from the sheet
  number); the PNG stays for the viewer.
- Each sheet is proposed with `container_name = <SheetNumber>.pdf`, no elements, `source "Publish Sheets"`, and
  `register {name, size_bytes, sha256, revision}` (the sheet's current revision, when it has one).
- A sheet that fails to export is listed "not exported — <why>"; nothing is proposed for it.
- The dialog says per sheet: registered vN (or P01) · planned due D / not in the MIDP / MIDP not read — why; or refused
  — the naming standard's words (a hold row, as for a model). The manifest keeps `container_name`, `version_id`,
  `verdict`, `midp`.
- **Decision (default): the sheet number must be the full container name.** A number that the naming standard refuses is
  refused in words, never renamed. The drill measures how aster's sheet numbers fare.
- **Decision (default): PDF is the deliverable.** It is what `containerKey` and the rulesets already strip.
- **Decision (default): publishing a drawing still needs a lead's reason** (migration 0031 accepts only an accepted
  verdict that measured something; a sheet has no elements, so its verdict is `recorded`). Revisit after the drill.
- **Deferred:** the PDF's bytes stay on the machine that exported them (the version carries their sha256 and size);
  uploading them to the platform project comes after Phase B.

## Phase B — the MIDP sees what nobody planned; the Sheets panel shows the verdicts

- `unplannedContainers(rows, files)` (deliverables-logic, pure): every live container whose key no row plans. Returned by
  `/deliverables/:key/status` as `unplanned`; the Deliverables panel lists them ("Issued, never planned"). **Amended while
  building:** they are not folded into `midp.milestones` — that would turn its verdict and the stage gate that reads it;
  a gate change is the founder's to decide.
- The Sheets panel: each sheet with a `container_name` shows its MIDP status from `/deliverables/:key/status` (delivered,
  late, in WIP, overdue, pending — or "not in the MIDP"); a failed read says "MIDP not read — <why>"; a sheet exported
  before Phase A shows "not registered — published before sheets were proposed".
- The Project Browser's 2D message points at what exists (Views / Sheets tabs and the live plan).

## Phase C — plans on the Views engine

- A plan hotspot (Sheets) and a level's view (Views) get **Live plan**: `views.createFromIfcStoreys({storeyNames:
  [level]})` → `open(id)` → section edges through `ClipStyler.createFromView(view)`; **Close** restores the camera
  (`restoreCameraOnClose`). The level-isolate stays as it is.
- **Added while building:** BIM Tools ▸ Browser ▸ **▦ Plans** lists every storey of the loaded models as a live plan —
  an IFC with no Revit export gets plans too (aster-tower has no published views or sheets).
- A level that is no storey of the loaded models says so: "live plan not opened — <level> is not a storey of the loaded
  models"; no model loaded says that. Storey names are matched as `isolateStoreyByName` matches them.
- Verified in the local app and in the published app (the platform's own viewer shares the engine; the self-built
  fragments worker does the sections).

## Tests

Bridge: readRegister's revision (kept, trimmed, refused when not a short string); the `midp` field (planned + met /
mismatch / not_specified, several rows, unplanned, not read) on the proposal row and the reply; unplannedContainers.
Web: the Sheets panel's status line per case; the live-plan helper's refusals (no storey, no model). Revit: builds on
2024–2026; the PDF naming helper.

## Drill (B27)

- Bridge, on a drill project: a planned sheet name with P01 → `midp.planned`, `revision met`, registered as P01; an
  unplanned name → `planned: false`; a misnamed one → rejected, held; the status lists the unplanned container.
- Web: the Sheets panel's statuses; Live plan opens and closes on a loaded model (local and published app).
- Revit (owed to a session with Revit): Publish Sheets on aster — PDFs written, one proposal row per sheet, the dialog
  lines; the lead publishes the planned sheet with a reason → the Deliverables row reads delivered.

## As built (2026-09-29)

55b5454 (bridge + web A/B/C), 84ff93b (▦ Plans), c24d4b0 (Revit Publish Sheets), cfb8d5e (a gate-preview honesty fix
found on the way). Drill B27 in the sim-room log.
