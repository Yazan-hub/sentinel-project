# Construction and handover: a review pack for a contractor and a facilities manager

Date 2026-11-16. Recommendation 6 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html`.

**Why this exists.** The founder's own practice stops at construction documents. Phases P5 (construction-phase
information) and P6 (close-out and handover) of the Snowdon lifecycle test were designed from guidance (UK BIM
Framework, CDBB), not from practice (`docs/testing/SNOWDON_LIFECYCLE_ROADMAP_DRAFT_2026-10.md` sections P5, P6). Before
anything more is built there, one or two people who do this work should look at it: a contractor's BIM or
information manager, and a facilities or asset manager on the client side.

**Rule until the review is done:** nothing new is built for P5 or P6. Defects found by the lifecycle run are recorded.

## The session (60 minutes, screen share)

| Minutes | Part |
|---|---|
| 0–5 | What Sentinel is, in one sentence (the 10-second line in the report, section 2) |
| 5–25 | Walk through what exists (below), on the Snowdon project, without selling |
| 25–55 | The questions (below), in the reviewer's words; write the answers down as said |
| 55–60 | "What would make you use this on a job?" and "What would make you refuse it?" |

Afterwards: one page of notes in this folder (`P5-P6_REVIEW_<name>_<date>.md`), and each answer that changes a
design becomes a line in the roadmap's gap list (section 6), with the reviewer named.

## What exists today, to show

| Area | What it does | State |
|---|---|---|
| Tender from the model | Bill of quantities taken off the governed model, a tender issued, bids entered against it, an award; the tender keeps the take-off and the rates it was priced from, and says how the model moved since issue | Issued in Snowdon (9 lines); no bid entered there |
| Cost 5D and Carbon 6D | Quantities from the model at a named revision; rates and carbon factors as versioned packs; the change between two revisions | Run on Snowdon with demo rates; negative quantities found (F-SNW-5) |
| 4D | A programme (CSV) against the model; each task's information ready, late, at risk, or not in the MIDP | Run with a generated sequence; a CSV programme not yet run |
| Contractor information | A contractor can be a member of the project and register model versions, judged like everyone's | Partial: no separate appointment for the contractor |
| COBie 7D | Each maintainable asset and its four FM fields measured from the governed IFC; export | Snowdon: 0 of 807 assets complete (a design model) |
| Owner view | Read-only: readiness, value, carbon, open items, the asset register | Shown on Snowdon |
| Hand-over gate | Passes only with issues and RFIs closed and COBie at least 95 % complete | Built, not reached |
| Archive and audit pack | Containers archived one by one; the project's audit pack: every decision, who, when, under which standard | Partial: no "final version" marker |
| Lessons learned | — | Absent |

## The questions

**Contractor (construction phase)**

1. When you take over the design team's model, what do you check first, and what makes you reject it?
2. Do you re-model, or build on the design model? Who owns the model during construction?
3. What does a contractor's information delivery plan look like on your jobs: who writes it, who approves it?
4. Would you price a tender from a bill of quantities taken off the model? What would you need to trust those
   quantities (classification, measurement rules, the revision)?
5. How do you link the programme to the model today, if at all? Is "information ready, late, at risk" per task useful,
   or is it noise?
6. Which approvals during construction need a record you could show in a dispute: RFIs, technical queries, design
   changes, as-built sign-off?
7. What do your clients ask for at handover, and when do they ask (at the start, or at the end)?

**Facilities or asset manager (handover)**

8. Which asset data do you actually use after handover? COBie, a spreadsheet of your own, a CAFM import?
9. Of the fields Sentinel measures (serial number, manufacturer, installation date, warranty), which matter, and
   which are missing?
10. Who should fill them, and when: the subcontractor at installation, the contractor at handover?
11. Is a "hand-over gate" (no handover until the data is complete) something you could enforce, or would it only be
    a report?
12. What would you need from the record of decisions (the ledger) years later: who approved what, under which
    standard?
13. What does "the final version" of the information model mean to you, and who should declare it?
14. What would a useful lessons-learned record hold, and who would ever read it?

## What changes depending on the answers

| If they say | Then |
|---|---|
| Contractors re-model rather than build on the design model | P5 is about receiving and judging the contractor's own models (Governed Intake), not about pricing ours |
| Quantities from the model are not trusted for pricing | The tender stays a comparison tool; the cost work stops |
| The FM team uses its own spreadsheet or CAFM | The COBie gate measures their fields, through a mapping, instead of COBie's |
| A hand-over gate cannot be enforced | It becomes a dated report on the ledger, not a gate |
| The record is what they value most | The audit pack and the final-version marker come before any other P6 work |
