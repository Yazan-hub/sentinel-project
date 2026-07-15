# Phase 3 — Technical Spec: Handover & the Golden Thread

> **Status:** Draft v0.1. Follows `platform-vision.md` (Phase 3). Phase 2 shipped.
> **Scope of the phase:** (A) **6D** — embodied carbon / whole-life; (B) **7D** — asset register + COBie
> handover; (C) **owner/FM portal** + the maintained golden thread. This is where the *owner* finally gets
> durable value instead of a pile of PDFs.
> **This turn builds slice A's MVP** (6D embodied carbon); B and C are outlined for the roadmap.

---

## A. 6D — embodied carbon  ← building now

**Idea:** the same quantities that drive 5D cost drive carbon. Multiply model quantities by embodied-carbon
factors (kgCO₂e per m³/m²/unit) → a whole-project carbon estimate, hotspots, and an intensity metric — from
the model, so it can't drift from design. Directly parallel to the 5D quick-win.

**Files:** `sentinel-core/carbon.ts` (pure: `CarbonFactor`/`CarbonReport`, `buildCarbon`, factor resolution)
+ `sentinel-core/carbon-factors.json` (editable, **indicative ICE-ballpark** factors — clearly flagged as
"replace with project EPD data") + `setups/carbon-panel.ts` (the **6D** tab). Reuses `quantityTakeoff`.

**Panel:** Take off → embodied carbon by category (kgCO₂e), **total tCO₂e**, **carbon intensity** (kgCO₂e/m²
GFA, where GFA = Σ slab area), a **hotspot bar chart**, editable factors, click-a-line-to-isolate, CSV.
Same honesty as 5D — **missing-Qto / no-factor banners** so gaps read as gaps, not as a low number.

## B. 7D — asset register + COBie handover (later slice)
Extract Components + Types + Spaces + their attributes (serial, manufacturer, warranty, install date) into the
**COBie** structure; export COBie CSV/tabs; a **completeness check** (which assets lack serials/warranties) that
feeds the handover stage gate. The "maintained as-built the FM team actually uses."

## C. Owner / FM portal + golden thread (later slice)
A read-only, role-scoped stakeholder view (model + issues + assets + O&M) that survives past practical
completion; the asset record maintained through operation. The golden thread the owner paid for.

---

## 6D MVP cut (this turn)
`carbon.ts` + `carbon-factors.json` + `carbon-panel.ts`: model-driven embodied-carbon take-off → category
table + total tCO₂e + intensity + hotspot bars + editable factors + isolate + CSV, with missing-Qto/no-factor
banners. Docked as the **6D** sidebar tab. Deferred: whole-life (operational) carbon, carbon change-tracking,
EPD/EC3 factor import.
