# MA-5b-2 — Ghost and Datum DWG hygiene (GHB-3 + DAT-4) — as built

**Goal:** Ghost Builder reads the drawing the person picked as it is now, and leaves no import behind; Ghost and Datum read a drawing in the
units it was drawn in.

**Spec:** docs/strategy/2026-09-30-model-automation-design.md (MA-5: GHB-3, DAT-4); the Revit tools audit (GHB-3: an edited DWG is never
re-read, the import stays after every end; DAT-4: no units choice, F41's inches). Founder: "go ahead with MA-5b", "can u run all phases all
together?" (2026-10-11).

## Decisions (as built)

1. **No reuse by name.** Every run imports the picked file (origin to origin, as before), so an edited drawing is read again and its sha256
   is always the file's (MA-1a item 4's provenance). The picker's "(already imported)" label goes with it.
2. **The import this run made is removed at the end** — never one the person picked from the model:
   - after a build: inside the build's TransactionGroup, after every changeset and the BLOCK check, before the group is named and kept — one
     Ctrl+Z brings back the build and the drawing together (GhostChangesetBuild.DropImport);
   - at every other end (the review closed, Cancel, a refusal, a failed build, went back with the review closed): `Release()` enqueues
     `RemoveImport` on Revit's thread (App.Events), once; a build that already removed it leaves nothing to do;
   - the two early ends on Revit's thread (the read failed, no layer): removed at once.
   The import's type goes too when no other instance uses it. The import stays visible while the person reviews (the ghosts over it).
   Not linked: an import read this way is live-proven (Datum, SIM 3.9); MH-CAD-01/02 never see it because it is gone when the run ends.
3. **Units (DAT-4):** the pick window (shared by Ghost and Datum) names the drawing's units — as the file says (Revit's Default: the file's
   header), mm, cm, m, in, ft — passed as `DWGImportOptions.Unit`. Datum adds `SpacingWarnings`: every storey gap under 1.5 m (a metres
   drawing read as mm), or a gap over 10 m (units, or a level line missing); an FFL/SSL pair beside real storeys is not flagged.

## Files

`SentinelAddin/Commands.GhostBuilder.cs`, `GhostBuilder/GhostChangesetBuild.cs`, `UI/DwgPickWindow.cs`, `Commands.Datum.cs`,
`GhostBuilder/DatumBuilder.cs`, `GhostBuilder/DatumFromDrawing.cs`; checks `tools/datum-check` (4 spacing cases), `tools/promote-check/Ma5b2.cs`.

## Live drill MA5b2 (Revit 2024, a scratch copy of a drill model; Ghost source folder holding a DXF)

| Row | What happens | Pass when |
|---|---|---|
| G-1 | Ghost Builder, pick the DXF, units "as the file says", close the review without Build | Manage Imports / the project browser: no import left; Undo history ends with "Sentinel — remove the imported DWG" |
| G-2 | Edit the DXF (move one wall line), keep its name; run again | the review reads the moved line (the old read is gone); the build:run receipt's source sha differs from G-1's |
| G-3 | Build (ticked rows) | the walls placed, no import left; one Ctrl+Z brings back the walls' absence AND the drawing (the import is back); Ctrl+Y |
| G-4 | Pick from model (an import already there) and close | that import is kept |
| D-1 | Datum on a metres DXF with no $INSUNITS, units "as the file says" | the preview warns "at most N mm apart … units look wrong" |
| D-2 | The same file, units "metres" | the levels at their real heights; no spacing warning |

## Checks

promote-check 900 (9 new), datum-check (4 new), the add-in builds for 2021, 2024 and 2025.
