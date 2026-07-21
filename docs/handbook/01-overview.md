# 01 · Overview — what Sentinel is

## One sentence

**Sentinel is the governance layer that sits downstream of every BIM authoring tool: it validates a model against a standard, governs it by ISO 19650, and records the verdict on an immutable ledger — so a model becomes *officially true*, on the record, only if it passes.**

## The thesis

> **Storage is a CDE's job. Truth is ours.**

Every Common Data Environment (CDE) on the market can *store* a model and move it through folders. None of them *adjudicate* whether the model is actually correct against a rulebook and then make that judgment permanent and auditable. That gap — between "a file was uploaded" and "a model was verified, and here is the tamper-proof proof" — is what Sentinel occupies.

The mental model is a **digital notary / referee**:
- A thousand tools and AI agents can *propose* a design.
- Sentinel is the one place their output is checked against a standard (buildingSMART **IDS**), governed by a process (**ISO 19650**), and stamped onto an **immutable, hash-chained ledger**.
- It publishes **only if the model passes**. A failure isn't a dead end — it's automatically turned into coordination issues (**BCF**) that sync back to the authoring tool.

## What Sentinel is *not*

Being clear about the boundaries is what makes the positioning defensible:

- **Not an authoring tool.** It never draws geometry. Revit/IFC authoring stays where it is; Sentinel is the referee, not a player.
- **Not a geometric clash detector.** It deliberately *cedes* hard-surface clash to the incumbents (Navisworks, Solibri) and competes on **data clash + compliance** instead — is the *information* correct, complete, and standards-conformant? (See [decision D-01](07-decisions.md).)
- **Not a 5D/6D cost/carbon engine.** Cost and carbon appear only as **lightweight, derivation-only panels** that read from validated quantities — never as a heavyweight estimating product. (See [decision D-02](07-decisions.md).)
- **Not "another CDE."** It can front a CDE or ride alongside one; its value is the *verdict + the record*, not the storage.

## Who it's for

- **Boutique / mid-size architectural studios** moving to real LOD 300 BIM deliverables who need to *prove* their information meets a client's or a regulator's standard — without buying enterprise-tier tooling.
- **The regulatory wave** as its wedge: e.g. the UK Building Safety Act's **"golden thread"** demands an auditable, tamper-evident record of building information. Sentinel produces exactly that as a by-product of normal work.

## The differentiated seam (what's actually live)

One thing is proven end-to-end today: **desktop → cloud → referee**.

> One button in Revit → export IFC → delivery gate → IDS adjudication → immutable verdict → publish-on-pass, with failures auto-raised as BCF issues that sync back into Revit.

Status: ✅ **Verified live end-to-end** on a real building model (the Governed Publish loop, G1–G4). Everything else in the platform orbits this seam. See [`04-core-workflows.md`](04-core-workflows.md) for the step-by-step, and [`05-capability-status.md`](05-capability-status.md) for the honest map of what surrounds it.

## The moat, in one line

Anyone can validate a model once. Sentinel's defensibility is the **accumulating, tamper-evident record of verified truth** — the governed element graph — that gets more valuable and harder to replicate the longer a project runs. (See [`07-decisions.md`](07-decisions.md) and `docs/STRATEGIC_REVIEW_2026-07.md`.)
