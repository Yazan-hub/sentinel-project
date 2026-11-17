# Run sheet: lifecycle test P1 to P4 (the freeze of 2026-11-16)

Recommendation 1 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html`: no new features until P1 to P4 have run.
This sheet is the order. The authority for each phase stays its own pack.

**Status 2026-11-17:** P0, P1, P2 and P4 for milestone M1 ran on 2026-11-16 in another session
(`P0-P4-RUN_2026-11-16.md`, findings F-RUN-1 to F-RUN-18, fixed in web 1.0.126 and 1.0.127). Left: **P3** (milestones M2
and M3, the named design changes) and P4 for M2 and M3, then driving F-RUN-5 to F-RUN-18 on screen.

## Before the first session (on the bridge PC, about 30 minutes)

1. Pull the branch `claude/sentinel-project-assessment-k7jxip` (or master after it is merged). `cd WebApp`,
   `npm install`, `npm test` once.
2. Restart the bridge with the new code (`tools\bridge-start.cmd`, answer Y).
3. Reliability, first run: `docs/RELIABILITY.md` steps A1 and A2 (the keeper), B1 to B4 (backups).
4. Publish the web app (`npm run publish`, the next version after 1.0.127) so the published seats answer That Open's
   `help`; reload the three published-app seats and sign them in again.
5. Done on 2026-11-16: the P0-01 approval and the READINESS answers (SYNTHETIC, from the P0 pack).

## The phases

| Phase | Pack | Driven by | Model and effort (CLAUDE.md) | Done when |
|---|---|---|---|---|
| P1 Appointment (5.4) | `P1/README.md` | — | — | Done 2026-11-16 |
| P2 Mobilisation (5.5) | the roadmap's P2 section | — | — | Done 2026-11-16, with findings (F1, F2, C6 have no place in Sentinel) |
| P3 Design production (5.6), M2 and M3 | The roadmap's P3 section and decision 14 (FG-02 with Naming Manager, FG-04 with one grid edit); Revit signed in as user4 | Claude in Revit and the web; the founder's Revit steps | Sonnet, medium; a blocking defect fixed with Opus, high | Each milestone published through Governed Publish, its federation and clash runs recorded |
| P4 Delivery and acceptance (5.7), M2 and M3 | Appendix A of the roadmap; review@3 as installed on 2026-11-16 | Four seats | Sonnet, medium | M2 and M3 accepted by the client through the chain; the audit pack downloaded and verified (M1 done 2026-11-16) |

Each phase writes its run log beside its pack (`P1/P1-RUN_<date>.md`, as P0 did). Findings are numbered F-LC-n and go
into the roadmap's gap list. Only a defect that blocks the rest of a phase is fixed between phases (decision 13).

## After P4

Then, in this order: the two-step sign-in for leads and owners (`docs/RELIABILITY.md` D), the Revit sync gate spike
(`docs/superpowers/specs/2026-11-16-revit-sync-gate-spike.md`), the engine upgrade once That Open answers about the
Collider (`docs/strategy/2026-11-16-thatopen-engine-upgrade.md`). P5 and P6 wait for the review in
`P5-P6_REVIEWER_PACK.md`.
