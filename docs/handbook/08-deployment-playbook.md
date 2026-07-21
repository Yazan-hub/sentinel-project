# 08 · Deployment playbook

> **Honesty flag:** there is **no formal "BDS BIM Implementation Master Plan"** — so the hardware baseline, the phased rollout, and the role definitions below are **`⬜ placeholder / proposed defaults, not yet validated`**. They are a starting skeleton for *you* to fill from real pilot experience. Do **not** quote these figures to a client as established fact until you've validated them. What *is* grounded (the prerequisites, the runbook links) is marked 🟩.

## Prerequisites (grounded 🟩)

To run Sentinel end-to-end in an office you need:
- The **bridge** running (`npm run bcf:serve`) + the **outbox watcher** (`npm run bridge:watch`) — see [`02-architecture.md`](02-architecture.md).
- The **Revit add-in** built + deployed (`dotnet build -p:RevitVersion=2024`, Revit closed).
- A **Supabase project** (URL + service key) and a **That Open platform** token in `config/.env`.
- The two **gate rulesets** in place (naming + element IDS) — see `docs/BDS_GATE_CONFIG.md`.
- For onboarding a first project, follow `docs/PILOT.md` (15-minute setup) and `docs/PILOT_DEMO_RUNBOOK.md`.

## Hardware baseline — ⬜ PLACEHOLDER (proposed, not validated)

*These are reasonable draft targets for a BIM authoring + Sentinel workstation, not measured requirements. Validate against a real machine before publishing.*

| Tier | CPU | RAM | GPU | Use |
|---|---|---|---|---|
| Minimum | `⬜ TBD` (e.g. i7) | `⬜ TBD` (e.g. 16 GB) | `⬜ TBD` | small models |
| Recommended | `⬜ TBD` (e.g. i7/i9) | `⬜ TBD` (e.g. 32 GB) | `⬜ TBD` (e.g. RTX 3060+) | day-to-day LOD 300 |
| Bridge/server host | `⬜ TBD` | `⬜ TBD` | — | can be a modest always-on box; loopback today |

> Note: the **bridge** itself is lightweight (a small Node service); heavy resource needs come from **Revit authoring + 3D viewing**, not Sentinel. Confirm before quoting.

## Phased rollout — ⬜ PLACEHOLDER (proposed 4-phase shape)

*A sensible structure to adapt; the specifics/durations are unvalidated.*

1. **Phase 1 — Foundation** `⬜` — stand up the bridge + Supabase + platform token; load the office's naming + IDS rulesets (or the BDS reference); confirm the Governed Publish loop runs on one sample model.
2. **Phase 2 — Training** `⬜` — walk the team through the ribbon, the gate, and reading a verdict/BCF issue; agree enforcement levels (naming=reject, data=warn to start).
3. **Phase 3 — Pilot** `⬜` — one real project through the full loop; tune the ruleset to the firm's actual standard; measure (verdicts, issues raised/closed).
4. **Phase 4 — Expansion** `⬜` — roll to more projects/teams; consider hosting the bridge (needs the F2 auth gate armed + TLS — see `docs/SECURITY_F2_ACTIVATION.md`); move from the BDS reference toward an office **Base template**.

## BIM roles — ⬜ PLACEHOLDER

*Fill from how the office actually works.*

| Role | Responsibility in Sentinel | Notes |
|---|---|---|
| Information Manager / BIM Lead | Owns the rulesets + enforcement levels; reads the audit trail | `⬜ TBD` |
| BIM Coordinator | Runs Governed Publish; triages BCF issues | `⬜ TBD` |
| Author (Architect/Engineer) | Fixes flagged issues, re-publishes | `⬜ TBD` |
| Reviewer / Approver | Advances ISO 19650 states | `⬜ TBD` |

## Remote / cross-timezone operation (grounded intent 🟩)

Sentinel is designed to be run and supported **remotely** (e.g. managing an office in one country from another). The bridge + Supabase are the shared backbone; the add-in is the only per-workstation install. Cross-machine coordination (the BCF/event feed) already supports multiple instances. *(Production remote hosting still needs the F2 gate armed + TLS — ⬜ planned.)*

---

**To finish this page:** replace every `⬜ TBD / placeholder` with real numbers and role definitions once you've run a pilot and measured them. Until then, when asked about deployment, say plainly: *"the technical rollout is proven; the packaged hardware/role/phase playbook is being finalized from live pilot data."* That's true and credible.
