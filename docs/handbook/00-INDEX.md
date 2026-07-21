# The Sentinel Handbook — source of truth

This is the single, honest record of what Sentinel *is*, what is *actually built*, and *why* every major decision was made. It exists so you can understand your own system deeply and explain it to anyone — a tester, a client, an interviewer — without overstating it.

> **This handbook is grounded in the code, not in a pitch.** Every capability carries a status tag. If it says `✅ Verified`, we watched it work. If it says `⬜ Planned`, it does not exist yet. That discipline is the point: Sentinel's whole thesis is *truth on the record* — the documentation has to hold itself to the same standard.

## Status legend

| Tag | Meaning |
|---|---|
| ✅ **Verified** | Proven working in a live run or test this project can point to |
| 🟩 **Built** | Implemented and in the codebase; not independently re-verified in this doc |
| 🟨 **Partial** | Partially built, or built but not yet activated |
| ⬜ **Planned** | Designed or aspirational — not built |

## Contents

| # | File | Read it to understand… |
|---|---|---|
| 01 | [`01-overview.md`](01-overview.md) | What Sentinel is, the thesis, and how it's positioned |
| 02 | [`02-architecture.md`](02-architecture.md) | The desktop→cloud pipeline, the bridge trust boundary, the stack |
| 03 | [`03-security-and-ledger.md`](03-security-and-ledger.md) | RLS, the immutable ledger, and the *current* honest security posture |
| 04 | [`04-core-workflows.md`](04-core-workflows.md) | The Governed Publish loop + BCF live-sync, step by step |
| 05 | [`05-capability-status.md`](05-capability-status.md) | The honest what's-real-vs-planned map |
| 06 | [`06-glossary.md`](06-glossary.md) | Every term you need to speak about Sentinel fluently |
| 07 | [`07-decisions.md`](07-decisions.md) | The *why* behind every major call, with the trade-off |
| 08 | [`08-deployment-playbook.md`](08-deployment-playbook.md) | How to roll Sentinel into an architectural office |

## How this relates to the rest of `docs/`

This handbook is the **curated front door**. The deeper, older docs in `docs/` remain the reference material it draws from (`ARCHITECTURE.md`, `SECURITY_AUDIT_2026-07.md`, `CAPABILITY_MAP.md`, `PILOT_DEMO_RUNBOOK.md`, `STRATEGIC_REVIEW_2026-07.md`, …). Where the two disagree, **this handbook wins** — it's the reconciled, status-tagged truth. The `graphify-out/` knowledge graph remains the queryable map of the *code*.

## Keeping it honest over time

When you change the system, update the status tag here in the same commit. A `Verified` claim that quietly becomes false is worse than no claim. When in doubt, downgrade the tag.

*Last reconciled: 2026-07-21.*
