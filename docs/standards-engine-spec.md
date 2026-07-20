# Sentinel Standards Engine — Technical Spec (Idea 1: the Ingester)

> **Status:** ✅ SHIPPED — the Standards Engine (Ingester) is implemented; retained as the design record. For current state see `CAPABILITY_MAP.md` / `../ROADMAP.md`.
> **One-line:** Turn an office's tacit standards (a "golden" `.rvt` + messy PDFs) into one
> versioned, machine-readable **Standards Pack** that *builds* the template **and** *enforces*
> it — reusing the rule engine, delivery contract, and builder patterns Sentinel already ships.

---

## 0. The core idea (why this is the spine, not another feature)

Sentinel already owns the **enforcement** half of "standards-as-code":

| Artifact | File | Role today |
|---|---|---|
| `Ruleset` (`Engine/RuleModels.cs`, `sentinel-core/types.ts`) | `%AppData%\Sentinel\ruleset.json` | What the scanner **checks** (naming, params, worksets…) |
| `DeliveryContract` (`Engine/DeliveryContract.cs`) | `%AppData%\Sentinel\delivery-contract.json` | What the IFC gate **certifies** at handover |

What's missing is the **provisioning** half: the machine-readable description of what to
*create* in a blank template (shared parameters, worksets, view templates, browser
organization, line/fill patterns…).

**Key insight — one array, two faces.** These are not two datasets. `WS-01.whitelist` (the 15
worksets the rule *enforces*) is exactly the list of worksets you'd *create*. The parameter a
rule checks for emptiness (`VP-01.parameter_name = "BDS_View Status"`) is exactly the shared
parameter you'd *bind*. So the Standards Pack is a **superset** that carries both faces from one
source of truth:

```
                     ┌─────────────────────────────┐
   golden .rvt  ─────▶│                             │────▶  PROVISION  → StandardsBuilder → template
   office PDFs  ─────▶│      Standards Pack         │
   ISO 19650    ─────▶│      (standards-pack.json)  │────▶  RULESET     → RulesetStore   → scanner (Revit + web)
   base profile ─────▶│                             │
                     └─────────────────────────────┘────▶  DELIVERY    → DeliveryContract → IFC gate
```

Build it once → the template, the checker, and the delivery gate all read the same file.
Change it once (drift) → all three update. **That** is the connection to the main workflow: the
ingester generates the artifact everything downstream (including the future Copilot) reasons over.

---

## 1. The JSON schema — `standards-pack.json`

Design rules:
- **Do NOT reinvent `Ruleset` / `DeliveryContract`.** The pack *embeds* them verbatim so the
  existing `RulesetStore` and `IfcDeliveryGate` consume the exact same bytes (write the `ruleset`
  sub-object straight to `ruleset.json`, the `delivery` sub-object straight to
  `delivery-contract.json`).
- **snake_case**, `schema_version`, semver — byte-compatible with the existing wire format and
  the `JsonStringEnumConverter(SnakeCaseLower)` already configured in `RulesetStore`.
- **Every extracted item carries `confidence` + `provenance`** (mirrors `LayerMapping.Confidence`).
  This is what powers the human-in-the-loop review: the reviewer sees *how sure* the AI is and
  *where it came from*.

```jsonc
{
  "schema_version": 1,
  "pack_key": "acme-arch",              // office/client slug
  "semver": "1.0.0",
  "created_at": "2026-07-15T12:00:00Z",
  "iso19650_profile": "uk-bs-en-19650", // baseline used for gap analysis (or null)

  // ── PROVISION: what StandardsBuilder creates in a blank template ──────────────
  "provision": {
    "shared_parameter_file": "ACME_SharedParams.txt",   // generated if absent
    "shared_parameters": [
      {
        "name": "BDS_View Status",
        "group": "BDS_View",                // shared-param group
        "type": "Text",                     // Revit ParameterType
        "binding": "instance",              // instance | type
        "categories": ["Views"],            // category names (empty = project param)
        "guid": "3f2b…",                    // stable GUID (preserved from golden model if present)
        "confidence": 1.0,
        "provenance": { "source": "golden-model:ACME_Tower.rvt", "locator": "BindingMap" }
      }
    ],
    "worksets": [
      { "name": "ARC_Walls", "confidence": 1.0,
        "provenance": { "source": "golden-model:ACME_Tower.rvt", "locator": "WorksetTable" } }
    ],
    "view_templates": [
      { "name": "LOD200 Coordination Plan", "view_type": "FloorPlan",
        "detail_level": "Fine", "discipline": "Coordination",
        "included_overrides": ["v/g", "detail_level", "scale"],
        "confidence": 0.9,
        "provenance": { "source": "golden-model:ACME_Tower.rvt", "locator": "View.IsTemplate" } }
    ],
    "browser_organization": {
      "views_grouping": ["BDS_View Status", "BDS_View Type"],   // the params ViewGenerator already routes on
      "sheets_grouping": ["BDS_Discipline"],
      "confidence": 0.8,
      "provenance": { "source": "golden-model:ACME_Tower.rvt", "locator": "BrowserOrganization" }
    },
    "line_patterns": [ { "name": "ACME_Hidden", "confidence": 1.0, "provenance": { … } } ],
    "fill_patterns": [ { "name": "ACME_Concrete", "target": "drafting", "confidence": 1.0, "provenance": { … } } ],
    "object_styles":  [ { "category": "Walls", "line_weight_cut": 5, "confidence": 1.0, "provenance": { … } } ],
    "levels": [ { "name": "L01_FFL", "elevation_m": 0.0, "confidence": 0.7, "provenance": { "source": "pdf:Naming.pdf", "locator": "p.4" } } ],
    "grids":  [ ]
  },

  // ── RULESET: embedded verbatim → written to ruleset.json (existing schema) ────
  "ruleset": {
    "schema_version": 1,
    "standard_key": "acme-arch",
    "semver": "1.0.0",
    "rules": [ /* exact Rule[] shape from RuleModels.cs / types.ts */ ]
  },

  // ── DELIVERY: embedded verbatim → written to delivery-contract.json ───────────
  "delivery": { /* exact DeliveryContract shape */ },

  // ── GAP ANALYSIS: the "consultant AI" output (advisory, not built) ────────────
  "gap_analysis": [
    { "severity": "warn", "iso_ref": "ISO 19650-2 §5.1",
      "finding": "No suitability/status codes (S0–S7) defined; CDE state transitions unenforceable.",
      "suggested_fix": "Add SUITABILITY token to the sheet-number rule (see SN-01).",
      "auto_fixable": true }
  ]
}
```

### Provenance is a first-class citizen
`provenance.source` is one of:
- `golden-model:<docTitle>` — reverse-extracted from a real `.rvt` (confidence 1.0, it exists).
- `pdf:<file>` / `xlsx:<file>` — LLM-extracted from a document (confidence < 1.0, cites page/cell).
- `iso-profile:<key>` — supplied by the baseline profile (a best-practice default).
- `user` — added/edited by the reviewer.

The review UI groups and colours by this. **Nothing with `source != golden-model|user` builds
without an explicit tick.**

---

## 2. The extraction pipeline (mirror the `LayerMapper` tier pattern)

`LayerMapper` already proves the shape: **cheapest-deterministic tier first, LLM only for the
residue, cache the result.** The ingester is the same idea one level up.

```
Tier 0  Golden-model scraper   (C#, deterministic, no AI)   → provision.* @ confidence 1.0
Tier 1  ISO 19650 base profile (bundled JSON default)       → fills gaps @ confidence ~0.6
Tier 2  Document LLM extractor (PDF/xlsx → structured)      → only the unstructured residue
        └─ frontier model for extraction; local Ollama optional for offline/private
Merge   de-dupe by (category,name); golden-model wins ties; stamp confidence + provenance
Gap     compare merged pack vs iso19650_profile             → gap_analysis[]
Review  human ticks/edits (§4)                              → approved pack
Commit  write ruleset.json + delivery-contract.json + run StandardsBuilder (§3)
```

**Why golden-model first:** it's deterministic, free, and 100% accurate — most offices have one
good project and terrible docs. The LLM is only asked to read the *prose* (naming conventions in
a PDF) that isn't recoverable from a model. This keeps AI on the smallest possible surface and
keeps the "LLM proposes, deterministic engine disposes" principle intact.

---

## 3. "Extract from Active Document" — the C# scraper

A new **deterministic** collector, `Sentinel.Standards.GoldenModelExtractor`. No AI, no
transaction (read-only). Runs on the open doc and returns a `provision` block. Concrete Revit-API
sources per item:

| Provision item | Collector | Notes |
|---|---|---|
| `worksets` | `FilteredWorksetCollector(doc).OfKind(WorksetKind.UserWorkset)` | Skip system worksets. |
| `shared_parameters` | iterate `doc.ParameterBindings` (`DefinitionBindingMapIterator`) | Read name, `ParameterType`, instance/type (`InstanceBinding` vs `TypeBinding`), bound categories, and the **GUID** (via `SharedParameterElement`) so re-provisioning is stable. |
| `view_templates` | `FilteredElementCollector(doc).OfClass(typeof(View)).Where(v => v.IsTemplate)` | Capture name, `ViewType`, `DetailLevel`, `Discipline`, and `GetTemplateParameterIds()` for `included_overrides`. |
| `browser_organization` | `BrowserOrganization.GetCurrentBrowserOrganizationForViews/Sheets(doc)` | Read the grouping/sorting field names → the same params `ViewGenerator` routes on. |
| `line_patterns` | `FilteredElementCollector(doc).OfClass(typeof(LinePatternElement))` | |
| `fill_patterns` | `FilteredElementCollector(doc).OfClass(typeof(FillPatternElement))` | Note drafting vs model target. |
| `object_styles` | `doc.Settings.Categories` → `Category.GetLineWeight`, `LineColor`, `GetMaterial` | |
| `levels` / `grids` | `OfClass(typeof(Level))` / `typeof(Grid)` | Feeds the naming-rule token inference too. |

Every scraped item is stamped `confidence = 1.0`, `provenance.source = "golden-model:<doc.Title>"`.

**Bonus — infer rules, not just provision.** The extractor also *proposes* naming `Rule`s by
running the existing token machinery in reverse: e.g. observe all workset names → emit
`WS-01.whitelist`; observe sheet numbers → suggest the `SN-01` token pattern. These land in the
pack's `ruleset` block at lower confidence for the reviewer to confirm. (This is also the seed for
"standards-from-behaviour" later.)

---

## 4. Human-in-the-loop review UI

A code-built modeless `Window` following the `BcfIssuesWindow` / `GhostBuilderProgressWindow`
pattern (no XAML) — **`Sentinel.UI.StandardsReviewWindow`**:

```
┌─ Sentinel — Build Office System ─────────────────────────────┐
│ Source:  ☑ Active model (ACME_Tower.rvt)   ☐ + PDF/xlsx…     │
│──────────────────────────────────────────────────────────────│
│ ▸ Shared Parameters (12)                          [tick all]  │
│    ☑ BDS_View Status      Text·inst   ● 1.0  golden-model     │
│    ☑ BDS_Discipline       Text·inst   ● 1.0  golden-model     │
│    ☐ Fire_Rating          Text·type   ◐ 0.7  pdf:Std.pdf p.9  │  ← low-confidence, unticked
│ ▸ Worksets (15)                                   [tick all]  │
│ ▸ View Templates (6)                                          │
│ ▸ Browser Organization                                        │
│ ▸ Naming Rules (proposed) (7)                                 │
│ ▸ ⚠ ISO 19650 Gaps (3)  — advisory                            │
│    ⚠ No suitability codes (S0–S7)  → [Add SN token] (auto)    │
│──────────────────────────────────────────────────────────────│
│  [Preview JSON]        [Build ticked items ▶]   [Save pack]   │
└──────────────────────────────────────────────────────────────┘
```

- **TreeView** grouped by provision category; each leaf = checkbox + name + type + **confidence
  badge** (● ≥0.9 green / ◐ 0.6–0.9 amber / ○ <0.6 red) + **provenance** (hover = full locator).
- Golden-model + `user` items pre-ticked; document-extracted items **unticked by default**.
- Gaps are advisory rows with a one-click "apply suggested fix" (mutates the pack's rule).
- **Preview JSON** shows the exact `standards-pack.json`. **Build** commits (§5). **Save pack**
  writes the pack without building (for versioning / Standards-Packs reuse).

This *is* the propose→approve pattern `RequestManager`/`ChangeRequest` already uses — the reviewer
is the gate; the LLM never writes to the model unattended.

---

## 5. The Builder (execution) — `Sentinel.Standards.StandardsBuilder`

Runs inside the **ExternalEvent + Transaction** discipline the codebase already uses
(`RevitEventHub`, `ViewGenerator.CreateClashView` is the template to copy). **Idempotent**:
skip-if-exists on every item, so re-running is safe and drift-updates only add deltas.

**Order matters** (dependencies):
```
1. shared-parameter file (create/point Application.SharedParametersFilename)
2. shared parameters      → bind to categories (needs #1)
3. project parameters
4. worksets               (doc must be workshared; else warn + skip)
5. line patterns → fill patterns → object styles
6. view templates         (needs params from #2 for browser routing)
7. browser organization   (needs #2 params to exist)
8. levels / grids
```

Each step in its own try/catch, accumulating a `BuildReport { created, skipped, failed[] }`
surfaced back in the window (same as the scan report). Reuse `ViewGenerator.SetFirstMatch` for
browser-param routing.

**On success**, the Builder also:
- writes `pack.ruleset` → `RulesetStore.UserCachePath` and calls `Engine.ReloadRuleset(doc)` →
  **the scanner immediately enforces the just-built standard** (closes the loop, zero new engine code);
- writes `pack.delivery` → `DeliveryContract.DefaultPath`;
- writes the full pack → `%AppData%\Sentinel\packs\<pack_key>-<semver>.json` (versioned, for drift).

---

## 6. How it plugs into everything (no rewrites)

| Consumer | Integration | Code change |
|---|---|---|
| **Scanner (Revit)** | pack.ruleset → `ruleset.json` → `RulesetStore.LoadEffective` | **none** — already reads that path |
| **Scanner (web)** | same `ruleset` JSON loads via `sentinel-core/types.ts` | **none** — byte-compatible |
| **IFC Delivery Gate** | pack.delivery → `delivery-contract.json` → `DeliveryContract.LoadOrDefault` | **none** |
| **GhostBuilder** | pack.provision worksets + family naming feed `LayerMapper` targets + placement worksets | small: pass pack to mapper |
| **Ribbon** | new **"Build Office\nSystem"** button in the **Workflow** panel, beside "Project Setup" | 1 `AddButton` in `App.BuildRibbon` |
| **Future Copilot** | grounds on the same pack (the "office rulebook" it cites) | future |

New files (all additive, namespace `Sentinel.Standards`):
```
Standards/StandardsPack.cs          // the JSON model (embeds Ruleset + DeliveryContract)
Standards/GoldenModelExtractor.cs   // §3 read-only scraper (Tier 0)
Standards/Iso19650Profile.cs        // §2 Tier 1 baseline + gap analysis
Standards/DocumentExtractor.cs      // §2 Tier 2 (LLM; reuse LocalGhostBuilder plumbing)
Standards/StandardsBuilder.cs       // §5 execution (ExternalEvent + Transaction)
UI/StandardsReviewWindow.cs         // §4 review UI
Commands.Standards.cs               // BuildOfficeSystemCommand (opens the window)
Resources/iso19650-profile.json     // bundled baseline
```

---

## 7. MVP cut (build this first — proves the spine, zero AI)

1. `GoldenModelExtractor` for **shared parameters + worksets + browser organization** only.
2. `StandardsReviewWindow` with those three groups (confidence/provenance already meaningful).
3. `StandardsBuilder` for those three (skip-if-exists).
4. On build, write `pack.ruleset` (just the worksets whitelist → `WS-01`) to `ruleset.json` and
   reload the engine → **watch the scanner light up on the standard you just built.**

That single loop demonstrates the entire thesis — *extract → review → build → enforce, one source
of truth* — with **no LLM, no PDF parsing, no new engine code.** PDF/LLM extraction (Tier 2),
view templates, line/fill patterns, and gap analysis layer on afterward.

**Built (deployed):** two ribbon commands + four provision types.
- **Build Office System** (`BuildOfficeSystemCommand`) — extract from the active golden model → review → build into it + write `WS-01`.
- **Apply Standard** (`LoadOfficeSystemCommand`) — load a saved `%AppData%\Sentinel\packs\*.json` → review → build into the active (blank) model. "Save pack" in the review window produces the file.

- **Ingest Docs** (`IngestDocumentsCommand`) — **Tier-2**: read office-standards documents (PDF via PdfPig; txt/md/csv direct), chunk by page, and extract **worksets + shared parameters** with a **local Ollama LLM** (constrained-decoding `format` schema, mirrors `LocalGhostBuilder`; endpoint/model overridable via `SENTINEL_OLLAMA_URL`/`SENTINEL_LLM_MODEL`, pluggable to a frontier provider). Items are cited `pdf:file · p.N` and **confidence-clamped ≤ 0.85** so they land **unticked** in review — opt-in, per the human-in-the-loop principle. *Deferred: naming-rule extraction (prose → token Rule), ISO 19650 gap analysis.*

Provision types split by how the Revit API lets us build them:
- **Serializable** (fully round-trip through a saved pack): **worksets** → `Workset.Create` + merge into `WS-01`; **shared parameters** → shared-param file + `ParameterBindings.Insert`.
- **Transfer-only** (Revit API cannot author these from JSON — `View.IsTemplate` is read-only, browser schemes have no authoring API): **view templates** + **browser organization** are **cross-document copied** (`ElementTransformUtils.CopyElements`, matched by name, `UseDestinationTypes` for collisions) from the golden model. The pack records `source_model`; the builder locates that open document at build time. If it isn't open, these items skip with a clear message (fallback: Transfer Project Standards). This is why the golden model must stay open when provisioning a blank template with templates/browser org.

---

## 8. Open decisions (need your call before coding)

1. **Golden-model source:** always the *active* doc, or allow picking a `.rvt` path (detached open)?
   Active-doc is simplest for MVP.
2. **ISO 19650 baseline:** which profile ships first — UK BS EN 19650, or your BDS house standard
   promoted to the baseline? (Affects `Resources/iso19650-profile.json`.)
3. **LLM tier for docs:** frontier API (Claude) for accuracy, local Ollama for privacy, or both
   with a toggle? (MVP skips this entirely.)
4. **Workset provisioning** requires a workshared model — build creates the central, or refuses on
   a non-workshared doc with a warning?
```

