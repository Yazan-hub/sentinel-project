# P1 appointment input pack: Snowdon Towers (SNW)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real appointment.

This folder holds the inputs for phase P1 (Appointment, ISO 19650-2 5.4) of the Snowdon lifecycle test. The authority for decisions is `docs/testing/SNOWDON_LIFECYCLE_ROADMAP_DRAFT_2026-10.md` (sections 2, 4 P1, 5). Its table "What Sentinel does today" for P1 was written on 2026-10-22, before the documents workspace (releases R1a to R3, 2026-10-24 to 2026-11-15). The steps below are written for Sentinel as it is now. Every invented value in these files is marked SYNTHETIC.

Status: drafted 2026-11-15. Not yet read by the founder; nothing of it is in Sentinel yet.

## The files, in order of use

1. `P1-01_Lead-drafted_EIR.md`: the client's EIR, drafted by the lead with the client (decision 5), one section per section of Sentinel's EIR template. Seven sentences the compiler should read and two it should refuse.
2. `P1-03_Teams_and_responsibility_matrix.md`: the five task teams to declare, the detailed responsibility matrix (5.4.2) and the container each team owns.
3. `P1-02_Confirmed_BEP_additions.md`: what changes in the BEP now that the EIR exists (5.4.1): the change list, the new text per section, the nominated people, the EIR clauses answered, two proposed changes to the client's naming, 12 LOIN rows, the appointment line.
4. `P1-05_MIDP.md` and `P1-05_MIDP_rows.txt`: the master information delivery plan (5.4.5), 7 containers by 3 milestones, 21 rows ready to paste.
5. `P1-04_Lead_EIRs_per_team.md`: the lead's exchange information requirements to each appointed party (5.4.3).
6. `P1-06_TIDPs.md`: a short task information delivery plan per team (5.4.4).
7. `P1-07_Appointment_letters.md`: "EXERCISE ONLY" appointment letters (5.4.6, 5.4.7). They stay outside Sentinel; the incorporation clause and the Information Particulars are marked "not verified" where the reference file does not reproduce them.

## Seats on snowdon-lifecycle

| Account | Role and party | Does in P1 |
|---|---|---|
| yazanhijazeen32@gmail.com | owner, Lead firm | Writes the EIR and the BEP; decides the Lead firm step |
| user4@gmail.com | lead, Lead firm | Sends documents for review (the sender never decides the Lead firm step); declared lead of the five teams |
| user3@gmail.com | contributor, Team ARC | Confirms for task team ARC |
| yazanhijazeen32@hotmail.com | viewer, Client | Accepts the EIR and the confirmed BEP |

## P1 order of steps

0. Carried over from P0, the founder's: approve `P0-01` while playing the client; fill the READINESS declared answers (17 items).
1. **The EIR.** gmail: Documents ▸ + New document ▸ the EIR template, title "SNW Exchange Information Requirements". Paste `P1-01` sections 1 to 7. In section 4 add a Naming block holding the client's seven fields, so the BEP can be compared against it. user4 sends it for review; gmail decides the Lead firm step (Issue); hotmail decides the Client step (Accept). Expected: "Accepted, A1" and "v1, Accepted C01".
2. **EIR to checks.** On the EIR: Compile to IDS. Expected: 9 requirement sentences read, 7 compiled, 2 refused with their reasons. A lead installs it as the project's IDS.
3. **Standards.** Settings ▸ Standards in force: the project reads the office's naming today. Save the project's own naming with role L and type DR allowed, so the names of `P1-03` part (c) pass. Contract and LOD matrix as in Session SNOWDON A4. Then "Generate from standards…" on the IDS row.
4. **Teams.** Declare the five teams of `P1-03` part (a): ARC, STR, MEP, SIT, INT. Mark STR, MEP, SIT and INT as "Not in Sentinel" (Deliverables ▸ Task teams ▸ the team ▸ the tick box): they have no seat, so a lead records what each one decided. This needs migration 0057 and web 1.0.125.
5. **The BEP goes back to draft.** gmail: SNW Pre-appointment BEP ▸ Review ▸ Back to draft (next revision). Outline ▸ Link an EIR… ▸ the EIR of step 1. This needs web 1.0.124: before it, only a BEP made from the comprehensive template could link an EIR, and Snowdon's BEP was written before that template existed.
6. **The BEP's new content**, from `P1-02`: the texts of part (b); in section 2 a table with a Person column (part c) and a responsibility matrix (`P1-03` part b); in section 3 the EIR link block with the clauses of part (d); in section 6 a Naming block and a Proposed changes block ▸ "Compare with the client's naming" (expected: the two changes of part e; type each reason); in section 7 the LOIN grid (part f) ▸ Compile to IDS (expected: 11 added, 1 already required) ▸ Install.
7. **Bind and read.** Bind section 2 to "Nominated people are project members" and "One responsible task team per element", section 7 to "Level of information need", section 6 to the container naming check. Read the Quality tab and the Summary.
8. **The MIDP.** Deliverables ▸ Paste a delivery schedule ▸ the content of `P1-05_MIDP_rows.txt` ▸ Preview ▸ Import 21 rows.
9. **Lead EIR and TIDP.** Enter team ARC's lead EIR (`P1-04`) and TIDP (`P1-06`) as documents. The other four teams' stay in this pack unless the founder wants them entered too.
10. **Confirm the BEP.** Review ▸ "Appointment indicated: open confirmation" (a note is asked, because no tender was selected in Sentinel for this BEP: "Awarded by letter P1-07 part 1, SYNTHETIC"). user4 sends it; user3 confirms for Team ARC; gmail records what STR, MEP, SIT and INT decided, taken outside Sentinel (who gave it, the day, where it is kept: the letters of `P1-07`), then signs off; hotmail accepts. Expected: "Accepted, A1 · Confirmed" and a version labelled "Confirmed C01".
11. Read the MIDP and responsibility checks; print the Summary; list what Sentinel could not hold.

## Known traps

- **Four of the five teams have no seat.** Closed on 2026-11-15 by the founder's "Yes, build it": a team marked "Not in Sentinel" is not owed a member, and a lead or owner who did not send the round records what the team decided, with who gave it, the day and where it is kept (migration 0057). An unmarked team with no member still stops the send, naming the team. user4 sends, so gmail records the four teams.
- The MIDP paste has no purpose column, and a comma splits a column, so no title holds one.
- Publishes from Revit carry S0 and no revision, so the MIDP's expected S2 will disagree. That is a finding, not a data error.
- `P1-01` sentence 7 (a space's LongName) compiles to a requirement with no property set; how the install and the viewer treat it is not verified.

## What is the founder's

- Reading this pack, above all `P1-01`: the founder approves the EIR while playing the client.
- The two carry-overs of step 0.
- The four teams with no seat: decided 2026-11-15, option (a), built (see Known traps). What is left is the founder's OK to apply migration 0057.
- A real public EIR to ingest once as the unrigged check of the compiler (roadmap P1; the founder picks the file).
- Signing in to the four accounts when a step needs another seat.

## Done when

The EIR is accepted by the Client before the confirmed BEP is sent, and Compile to IDS gave reasons for what it refused. Five teams are declared. The MIDP imports with every stage accepted. The BEP is accepted at the stage Confirmed beside its tender version, with the change list of `P1-02` part (a). Each of 5.4.1 to 5.4.7 has a place in Sentinel or a written ABSENT note.
