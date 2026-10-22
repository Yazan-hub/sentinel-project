# P0-03 Task team capability and capacity, and delivery team summary (SNW, Snowdon Towers)

SYNTHETIC, exercise only. Snowdon lifecycle test, not a real tender.

Prospective lead appointed party: Snowdon Office (Sentinel office key snowdon-office). Appointing party: Snowdon Developments (sample). Clauses: ISO 19650-2 5.3.3 (each task team) and 5.3.4 (delivery team summary).

## How to read this sheet

- 5.3.3 asks each task team to consider three things (Part 2 p.43): its capability and capacity to manage information, its capability and capacity to produce information, and the availability of IT. Part 2 p.24 adds the capacity test: "do you have enough human resource to do this on this project".
- Capability = can the team do it. Capacity = does it have enough people and time to do it.
- "SYNTHETIC" marks every invented value: people, hours, availability. "Evidence" marks real measurements from Session SNOWDON (docs/testing/SNOWDON_FULL_TEST_REPORT_2026-10.md, Timings and findings; SIMULATION_ROOM_RUN_2026-09-22.md, Session SNOWDON). Where no evidence exists, the sheet says "not run".
- The honest fact behind every sheet: all accounts are played by one person on one workstation. Named people below are SYNTHETIC stand-ins.
- Certification: Part 2 p.43 notes that task teams "can seek certification" from an independent third party. No team holds any. None is claimed.

## Shared facts for all five teams

**People and accounts.**

| Role | Account | Person |
|---|---|---|
| Information management (lead appointed party) | yazanhijazeen32@gmail.com | Yazan Hijazeen |
| Task team leader, every team (presses Share) | user4@gmail.com | SYNTHETIC: "Task Team Leader" |
| Task team checker, every team | user3@gmail.com | SYNTHETIC: "Task Team Checker" |

Review chain (decision 7): task team check (contributor) then lead authorization (lead, 5.7.2) then client acceptance (owner, 5.7.4).

**IT available (real, read 2026-10-22).** One laptop workstation. There is no second machine and no server.

| Item | Fact |
|---|---|
| CPU | Intel Core i9-13900HX, 24 cores / 32 threads |
| RAM | 31.7 GB |
| GPU | NVIDIA GeForce RTX 4060 Laptop GPU, plus Intel UHD (integrated). The web viewer has been tested on the integrated GPU only. A run on the RTX is owed. |
| Disk | C: 139.7 GB free of 929.3 GB |
| OS | Windows 11 Home 10.0.26300 |
| Authoring | Revit 2025.4 used for Snowdon. Revit 2023 to 2027 installed. |
| CDE and checking | Sentinel: Revit add-in (Revit 2021 to 2027), Node bridge on this PC, That Open web app 1.0.110, Postgres ledger with a daily RFC 3161 timestamp (a signed time proof from an outside service) |
| AI | Local Ollama (qwen2.5:7b installed). The "Ollama stopped" row (E3) was not run. |
| Remote access | The bridge reaches the web app through a Tailscale Funnel (a public tunnel to this PC). Only the founder may refresh it. |

**Shared limits.** One PC is a single point of failure for every team, the CDE bridge and the AI. If the PC is off, nobody can share or publish. F-SNW-1: the first "Save changes" on a new project is refused (412 stale version); the fix (b34baedd) is live only after the bridge restarts and the Funnel is refreshed. F-SNW-1b: the refresh button does not reload the panel. F-SNW-14: one person moved a container from WIP to Shared to Published with no review; there is no gate without a review standard. The same account raised, answered and approved its own RFI. F-SNW-16: Deliverables still showed all 7 rows "pending" after the ARC publish.

## ARC: Architectural and Facades models

Models: SNW_ARC_ZZ_XX_M3_A_0001 (93.8 MB on disk; the report says "98 MB", probably decimal MB) and SNW_FAC_..._A_0002 (50.3 MB). ARC has 55 sheets, 297 views, 222 families.

| Aspect | SYNTHETIC position | Evidence from the Snowdon run | Limits |
|---|---|---|---|
| Manage information | Leader and checker named above. SYNTHETIC: 1 modeller at 1.0 FTE (full-time equivalent) from 2026-11-16 to 2027-02-26. | Governed Publish accepted ARC v1 (wip) in about 50 s from dialog to snapshot, 4841 elements (ledger #3304 to #3311). The first ARC run was rejected on the model name (E1). | Facades Governed Publish not run. |
| Produce information | SYNTHETIC: the modeller has used the ISO container naming before. | Revit 2025 opened the model in about 90 s. IFC export about 4 to 5 min. Publish Sheets about 20 min: 55 of 55 exported, 0 registered (F-SNW-7: PDFs named by sheet number fail the 7-field container rule). The SN-01 sheet rule scored 0.0 % against Autodesk's numbering (55 REQUEST issues). Heal fixed 222 families in about 6 min, 0 failed (ledger #3293). | Heal rewrote all 222 families with no preview (F-SNW-3). Publish Sheets shows no progress and Cancel does nothing (F-SNW-6). Ghost Builder from A102.dwg proposed 2,846 elements but built nothing (F-SNW-9, the one failed row). IFC Pre-Flight flags 4184 of 4184 elements yet reads 93.4 % readiness. |
| IT availability | Shared workstation. | Web viewer opened ARC in 2.3 s (9.7 MB download 1.0 s, open 1.3 s). | The viewer Performance readout (10.5 s) is not valid: Chrome was throttled behind Revit. Re-measure owed. |

## STR: Structural model

Model: SNW_STR_..._S_0001 (26.6 MB).

| Aspect | SYNTHETIC position | Evidence from the Snowdon run | Limits |
|---|---|---|---|
| Manage information | Leader and checker named above. SYNTHETIC: 1 modeller at 0.5 FTE. | Governed Publish accepted STR (ledger #3454, #3455, #3459). | No timing was recorded. |
| Produce information | SYNTHETIC: experience with ISO naming and IFC export. | ISO-renamed copy exists. | STR IFC export time not recorded separately. |
| IT availability | Shared workstation. | Web viewer opened STR in 1.1 s (0.8 MB in 0.3 s). | Same single PC as every team. |

## MEP: HVAC, Plumbing and Electrical models (one team)

Models: SNW_MEP_..._M_0001 HVAC (21.2 MB), SNW_MEP_..._P_0001 Plumbing (39.8 MB), SNW_MEP_..._E_0001 Electrical (38.6 MB).

| Aspect | SYNTHETIC position | Evidence from the Snowdon run | Limits |
|---|---|---|---|
| Manage information | Leader and checker named above. SYNTHETIC: 1 modeller at 1.0 FTE across three models. | Governed Publish rejected HVAC on the delivery contract (ledger #3445, #3446): 0 IFCWALL, 37 of 37 elements are proxies (generic IFC objects with no real type). | One delivery contract per project (decision 6) does not fit MEP. F-SNW-12: a contract per discipline is needed. Plumbing and Electrical publish not run. |
| Produce information | SYNTHETIC: experience with MEP families and IFC export. | Revit Clash Manager across the federation: 4075 clashes (368 hard, 2459 medium, 1248 soft), 6 links. | No MEP model has passed a gate yet. Three models under one team is the heaviest load per person. |
| IT availability | Shared workstation. | None specific to MEP. | Not measured: opening all three MEP models with ARC linked on this PC. |

## SIT: Site and landscape model

Model: SNW_SIT_..._L_0001 (51.8 MB).

| Aspect | SYNTHETIC position | Evidence from the Snowdon run | Limits |
|---|---|---|---|
| Manage information | Leader and checker named above. SYNTHETIC: 1 modeller at 0.25 FTE. | ISO-renamed copy exists. | Governed Publish not run. |
| Produce information | SYNTHETIC: experience with site and landscape modelling. | None. | Not run. No evidence either way. |
| IT availability | Shared workstation. | None specific to SIT. | Not measured. |

## INT: Interior

INT owns furniture and finishes inside the ARC model. It has no own model and no own container. Its work is shared and published as part of SNW_ARC_ZZ_XX_M3_A_0001.

| Aspect | SYNTHETIC position | Evidence from the Snowdon run | Limits |
|---|---|---|---|
| Manage information | Leader and checker named above. SYNTHETIC: 1 interior designer at 0.5 FTE, working in the ARC model. | Covered only by the ARC publish (4841 elements in the snapshot). | INT cannot check, share or publish on its own: every INT change waits for an ARC container. Splitting responsibility for categories inside one model was not tested. |
| Produce information | SYNTHETIC: experience with furniture and finish families. | Web Browser lists 26 categories and 6,388 elements across the published set; INT elements are not counted separately. | No INT-only count exists. |
| IT availability | Shared workstation. | Same as ARC. | Same as ARC. |

## Delivery team capability and capacity summary (5.3.4)

**Guidance gap.** Part 2 p.44 says "There is no Insight for this clause". The ISO clause text is not reproduced in any source held here. The only guidance is Part 2 p.18: the lead should "Summarize the delivery team's capability and capacity to manage and produce information". This summary follows that sentence and nothing more. Sentinel has no place for it (roadmap P0: "Delivery team summary (DTCCA): ABSENT"), so it goes as text in BEP sections 2 and 9.

| Team | Models | SYNTHETIC capacity | Shown in Snowdon | Not shown |
|---|---|---|---|---|
| ARC | ARC, FAC | 1.0 FTE | Publish accepted (50 s, 4841 elements); IFC 4 to 5 min; sheets exported | Sheets registered; FAC publish; Ghost Builder |
| STR | STR | 0.5 FTE | Publish accepted | Timings |
| MEP | HVAC, PLB, ELE | 1.0 FTE | Clash run (4075) | Any accepted publish; HVAC rejected |
| SIT | SIT | 0.25 FTE | Nothing | Everything |
| INT | inside ARC | 0.5 FTE | Via ARC only | Anything on its own |
| Information management | all | Yazan Hijazeen, SYNTHETIC 0.5 FTE | Ledger, review chain, timestamps exist | A real separate check (F-SNW-14, self-approved RFI) |

**Run tally (real).** 51 pass, 1 fail, 4 n/a, 15 not run (commit 0c530243). Of 7 Governed Publish runs: 2 accepted (ARC, STR), 1 rejected (HVAC), 4 not run (PLB, ELE, FAC, SIT).

**Overall position.**
- Capability to manage information: shown for ARC and STR. Not shown for MEP, SIT and INT.
- Capability to produce information: Revit, IFC and sheet export work on the Snowdon ARC model. Not run on the other models. Naming of sheets and the MEP contract are open.
- Capacity: SYNTHETIC total about 3.75 FTE. In fact one person plays every role. Part 2 p.39 asks: "are the people with those skills available for the duration of the appointment?" The honest answer is no, not without the recruitment step in the mobilisation checklist.
- IT: one laptop workstation with an RTX 4060 Laptop GPU and an integrated GPU. Shown: Revit opened ARC in about 90 s, and Clash Manager ran with 6 links. The web viewer loaded ARC and STR only, on the integrated GPU. A 7-model web load is untested. No backup machine.

Each gap above is carried into the P0 risk register and the P0 mobilisation checklist. This sheet does not hold its own risk list. Part 2 p.46 lists, as an example risk assumption, that information risks belong in a single register: "the BEP should not feature a supplementary risk register".
