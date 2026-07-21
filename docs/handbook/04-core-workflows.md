# 04 · Core workflows

## The Governed Publish loop (G1–G4) — the flagship

This is the differentiated seam, ✅ **verified live end-to-end** on a real building model. One deliberate button-press in Revit runs the whole referee cycle.

```
   Revit: "Governed Publish"
            │
   G1  ┌────▼─────────────┐   Export the active model to IFC and hand it to the bridge.
       │  Export IFC      │   (Dedicated 120s path — big models take seconds, not ms.)
       └────┬─────────────┘
   G2  ┌────▼─────────────┐   DELIVERY GATE. Two configurable checks before anything is trusted:
       │  Delivery gate   │     • Naming gate  — ISO 19650 container name (enforce = reject)
       │  (naming + IDS)  │     • Element IDS  — LOD-300 data completeness (enforce = warn)
       └────┬─────────────┘
   G3  ┌────▼─────────────┐   ADJUDICATE. The pure engine runs the IDS spec over every element →
       │  IDS adjudication│   verdict: accepted / accepted-with-warnings / rejected.
       └────┬─────────────┘
   G4  ┌────▼─────────────┐   IMMUTABLE VERDICT. The verdict is appended to the hash-chained
       │  Record verdict  │   ledger against the file version (a ✓/✗ badge appears in the CDE).
       └────┬─────────────┘
            │
     ┌──────┴───────┐
   PASS            FAIL
     │               │
  Publish to     Auto-raise a BCF issue per failing requirement,
  the CDE        which live-syncs back into Revit for the author to fix.
```

### What each gate actually checks

- **Naming gate (Phase A)** — `bridge/naming-ruleset.json`, the BDS 11-field ISO 19650 form. Default enforcement: **reject** (a bad name blocks the publish). 🟩 Built.
- **Element IDS (Phase B)** — `%AppData%/Sentinel/ids.json` (from `demo/bds-pilot/bds-ids.json`), LOD-300 completeness checks (discipline, fire rating, U-value, etc.). Default enforcement: **warn** (missing data warns during early stages, doesn't block). 🟩 Built.
- Both rulesets are **swappable config, not code** — a future office-agnostic "Base template" just replaces two files. (See [decision D-03](07-decisions.md) and `docs/BDS_GATE_CONFIG.md`.)

### The verdict combination

`naming (reject/warn/off)` **+** `element IDS (reject/warn/off)` → the overall verdict. A rejected name blocks publish; missing LOD-300 data warns. This exact combination runs identically in the bridge and in the browser sandbox.

## The live BCF loop (coordination sync)

When the gate fails, Sentinel doesn't just say "no" — it turns each failing requirement into an **OpenCDE BCF 3.0** coordination topic and pushes it back to Revit over a live **Server-Sent Events (SSE)** stream. The author sees the issues in Revit, fixes them, and re-publishes. Status: 🟩 Built (SSE fan-out, cross-machine event feed).

## ISO 19650 state governance

Information containers move through an ISO 19650 state machine (WIP → Shared → Published → Archived, with suitability codes) recorded on the ledger, so the CDE timeline shows *who moved what, when, and with what verdict*. Status: 🟩 Built (`cde_transition`, the Versions panel with history / set-live / compare).

## Try it without any install

The **Sentinel Sandbox** runs the *real* `sentinel-core` engine client-side — edit a model + your own rulesets and watch the verdict update live. Good for demos and for understanding the referee's logic. Status: 🟩 Built (`WebApp/sandbox/`). There's also a shareable explainer page.

For the beat-by-beat demo script (including a headless dry-run), see `docs/PILOT_DEMO_RUNBOOK.md`.
