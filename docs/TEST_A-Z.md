# Sentinel Platform — A→Z Manual Test Script

> Run this against a **real project** (e.g. Snowdon Tower). It covers the model-dependent behaviour I
> can't test headlessly (loading a model + driving the viewer). Each step: **Do → Expect → If it fails**.
> Please note results against the ⚑ flagged items especially — those read IFC data I couldn't validate live.

## What's already verified headlessly (you don't need to re-check)
- ✅ Revit plugin compiles on all 7 versions (2021–2027); loads in Revit 2024 (all ribbon buttons register).
- ✅ Web app builds clean (v1.0.13); all 5 bridge scripts parse.
- ✅ Pure core logic (5D BoQ, 6D carbon, 7D completeness, gates, 4D schedule) — 30/31 assertions pass.
- ✅ Service (:4100) — all 4 route families (bcf / projects / rfis / tenders) respond; lifecycles smoke-tested.

## Prereqs
1. **Service running:** `npm run bcf:serve` (it's up now on :4100). Needed for Project, Copilot, Issues, RFIs, Tender, Owner.
2. **(Optional) Ollama** for Copilot free-form answers: `ollama pull llama3` + `set OLLAMA_ORIGINS=*`. Without it the Copilot still answers the built-in questions.
3. **Reload the app** (v1.0.13) and **load a model** from the **Assets** tab (an IFC with quantities is ideal).

---

## The walkthrough (sidebar, top to bottom)

### 1. Project (landing) — the command center
- **Do:** open the app → it lands on **Project**. Press ↻.
- **Expect:** lifecycle rail (Tender→Operate); KPI tiles fill — Model health %, Std compliance %, Open issues, Cost. A stage gate with ✓/! checks + GATE PASS/HOLD. "Advance stage" refuses if a check fails.
- **If it fails:** empty KPIs with a model loaded → tell me which tile is "—".

### 2. Copilot — grounded answers
- **Do:** tap a suggestion ("What's the model health?"), then "How many walls fail naming?", then "Total cost?".
- **Expect:** cited answers ("source: scorecard…"); failing-rule answers show an **Isolate** button that highlights those elements. Numbers match the QA/Cost tabs.
- **If it fails:** note any answer whose number disagrees with the QA or Cost tab.

### 3. QA — the scan
- **Do:** press Scan.
- **Expect:** grade + score, domain chips, violations list; click a violation → isolates + zooms.

### 4. Cost · 5D
- **Do:** **Take off ▶**. Then edit a rate. Then **Baseline**, tweak a rate, press **Δ**.
- **Expect:** grouped BoQ + total; missing-Qto / unpriced banners if applicable; rate edit reprices live; **Δ shows per-line change vs baseline** (red up/green down, total impact). Click a line → isolates.
- **⚑ Watch:** if **every** line shows the "missing Qto_" banner, your IFC has no quantity sets — re-export with quantities on (that's the cue for the geometry-fallback we deferred).

### 5. Tender ⚖ (front of the lifecycle)
- **Do:** ＋New → "Create from model BoQ". Open it → "＋ Enter a bid" (bidder + rates) → submit. Add a second bid. Award one.
- **Expect:** scope = the BoQ; comparison table with **lowest-per-line green** + total variance vs estimate; award sets status + logs history.

### 6. 4D — sequence simulation
- **Do (Trade):** with **Trade** selected, **Generate** → drag the scrubber → press ▶.
- **Expect:** the model builds up by trade (Structure→…→Finishes); completed shown, active highlighted, not-started hidden; Gantt bars fill; click a task → isolates its elements.
- **⚑ Do (Level):** switch to **Level** → **Generate**.
- **⚑ Expect:** a floor-by-floor sequence (the tower rises bottom→top). **If it says "couldn't read storeys… using the trade sequence"**, your IFC lacks spatial containment — tell me (this is the untested-live path; I'll tune the containment reader or add the geometry fallback).

### 7. 6D — carbon
- **Do:** **Take off ▶**.
- **Expect:** total tCO₂e + intensity (kgCO₂e/m²); hotspot bars; editable factors re-estimate live; "indicative factors" note shown; click a line → isolates.

### 8. ⚑ 7D — handover / COBie
- **Do:** **Assets ▶**. Toggle "Only incomplete". Click an asset. **Export COBie**.
- **Expect:** handover-readiness %; per-field coverage bars (Serial/Manufacturer/Warranty/Install); asset list with red missing-field chips; click → isolates; COBie CSV downloads.
- **⚑ Watch:** if readiness is very low / all chips red, the IFC wasn't exported with FM psets (manufacturer/serial/warranty) — that's *correct* behaviour (it's showing the gap), but if you have a COBie-populated model and it still reads empty, tell me — the pset-name aliasing may need tuning for your exporter.

### 9. Owner — the FM portal
- **Do:** open **Owner**. Then "Load from model" + search an asset.
- **Expect:** project name + stage; **handover-readiness ring** + tiles (health / open items / value / carbon) — these come from the **snapshot**, so run the QA / Cost / 6D / 7D tabs first to populate them. Read-only. Search + click locates an asset.

### 10. Issues & RFIs
- **Issues:** ⚑ select an element → ＋New → fill + Send → it appears in the list; the **Revit** BCF window shows it and zooms.
- **RFIs:** ＋Raise (select elements first to link) → Answer → Approve & close; history logs the trail.

### 11. The gate loop (the payoff)
- **Do:** on **Project**, note the current gate. Now close/answer the open Issues + RFIs (and for handover, get 7D readiness ≥ 95%). Re-run ↻. Try **Advance stage**.
- **Expect:** the gate flips from HOLD to PASS only when its checks are met, then advances the stage. **This is standards-as-code enforcing the lifecycle** — the core thesis.

---

## Report back
For anything that misbehaves, tell me: **which tab · what you did · what you saw vs expected**. The ⚑ items
(by-level 4D, 7D FM attributes) are the most likely to need tuning against your specific IFC exporter — those
are the two places I flagged as "compiles + degrades gracefully, but unvalidated against a live model."
