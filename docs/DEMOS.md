# The three Sentinel demos

Date 2026-11-16. Recommendation 7 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html`. Three fixed demos, five
minutes each, each repeatable, each proving one sentence. Pick by audience:

| Demo | The sentence it proves | Show it to |
|---|---|---|
| 1. Governed Publish | "A model is published only if it passes, and the failures go back into Revit." | BIM coordinators, modellers, BIM managers |
| 2. Delivery Gate on That Open | "Anything uploaded to the platform is judged in seconds against the contract, with nothing installed by the sender." | Leads who receive consultants' models; That Open's community |
| 3. A BEP that checks itself | "The BEP's clauses are checks that run, and its approval is a recorded round up to the client." | Information managers, clients, anyone who has written a BEP in Word |

Before any demo: the bridge answers (`/health` 200 locally and through the Funnel; `docs/RELIABILITY.md`), you are
signed in, and you rehearse on a **scratch project**, never on a project whose ledger you want clean: ledger rows can
never be deleted.

---

## Demo 1: Governed Publish (Revit to verdict to Revit)

Detailed preflight and a headless fallback: `docs/PILOT_DEMO_RUNBOOK.md`. Two screens: Revit (the modeller) and the web
app (the coordinator).

**Setup (T-15):** a scratch project with the base standard installed on its office (Packs ▸ base-standard ▸ Install on
office, or Settings ▸ Standards in force), so naming, IDS and contract are in force. A small model bound to that project
(Sentinel ▸ Project Setup) with two known gaps, for example a wall without `FireRating` and a door without it. Revit
signed in (Standards ▸ Sign in).

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Revit | Show Panel: the live checks | "Sentinel checks the model while you work, against the office's standard." |
| 0:40 | Revit | Governed Publish | "One button: export, gate, judge, record." |
| 1:20 | Revit | The dialog: refused, the failures named, the ledger line | "Refused. Nothing was stored. It says exactly why, and the refusal itself is on the record." |
| 2:00 | Web | Project Files ▸ On hold; Coordination ▸ Issues | "The file waits on hold, and each failing requirement became an issue on the elements." |
| 2:40 | Revit | BCF Issues ▸ Fix in Revit: type the values, Check, Apply | "The issue comes back into Revit with the elements. Sentinel checks the values before writing them." |
| 3:30 | Revit | Governed Publish again | "Passed. Now it is a version, with its verdict." |
| 4:10 | Web | Coordination ▸ CDE: the version, its ✓ badge, the ledger entry | "Refused, fixed, accepted: who, when, under which standard, on a ledger nobody can edit." |

**Reset:** none needed on a scratch project; archive it afterwards.
**If Revit fails on the day:** the headless dry-run in `docs/PILOT_DEMO_RUNBOOK.md` §2 shows the same verdicts and
issues from the bridge.

---

## Demo 2: the Delivery Gate on That Open (no install for the sender)

Script source: the hackathon storyboard `docs/hackathon/2026-10-04-video-script.md`. One browser with two tabs: That
Open's CDE app and the Sentinel app, in the platform project linked to a Sentinel project (Settings ▸ General ▸ Platform
project).

**Setup (T-15):** the Sentinel Delivery Gate component enabled on the platform project, the two automations ("Sentinel
gate — new file" and "— new version") on, the contract installed (Settings ▸ Standards in force ▸ contract), and two
IFC files ready: one that fails the contract (for example many `IfcBuildingElementProxy`), one that passes.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Sentinel ▸ Settings ▸ Standards in force | The contract and its line "also on the platform as sentinel-contract.json" | "The lead installs one contract in Sentinel. It travels to the platform by itself." |
| 0:40 | That Open CDE app | Drag in the failing IFC | "A consultant uploads straight into the platform. Nothing to install." |
| 1:20 | Automations ▸ View runs | The run: Refused, the failure in words | "Seconds later the platform has judged it against the contract." |
| 2:00 | That Open CDE app | The version's labels and `<name>.gate.json` | "The verdict is written on the file itself." |
| 2:40 | Sentinel ▸ Coordination ▸ CDE | Platform deliveries: the card, the ledger number | "And on Sentinel's ledger, in the contract's words." |
| 3:20 | That Open CDE app | Upload the passing IFC as a new version | "Fixed and uploaded again." |
| 4:00 | Sentinel | The card: Passed, the sha256 | "Passed. The same fingerprint as on the ledger. Two judges, one contract, one record." |

**Watch out:** the verdict on the platform does not need the bridge, but the ledger number on the card does: the bridge
copies each run onto the ledger on its next sync (every 60 s when `THATOPEN_GATE_COMPONENT_ID` is set, or
`node bridge/platform-gate-ledger.mjs --once`). Until then the card says "not on this project's ledger yet".

---

## Demo 3: a BEP that checks itself, approved by the client

Built in releases R1a to R3 (2026-10-24 to 2026-11-15); the steps are those of the P1 pack
(`docs/testing/snowdon-lifecycle/P1/README.md`). Two seats: the lead (signed in) and the client (a second browser
profile, signed in as a viewer with the appointing party).

**Setup (T-15):** a scratch project with members: you as owner (lead firm), one more lead to send, the client as viewer
(Members ▸ Invite…). A BEP made from the office's comprehensive template, with section 2 holding a table of nominated
people and a responsibility matrix, section 6 a naming block, section 7 a short LOIN table (three rows), and section 2
bound to "Nominated people are project members".

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Documents ▸ the BEP ▸ Outline | Scroll the blocks: people, matrix, naming, LOIN | "This BEP is built from tables and rules, not paragraphs." |
| 0:50 | Quality tab | The checks: a nominated person who is not a member is named | "A clause only counts when it is bound to a check that runs. This one fails, and says who." |
| 1:30 | Outline ▸ the people table | Put an active member in that row, back to Quality | "Name someone who is really on the project, and the clause passes. The document tests reality." |
| 2:10 | LOIN block ▸ Compile to IDS ▸ Install | The requirements added | "The information we promised becomes the rules every model is judged by." |
| 2:50 | Review tab | Send for review (the second lead), decide the lead firm step | "Approval is a round: who must decide is fixed when it opens." |
| 3:40 | Client's browser | Open the BEP, read, Accept | "The client reads it any time, and decides the last step here." |
| 4:20 | Summary | The one-page summary and the version label | "Accepted, labelled, and every decision on the ledger." |

**Watch out:** the sender of a round never decides the lead firm step (the database refuses it), so the second lead
sends and you decide. A team with no member stops the send unless it is marked "Not in Sentinel". An invited person
who has not signed in yet does not count as a member ("is invited and has not signed in yet"), so put a name in the
failing row that you know is not on the project, and have an active member ready for the fix.

---

## After each demo

Write one line in the run log of the project you used: date, demo, audience, what broke. A demo that broke twice is a
defect, not bad luck.
