# Governed Publish Loop — BDS Pilot Demo Spec

**Date:** 2026-07-20
**Goal:** take Sentinel's *one differentiated seam* — the Governed Publish loop — from "pieces that exist"
to **one flawless, demo-perfect end-to-end story** for the Badran Design Studio (BDS) pilot.
**Thesis it proves:** *"A model becomes TRUE here, and it's on the record."* No competitor (ACC, Revizto,
Solibri) owns the desktop→cloud→referee seam.

---

## 1. The demo (this is the acceptance criteria)

A BDS modeler and a coordinator, one screen each. Every step must work first try, no console, no "let me
restart the bridge."

1. **Modeler, in Revit:** clicks **Governed Publish** on the Sentinel ribbon.
   - One action: exports the active view to IFC → runs the **IFC Delivery Gate** (contract check) → runs
     **IDS adjudication** → records the verdict to the **immutable audit chain** → uploads + versions the
     model **only if it passes** (a fail is still recorded, but not published as live).
   - The modeler sees a single clear result: **✓ ACCEPTED — published as v4** or **✗ REJECTED — 3 failures
     (not published)**, with the reasons.
2. **Coordinator, in the browser (zero install):** opens the project's **Assets / CDE** tab.
   - The new version is there with **who published it, when, its ISO 19650 state, and a pass/fail verdict
     badge**. One click opens the **immutable audit entry** (hash-chained) behind the verdict.
3. **On a REJECT:** the failures have **auto-opened as BCF issues**, visible in the web Issues panel on the
   3D elements, and **live-synced back into the modeler's Revit** (the existing SSE BCF loop).
4. **Modeler fixes, re-publishes** → **✓ ACCEPTED**, the BCF issues close, the audit shows the full trail:
   rejected → fixed → accepted, with names and timestamps.

If those four beats land cleanly, the pilot demo is done. Everything else is out of scope.

---

## 2. Current state (verified from source, 2026-07-20)

The loop is ~80% built but **fragmented across three separate actions**:

| Piece | Where | State |
|---|---|---|
| Export active view → IFC → outbox | `Commands.PublishToPlatform` + `PlatformExporter` | Built |
| IFC Delivery Gate (STEP parse vs EIR/BEP contract → signed SHA-256 cert) | `Commands.IfcGate` + `Engine.IfcDeliveryGate` | Built, **separate command** |
| IDS adjudicate (accept/reject/record) | `sentinel-core/ids.ts::adjudicate` → bridge `POST /cde/:key/propose` | Built + tested, **web/agent path only** |
| Record verdict to immutable audit | `Coordination.GovernedNotify.DeliveryGate` → bridge `/cde/:key/audit` | Built (fire-and-forget) |
| Web CDE / version + who/when/state | `cde-panel.ts`, `files-panel.ts` | Built |
| Live BCF sync Revit↔web (SSE) | `BcfSyncManager` + `bcf-service` SSE + `issue-panel.ts` | Built |

---

## 3. Gaps to close (integration + surfacing — no new engines)

**G1 — Unify into one "Governed Publish" action (Revit).**
A single ribbon command that runs export → delivery gate → IDS adjudicate → record verdict → publish-on-pass,
reusing `IfcDeliveryGate.Validate`, the adjudicate core, `PlatformExporter`, and `GovernedNotify`. The three
existing commands stay (power users), but the demo path is one button with one clear verdict dialog.
*Risk:* Revit-side code — buildable here, but **only the user can run Revit to verify**; I verify the bridge
+ web halves and the addin compile.

**G2 — Fail → BCF, automatically.**
On a gate/IDS **reject**, create a BCF topic per failure (reuse the web-side IDS→BCF path already in
`visibility-panel.ts`, and/or `GovernedNotify`), so they surface in the web Issues panel and live-sync to
Revit. Today only web-initiated IDS raises BCF; the publish path does not.

**G3 — Verdict badge on the governed version (web).**
Surface a clear **✓ accepted / ✗ rejected / recorded** badge on the version row in the CDE/Assets view, with a
one-click link to the immutable audit entry. Today the verdict is in the audit log but not surfaced as a badge.

**G4 — Demo-reliability checklist (ops).**
A short preflight so the live demo can't stumble: bridge running + **platform token valid** (the new startup
health-check covers this), `SUPABASE_SERVICE_KEY` set, a prepared BDS demo model + delivery contract + IDS
spec, and a dry-run script. Package as `docs/PILOT_DEMO_RUNBOOK.md`.

---

## 4. Non-goals (YAGNI — explicitly out)

- No changes to GhostBuilder, Standards ingest, or the Analytics pillar for this demo.
- No new validation logic — reuse `IfcDeliveryGate` + `adjudicate` as-is.
- No multi-user/roles theater; single modeler + single coordinator.
- No Ollama-dependent features on the demo path (this loop needs none).
- No IFCZIP support, no server-side raw `.ids` XML (browser-parses the spec — known, fine).

---

## 5. Architecture (altitude: thin orchestration over built parts)

```
Revit "Governed Publish" (G1, new thin command)
   ├─ PlatformExporter.ExportToOutbox            (exists)
   ├─ IfcDeliveryGate.Validate(ifc, contract)    (exists) ─┐
   ├─ adjudicate(idsSpec, elements)  via propose  (exists) ─┼─► verdict
   ├─ GovernedNotify.DeliveryGate → /cde/audit    (exists)  │   (immutable)
   ├─ on PASS: upload + register version           (exists) │
   └─ on FAIL: GovernedNotify → create BCF topics (G2, new hook)
                                                             ▼
Web (coordinator)
   ├─ CDE/Assets version row + verdict badge (G3, new UI) ──► audit entry (exists)
   └─ Issues panel shows BCF (exists) ──SSE──► back to Revit (exists)
```

The only genuinely new code: one Revit orchestration command (G1), one fail→BCF hook (G2), one web verdict
badge (G3), and a runbook (G4). Everything else is reuse.

---

## 6. Verification plan

- **I can verify:** addin compiles (2025/2026); bridge propose/audit/BCF endpoints return correct verdicts;
  web verdict badge renders against real audit data; the 75-test suite + any new core tests stay green.
- **User must verify (has Revit):** the one-button Governed Publish inside Revit, end-to-end, on a real model.
- **Definition of done:** the four demo beats in §1 run cleanly in a rehearsal, captured in the runbook.

---

## 7. Open question for the user

The demo needs a **prepared BDS model + delivery contract + IDS spec** to run against. Do you have a
representative `.rvt` (or IFC) and a contract/IDS to use, or should the spec include building a minimal
demo dataset as a first step?
