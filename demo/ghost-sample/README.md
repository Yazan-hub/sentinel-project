# GhostBuilder sample — a plan and a spec that test each other

Point GhostBuilder's **Ghost source folder** at this directory and import `sample-plan.dxf`.
Step-by-step in [How to run the live test](#how-to-run-the-live-test) below.

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
| `EXTERIOR-ENVELOPE` | 1 line | **The only layer the deterministic pass cannot match**, so it is the only one sent to the local model — and the spec paragraph about the envelope zone is exactly the context it needs. This is the P2 thesis in one row. |
| `A-ANNO` | 1 line | Tier 0 ignore (`*-ANNO`). **Must never reach the review window.** |
| `DEFPOINTS` | 1 line | Tier 0 ignore. Same. |

## How to run the live test

The acceptance run for GhostBuilder v2 — do this again whenever the model, the ruleset, or the placement
code changes. It first passed on **Revit 2024, 2026-07-23** (all rows green; see the
[P3 plan](../../docs/superpowers/plans/2026-07-23-ghostbuilder-v2-p3-plan.md)).

**Before you start:** Revit must be **closed**, then `dotnet build SentinelAddin/Sentinel.csproj
-p:RevitVersion=2024` (the build *refuses* to deploy over a running Revit rather than leave a silently
stale install). Ollama must be running with `qwen2.5:7b-instruct`; `llava` is optional and adds the
sketch-reading step.

1. Open Revit, in a project **with at least one Level**.
2. **Insert → Import CAD** → `sample-plan.dxf`. If asked for units, choose **Millimeters**.
3. Point **Sentinel → Project Setup → Ghost source folder** at a folder holding a spec (this folder, or
   your own). Then **Sentinel → Ghost Builder** and pick the import.

What must be true — each row is a real failure mode, not a formality:

| Check | Why it matters |
|---|---|
| The review window appears and **nothing is built yet** | The safety gate. Geometry before Build = the gate failed. |
| `A-ANNO` and `DEFPOINTS` are **absent** from the list | Tier 0 ignore regressed if they appear. |
| `EXTERIOR-ENVELOPE` is interpreted sensibly | The spec-reading premise. Clear it from `%AppData%\Sentinel\dwg_mappings.json` first, or the cache answers and the model is never asked. |
| Untick a layer → it is **not** in the model | Ticks are the gate, not decoration. |
| A spec value (e.g. `Fire Rating = FR60`) is on the built element or its type | The P2 payload. |
| **One** Ctrl+Z removes the whole build | Confirms the single-transaction design; if it takes several, that's a real regression. |

Expect `Thickness` and `Material` to be reported as not applied — Revit derives wall thickness from the
type's structure and Material is an element reference, so neither takes a text value. That is honest
reporting, not a bug.

**Faster loop:** `dotnet run --project tools/ghost-p2-check -- --live` runs the real mapping and parameter
passes against real Ollama and real documents with **no Revit at all** — that half of the code is
Revit-free. It caught two genuine bugs before the first live run. Use it first; only the placement,
the window and the undo actually need Revit.

## Verified offline

`dotnet run --project tools/ghost-p2-check` reads this folder through the **real** `GhostEvidence.FromFolder`
— the same call the Revit command makes — and asserts the PDF parses in PdfPig, is cited as a source, and
contains `FR60`, `A-WALL-EXT` and `EXTERIOR-ENVELOPE`. So if the live run shows no document context, the
sample is not the suspect.
