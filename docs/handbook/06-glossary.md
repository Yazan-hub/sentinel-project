# 06 · Glossary

The vocabulary to speak about Sentinel fluently — to a client, a tester, or an interviewer. Split into *industry terms* (what the AEC world means) and *Sentinel terms* (what we mean by them).

## Industry / standards terms

**AEC** — Architecture, Engineering & Construction: Sentinel's industry.

**BIM** (Building Information Modelling) — designing a building as a data-rich 3D model, not just drawings. Every wall/door/window is an object carrying properties (material, fire rating, U-value…).

**IFC** (Industry Foundation Classes) — the open, vendor-neutral file format for BIM models (a buildingSMART standard). Sentinel governs IFC so it isn't locked to Revit.

**IDS** (Information Delivery Specification) — a buildingSMART standard for writing *machine-checkable rules* about what a model must contain ("every external wall must have a fire rating"). **IDS is Sentinel's rulebook** — the thing it validates against.

**ISO 19650** — the international standard for managing information over a built asset's life cycle. Defines the **CDE**, the container **states** (WIP → Shared → Published → Archived), and **suitability codes**. **ISO 19650 is Sentinel's process** — the governance it enforces.

**CDE** (Common Data Environment) — the agreed single source of information for a project (where models/documents live and move through approval states). Sentinel governs a CDE; it doesn't try to *be* the storage.

**BCF** (BIM Collaboration Format) — an open format (OpenCDE BCF 3.0) for exchanging coordination *issues* between tools, independent of the model file. Sentinel raises BCF issues when a model fails the gate.

**LOD** (Level of Development, e.g. **LOD 300**) — how detailed/reliable a model's elements are. LOD 300 ≈ "design-stage, dimensionally accurate, with real properties." Sentinel's element checks target LOD-300 data completeness.

**Golden thread** — from the UK Building Safety Act: the requirement to keep an accurate, auditable, tamper-evident record of a building's safety-critical information across its life. Sentinel's immutable ledger produces this as a by-product.

**Clash detection** — finding conflicts in a model. **Geometric/hard clash** = two solids overlap (Navisworks' turf). **Data/soft clash** = the *information* is wrong, missing, or non-conformant (Sentinel's turf).

**5D / 6D** — BIM "dimensions": 5D = cost, 6D = sustainability/carbon (on top of 3D geometry + 4D time). Sentinel treats these as read-only derivations, not core products.

## Sentinel terms

**Referee / Digital Notary** — the mental model for Sentinel: it doesn't design; it *judges* what others propose and makes the judgment official and permanent.

**Governed Publish** — the flagship one-button Revit workflow: export → gate → adjudicate → immutable verdict → publish-on-pass (or auto-raise BCF). Steps labelled **G1–G4**.

**Delivery gate** — the checkpoint a model must pass before it's trusted: a **naming gate** + an **element IDS gate**, each independently set to `reject` / `warn` / `off`.

**Adjudication** — running an IDS spec over every element to produce a verdict (`accepted` / `accepted-with-warnings` / `rejected`). The core function is `adjudicate(spec, elements)`.

**The verdict** — the referee's ruling, appended to the ledger against a specific file version (shows as a ✓/✗ badge).

**Immutable / hash-chained ledger** — the append-only `audit_log`; each entry chains to the previous by hash, and DB triggers forbid update/delete/truncate. The "on the record" mechanism.

**Governed element graph** — the accumulating, verified record of a project's elements and their verdicts over time; the intended moat.

**The bridge** — the Node service (`:4100`) that is the trust boundary: it holds the secrets and mediates every client↔database call.

**`sentinel-core`** — the pure governance engine; the same validation code in the browser and on the bridge.

**Enforcement level** — per-ruleset setting: `reject` (block), `warn` (flag but allow), `off` (skip). How Sentinel is "configurable, warn-first."

**Base template** (⬜ planned) — a future office-agnostic default ruleset; today the gate uses the **BDS** documents as a *reference*, not a fixed standard.

**BDS** — Badran Design Studio, the reference/pilot studio whose BIM documents currently configure the gate for testing.
