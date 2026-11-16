# Run sheet: lifecycle test P1 to P4 (the freeze of 2026-11-16)

Recommendation 1 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html`: no new features until P1 to P4 have run.
This sheet is the order. The authority for each phase stays its own pack.

## Before the first session (on the bridge PC, about 30 minutes)

1. Pull the branch `claude/sentinel-project-assessment-k7jxip` (or master after it is merged). `cd WebApp`,
   `npm install`, `npm test` once.
2. Restart the bridge with the new code (`tools\bridge-start.cmd`, answer Y).
3. Reliability, first run: `docs/RELIABILITY.md` steps A1 and A2 (the keeper), B1 to B4 (backups).
4. Publish the web app (`npm run publish`, version 1.0.126) so the published seats answer That Open's `help`; reload
   the three published-app seats and sign them in again.
5. The founder's two carry-overs from P0: approve `P0/P0-01_Invitation_to_tender.md` while playing the client, and
   answer the 17 declared READINESS questions.

## The phases

| Phase | Pack | Driven by | Model and effort (CLAUDE.md) | Done when |
|---|---|---|---|---|
| P1 Appointment (5.4) | `P1/README.md` (ready, 11 steps) | Claude on the four seats; the founder signs in and decides as client | Sonnet, medium; a blocking defect fixed with Opus, high | `P1/README.md` "Done when" |
| P2 Mobilisation (5.5) | To write after P1, from the roadmap's P2 section and P1's results | Claude drafts, the founder reads | Sonnet, medium | Every 5.5 item has a place in Sentinel or a written ABSENT note |
| P3 Design production (5.6), M1 to M3 | To write after P2; the roadmap's P3 section; Revit signed in as the task team leader | Claude in Revit and the web; the founder's Revit steps | Sonnet, medium | Each milestone published through Governed Publish, its federation and clash runs recorded |
| P4 Delivery and acceptance (5.7) | To write with P3; Appendix A of the roadmap (the three-step chain) | Four seats | Sonnet, medium | One milestone accepted by the client through the chain; the audit pack downloaded and verified |

Each phase writes its run log beside its pack (`P1/P1-RUN_<date>.md`, as P0 did). Findings are numbered F-LC-n and go
into the roadmap's gap list. Only a defect that blocks the rest of a phase is fixed between phases (decision 13).

## After P4

Then, in this order: the two-step sign-in for leads and owners (`docs/RELIABILITY.md` D), the Revit sync gate spike
(`docs/superpowers/specs/2026-11-16-revit-sync-gate-spike.md`), the engine upgrade once That Open answers about the
Collider (`docs/strategy/2026-11-16-thatopen-engine-upgrade.md`). P5 and P6 wait for the review in
`P5-P6_REVIEWER_PACK.md`.
