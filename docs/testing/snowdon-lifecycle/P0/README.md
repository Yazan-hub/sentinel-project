# P0 bid input pack: Snowdon Towers (SNW)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real tender.

This folder holds the inputs for phase P0 (bid response, ISO 19650-2 5.3) of the Snowdon lifecycle test. The authority for decisions is `docs/testing/SNOWDON_LIFECYCLE_ROADMAP_DRAFT_2026-10.md` (sections 2, 4 P0, 5, Appendix A). Every invented value in these files is marked SYNTHETIC.

## The five files, in order of use

1. `P0-01_Invitation_to_tender.md`: the client's invitation, with no EIR (decision 5). Basis: 5.2.3 and 5.2.4 without 5.2.1. Goes outside Sentinel, as a .pdf the founder approves while playing the client.
2. `P0-02_Pre-appointment_BEP.md`: the pre-appointment BEP text, items A to G of 5.3.2, with the anticipated requirements and the "not following ISO 19650" flag (Part E p.24). Goes into Sentinel: paste each `##` section into the same section of the BEP template in Documents, label version 1 "Pre-appointment (tender)".
3. `P0-03_Capability_and_capacity.md`: one sheet per task team (ARC, STR, MEP, SIT, INT) and the delivery team summary, 5.3.3 and 5.3.4. Sentinel has no place for it (DTCCA is ABSENT); BEP sections 2 and 9 point to it. Attached to the tender return outside Sentinel.
4. `P0-04_Mobilisation_checklist.md`: a cut-down subset of the CDBB 4.3 checklist, 5.3.5. Attached outside Sentinel; BEP section 5 cross-references it. It is run in P2 (mobilisation, 2026-11-16 to 2026-11-25).
5. `P0-05_Risk_register.md`: the one integrated risk register, 12 rows under the six 5.3.6 headings. Attached outside Sentinel; BEP section 3 cross-references it. The BEP carries no register of its own (Part 2 p.46).

## P0 order of steps

New project; the founder plays the lead. A Documents publish needs the state moves draft, shared, published and a version label.

1. Start state: hotmail creates a fresh project `snowdon-lifecycle` (code SNW) in office `snowdon-office`. `snowdon-towers` stays untouched as the Session SNOWDON record. Add gmail and user4 as leads and user3 as contributor.
2. The founder refreshes the Funnel (the public tunnel to the bridge on port 4100); Claude checks `/health`.
3. The founder, as client, approves `P0-01`; save it as a .pdf outside Sentinel.
4. Create the BEP from the template and paste `P0-02` section by section. It already carries the anticipated requirements and the non-ISO flag. Run Check integrity (local Ollama must be running; check it first).
5. Note what Sentinel offers for the no-EIR case (expected ABSENT).
6. Fill the READINESS declared answers; send the office snapshot from Revit for the measured ones.
7. Confirm BEP section 2 (nominations, from `P0-02`) and the cross-references to `P0-03` (sections 2, 9), `P0-04` (section 5) and `P0-05` (section 3).
8. Publish BEP version 1; Print/PDF. Assemble the tender response outside Sentinel from the BEP PDF plus `P0-03`, `P0-04` and `P0-05` (the four parts asked in `P0-01` section 5). List what Sentinel could not hold.

Known trap: F-SNW-1b. If the first Settings save on the new project is refused, only a browser reload recovers, and it loses the edits.

Done when: each of 5.3.1 to 5.3.7 has a place in Sentinel or a written ABSENT note; all 10 BEP sections are filled; Check integrity has run; version 1 is labelled "Pre-appointment (tender)"; no EIR exists in the project at the end of P0.

## What is still the founder's

- READINESS declared answers (17 items: people, process, standards). Answer them honestly; Claude does not fill them.
- Real office facts, only if he wants them in place of the SYNTHETIC names, hours and availability in `P0-02` and `P0-03`.
- Passwords: signing in to the four accounts (hotmail, gmail, user4, user3).
- The Funnel refresh, once per run after the bridge restarts.
- Approving `P0-01` while playing the client.
