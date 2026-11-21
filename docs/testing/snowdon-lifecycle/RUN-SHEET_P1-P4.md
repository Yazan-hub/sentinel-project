# Run sheet: lifecycle test P1 to P4 (the freeze of 2026-11-16)

Recommendation 1 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html`: no new features until P1 to P4 have run.
This sheet is the order. The authority for each phase stays its own pack.

**Status 2026-11-21:** P0, P1, P2 and P4 for milestone M1 ran on 2026-11-16 (`P0-P4-RUN_2026-11-16.md`, findings
F-RUN-1 to F-RUN-18, fixed in web 1.0.126 and 1.0.127). **P3 and P4 for M2 and M3 ran live on 2026-11-17**
(`P3-P4-RUN_2026-11-17.md`: ARC v4/v5 and STR v4 published, three review steps passed for both, 4333 clashes, audit
pack verified, findings F-LC-1 to F-LC-8), on the interface before UX slices 1-7. Left: driving F-RUN-5 to F-RUN-18 on
screen, and, if wanted, a re-run of P3/P4 on the simplified interface (the steps below), which would also confirm the
one flagged label in P4 step 2.

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
| P3 Design production (5.6), M2 and M3 (ran live 2026-11-17, `P3-P4-RUN_2026-11-17.md`, F-LC-1 to F-LC-8) | The roadmap's P3 section and decision 14 (FG-02 with Naming Manager, FG-04 with one grid edit); Revit signed in as user4 (More > Sign in) | Claude in Revit and the web; the founder's Revit steps | Sonnet, medium; a blocking defect fixed with Opus, high | Each milestone published through Publish (slide-out > Publish tools > Publish model), its Coordination check (Models > Clash > Run gate) and clash runs recorded |
| P4 Delivery and acceptance (5.7), M2 and M3 (ran live 2026-11-17, same log) | Appendix A of the roadmap; review@3 as installed on 2026-11-16 | Four seats | Sonnet, medium | M2 and M3 accepted by the client through the three review steps (Documents > Files); the audit pack downloaded (Settings > Advanced > Ledger and audit) and verified (M1 done 2026-11-16) |

Each phase writes its run log beside its pack (`P1/P1-RUN_<date>.md`, as P0 did). Findings are numbered F-LC-n and go
into the roadmap's gap list. Only a defect that blocks the rest of a phase is fixed between phases (decision 13).

## P3 and P4 for M2 and M3: the steps, on the simplified interface

Places and labels updated 2026-11-19 for the simplified interface (UX slices 1-7); see docs/ux/.

Revit paths: the ribbon has Sentinel, Check, Fix, Issues, Publish, Build, More; the slide-out holds Checks, Changes, Build tools, Publish tools (`docs/ux/ribbon-coverage.md`, `revit-words.md`). Web paths: Home, Models, Documents, Issues, Settings (`web-coverage.md`, `web-words.md`). Steps done under a contributor or viewer account: some tabs (Settings > Project, Settings > Standards library, Documents > Proposed changes, Reports > Tender and Owner view) are hidden for that role unless "Show all tools" (right of the Settings tab bar) is ticked (`role-hiding.md`).

P3, each milestone (M2, M3):

1. Revit as user4: More > Sign in; More > Project Setup, save (the Sentinel pane picks up new Project standards only after this; the pane's refresh button keeps the old version).
2. If the office has no type naming rule: web Settings > Standards library, install the standard on the office (a fork of a pack is refused; install worked in the earlier run). Settings > Standards library is a lead or owner tab.
3. M2, named change FG-02: slide-out > Checks > Naming Manager on ARC; confirm the set of proposed changes (it is recorded in History).
4. M2, FG-04: one grid edit in Revit (Sentinel's Build tools are not needed for it); M3, the named change: edit one door type (type properties), save.
5. Publish: Publish button, or slide-out > Publish tools > Publish model, on ARC (and STR, bound with More > Project Setup, if it changed). Check the Pre-publish check result (formerly IFC Delivery Gate; slide-out > Publish tools > Pre-publish check), the Data requirements (IDS) count, and the version in History.
6. Coordination check (formerly Federation Gate): web Models > Clash > Run gate, then run Models > Clash; record both. Groups sent as issues appear in Issues.
7. Anything that fails and must be fixed: Fix button (Proposed changes to approve, with undo; slide-out > Changes). Reading the model in the web: Documents > Files > Open 3D; Waiting for approval (the old holding area) is at Documents > Files.

P4, each milestone (M2, M3), four seats:

1. Share ARC and STR (lead, user4): Documents > Files, the board card, Share (a reason box may ask for one); the review starts.
2. Step 1, task team check (user3); step 2, lead authorization (owner; the sharer cannot decide it); step 3, client acceptance (Client, viewer): each on the card's review line in Documents > Files. Check the file reaches Published and History records each step. (Not confirmed: the coverage map also calls this line "Review desk"; confirm the label on screen.)
3. Audit pack: Settings > Advanced > Ledger and audit > Audit pack download (lead or owner), then `node WebApp/bridge/ledger-verify.mjs <pack>`; the founder gives the download OK first.

## After P4

Then, in this order: the two-step sign-in for leads and owners (`docs/RELIABILITY.md` D), the Revit sync gate spike
(`docs/superpowers/specs/2026-11-16-revit-sync-gate-spike.md`), the engine upgrade once That Open answers about the
Collider (`docs/strategy/2026-11-16-thatopen-engine-upgrade.md`). P5 and P6 wait for the review in
`P5-P6_REVIEWER_PACK.md`.
