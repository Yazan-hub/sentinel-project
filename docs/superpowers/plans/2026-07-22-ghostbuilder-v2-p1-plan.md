# GhostBuilder v2 · P1 implementation plan — local-default interpreter + deterministic pass

**Status:** Ready to build · **Date:** 2026-07-22 · Follows [`2026-07-22-ghostbuilder-v2-design.md`](../specs/2026-07-22-ghostbuilder-v2-design.md)

## What P1 delivers

The smallest slice that ships real value and lays the foundation P2–P4 reuse:

1. **Deterministic-first mapping** — GhostBuilder maps compliant DWG layers with **zero AI calls** (using the BDS Layer Standard), and only sends the genuine gaps to the model.
2. **An upgraded local brain** — replace the hardcoded `llama3` with a stronger, config-selectable local model (data never leaves the machine).
3. **The interpreter abstraction** — a clean seam so a cloud provider can be added later as strict opt-in, without touching the pipeline.

**Non-goals for P1:** vision/PDF senses (P2), the auto-build safety rails + review window (P3), cloud opt-in wiring (later), new-family generation. P1 stays on the **existing DWG-layer flow**, just made reliable and smarter — fully offline.

## The local models (the exact picks)

All run via **Ollama** on the workstation; nothing leaves the machine. P1 needs a **text-reasoning** model (layer names + PDF-derived text → schema-constrained JSON). Vision models are named for P2 so the abstraction anticipates them.

### P1 · text reasoning → structured JSON

| Tier | Model | Ollama tag | ~VRAM (Q4) | Why |
|---|---|---|---|---|
| **Default** | **Qwen2.5-7B-Instruct** | `qwen2.5:7b-instruct` | ~5 GB | Best-in-class open model at this size for instruction-following + **structured JSON** + reasoning; multilingual (incl. Arabic — relevant for BDS). Runs on modest GPUs or CPU. |
| **Recommended** (RTX 3060 12 GB+) | **Qwen2.5-14B-Instruct** | `qwen2.5:14b-instruct-q4_K_M` | ~9 GB | Noticeably better mapping quality on messy/ambiguous layers. The sweet spot if the GPU has ≥12 GB. |
| **Strict-JSON variant** | **Qwen2.5-Coder-7B** | `qwen2.5-coder:7b` | ~5 GB | Even tighter at emitting exact schemas, if we see JSON drift. |
| **Safe fallback** | **Llama 3.1 8B-Instruct** | `llama3.1:8b` | ~5 GB | Well-worn, Ollama-native; the low-risk default if Qwen misbehaves. |

**Recommendation:** default to **Qwen2.5-7B-Instruct**, auto-upgrade to **14B** when the GPU has the VRAM. Ollama already supports **JSON-schema-constrained decoding** (the `format` field GhostBuilder uses today), so this is largely a model-name swap + prompt/schema tuning — not a rewrite.

### P2 · vision (named now, wired later)
`qwen2.5vl:7b` (documents/drawings) · `llama3.2-vision:11b` (general) · `minicpm-v` (strong OCR/doc). ~8–10 GB.

### P4 · embeddings (for the example-library RAG)
`nomic-embed-text` or `bge-m3`.

## Architecture changes

The key privacy constraint drives the design: **the deterministic pass and the local model both run on-machine — the default path makes no network call at all.**

```
Revit layers + PDF text
      │
  ① LayerRulesetMatcher (C#, NEW)  ── loads bds-layers.json ──▶ maps compliant layers deterministically (no AI)
      │                                                          collects the `needsAI` remainder
  ② LocalInterpreter (upgraded LocalGhostBuilder)  ── Ollama (qwen2.5) ──▶ maps ONLY the gaps → JSON
      │
  ③ merge → existing ElementPlacementFactory / placement engine
```

- **`ILayerMapper`** stays the interpreter seam. `LocalGhostBuilder` becomes `LocalInterpreter` — model name + Ollama URL read from settings (no more hardcoded `llama3`). A `CloudInterpreter` stub implements the same interface (present, **off**).
- **`LayerRulesetMatcher` (new, pure C#)** mirrors `sentinel-core/layers.ts` — exact → alias(+rename) → ignore-glob → format-parse → `needsAI`. It loads `bds-layers.json` (deployed to `%AppData%/Sentinel/` like `ids.json`). **`layers.test.ts` is the conformance reference** — the C# port must produce the same results for the same inputs (guard against drift).
- **`SettingsManager`** gains: `ghostModel` (default `qwen2.5:7b-instruct`), `ollamaUrl` (default `http://localhost:11434`), `layerRulesetPath`, `cloudOptIn` (default `false`).

## Task breakdown (ordered)

1. **Model runtime** — document + script Ollama setup (`ollama pull qwen2.5:7b-instruct`; a VRAM probe to pick 7B vs 14B). Extend GhostBuilder's existing Ollama health-check to verify the configured model is pulled.
2. **Config** — add the settings above to `SettingsManager`; surface `ghostModel` in the GhostBuilder command UI (a dropdown of installed Ollama models).
3. **`LayerRulesetMatcher` (C#)** — port `layers.ts` (`mapLayer`/`validateLayers`); load `bds-layers.json`; deploy the JSON to `%AppData%/Sentinel/`. Unit-test against the `layers.test.ts` cases.
4. **`LocalInterpreter`** — de-hardcode the model in `LocalGhostBuilder`; keep the JSON-schema-constrained decoding; add the `ILayerMapper` `CloudInterpreter` stub (off).
5. **Prompt upgrade** — rebuild the mapping prompt for the stronger model: inject the category enum + **few-shot exemplars pulled from `bds-layers.json`** (canonical layer→category rows) + any PDF-derived context; keep the strict output schema.
6. **Pipeline** — `GhostBuilderOrchestrator` runs ① deterministic, then ② model on the `needsAI` remainder only, then ③ merge → existing placement. Emit per-layer confidence + source (deterministic vs model).
7. **Tests + characterization** — see below.

## Testing & acceptance

- **Unit (C#):** `LayerRulesetMatcher` mirrors every `layers.test.ts` case (exact/alias/ignore/format/none, batch verdicts).
- **Characterization:** a sample DWG with mixed layers → assert (a) a **fully-compliant** DWG needs **zero** model calls and builds correctly; (b) a messy DWG sends **only** non-standard layers to the model; (c) placement output matches the pre-P1 baseline for the compliant subset.
- **Model swap:** GhostBuilder runs end-to-end on `qwen2.5:7b-instruct` producing valid schema-constrained JSON.
- **Privacy assertion:** in default mode, **no outbound network call** beyond `localhost:11434` (the local Ollama). This is the acceptance gate for the whole privacy promise.

**Done when:** a compliant BDS DWG auto-builds offline with 0 AI calls; a messy DWG builds with only its non-standard layers hitting the local model; the model is swappable via settings; nothing leaves the machine.

> **Verified 2026-07-22 (AI, offline):** `LayerRulesetMatcher.cs` (the one non-Revit new file) was compiled in isolation on .NET 8 and run against the real `bds-layers.json` — **15/15 conformance checks pass** (exact/alias/ignore/format/keyword/unknown/extension/empty), matching `layers.test.ts`. The remaining files are small Revit-coupled edits (model de-hardcode + wiring) that need the user's `dotnet build` to confirm.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| C#↔TS logic drift in the matcher | `layers.test.ts` is the conformance spec; port case-for-case; consider a shared fixture file |
| Local model JSON drift | Ollama `format`-constrained decoding (already used) + Qwen2.5-Coder fallback |
| VRAM limits on some machines | Tiered default (7B/14B) + CPU fallback (slower, still works) |
| C# can't be built/tested in the AI's env | Plan is written for you to build; I pair on it, and the pure matcher is validated via the TS reference tests |

## Deferred to P2+

Vision + PDF senses (P2) · auto-build TransactionGroup undo + ghost placement + `GhostReviewWindow` (P3) · cloud opt-in adapter + example-library RAG (P4) · new-family generation (separate slice).

---

*Local-first, offline, deterministic-where-possible — P1 makes GhostBuilder reliable and private before it gets clever.*
