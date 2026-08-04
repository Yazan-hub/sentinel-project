# Upgrade Ladder — live drill (2026-08-04)

Task 6 of the plan. Ran the Upgrade Files tool from Revit 2024 against a
mixed folder, target Revit 2026 (Sentinel deployed to both). PASS across
every criterion — the first cross-version, cross-process feature in the
product, verified end to end.

## Setup

`C:\Users\yazan\Desktop\Upgrade Test\`:
- `snowdon-struct-2024.rvt` — 2024 project, 28 MB
- `sample-family-2024.rfa` — 2024 family
- `broken.rvt` — 25 bytes of text (corrupt)

## The window (every design rule visible at once)

- Header stated the posture verbatim: upgraded copies → `upgraded-<version>`
  subfolder, sources never modified, workshared detached, downgrading needs
  the Version Bridge (not built).
- Rows: `snowdon-struct · 2024 · Project` ticked, `sample-family · 2024 ·
  Family` ticked, `broken.rvt · version unknown` **unticked**.
- **Target dropdown listed 2025 / 2026 / 2027 — NOT 2024.** The self-kill
  fix (target must be newer than the running version) confirmed live: the
  requester cannot select its own version, so no same-version queue can be
  written.
- Button counted correctly: "Upgrade 2 file(s) ▶".

## The run (cross-process, hands-off)

Picked target 2026, Run. Revit 2024's progress window showed "0 of 2
done…" and polled. Revit **2026 auto-launched** (pid 40404, no user action),
processed the queue with dialogs suppressed, and **exited on its own**.
Total ~4 minutes (2026 cold start dominates). Final report in Revit 2024:

- ✓ `sample-family-2024.rfa (2024 → 2026), 0 warnings, 4 s`
- ✓ `snowdon-struct-2024.rvt (2024 → 2026), 0 warnings, 39 s`

## Disk verification (all PASS)

- `upgraded-2026\` contains both upgraded files (larger than sources, as
  expected).
- Sources byte-for-byte unchanged (28,057,600 / 626,688).
- `%AppData%\Sentinel\upgrade-queue.json` **deleted** after the run — no
  stale queue can ambush a later startup.
- `broken.rvt` **absent** from output — the unticked unknown-version row
  never entered the batch.

## Findings

None. The feature did exactly what the design promised, including the two
things only a live run could prove: the target Revit genuinely auto-launches
and self-exits, and the same-version exclusion holds in the real dropdown.

Not exercised this run (cheap follow-ups, not blockers): the downgrade-
refusal row (needs a file NEWER than an installed version — e.g. a 2027 file
targeting 2026); the fast-fail-on-target-death path (kill the launched Revit
mid-run). Both are code-verified; leave for an adversarial pass.

## Verdict

**Upgrade Ladder ✅ Verified live 2026-08-04.** Batch cross-version upgrade,
honest refusals, clean cross-process handoff, sources safe, queue self-
cleaning.
