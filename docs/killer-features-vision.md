# Sentinel — Killer-Feature Vision & Architecture

*Lead BIM Software Architect / AEC Product Visionary brief. No code — analysis, feature proposals, and the
architecture for the chosen feature, per the "propose before writing, logic before visuals" rule.*

---

## 1. Codebase & idea synthesis — what we've built

Sentinel is a **web-native OpenBIM platform + a connected Revit plugin**, aimed at one thesis the market
research confirmed no one delivers: **unify web-native viewing + ISO 19650 governance + the full 4D–7D /
QA / cost / tender lifecycle + open interop, in one governed dataset.**

**Revit plugin (`SentinelAddin/`, C#/.NET):** Standards Engine (extract office standards from a golden
model / saved pack / documents → review → build → enforce; naming-rule extraction; ISO 19650 gap analysis),
GhostBuilder (DWG→LOD200 via local LLM), BcfSyncManager (pull web issues into Revit), and
PublishToPlatform (export active view → IFC → local outbox).

**Web app (`WebApp/`, That Open / fragments + web-ifc):**
- **Viewer + BIM coordination tools (new):** Properties Palette (click → clean IFC identity + Pset/Qto,
  IDS-ready), Project Browser (Category→Type→Instance tree driving selection), Visibility/Graphics
  (per-category hide/isolate/ghost/colour), Saved Views, plus in-browser IFC **authoring → Bake to IFC**.
- **Governance + lifecycle:** QA rule engine + scorecard, 5D cost, 6D carbon, 7D COBie, **4D timeline
  fused with 5D/6D**, BCF issues, RFIs, tenders, standards-pack marketplace, grounded AI Copilot.
- **The CDE (live on Supabase):** ISO 19650 information containers with a real **state machine**
  (WIP→Shared→Published→Archived), suitability codes, **published-immutability**, and a **hash-chained,
  append-only audit trail** — the golden thread no OpenBIM competitor ships web-native.
- **The bridge (Node):** watches the outbox, IFC→fragments, uploads to the platform; hosts the BCF/CDE/
  RFI/tender service; token stays server-side.

**The through-line idea (yours):** *"LLM proposes, the deterministic engine disposes"* — standards-as-code,
open standards (IFC/BCF/IDS) as the spine, and one element graph that every dimension is a *view* of.

---

## 2. Market gap analysis — 3 bottlenecks worth attacking

1. **Data fragmentation / no single source of truth.** Issues live in Navisworks/Revizto, documents in
   ACC/Aconex, cost in Excel, the model in Revit. Nothing reconciles them; coordinators re-key data and
   truth drifts. (Confirmed across the CDE research — "no single platform serves the whole lifecycle.")
2. **Disconnected, latent issue/clash tracking.** BCF is exchanged as *files*; a clash found in the viewer
   doesn't appear in the modeller's live Revit session — it's emailed, re-imported, and often stale.
   Clash tools re-report the *same* resolved clashes every run, drowning teams in noise.
3. **Poor, manual, late data validation.** ISO 19650 information requirements live in dead PDFs. Whether
   an IFC actually carries the required parameters is checked by eyeball, late, at handover — when it's
   expensive to fix. IDS (the open standard that fixes this) is barely adopted in mainstream tools.

Secondary but real: heavy desktop installs / big files, and restrictive per-seat licensing that taxes
*granting access* to external parties.

---

## 3. Killer features — 3 to 5, evaluating your three concepts

**KF-A · Live BCF loop (web ⇄ Revit), real-time.** *(your "real-time BCF syncing")*
A clash/issue raised in the web viewer appears in the **active Revit session within seconds**, and a
status change in Revit reflects on the web instantly — two-way, live. We already have BcfSyncManager +
the BCF service + Supabase; the missing link is **Supabase Realtime** (push) instead of file/poll. Impact:
high (kills the #2 gap). Feasibility: high — mostly a realtime channel + a plugin listener.

**KF-B · IDS-driven auto-validation + visual colour-coding.** *(your "IDM/ISO 19650 validation")*
On IFC upload (or on demand), validate every element against an **IDS** spec (applicability + required
psets/properties/values), then **colour the model**: green = compliant, red = missing/ wrong, grey = out
of scope — with a compliance panel + exportable report, and each failure optionally raised as a BCF topic
tied to the CDE audit. We already have the property extractor, per-category colouring, the rule engine,
and standards packs (→ IDS). Impact: very high (kills the #3 gap, the one no incumbent does well).
Feasibility: high, and almost entirely on assets we've built. **This is the sharpest wedge.**

**KF-C · Headless clash detection (dedup'd).** *(your "headless clash")*
The bridge runs background clash between federated IFCs (arch↔struct), and — critically — **persists only
UNRESOLVED clashes**, deduping against prior runs by a stable clash signature so resolved ones never
re-surface. Results become BCF topics in the CDE. Impact: high (kills clash-noise, gap #2). Feasibility:
medium — needs a collision pass (bbox broad-phase + mesh narrow-phase) in Node/worker.

**KF-D · Golden-thread issues (unique).** Every clash/issue is bound to the **CDE container version +
immutable audit trail** we already built — so "who introduced this, in which revision, who signed it off"
is provable. ISO 19650 accountability as a product feature. Feasibility: high (compose existing CDE + BCF).

**KF-E · Grounded Copilot over the governed dataset.** Extend the existing cited Copilot: *"which elements
fail IDS?", "open clashes on Level 3?", "what's uncommitted in WIP?"* — natural-language over validation +
clash + CDE state. Feasibility: high (Copilot exists; wire the new data sources).

---

## 4. The pick + architecture — **KF-B: IDS validation + colour-coding**

Most viable because it (a) attacks the least-served pain (data validation), (b) is built almost entirely
on components we already have, (c) makes **IDS the interchange between the Revit plugin and the web**, and
(d) composes with the CDE golden thread and BCF for a complete "validate → flag → resolve → prove" loop.

**Per the rules: logic first (extract + validate + log), visuals second (colour + panel).**

### Data model (the IDS spec, parsed)
An IDS spec = a set of **specifications**, each with:
- **Applicability** — which elements it targets (IFC entity + optional predefined type / attribute).
- **Requirements** — required **property** (pset + name), optional **value/pattern/range**, **cardinality**
  (required/prohibited/optional), and **datatype**.
buildingSMART IDS is XML; we parse it to a typed `IdsSpec`.

### Phase B1 — Logic (no visuals; log to console/report)
1. **`sentinel-core/ids.ts`** (pure) — types + a validator: given `IdsSpec` + an element's extracted
   properties (from the existing `element-properties.ts`), return `{ pass, failures: [{spec, requirement,
   reason}] }`. Deterministic, unit-testable with fixtures (mirrors how we proved the CDE/IFC logic).
2. **`sentinel-core/ids-parse.ts`** (pure) — IDS XML → `IdsSpec[]` (DOMParser / a tiny XML reader).
3. **`adapter/model-validate.ts`** — run the validator over a whole loaded model: pull each applicable
   element's properties via `FragmentsManager.getItemsData` (reuse the proven relations config), classify
   pass/fail, return `{ modelId, results: Map<localId, {pass, failures}> , summary }`. **Checkpoint: log
   the summary + a few failures to the console** before any colour.
   *OBC modules:* `OBC.FragmentsManager` (getItemsOfCategories + getItemsData). No new heavy deps; XML via
   the browser's `DOMParser`.

### Phase B2 — Visuals (only after B1 verifies)
4. **Colour-code** compliant/non-compliant using the P3 mechanism (Highlighter styles / model colouring):
   green pass, red fail, grey out-of-scope; toggle in the **Visibility** panel.
5. **Compliance panel** — a list grouped by specification: N failing elements, click → select + isolate
   (reuse Browser/Properties), export a CSV/BCF report.
6. **Golden thread + BCF** — optionally raise each failure as a BCF topic bound to the CDE container
   version + audit (KF-D), so remediation is tracked and provable.

### Plugin side (shift-left)
- The Revit plugin validates against the **same IDS** *before* export (catch gaps in-authoring), and the
  Standards Engine's **Ingest Docs** can *produce* IDS from requirement documents — closing the loop:
  documents → IDS → enforced in Revit **and** validated on the web, from one spec.
- Transport: IDS files ride the existing bridge/CDE; no new pipe.

### Why this is defensible
No mainstream tool does web-native, IDS-driven validation with live colour-coding tied to an auditable
CDE. It turns "is this model compliant?" from a late, manual, subjective question into an instant, visual,
provable one — the exact ISO 19650 / information-delivery pain, solved on the stack we already have.

---

## 5. Development rules (agreed)
1. No code until we agree the vision (this doc).
2. Strictly iterative, one slice at a time.
3. **Logic before visuals** — build + verify data extraction/validation (console/report) before rendering
   colours or panels.
4. **Propose architecture + the exact OBC modules before touching files** (done above for KF-B).

**Proposed first slice:** build **B1** — the pure IDS types + validator + `model-validate` adapter — and
**log validation results to the console** against a real loaded IFC (using a small IDS spec derived from a
standards pack). Once you can see "N compliant / M failing, here's why" in the console, we build the
colour-coding and compliance panel. Say the word and I'll implement **B1 only**.
