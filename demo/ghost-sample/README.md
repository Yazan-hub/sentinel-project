# GhostBuilder sample — a plan and a spec that test each other

Point GhostBuilder's **Ghost source folder** at this directory and import `sample-plan.dxf`. Full
step-by-step in [`docs/YOUR-TWO-TASKS.md`](../../docs/YOUR-TWO-TASKS.md).

Two files, deliberately built so the PDF explains the drawing:

- **`sample-plan.dxf`** — a 10 × 7 m plan (millimetres).
- **`sample-spec.pdf`** — a one-page outline specification naming those same layers.

Regenerate either with `python make-sample.py` — no third-party libraries needed. Edit the geometry or
`SPEC_LINES` in that script to build a different test case.

## What each layer is for

| Layer | Geometry | What it proves |
|---|---|---|
| `A-WALL-EXT` | 4 lines (perimeter) | Deterministic BDS match — **no model call**. The spec's *"fire rating of FR60"* should land on these walls (or their type). |
| `A-WALL-INT` | 1 line | Second deterministic match; the spec says explicitly it is **not** rated, so a model that puts FR60 here is over-reaching. |
| `A-FLOR` | closed polyline | Closed outline → boundary loop → `Floor.Create`, plus the floor-type provisioner. |
| `A-DOOR` | 2 closed rectangles | The centroid path for point families. Skips honestly if the project has no door family loaded — that's a valid outcome, not a bug. |
| `EXT-ENVELOPE-2HR` | 1 line | **The only layer the deterministic pass cannot match**, so it is the only one sent to the local model — and the spec paragraph about the envelope zone is exactly the context it needs. This is the P2 thesis in one row. |
| `A-ANNO` | 1 line | Tier 0 ignore (`*-ANNO`). **Must never reach the review window.** |
| `DEFPOINTS` | 1 line | Tier 0 ignore. Same. |

## Verified offline

`dotnet run --project tools/ghost-p2-check` reads this folder through the **real** `GhostEvidence.FromFolder`
— the same call the Revit command makes — and asserts the PDF parses in PdfPig, is cited as a source, and
contains `FR60`, `A-WALL-EXT` and `EXT-ENVELOPE-2HR`. So if the live run shows no document context, the
sample is not the suspect.
