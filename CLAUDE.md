# Sentinel — working notes for Claude

Sentinel is a BIM governance "referee" (Revit add-in + web app on That Open + Node bridge + Supabase). Start from
`docs/strategy/2026-11-16-sentinel-full-picture-ar.html` (the founder's overview, Arabic) and `docs/handbook/00-INDEX.md`.
The founder writes in Arabic (Levantine); answer in the same language, keep code, docs and commits in English.

## Usage budget (founder is on Claude Pro since 2026-11-16 — the weekly limit must last the week)

Pick the cheapest model and lowest effort that holds quality, without being asked. Relative cost per token:
Haiku 5.5 ≈ 1/40 of Opus, Sonnet 5.5 ≈ 1/2 of Opus, Opus 5.5 = 1, Fable 5.2 ≈ 2× Opus.

| Work | Model | Effort |
|---|---|---|
| Searching, listing, reading many files, collecting facts, mechanical edits, doc touch-ups, run logs | Haiku (subagent `Explore` or `general-purpose`) | low |
| Ordinary code changes with tests, doc rewrites, drafting packs and scripts, reviews of a small diff | Sonnet | medium |
| Design decisions, multi-file features, security, data model, migrations, anything hard to undo | Opus | high |
| Only a hard decision the founder asks to get right at any cost, or a design Opus failed twice | Fable | high |

- Recommend the founder run the main session on Sonnet (`/model`) for routine days, Opus for design days.
- Delegate reading-heavy work to a cheap subagent with a precise prompt; keep work inline when the context is
  already loaded (a cold subagent re-reads everything).
- Don't re-read large files: use `Grep`, `head`, line ranges. Don't run the full test suite when a targeted run proves
  the change; run it once before a commit that touches shared code.
- Keep replies short. No long recaps of what the founder already read.

## Standing rules

- Freeze (2026-11-16): no new features until the Snowdon lifecycle test P1 to P4 has run. P0, P1, P2 and P4-M1 ran on
  2026-11-16; P3 (M2, M3) and P4 for M2/M3 remain (`docs/testing/snowdon-lifecycle/RUN-SHEET_P1-P4.md`). Fixes that block
  a phase are allowed.
- Before the founder approves a change, say in one Arabic sentence what will change on screen.
- Every status claim says whether it was run live, built, partial or absent (the handbook's legend).
