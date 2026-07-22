# GhostBuilder v2 · P2 implementation plan — the senses (scoped folder + PDF + vision)

**Status:** Planned (contingent on P1 landing) · **Date:** 2026-07-22 · Follows [P1](2026-07-22-ghostbuilder-v2-p1-plan.md)

## What P2 delivers

P1 gave GhostBuilder a better brain on DWG layers. P2 gives it more **senses** and a **scoped, safe input**:

1. **Scoped local folder** — the agent reads only ONE folder you point it at, nothing else on disk.
2. **Multi-document SENSE** — DWG (geometry, as today) **+ PDF** (schedules/specs/notes, text) **+ images** (sketches/renders, via a **local** vision model).
3. **The Evidence Packet + a richer Build Proposal** — the interpreter now sees the *documents' meaning*, not just layer names, and produces element → family/type/**params**/rationale/source (superseding the bare `LayerMapping`).

**Everything stays local** — the vision model runs on-machine via Ollama, so drawings/specs never leave the machine (the P1 privacy decision holds).

**Non-goals for P2:** the auto-build safety rails + review window (P3), cloud opt-in wiring (later), new-family generation.

## The local vision model (the exact picks)

For reading sketches, renders, and PDF drawing pages into *semantic hints* (never dimensioned geometry). All via Ollama, offline.

| Tier | Model | Ollama tag | ~VRAM | Why |
|---|---|---|---|---|
| **Default** | **MiniCPM-V 2.6** | `minicpm-v` | ~8 GB | Strong OCR + document/drawing understanding at ~8B; efficient |
| **Recommended** | **Qwen2.5-VL 7B** | `qwen2.5vl:7b` | ~9 GB | Excellent on documents/drawings; multilingual (Arabic for BDS) |
| **Alternative** | **Llama 3.2-Vision 11B** | `llama3.2-vision` | ~10 GB | Ollama-native general VLM |

**Recommendation:** default **MiniCPM-V** (efficient, great OCR for schedules/notes); Qwen2.5-VL where the GPU allows. Vision is **optional** — if no VLM is pulled, images are skipped gracefully and the DWG+PDF flow still works.

## Architecture

```
┌ Scoped folder (agent's ONLY filesystem access) ┐
│  plan.dwg · spec.pdf · sketch.jpg · render.png  │
└───────────────────────┬─────────────────────────┘
        GhostSense (extended)
   ┌────────────┼───────────────┬───────────────┐
   DWG→layers+curves   PDF→text (DocumentTextReader)   images→VLM hints (LocalVisionReader, Ollama)
   └────────────┴───────────────┴───────────────┘
                        │  Evidence Packet
                        ▼
        Interpreter (LayerMapper + LocalGhostBuilder, P1) — prompt now enriched with PDF + vision hints
                        │  richer Build Proposal (family/type/params/rationale/source)
                        ▼
              existing placement engine  →  GOVERN (referee)
```

- **`GhostSense` (new/extended)** — reads the scoped folder → an `EvidencePacket { dwgLayers, dwgCurves, pdfText[], imageHints[] }`. Refuses any path outside the configured folder.
- **Scoped-folder setting** — `ghost_source_folder` in `SentinelSettings`; a folder picker in the command; SENSE hard-fails on out-of-scope paths.
- **PDF** — reuse `Standards/DocumentTextReader.cs` (already extracts text) to pull schedules/specs/notes into the packet.
- **`LocalVisionReader` (new)** — posts each image (base64) to the local Ollama VLM → a short structured hint (what it depicts, likely elements/params). Local; skipped if no VLM.
- **Interpreter enrichment** — the P1 `LocalGhostBuilder` prompt gains the PDF/vision context so it disambiguates messy layers AND seeds IDS params (e.g. a spec's "FR60 external walls" → sets `FireRating` on `A-WALL-EXT`).
- **Richer Build Proposal** — extend the mapping to carry `params` + `rationale` + `sourceDoc` (additively, so P1's `LayerMapping` path keeps working).

## Tasks (ordered)

1. **Scoped folder** — `ghost_source_folder` setting + picker; `GhostSense` reads only there; out-of-scope guard + test.
2. **PDF sense** — feed `DocumentTextReader` output into the Evidence Packet.
3. **`LocalVisionReader`** — Ollama VLM client; per-image hint; model pull check; graceful skip if absent. Pick the VLM (above).
4. **Evidence Packet + richer Build Proposal contract** — additive fields; keep the P1 shape valid.
5. **Interpreter enrichment** — thread PDF/vision context into the mapping prompt; seed params.
6. **Wire into the pipeline** — SENSE assembles the packet; keep local-default; keep the deterministic-first pass in front.

## Testing & acceptance

- **Scoped folder:** SENSE reads a chosen folder and **refuses** a path outside it.
- **PDF influence:** a folder with a DWG + a PDF schedule → the PDF's fire ratings / types show up in the proposal's params/mapping.
- **Vision:** a sketch image → the VLM returns a usable hint; with **no** VLM pulled, images are skipped and the run still completes.
- **Privacy gate (unchanged):** default mode makes no network call beyond `localhost:11434`.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Sketch → geometry over-reach | Vision produces **hints only**, never dimensioned geometry (that stays DWG); humans review in P3 |
| VLM VRAM / not installed | Tiered picks; vision is optional and skipped gracefully |
| Contract change ripples | Extend `LayerMapping`/proposal **additively**; P1 path stays valid |
| PDF/vision noise misleads the model | Keep the deterministic BDS-standard pass in front; hints only refine, never override a confident deterministic match |

## Deferred to P3+

Auto-build TransactionGroup undo + confidence ghosts + `GhostReviewWindow` (P3) · cloud opt-in adapter + example-library RAG (P4) · new-family generation (separate slice).
