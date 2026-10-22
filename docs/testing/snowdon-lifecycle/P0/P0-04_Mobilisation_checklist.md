# P0-04 Mobilisation checklist: Snowdon Towers (SNW)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real tender.

Delivery team: Snowdon Office (office key snowdon-office). Mobilisation window: 2026-11-16 to 2026-11-25 (SYNTHETIC). Nothing is produced until every line below is done (CDBB BEP p.22; Part 2 p.39).

This is a cut-down subset of the CDBB 4.3 mobilisation checklist (CDBB BEP pp.22-24). Group letters A to F and item ids are kept where an item is kept. Per CDBB, the checklist is run again at each work stage and when a new task team joins (CDBB BEP p.22). The last row (Journey) is Sentinel's own, not a CDBB item.

Accounts: **client** = yazanhijazeen32@hotmail.com (owner role). **IM** = yazanhijazeen32@gmail.com (lead role, information management). **TTL** = user4@gmail.com (lead role, task team leader, presses Share). **checker** = user3@gmail.com (contributor role). The Funnel is the public tunnel from this PC to the bridge on port 4100; only the founder refreshes it.

| Ref | Task | Owner | Done when |
|---|---|---|---|
| A1 | DTCCA (delivery team capability and capacity assessment) undertaken | IM | P0-03 capability sheets are attached to the tender return and the Readiness declared items 13 to 18 are answered |
| E3 | The four accounts are onboarded | client | All four sign in to the web app; the Members form lists client owner, IM lead, TTL lead, checker contributor |
| C5 | Network does not block exchange (the Funnel) | IM (founder refreshes) | With bridge 4100 up, /health answers and one page loads through the Funnel from the lead's PC |
| C1 | Software in place on every seat | IM | Sentinel add-in loads in Revit 2025.4; PC Settings tests all green; local Ollama answers |
| B1 | Configure the CDE | client (creates the project), IM (folders) | Project snowdon-lifecycle (code SNW) exists under snowdon-office, created by the client account so it is the owner; folder tree made with "+ Folder"; Journey "team" step done |
| D1 | Test shared resources | IM | Readiness shows "Container naming standard installed" met; UK 2021 National Annex codes set in the cde.suitability allowed list |
| B12 | Test access settings | client | Members show the four roles; viewer rows not run by choice (decision 15) |
| B3, B4, B8 | Test upload, format types and metadata | TTL | fixture fed-a.ifc and fed-b.ifc upload in the Files panel under 7-field ISO names and pass the naming check. Only IFC is tested here; other format types (PDF, DWG, .rvt) are not, so B4 stays partial |
| B9, B10, B11, B16 | Test the review chain and state transfer | client | review@n (3 steps) installed; one test container goes WIP, Shared, Published: checker check, IM authorisation (5.7.2), client acceptance (5.7.4); all four accounts on the ledger; one planned rejection raises its BCF topic |
| C2 | Each task team has tested its software | TTL | One Governed Publish per container team (ARC, STR, MEP, SIT) reaches v1 wip, or its rejection is logged; INT works inside ARC |
| E1, E4 | Task teams have the agreed capacity | TTL | Readiness item 12 "Task teams declared per discipline, each with a lead" is met |
| D3, D6 | Risk register reviewed | IM with client | Every P0-05 row has an owner and a status; the no-EIR assumption is answered by the client |
| F1 | Kick-off and education (5.5.1) | IM | ABSENT in Sentinel. A dated kick-off note with attendees is uploaded as a container; it covers scope, standards, CDE use, milestones M1 to M3 and the three-step chain |
| F2 | Training on shared resources (5.5.1) | IM | ABSENT in Sentinel. TTL and checker each run Scan and Governed Publish once with the Revit help open (the F1 key, not checklist item F1); the attendance note records it; Readiness item 15 answered |
| C6 | Back-up of project information containers | IM | ABSENT in Sentinel. A dated copy of the model files and of the database is kept off this PC, and the copy date is noted against risk R03 in P0-05. The daily RFC 3161 timestamp proves the ledger is unchanged; it is not a back-up |
| Journey | Ready to produce | IM | Project Journey shows team, standards, bep and tidp done (4 of 9), each with its evidence ref |

The mobilisation plan may include educating and training the delivery team (Part 2 p.45), and the lead delivers both under 5.5.1 (Part 2 pp.56-57). Sentinel has no screen for them, so they live in an uploaded note.

**Dropped CDBB items.** B2 merged into F2. B5 has no list in the source. B6 is covered by the Shared state in the chain line. B7: Sentinel sends no notification to the next approver; each one checks "My reviews" (roadmap Appendix A, F-G); P2 records it. B13 archiving is tested at close-out (P6), not here. B14 correspondence has no Sentinel module. B15 RFI was already run in Session SNOWDON. B17 watermarks do not exist in Sentinel. C3 is covered by A1. C4 has no EIR to align to (decision 5); shared resources are covered by D1. D2: no extra shared resources are proposed beyond the P0-02 BEP. D4 is a review at each work stage, not a mobilisation test; the roadmap does not yet plan it. D5 is folded into F1. E2 (cover for each role) is a risk, not a test: one person holds the passwords of all four accounts; see P0-05 R02. F3 is this checklist.
