# GhostBuilder v2 — "auto-build → govern → review"

**Status:** Draft for review · **Date:** 2026-07-22 · **Owner:** Yazan Hijazeen

## Summary

GhostBuilder v2 upgrades Sentinel's existing CAD→BIM auto-modeller in two ways — a stronger **brain** (multi-model cloud AI instead of the local Llama 3) and more **senses** (a scoped local folder of DWG + PDF + sketch/render documents instead of DWG layers alone) — and wires the result into Sentinel's governance loop.

The interaction model is **autonomous**: the agent reads a folder, builds the whole model, governs it, and presents the result for review. What makes "review after" safe rather than reckless is three rails — **one-click undo, confidence-graded "ghost" placement, and the referee as guardrail** — all of which are native Sentinel strengths.

> **The differentiated claim this makes real:** *the only AI that builds to a standard and proves it* — every element it generates is born-compliant and auto-adjudicated on the immutable ledger. Generate → govern, in one loop.

## Goals

1. Replace GhostBuilder's local Llama 3 with a **provider-abstracted multi-model gateway** (Claude default; Kimi and others pluggable), hosted on the **bridge** so no API keys ever reach the desktop plugin.
2. Extend document intake from DWG-layers-only to a **scoped local folder** of mixed documents: **DWG (geometry), PDF (text/schedules/specs), images (sketches/renders, via vision)**.
3. Produce a structured, governable **Build Proposal** and build the model **autonomously**, wrapped in safety rails that make an unattended run reversible and auditable.
4. **Govern every build**: each generated element is adjudicated against the office standard (IDS) and recorded on the audit ledger.

## Non-goals (explicit — these are horizons, not v1)

- **New-family *generation*.** v1 places and adapts *existing* BDS families (as GhostBuilder does today). Generating brand-new parametric families is the *next* slice, specced separately.
- **Sketch/render → dimensioned geometry.** Images are interpreted as *semantic hints* (what/where/which type), never as the source of dimensioned geometry. Geometry comes from DWG.
- **Full MEP/structural systems, fabrication-level detail.** Out of scope for v1.
- **Autonomous self-training / weight updates.** The agent improves via a *retrieval + example library* (in-context), not by retraining models. See [Learning](#learning-how-the-agent-improves).

## What exists today (build on, don't replace)

| Area | Files | Role in v2 |
|---|---|---|
| CAD→BIM modeller | `SentinelAddin/GhostBuilder/*` (`GhostBuilderOrchestrator`, `ElementPlacementFactory`, `GhostBuilder_ExtractionAndPlacement`, `GhostWallTypeProvisioner`, `GhostFamilyPreloader`, `MepVoidManager`, `LayerMapper`, `GhostFailureHandler`) | **Reused** as the BUILD engine |
| Model interpreter seam | `GhostBuilder_Architecture.cs` → `ILayerMapper` / `LocalGhostBuilder` (Ollama) | **Extended** — add a bridge-backed interpreter behind the same interface |
| Document reading | `SentinelAddin/Standards/DocumentExtractor.cs`, `DocumentTextReader.cs` | **Reused/extended** for the SENSE stage (PDF text) |
| Family handling | `SentinelAddin/Workflow/FamilyProcessor.cs`, `FamilySanitizer.cs` | Reused for family placement/sanitizing |
| Trust boundary / API | `WebApp/bridge/bcf-service.mjs`, `cde-store.mjs` | **Home of the new AI gateway** |
| Governance engine | `WebApp/src/sentinel-core` (`adjudicate`, IDS) + `GovernedElementExtractor.cs` | **Reused** for the GOVERN stage |
| Audit ledger | `WebApp/db` hash-chained `audit_log` | Records every build decision + verdict |
| AI chat (future reuse) | `WebApp/src/setups/copilot-panel.ts` (Ollama) | Later re-points at the same gateway |

## The pipeline

```
┌─ Scoped local folder (agent's ONLY filesystem access) ─────────────┐
│   plans.dwg · spec.pdf · sketch.jpg · render.png                    │
└───────────────────────────────┬────────────────────────────────────┘
                                │
  1 · SENSE      DWG → layers + linework (curves) · PDF → text/schedules · images → bytes
                 → assemble an "Evidence Packet"
                                │
  2 · INTERPRET  bridge → cloud model (Claude/Kimi) with { evidence + office IDS + examples }
                 → a schema-validated "Build Proposal" (element → family/type/params, confidence, rationale)
                                │
  3 · BUILD      placement engine consumes the Proposal, inside ONE Revit TransactionGroup
                 → high-confidence solid · low-confidence as provisional "ghost"
                                │
  4 · GOVERN     GovernedElementExtractor + adjudicate() → per-element verdict; append to audit ledger
                                │
  5 · REVIEW     Review window opens on the VERDICT: ✓ compliant / ⚠ warned / ✗ rejected,
                 each with rationale + source doc + confidence · accept / fix / undo
```

## Components

Each component has one responsibility and a defined interface, so it can be built and tested in isolation.

### C1 · AI gateway (bridge) — `WebApp/bridge/ai-*.mjs`
- **Responsibility:** the single place that talks to cloud LLM/vision providers; holds keys; routes by model.
- **Interface:** `POST /ai/interpret` `{ evidence, standard, model?, examples? } → BuildProposal`; (later) `POST /ai/chat` for the copilot.
- **Provider abstraction:** `interpret(provider, payload)` with adapters for Anthropic (Claude, incl. vision), Moonshot (Kimi), … behind one signature. Default + per-request `model`. Keys in `config/.env` (`ANTHROPIC_API_KEY`, `MOONSHOT_API_KEY`), never on the desktop.
- **Depends on:** the F2 auth gate (the AI routes are protected like every other bridge route).

### C2 · Model interpreter (plugin) — `BridgeInterpreter : ILayerMapper`
- **Responsibility:** desktop-side client that posts the Evidence Packet to `/ai/interpret` and returns a validated `BuildProposal`. Selected by config in place of `LocalGhostBuilder`; `LocalGhostBuilder` stays as the **offline / privacy fallback**.

### C3 · SENSE — `GhostSense` (plugin)
- **Responsibility:** read the scoped folder and assemble the Evidence Packet. DWG → layers + curves (reuse `GhostBuilder_ExtractionAndPlacement`); PDF → text (reuse `DocumentTextReader`); images → base64 bytes + filename.
- **Constraint:** reads **only** the configured folder; refuses paths outside it.

### C4 · BUILD — `GhostBuilderOrchestrator` (extended)
- **Responsibility:** consume a `BuildProposal` (superset of today's `LayerMapping`) and place elements via the existing factory. **New:** wrap the whole run in a single `TransactionGroup`; place confidence < threshold as **ghost/provisional** (distinct visual override + a `Sentinel.Provisional` flag).

### C5 · GOVERN — reuse `GovernedElementExtractor` + `adjudicate()`
- **Responsibility:** after build, extract the created elements and adjudicate against the office IDS; attach a verdict to each; append the run + verdicts to the audit ledger.

### C6 · REVIEW — `GhostReviewWindow` (evolves `GhostBuilderProgressWindow`)
- **Responsibility:** present the built result grouped by verdict, each element showing rationale + source doc + confidence, with per-group **accept / fix / undo**. Undo maps to rolling back the transaction group (whole build) or deleting a provisional group.

## The Build Proposal (data contract)

The model MUST return this shape (schema-constrained, as `LocalGhostBuilder` already does for mappings):

```jsonc
{
  "elements": [{
    "source":     { "doc": "plans.dwg", "layer": "A-WALL-EXT", "region": "grid B/2" },
    "category":   "Walls",                       // enum ElementPlacementFactory switches on
    "family":     "BDS_Wall_Ext",
    "type":       "FR60_200mm",
    "params":     { "FireRating": "FR60", "IsExternal": true, "Discipline": "A" }, // IDS-required
    "geometryRef":{ "kind": "dwgCurves", "layer": "A-WALL-EXT" },  // geometry from DWG only
    "confidence": 0.86,
    "rationale":  "External wall per layer + FR60 from spec.pdf schedule S-02"
  }],
  "notes": "…",
  "unmapped": [ { "doc": "...", "layer": "...", "reason": "no confident match" } ]
}
```

`params` is pre-populated with the exact fields the office IDS requires → elements are **born compliant**.

## Deterministic layer mapping (the reliability backbone)

The INTERPRET stage is **deterministic-first**. A **DWG Layer Standard** (`docs/BDS_DWG_LAYER_STANDARD.md` + the ruleset `demo/bds-pilot/bds-layers.json`, same config pattern as naming/IDS) maps compliant layer names → category / family / seeded IDS params with confidence 1.0 and **no AI call**. The cloud model is reserved for the genuine gaps: non-compliant or ambiguous layers, which it *proposes* a mapping for (lower confidence) **and** suggests a compliant rename for. A **layer-compliance gate** (`reject`/`warn`/`off`) flags non-standard DWGs in the review so the source can be fixed and the next run is fully deterministic. This is what keeps an autonomous build trustworthy — the standard carries the common cases; the AI handles ambiguity, not chaos.

## Safety rails (what makes autonomous build safe)

1. **One-click undo** — the entire build is one `TransactionGroup`; `RollBack`/undo reverts everything. No partial or stuck state ever (a mid-build failure rolls the group back automatically).
2. **Confidence-graded ghosts** — elements below the confidence threshold are placed as visually-distinct provisional geometry, listed separately for accept/reject. Uncertainty is never hidden as fact.
3. **Referee guardrail** — every element is adjudicated; the review opens on the verdict, not a raw model. Non-compliant elements are flagged with the failing requirement + a suggested fix.
4. **Full audit** — every decision (mapping, confidence, source, verdict) is written to the immutable ledger, so even a lights-out build has a golden thread.

## Data flow (end to end)

Revit command → `GhostSense` reads folder → Evidence Packet → `BridgeInterpreter` → `POST /ai/interpret` → bridge → provider (Claude) → `BuildProposal` (schema-validated bridge-side) → back to plugin → `GhostBuilderOrchestrator` builds in a TransactionGroup → `GovernedElementExtractor` + `adjudicate()` → verdicts + ledger append → `GhostReviewWindow`.

## Error handling & failure modes

| Failure | Handling |
|---|---|
| Model timeout / provider error | Retry once; then offer `LocalGhostBuilder` fallback or clean abort (TransactionGroup never opened → no change) |
| Malformed / off-schema proposal | Bridge validates against the schema and rejects; retry with a repair prompt; surface if still bad |
| Low-confidence flood | Build as ghosts, don't commit silently; review flags "N low-confidence — check before accepting" |
| Per-layer/DWG parse failure | Skip that layer, log to `unmapped`, continue; never abort the whole run for one bad layer |
| Mid-build exception | TransactionGroup auto-rolls-back → Revit left exactly as before |
| Folder path outside scope | `GhostSense` refuses; command errors clearly |

## Security & privacy

- **Keys on the bridge only** (consistent with today's trust boundary); desktop stays thin.
- **AI routes protected** by the F2 auth gate.
- **Scoped folder** — the agent reads only the one configured folder, nothing else on disk.
- **⚠ Privacy call-out (needs an office decision):** cloud interpretation means the office's **drawings/specs are sent to a third-party model API** (Anthropic / Moonshot). This must be surfaced to the user and made a setting. `LocalGhostBuilder` (offline) remains available for sensitive projects. *This is a real trade-off to confirm with the firm, not a detail.*
- **Governed** — every build recorded to the tamper-evident ledger.

## Learning (how the agent improves)

Not weight-training. The agent gets better via **retrieval + examples**:
- A **standards + reference knowledge base** (the office IDS, naming rules, and curated reference material — including transcripts of training videos) the interpreter retrieves from (RAG).
- An **example library**: the user's own ready-built families/models become few-shot exemplars the interpreter is shown, so it follows *their* conventions.
This delivers "learns my workflow from my examples" honestly and cheaply; optional fine-tuning is a much later, separate decision.

## Testing strategy

- **Pure / unit:** Build Proposal schema validation; the SENSE packet assembly; the confidence→ghost decision. Fixture Evidence Packets → expected Proposals.
- **Bridge:** provider abstraction with mock providers; `/ai/interpret` contract + schema enforcement; auth-gate coverage.
- **Governance:** reuse `sentinel-core` tests; assert a generated model adjudicates to the expected verdict (born-compliant elements pass).
- **Revit (characterization):** a known DWG+PDF fixture → build → assert element counts/types; assert **TransactionGroup undo restores the prior state exactly**; assert ghosts are visually flagged and separately listed.

## Phasing (within v2)

1. **P1 — Gateway + brain swap.** Bridge AI gateway + provider abstraction; `BridgeInterpreter` behind `ILayerMapper`; run the *existing* DWG-only flow through Claude. Ship value immediately (better mappings).
2. **P2 — Senses.** Scoped folder + multi-doc SENSE (PDF + vision) + the richer Build Proposal contract.
3. **P3 — Autonomous rails + review.** TransactionGroup undo, ghost/confidence placement, GOVERN integration, `GhostReviewWindow`. (This is where "auto-build → review" becomes real.)
4. **P4 — Multi-model + tuning.** Kimi/other routing, the example library + knowledge base, prompt/confidence tuning.

## Open questions (to resolve before/within build)

1. **Cloud vs local default** — is cloud interpretation acceptable for the pilot's drawings, or is `LocalGhostBuilder` the default with cloud opt-in? (Privacy trade-off above.)
2. **Confidence threshold** for ghost vs solid — start at a value (e.g. 0.75) and tune from real runs.
3. **Which providers at launch** — Claude (has vision) is the natural first; Kimi second for large doc sets. Confirm accounts/keys.
4. **Governance timing** — govern *after* build (as specced), or a pre-build dry-run adjudication of the Proposal too? (Post-build is simpler for v1.)

---

*Next step after approval: a `writing-plans` implementation plan, starting at P1.*
