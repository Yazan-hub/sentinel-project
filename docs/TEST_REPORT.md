# Sentinel — Full Test Report

> **Run:** unattended overnight verification (2026-07-15).
> **Scope:** whole project — Revit plugin (all versions), web app, BCF service, bridge, new Standards Engine.
> **Verdict:** ✅ **All automated checks pass.** 3 issues found and fixed. GUI click-through needs manual
> confirmation (a checklist is at the end) — I can't drive Revit's UI or the browser interactively.

---

## 1. Automated results

| Check | Result | Detail |
|---|---|---|
| **Revit plugin — compile, all 7 versions** | ✅ PASS | 2021–2027 (net48 / net8 / net10) build with **0 errors** |
| **Compiler/NuGet warnings** | ✅ CLEAN | CS0108 + NU1510 fixed → zero warnings |
| **Standards Engine `#if` branches** | ✅ PASS | ParameterType (≤2021) and ForgeTypeId (≥2022) paths both compile |
| **Web app build (Vite/TS)** | ✅ PASS | `vite build` — 99 modules, no TS/bundle errors |
| **Bridge scripts** | ✅ PASS | all 5 `.mjs` pass `node --check` |
| **BCF service — end-to-end** | ✅ PASS | create → list → status filter → close → comment → history |
| **Deploy integrity (2024)** | ✅ PASS | manifest → `Sentinel.App`; 18 DLLs incl. PdfPig + System.Text.Json |
| **PdfPig runtime-load risk** | ✅ LOW | adds only self-contained `UglyToad.*`; `System.*` helpers already shipped via STJ 8 |
| **Revit in-process load smoke-test** | ✅ PASS | Sentinel + all 17 buttons + events registered; PdfPig loads (§4) |

### BCF service — verified behaviour
- `POST topics` → returns the topic with a `guid` and `history:[{action:"Created"}]`.
- `GET topics` (default) correctly **hides Closed** topics; `?status=all` shows them; `?status=Closed` filters to them.
- `PUT status` → logged `"Status: Open → Closed"`; `POST comment` → logged `"Comment added"`.
- Final history on the test topic: `["Created", "Status: Open → Closed", "Comment added"]` ✅ (versioning works).

---

## 2. Bugs found & fixed

| # | Severity | File | Issue | Fix |
|---|---|---|---|---|
| 1 | **Real (threading)** | `Commands.Standards.cs` | `IngestDocumentsCommand` read `doc.Title` inside the async continuation — a Revit-API call off the API thread (can throw / is unsafe). | Capture `doc.Title` into a local on the API thread before the `await`. |
| 2 | Cosmetic | `UI/BcfIssuesWindow.cs` | Private `Activate()` hid `Window.Activate()` (CS0108). | Renamed to `ActivateSelected()`. |
| 3 | Cosmetic | `Sentinel.csproj` | `System.Text.Json` package redundant on net8/net10 (NU1510). | Conditioned the reference to `net48` (in-box elsewhere). |

All three re-verified: full 2021–2027 rebuild after the fixes is clean, 0 warnings.

---

## 3. Code review — no further bugs; known limitations (by design)

- **View templates / browser organization are transfer-only.** The Revit API cannot author them from JSON
  (`View.IsTemplate` is read-only; no browser-scheme authoring API). They're cross-document **copied** from the
  golden model, so that model must be **open** at build time. If it isn't, those items skip with a clear message
  (fallback: Transfer Project Standards). Worksets + shared parameters fully round-trip from a saved pack.
- **Tier-2 ingest needs Ollama.** `Ingest Docs` calls a local LLM (`localhost:11434`, `llama3`). If Ollama isn't
  running the window shows *"start Ollama and `ollama pull llama3`"*. Overridable via `SENTINEL_OLLAMA_URL` /
  `SENTINEL_LLM_MODEL`. Extraction quality depends on the model (8B is modest — that's why doc items are
  confidence-clamped ≤ 0.85 and **unticked by default** for human review).
- **Browser-org activation is manual.** A copied scheme lands in the target; Revit has no API to make it the
  current organization — the report tells the user to activate it via right-click.
- **~~Deferred~~ Done (2026-07-16):** naming-rule extraction (prose → token `Rule`) and ISO 19650 gap
  analysis are both now implemented — see §6.
  - **Naming-rule extraction** (`a33945a`): `Ingest Docs` now pulls naming conventions from standards
    documents as ordered token rules (target + separator + example), confidence-clamped ≤ 0.85 and
    unticked-by-default in review; on build they map to `Engine.Rule` (Warn) and merge into the effective
    ruleset, so the scanner's token→regex path enforces them immediately.
  - **ISO 19650 gap analysis** (`7dbbf3c`): `IsoGapAnalyzer` grades a standards pack against ISO 19650-2
    fundamentals (container naming, suitability/status, revision, Uniclass, originator, worksets) as
    Present / Partial / Missing with a weighted score, surfaced via the **ISO 19650 ✓** button in the
    review window. Parameters are only ever Partial on a name match (a pack can't prove the field carries
    ISO codes) — honest by design.

---

## 4. Revit in-process load smoke-test — ✅ PASS

_Launched Revit 2024 headlessly, let it fully initialize, parsed journal `0176`, then killed it. This is the
strongest available signal short of clicking: it proves the deployed DLL (with PdfPig) actually loads in Revit's
process and wires every command._

**Result — Sentinel loaded fully:**
- `API_SUCCESS { Starting External Application: Sentinel BIM Coordinator, Class: Sentinel.App, Version 1.0.0.0 }`
  → `App.OnStartup` ran and returned `Succeeded`.
- **All 17 ribbon buttons registered** (`API_SUCCESS`), including the 3 new Standards Engine ones:
  `Sentinel_BuildOfficeSystem`, `Sentinel_LoadOfficeSystem` (Apply Standard), `Sentinel_IngestDocs`.
- Event handlers registered: `DocumentOpened`, `DocumentSynchronizedWithCentral`, `FailuresProcessing`.
- **No PdfPig / FileNotFound / missing-assembly load failure** — the Tier-2 dependency loads in-process.

**Benign, non-fatal notes (no action needed):**
- `API_ERROR: Assembly version conflict in Sentinel.dll` — Revit 2024 preloads **System.Text.Json 9.0.0.1**;
  the plugin references 8.0. Revit resolves to its higher preloaded version, which is backward-compatible with
  every API used (`JsonNamingPolicy.SnakeCaseLower` exists since 8.0). Also the long-standing `System.Net.Http`
  4.2↔4.0 and `System.Memory` minor conflicts. **All non-fatal — load succeeded after them.** These are normal
  for any Revit .NET add-in. The net48 STJ reference is kept deliberately (Revit 2021–2023 don't preload it).
- A one-time *"publisher of this add-in could not be verified"* dialog appears because the add-in is unsigned
  (dev build). It did **not** block loading. In normal use click "Always Load".

---

## 5. What I could NOT test — manual GUI checklist for you

I can't click Revit's ribbon or drive the browser, so please spot-check these when convenient (≈5 min):

**Revit — Sentinel tab ▸ Workflow panel**
1. **Build Office System** — open your golden model → click it → the review window lists Worksets / Shared
   Parameters / View Templates / Browser Organization with ● confidence badges. Tick a few → **Build ticked
   items** → report shows ✓created; the Sentinel panel re-scans (WS-01 now enforces the built worksets).
2. **Save pack** (in that window) → confirm a JSON lands in `%AppData%\Sentinel\packs\`.
3. **Apply Standard** — open a blank workshared model → click it → pick the saved pack → Build → worksets/params
   appear. (For view templates, keep the golden model open too.)
4. **Ingest Docs** — with Ollama running, pick a standards PDF → after a minute the window fills with amber
   (◐, unticked) worksets/params cited `pdf:file · p.N`.
5. **BCF Issues** — the richer window (details/history/isolate) still opens and zooms to elements.

**Web app (reload the platform app, v1.0.3)**
6. **⚑ Issues** sidebar tab → one panel: List (with Status/Type/Priority filters) · ＋New · click a row → Detail
   (fields + comments + history). Create an issue (select an element first) → it appears in Revit's BCF window.

If any step misbehaves, tell me what you saw and I'll fix it.

---

## 6. Addendum (2026-07-16) — deferred items closed + bridge hardening

The two §3 deferred items are now implemented, plus a bridge fix and a Copilot addition. Each was
verified to the strongest level available without a live Revit + dashboard token.

| Change | Commit | Verification |
|---|---|---|
| **Naming-rule extraction** (prose → token `Rule`) | `a33945a` | Revit 2021–2027 target build clean (0/0); logic checked against the engine's existing token→regex path |
| **ISO 19650 gap analysis** (`IsoGapAnalyzer`) | `7dbbf3c` | Pure analyzer linked into a **Revit-free test harness** — weak pack 1/6 (25%), strong pack 67%, all assertions pass; add-in build clean |
| **Bridge: offline dry-run + re-sweep** | `d3462a3` | Ran `watch-outbox --dry-run --once` with **no credentials** (detects `.ifc`, ignores `.txt`); watch mode picks up a file dropped after startup |
| **Copilot: embodied-carbon (6D) answers** | `ba9fa8f` | `vite build` clean (123 modules) |

**New GUI surfaces to spot-check** (extends §5):
- **Ingest Docs** review window now shows a **Naming Rules** group (amber ◐, unticked) alongside worksets/params.
- The review window has an **ISO 19650 ✓** button → grades the full extracted standard (Present/Partial/Missing + %).
- **Copilot** answers *"What's the embodied carbon?"* / *"carbon of walls"* with cited figures + Isolate.

**Still runtime-untested (unchanged from §5):** anything needing live Revit UI, a real dashboard token,
or Ollama. The ISO analyzer is the exception — being Revit-free, it was executed and asserted directly.
