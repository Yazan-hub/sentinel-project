# Session C — Validate panel on the Golden Nugget copy (2026-07-28)

Protocol: `docs/TESTING_PROTOCOL.md` Session C, first pass. Victim: writable
copy of the German sample, carrying its own harvested standard (Session A).
Adapted from the planted-damage script: on a fully foreign model the baseline
IS the damage — the test becomes "are the violations real, is the output
actionable, does the score move when one is fixed."

## What was run — all PASS on substance

- **Scan Now:** 1,092 elements in **88 ms**, verdict "10.9% compliant".
  Every violation checked was genuinely correct (German view names vs the
  BDS `[PREFIX]_[TYPE]_[LEVEL]_[DESC]` pattern), each row carrying rule id,
  mode, message, and doc ref (`BDS-RTG-001 §5`) plus a Fix button.
- **Fix flow (Review Fix dialog):** proposed `WIP_<name>`, live-validated it
  ("✗ Does not match the token pattern yet" — correct, spaces/umlauts), and
  **withheld the Execute button until the edited proposal validated**
  ("✓ Matches the naming schema"). Executed fix → re-scan (81 ms) →
  **10.9% → 11.0%** and the fixed view left the list. The full
  detect→review→fix→verify loop, closed live.
- **Health Scorecard:** "0.0% (F) — 1,069 open issues across 5 domains";
  per-domain counts sum exactly (411+412+127+22+97).
- **IFC Pre-Flight:** 2,161 elements in **238 ms**; every element correctly
  flagged MONITOR "No explicit IFC mapping — default category mapping will
  be used" (ISO 16739 ref) — right severity for informational findings.
- **IFC Delivery Gate:** active view was a SHEET — the command **handled the
  trap gracefully** (switched itself to a 3D view), exported, certified:
  "✓ PASS — certified for CDE upload", 457,821 entities / 24.1 MB, entity
  census, and a **certificate file with SHA-256** written beside the IFC.
- **Sanitize .rfa:** refused `rac_advanced_sample_family.rfa` — "failed
  sanitation — NOT loaded · Missing shared parameter: BDS_Description".
  The refusal is loud, named, and the family was genuinely not loaded.

## Findings

1. **MEDIUM — one word, three numbers.** The same model shows "11.0%
   compliant" (live panel), "0.0% (F)" (scorecard), and "91.4% compliant"
   (pre-flight header) simultaneously. Each formula is defensible
   (element-share vs weighted-penalty vs monitor-excluded) but nothing on
   screen says so. Label the metrics distinctly or reconcile them.
2. **MEDIUM — family gate enforces BDS regardless of project standard.**
   Sanitize demands `BDS_Description` on a project running the harvested
   German pack. Same coupling class as the known QA-ruleset limitation, but
   here it BLOCKS loading. The mandatory-param list should follow the
   active standard.
3. **LOW/VERIFY — "Solids: 0" on a geometry-rich family.** The sanitizer's
   solid census read zero for Autodesk's advanced sample family. If nested
   geometry isn't counted, the geometry-budget check is easy to defeat.
4. **LOW — scorecard domain codes unexplained.** VN/VP/FN/SN/LV appear with
   no legend.
5. **LOW — panel is a shared surface.** Pre-flight results replace the
   compliance scan in the same panel; the earlier list is gone without a
   trace or tab.
6. **ENV note:** a Revit "Security — Unsigned Add-In" dialog and the Review
   Fix dialog both opened on a disabled display and stalled the session
   until moved via Win32. Worth defaulting Sentinel WPF dialogs to the
   Revit main window's monitor (owner is already set — check
   WindowStartupLocation).

## Part 2 — run same evening

7. **HIGH — Delivery Gate fail path is silent and switches documents.**
   Ran the gate on the EMPTY `Project1` (no walls, no slabs — the
   bds-default contract must refuse it). Expected: a loud "rejected" naming
   the missing entities. Got: **no dialog, no export, no certificate, and
   the active window switched to the OTHER open document's 3D view**
   (the Golden Nugget model), with `Project1`'s view tabs gone from the tab
   bar. A user cannot tell the gate refused, errored, or ran at all — and
   ends up staring at a different building. Likely root: the "find a 3D
   view" fallback crossing document boundaries + an exception swallowed
   before the result dialog. The referee's no must be as loud as its yes.
8. **LOW — "Family Health" is a container, not a tool.** The ribbon button
   only holds Sanitize/Heal; the per-family health ranking the handbook
   table describes does not exist in the UI. Fix the docs or build the
   report.

Still pending (part 3): planted pset damage → Pre-Flight delta; Heal Loaded
Families with before/after type-count diff; Delivery Gate fail path RETEST
after finding 7 is fixed.

## Verdict

The Validate panel's substance holds on hostile input — fast (88–238 ms),
correct, honest, genuinely governed fix loop — until the fail path: finding
7 is the session's one correctness bug and the next fix-first item. Best
moment: the SHA-256 delivery certificate. Worst moment: the silent refusal.
Both are the same feature, which is exactly why the protocol tests both
directions.
