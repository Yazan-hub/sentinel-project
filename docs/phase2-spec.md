# Phase 2 — Technical Spec: Time, Cost & Gates across the lifecycle

> **Status:** Draft v0.1. Follows `platform-vision.md` (Phase 2) and Phase 1 (shipped).
> **Scope of the phase:** (A) **4D** — schedule ↔ element sets + sequence simulation; (B) **5D full** —
> cost planning, change tracking; (C) **stage gates everywhere**; (D) **RFIs / submittals / approvals**.
> **This turn builds slice A's MVP** (the 4D sequence simulator); the rest is outlined for the roadmap.

---

## A. 4D — schedule ↔ elements + sequence simulation  ← building now

**Idea:** the programme becomes a *view of the model*, not a disconnected P6 file. Tasks map to element
sets; a timeline scrubber reveals/greys elements by date so you *watch the building rise*.

**Element ↔ task mapping (MVP): by trade/category** — reliable with data we already extract
(`quantityTakeoff` gives category + `model_id`/`local_id`). Finer mapping (by level/zone via IFC spatial
containment) is the Phase-2 refinement.

**Schedule sources:**
- **Generate from model** (zero-import): a standard construction sequence by trade
  (Structure → Walls → Roof → Openings → Stairs → Finishes) with sensible durations from a start date.
- **Import CSV** (P6/MSP export): `name,start,finish,categories` — the pragmatic interchange (XER/MPP later).

**Simulation:** a range slider over the schedule's date span. At date *D*: tasks finished are shown, active
tasks highlighted, not-yet-started hidden (via `Hider.isolate` + `Highlighter`). A **Play** button animates it.
Click a task → isolate its elements. A Gantt strip shows each task's bar + progress at *D*.

**Files:** `sentinel-core/schedule.ts` (pure: `Task`/`Schedule`, `defaultSequence`, `csvToSchedule`,
`scheduleRange`); `setups/timeline-panel.ts` (the **4D** tab). No new service — schedule can persist to the
project store (`PUT /projects/:pid` `schedule`) in a later slice.

## B. 5D full (later slice)
Rate libraries per discipline, quantity→cost with waste/overhead factors, **change tracking** (diff BoQ across
model versions → cost delta), currency + regional rate packs. Extends `quantities.ts` + `cost-panel.ts`.

## C. Stage gates everywhere (later slice)
Generalize the Phase-1 gate: declarative gate definitions per stage boundary, each check a boolean over
computed data (health, clashes, COBie %, RFIs closed). Persist gate history; block advance on fail. The
`project-shell` already runs coord-boundary gates — this makes them data-driven and complete.

## D. RFIs / submittals / approvals (later slice)
First-class coordination objects beside BCF topics in the service: `/rfis`, `/submittals` with status,
assignee, due, linked elements, and an approval trail. Surface in the shell + Copilot.

---

## 4D MVP cut (this turn)
`schedule.ts` + `timeline-panel.ts`: **Generate sequence from model** + **CSV import**, a Gantt task list,
a **timeline scrubber + Play** that reveals/greys/highlights elements by date, and click-a-task-to-isolate.
Mapping by trade/category. Docked as the **4D** sidebar tab. Deferred: level/zone mapping, schedule
persistence, XER/MPP import.
