# Sentinel hackathon video — storyboard v2 (draft for the founder's approval)

Made 2026-09-29 after the founder's verdict on the first cut: "does not show the power of sentinel at all and what one can do with sentinel". Three storyboards were written from different angles (problem→proof, a project's life, three people) and judged against the hackathon criteria; this is the synthesis. Nothing here is recorded yet.

## Scores of the three angles

| Angle | Usefulness | Creativity | Polish feasible | Criteria | Honesty | Note |
|---|---|---|---|---|---|---|
| problem-proof | 5 | 4 | 3 | 5 | 4 | Best hook: "A wrong model reached the client. Who approved it?" It also has the best ending: a receipt check where changing one word makes it fail. Both are grafted into the final. Weaknesses: it keeps Governed Publish in Revit, which takes minutes to export and, while signed in, shows the 'HTTP 403' gate row (H5 still owed). About 12 of its 30 shots still need proving. The side-by-side fingerprint shot is weaker than it looks: the Sentinel card shows only the first 12 characters, and the platform splits the fingerprint across two labels. |
| project-life | 4 | 3 | 2 | 5 | 3 | Shows the most features: readiness, clash, plans, On hold and COBie. But the shots last only 6-7 seconds and about 16 of them need proving, so it plays like a feature list, which is close to the founder's complaint. Honesty risks: the exact clash has never been run on the live ASTR26 model, the web On hold list has never been clicked, and Governed Publish carries the 403 risk. Its live floor-plan shot (B27) is proven and good on camera, so it is grafted into the final. |
| three-people | 5 | 4 | 4 | 5 | 4 | WINNER. Following the designer, the BIM manager and the client shows a judge right away who needs Sentinel, and the client side is naturally on That Open. It leaves out on purpose the Revit export that shows the 403, plus clash, On hold and the stage gate. Two over-claims to fix. First, it marks the contract mirror line LIVE, but the capability page still marks it 🟨. Second, it says 'the designer sends a corrected version', but Desktop/hackathon-video v2.ifc is v1 with its 224 generic objects deleted (602 → 378 elements), not a fix made in Revit. Its fingerprint shot is weak for the same reason as in problem-proof. |

## Sentinel: "Three people, one set of rules" (final cut)

**Logline:** Dozens of firms send files to a building project, and nobody can prove who checked or approved them. In this film a designer in Revit, a BIM manager in Sentinel and a client on That Open work on one tower, aster-tower. Sentinel checks every handoff between them, gets each file approved, checks the hand-over data and records every decision with a receipt anyone can check.

**The whole thing in one breath:** "Sentinel is the rulebook and the referee for a building project's files. The manager writes the rules once. Every file is checked the moment it arrives, in Revit or on That Open. A second person approves it. Every decision gets a receipt nobody can fake."

**Runtime:** 4:38. If 6.1 is cut, hold R and E 5 s longer, which gives 4:38 again (the minimum is 4:33).
**Built from:** the three-people storyboard. Grafted in:
- from problem-proof: the problem cold open (0.1) and the receipt tamper check (6.2);
- from project-life: live floor plans (5.3) and the red "before" COBie shot (5.1).

**Dropped because they are risky or not proven live:**
- Governed Publish and the IFC Delivery Gate in Revit (the 403 row);
- exact clash;
- the web On hold list;
- the stage gate;
- the 4D, 5D and 6D panels;
- the Owner view (kept as a reserve);
- the side-by-side fingerprint shot (the card shows 12 characters only).

**Frame rules**
- **Web shots:** 1920×1080, Chrome at 125 %, with the That Open header and the platform.thatopen.com address bar always visible.
- **Revit and terminal shots:** they take 75 % of the frame, below the Chrome top strip, so the platform header and URL stay visible.
- **Close-ups:** enlarged insets over the lower half of the frame. Never crop the whole frame.
- **Chapter bar** along the bottom, with the current chapter lit: 1 Set the rules · 2 Work in Revit · 3 Check the delivery · 4 Approve · 5 Hand over · 6 Prove it.
- **Badges** appear the first time each piece is seen: "Revit connection" at 2.1, "That Open automation" and "That Open cloud component" at 3.2.
- **Waits** are sped up 4× with a "4×" tag, and the picture freezes for 2 s on each verdict.
- **Voice-over** runs at about 2.5 words per second. Captions stay on screen because judges often watch muted.

**How to read the Status column**
- **PROVEN** means it already worked in a recorded test (the code in the column is the proof to quote).
- **CHECK** means it is proven, but look at it once on today's data before recording.
- **PROVE** means it has never been clicked through live, so it must pass a dry run before recording day.

| # | Time | Chapter | On screen (click path · project) | Caption (≤12 words) / voice-over | Status · evidence |
|---|---|---|---|---|---|
| 0.1 | 0:00–0:08 | Opening | platform.thatopen.com ▸ Welcome Project ▸ CDE app ▸ file list of IFC versions; slow push-in on one row | **Many firms send models. Who checked them? Who approved them?** / VO: "Dozens of firms send model files to a building project. Who checked them? Who approved them? Nobody can prove it." | PROVEN (That Open CDE list, B14) |
| 0.2 | 0:08–0:15 | Opening | Sentinel app ▸ aster-tower ▸ Project Files ▸ Open 3D (ASTR26-AST-ZZ-XX-M3-A-0001, hand-over version) ▸ slow orbit | **Sentinel checks every file and proves every decision, inside That Open.** / VO: "Sentinel runs inside That Open. It checks every file against the project's rules and proves each decision." | PROVEN (3D viewer at 60 fps, B19, B20) |
| 0.3 | 0:15–0:21 | Opening | Three panels over the dimmed tower: Revit + Sentinel pane "Designer" (from 2.1), Sentinel app "BIM manager" (from 1.2), That Open CDE app "Client" (from 3.1). Arrows between them; the chapter bar fades in | **One tower. Three people. One set of rules.** / VO: "One tower. Three people: the designer, the BIM manager, the client. One set of rules." | Edit only |
| 1.1 | 0:21–0:28 | 1 Set the rules | Activity bar ▸ Projects (hub) ▸ aster-office, with aster-tower and aster-villa grouped under it | **Set the rules once for the office. Every project follows.** / VO: "The BIM manager sets the rules once, on the office. Every project under it follows." | PROVEN (B2, B3). CHECK that the hub shows the grouping (seen in B23, not a test step) |
| 1.2 | 0:28–0:37 | 1 Set the rules | aster-tower ▸ Settings ▸ Standards in force. Inset: naming@1 and ruleset@5 (from aster-office), ids@3, contract@1 (project, 9cc32c96f815…), publish@2, roi@1, with plain labels "names", "data checks", "what a delivery must contain" | **Every rule file has a version number and a fingerprint.** / VO: "Names, data checks, the delivery contract. Each rule file has a version and a fingerprint." | PROVEN (B3, B5; web block seen 2026-09-29) |
| 1.3 | 0:37–0:45 | 1 Set the rules | Standards in force ▸ contract ▸ Install JSON… ▸ Desktop/hackathon-video/contract.json ▸ inset of the line "✓ contract@n installed … also on the platform as sentinel-contract.json contract@n". Overlay in plain words: "walls, doors, slabs must exist · at most 5 % generic shapes · walls carry their standard data" | **The delivery rules copy themselves to the client's That Open project.** / VO: "The manager installs the delivery contract. It copies itself to the client's project on That Open." | CHECK (B6, B14; the capability page still marks it 🟨). If the file is unchanged, the line may read "already on the platform as …". The founder decides whether to re-install (a new version changes every later verdict to @n) or film the existing block |
| 1.4 | 0:45–0:52 | 1 Set the rules | aster-office ▸ Documents ▸ READINESS ▸ versions v1 → v3. Inset: "3 met / 8 violations" → "8 met / 3 violations" | **Sentinel scores the office against ISO 19650: 3 items met, now 8.** / VO: "Sentinel also scores the office against ISO 19650, item by item. Three met, now eight." | PROVEN (Simulation room 2026-09-22, Acts 1, 2 and 5; audit 514) |
| 2.1 | 0:52–1:00 | 2 Work in Revit | Revit 2024 ▸ AST_ASTR26_Aster Tower_yazan.hKNTHU.rvt ▸ Sentinel tab ▸ Coordinate ▸ Show Panel: rules in force, health, "next step n of m". **Badge: Revit connection** | **In Revit, the designer sees the same rules and health score.** / VO: "In Revit, the designer sees the same rules, the model's health, and the next step." | PROVEN (B4, B5, B8) |
| 2.2 | 1:00–1:05 | 2 Work in Revit | Standards & Build ▸ Standards ▾ ▸ status "Signed in as … — the ledger records your e-mail" (e-mail blurred) | **Everyone signs in. Every change carries their name.** / VO: "Everyone signs in, so every change carries their own name." | PROVEN (B15, B16). The founder signs in off camera |
| 2.3 | 1:05–1:20 | 2 Work in Revit | Validate ▸ Naming Manager ▸ proposed rows ▸ inset of one row's note (function, material, measured thickness) ▸ ⚡ Fix ▸ inset "Recorded: ledger #… · receipt …" | 1:05 **Sentinel suggests correct names from the model's own facts.** 1:13 **One click renames it, recorded under the designer's name.** / VO: "Wrong type names? Sentinel suggests the correct name from the model's own facts: function, material, measured thickness. One click renames it, and the change is recorded under the designer's name." | PROVEN (B16: 99 of 142 proposed; ledger #1093 under the founder's e-mail). CHECK: re-scan first; the bridge must be up |
| 2.4 | 1:20–1:35 | 2 Work in Revit | Coordinate ▸ BCF Issues ▸ topic "Pset_WallCommon.LoadBearing ×10" ▸ double-click (isolates the walls) ▸ Fix in Revit ▸ Resolved, with the receipt line | 1:20 **The manager's issue opens in Revit, on the exact walls.** 1:28 **Fix in Revit fills the data and closes the issue.** / VO: "The manager raised an issue: walls missing their load-bearing data. It opens in Revit on the exact walls. Fix in Revit fills it in and closes the issue, with a receipt." | PROVE on this topic (proven on doors: Simulation room Act 3, 42/42 fixed). Reserve if it fails: ROI Dashboard or Heal Loaded Families |
| 2.5 | 1:35–1:47 | 2 Work in Revit | Split screen. Left: select a wall ▸ BCF Issues ▸ ＋ New issue from my Revit selection. Right: Sentinel ▸ aster-tower ▸ Coordination ▸ Issues, where the new row appears (name blurred) | **A question raised in Revit lands on the manager's board.** / VO: "It works the other way too. The designer selects a wall, raises a question, and it lands on the manager's board under their name." | PROVEN (B17, B18) |
| 3.1 | 1:47–1:54 | 3 Check the delivery | platform.thatopen.com ▸ Welcome Project ▸ CDE app ▸ drag the refused IFC (a copy of v1 under a clean ISO name, e.g. ASTR26-AST-ZZ-XX-M3-A-0002.ifc) into the list (4×) | **The model is delivered to the client's project on That Open.** / VO: "Now the model is delivered to the client's project on That Open." | PROVE: in B14 a script sent the files. Check that one drag by hand starts "Sentinel gate – new file" |
| 3.2 | 1:54–2:02 | 3 Check the delivery | Automations: "Sentinel gate – new file" and "– new version" on Sentinel Delivery Gate **1.0.4** ▸ ⋮ ▸ View runs ▸ the run goes from running to a verdict (4×). **Badges: That Open automation · That Open cloud component** | **A That Open automation runs Sentinel's cloud component. Verdict in seconds.** / VO: "A That Open automation starts Sentinel's cloud component. It checks the file against the contract in seconds." | PROVEN (B14: 5 s to a verdict; B26 at 1.0.4), once the founder re-points both automations to 1.0.4 |
| 3.3 | 2:02–2:13 | 3 Check the delivery | Run detail, frozen 2 s. Inset: "[WARNING] Refused — contract@n (aster-tower) — IFCBUILDINGELEMENTPROXY 224/602 (37%) exceeds 5%". Plain-words box underneath | **Refused: 37 % are generic shapes. The rules allow 5 %.** / VO: "Refused. Thirty-seven percent of the objects are generic shapes, not real walls, doors or slabs. The contract allows five." | PROVEN (B14; v1 has 224 generic objects out of 602) |
| 3.4 | 2:13–2:21 | 3 Check the delivery | CDE app ▸ the file ▸ labels sentinel_gate fail · sentinel_contract · sentinel_failures 1, and `<name>.gate.json` beside it (inset) | **The verdict is written on the file itself.** / VO: "The verdict is written on the file itself, as labels and a report everyone can see." | PROVE where the CDE app shows labels (never filmed). If they are hidden, show only the .gate.json and shorten the shot |
| 3.5 | 2:21–2:28 | 3 Check the delivery | Sentinel ▸ aster-tower ▸ Coordination ▸ CDE ▸ Platform deliveries card "Refused — contract@n — 1 failure" (inset) | **The manager sees the same verdict on Sentinel's board.** / VO: "The manager sees the same verdict on Sentinel's board, without opening the file." | PROVEN (B24–B26). The card reads the platform directly; its "ledger #" line needs the 60 s poller |
| 3.6 | 2:28–2:42 | 3 Check the delivery | CDE app ▸ same file ▸ upload new version (v2 = the same model without the generic shapes) ▸ View runs "SUCCESS Passed — contract@n (aster-tower)" (4×) ▸ cut to the Sentinel card "Passed · ledger #…" | **Corrected version: passed, against the same rules, and recorded.** / VO: "A corrected version, with the generic shapes removed, goes up as a new version. Same rules, same automation: passed. And the pass goes on Sentinel's record." | PROVEN (B14, B26 #1164). Do NOT say it was fixed in Revit |
| 4.1 | 2:42–2:51 | 4 Approve | Sentinel ▸ aster-tower ▸ Coordination ▸ CDE board ▸ the hand-over version's card in WIP (passed verdict) ▸ Share → ▸ it moves to Shared "under review, step 1 of 1". Columns labelled in plain words | **Work in progress, shared, published: only checked files move forward.** / VO: "Files move through the ISO 19650 states: work in progress, shared, published. Only checked files move forward." | PROVE on aster-tower (B9, B13 on b13-review). Needs the card in WIP with a passed verdict and a review policy (the founder's decision) |
| 4.2 | 2:51–3:05 | 4 Approve | Incognito window, second account (the reviewer) on platform.thatopen.com ▸ Sentinel app ▸ My reviews (1) ▸ Approve with a note ▸ inset "Approved step 1 of 1 … published · ledger #…" ▸ back on the board, the card is in Published | **A second person approves. Nobody approves their own work.** / VO: "Publishing needs a second person. The reviewer approves on That Open, and only then is the file published. Nobody approves their own work." | PROVEN (B13: #1067, #1069; rule "the submitter does not review their own share"). PROVE that the second account reaches the app on the platform. Fallback: b13-review, unarchived and labelled honestly |
| 4.3 | 3:05–3:13 | 4 Approve | A card with no passed check ▸ Publish → ▸ the reason field on the card (inset) ▸ Cancel | **No passed check? Publishing needs a written reason, kept forever.** / VO: "No passed check? A lead can still publish, but only with a written reason, kept forever." | PROVEN (B9, B13). Show the field; do not submit |
| 5.1 | 3:13–3:21 | 5 Hand over | Project Files ▸ Open 3D the earlier ASTR26 version (no hand-over data) ▸ Lifecycle ▸ COBie 7D ▸ Assets ▶ ▸ "0/168 assets complete" ▸ tick Only incomplete (red gaps) | **Before hand-over, every door and window needs four facts. None here.** / VO: "Before hand-over, facilities need four facts on every door and window. The earlier version has none." | PROVE (bridge measured 0/168 in B28; the panel has never been clicked in a browser). Assets ▶ saves a snapshot to the project |
| 5.2 | 3:21–3:35 | 5 Hand over | Open 3D the hand-over version ▸ COBie 7D ▸ Assets ▶ ▸ "[n]/168 assets complete" in green ▸ untick Only incomplete ▸ click a door row (isolates it) ▸ COBie (export) | **Hand-over version: maker, serial, warranty, install date on every asset.** / VO: "The hand-over version: all [n] complete. Click a row to find the door in the building, and export the COBie file for the facilities team." | PROVE. Needs the hand-over version (see prep). Say the number the panel actually shows |
| 5.3 | 3:35–3:43 | 5 Hand over | Same model ▸ BIM Tools ▸ Browser ▸ ▦ Plans ▸ L04_FFL ▸ Exit to 3D | **Floor plans for every storey, cut live from the same model.** / VO: "Floor plans for every storey, cut live from the same model." | PROVEN (B27) |
| 6.1 | 3:43–3:48 | 6 Prove it | A platform project with no contract ▸ View runs "Not checked — no contract on the platform project — install one in Sentinel" | **No rules installed? It says Not checked. Never a fake pass.** / VO: "No contract installed? It says Not checked. Never a fake pass." | PROVEN (B14; exact text in the component). OPTIONAL: cut if no uncontracted project is covered by the automations |
| 6.2 | 3:48–4:01 | 6 Prove it | Terminal under the Chrome top strip: anonymous `POST /receipt/aster-office/verify` with receipt.json ▸ `"matches": true` (inset). Then receipt-edited.json (verdict word flipped) ▸ `"matches": false` in red, frozen 2 s | 3:48 **Every decision gets a receipt. Anyone can check it.** 3:55 **Change one word, and the check fails.** / VO: "Every decision gets a receipt. Anyone can check it, without logging in. Change one word, and the check fails." | PROVEN (D2, B8: aster-office #702 true; flipped verdict false). The token must never be on screen |
| 6.3 | 4:01–4:08 | 6 Prove it | Revit ▸ Standards & Build ▸ ROI Dashboard ▸ "… gate runs → … EUR at 90 EUR/h · roi@1" | **Hours saved, counted from the record. No invented numbers.** / VO: "Sentinel counts the hours it saved from its own record. No invented numbers." | PROVEN (B11) |
| 6.4 | 4:08–4:17 | 6 Prove it | platform.thatopen.com ▸ Apps & Components: the Sentinel app and Sentinel Delivery Gate beside That Open's own parts; inset: Automations list on 1.0.4. All three badges together | **Built on That Open: app, cloud component, two automations, Revit.** / VO: "All of it runs on That Open: an app, a cloud component, two automations, and a Revit connection." | PROVEN (B14, B26). CHECK the exact menu path |
| R | 4:17–4:28 | Close | Six tiles over the dimmed tower, with the header visible: Set the rules · Work in Revit · Check every delivery · Approve · Hand over · Prove it | **Set rules. Work in Revit. Check. Approve. Hand over. Prove it.** / VO: "Set the rules. Work in Revit. Check every delivery. Approve. Hand over. Prove it." | Edit only |
| E | 4:28–4:38 | Close | End card over the dimmed live frame: "Sentinel — ISO 19650 information management, built on That Open", plus the community profile URL | **Sentinel. Every file checked, approved and proven.** / VO: "Sentinel. Every file checked, approved and proven. Built on That Open Platform." | Needs the community profile URL |

## Reserve shots (same length, all proven)
Use one of these if a PROVE shot fails its dry run:
- **ROI Dashboard.** Caption: "Time saved, counted from the record." (B11)
- **Deleted items on aster-tower.** Caption: "Deleted files wait with who and when. Nothing is erased." (B22; do not click Restore)
- **Deliverables "Issued, never planned (1)".** Caption: "Every file is checked against the delivery plan." (Simulation room Act 3, B27)
- **Stage rail preview "GATE PASS".** Do not press Run gate. Caption: "The project moves stage only on measured facts." (B11)
- **Federation Gate banner "PASS · 1 model".** Caption: "Before clashes, Sentinel checks the models agree." (B21, B23)
- **Owner view.** Only if its tiles are filled, not "—". Crop the Est. value and Est. carbon tiles.

## Evidence sheet: plain answers when judges ask for more
- **"Does the check really run on That Open?"** Yes. The Sentinel Delivery Gate cloud component (6ab97f72…, version 1.0.4) is started by two That Open automations, one for a new file and one for a new version.
  - Proof: test B14 (a verdict in 5 seconds, refused and passed) and B26 (record entry #1164).
- **"Is the 37 % real?"** Yes. The refused file has 224 generic objects out of 602. The contract allows 5 %. The passed file is the same model without those 224 objects (378 elements).
- **"How can we trust the record?"** Every decision has a receipt. Anyone can check it without logging in; change one word and the check fails.
  - Proof: receipt #702 on aster-office, tests D2 and B8.
- **"Is Revit really connected, under real names?"** Yes. A rename was recorded under the founder's own e-mail (entry #1093, B16). An issue raised in Revit appears on the web and isolates the same wall (B17).
- **"Can someone approve their own file?"** No. The rule is "the submitter does not review their own share".
  - Proof: test B13, with two accounts. Approvals #1067 and #1069 published the file; rejection #1071 opened an issue; a viewer and an earlier approver were refused.
- **"Where is ISO 19650?"**
  - The file states WIP, Shared, Published, Archived (B9, 20/20 checks).
  - The office readiness score, v1 → v3 (Simulation room, 2026-09-22).
  - The rule files, each with a version and a fingerprint (B3, B5).
- **"Is the hand-over data real?"** The check is real: it looks for manufacturer, serial number, install date and warranty on every door and window (B28 measured 0 of 168 before). The values in the demo model are demo values filled in for this film.
- **"What is built but not shown?"** Exact clash on real shapes, 4D programme, 5D cost, 6D carbon, and Publish Sheets from Revit. They are built and tested on the bridge, but not yet clicked through live, so they are left out.
- **Where the records are:**
  - docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md (tests B14 and later);
  - docs/CAPABILITY_MAP.md;
  - plus the ledger numbers and run IDs written down during the take.

## Prepare before recording (in order)

1. DONE 2026-09-29: both automations moved to 1.0.4 (B30). Gate 1.0.5 (report fix) is published; move both automations to it before recording, so no run shows 'the report could not be written'.
2. Founder decisions, written down before the dry run: (a) re-install contract.json on camera (it may become contract@2, or the line may say 'already on the platform'), or film the existing Standards block; (b) install a one-step review policy on aster-tower naming the gmail account as approver and add it as a member, or use b13-review after unarchiving it; (c) save or discard the Revit rename and Fix in Revit changes; (d) allow the COBie CSV download.
3. DONE 2026-09-29: aster-tower's hand-over version exists — ASTR26-AST-ZZ-XX-M3-A-0001.ifc v3 (live, wip), COBie 168/168 measured by the bridge, SAMPLE values (B30, ledger #1187). v2 (0/168) stays openable for the red 'before' shot (5.1). Still to check in a browser: COBie 7D ▸ Assets ▶ on v3 shows 168/168.
4. The hand-over version went in by the CLI intake (B30). For shot 4.1 it must be in WIP with a passed verdict — it is (v3, wip, gate PASS).
5. Prepare the upload files. Copy v1.ifc to a clean ISO name without ' v1', for example ASTR26-AST-ZZ-XX-M3-A-0002.ifc, and keep v2.ifc ready to upload as its new version. Keep contract.json in the same folder.
6. Services: start the bridge with the platform poller on, turn the public relay on (tools/public-bridge-on.cmd, plus the Funnel toggle after any bridge restart), and open Revit 2024 with the Aster local file and the add-in.
7. Founder signs in himself (the agent never types passwords): That Open, the Sentinel app (bottom right, every visit), the second account in an Incognito window, and Revit (Standards ▾ ▸ Sign in).
8. Revit dry run: re-scan Naming Manager and confirm there are still proposed rows (2.3). Check that the 'Pset_WallCommon.LoadBearing ×10' topic isolates walls in the open model, and that Fix in Revit resolves it (2.4). Do one raise-issue round trip (2.5). Open the ROI Dashboard (6.3).
9. Web and platform dry run:
- Hub grouping (1.1).
- Contract install line (1.3).
- A drag-upload by hand in the CDE app starts the 'new file' automation (3.1).
- Find where the CDE app shows the labels and the .gate.json (3.4).
- Share →, then My reviews in the Incognito window, then Approve (4.1–4.2).
- Publish → shows the reason field; press Cancel (4.3).
- COBie 7D on both versions, including the row click and the export (5.1–5.2).
- ▦ Plans (5.3).
- The exact path to Apps & Components (6.4).
- A platform project with no contract that the automations cover (6.1); cut 6.1 if there is none.
Write down every ledger number and run ID.
10. Receipt: off camera, fetch aster-office receipt #702 into receipt.json. That fetch needs the token, which must never be on screen. Make receipt-edited.json with the verdict word flipped. Test the anonymous POST verify once on each file (true, then false).
11. Clean frame: a new Chrome profile with no bookmarks bar and no Claude extension (so no debugging bar or copper border), Chrome zoom at 125 %, a 1920×1080 OBS canvas and the taskbar hidden. Put the Revit and terminal sources below the Chrome top strip. Blur list: the sign-in pill, Revit's 'Signed in as', member lists, the name column in the record strip, and the second account's e-mail.
12. Record by location, not in film order: first all That Open CDE and automation shots (0.1, 3.1–3.4, 3.6, 6.1, 6.4), then Sentinel web (1.x, 3.5, 4.x, 5.x, 0.2), then Revit (2.x, 6.3), then the terminal (6.2). Move the mouse slowly.
13. Edit:
- Styled .ass captions of about 48 px on a semi-transparent box.
- The chapter bar and the three badges.
- 4× speed tags on waits and 2 s freezes on every verdict.
- Enlarged insets instead of full-frame crops.
- Voice-over from the VO lines (Clipchamp text-to-speech, or Windows 'Mark'), made even with loudnorm.
- Output H.264 crf 18 at 1920×1080 with an audio track.
Check the runtime is between 4:33 and 4:38.
14. Before submitting, fill the evidence sheet with the fresh ledger numbers and run IDs from the take. After recording, tidy up: note any contract version bump, close Revit without saving if that was decided, and leave the review policy as decided.

## Risky shots (dry-run first)

- 3.1: dragging a file into the CDE app by hand has never been done; in B14 a script sent the files. If the 'new file' automation does not fire, the whole chapter 3 fails, so dry-run it first.
- 3.4: where the CDE app shows the labels sentinel_gate, sentinel_contract and sentinel_failures has never been filmed. The fingerprint is split across two labels, sentinel_sha256_a and sentinel_sha256_b.
- 1.3: the contract mirror line is still 🟨 on the capability page. Re-installing an unchanged file may say 'already on the platform', or a new contract version may change the @n in every later verdict.
- 2.4: Fix in Revit is proven only on doors (Simulation room Act 3), not on the LoadBearing wall topic. Its elements must be in the open Aster model.
- 2.3: Naming Manager may show few proposed rows, because the founder's earlier rename (B20) may already have corrected most names. Re-scan first.
- 4.1–4.2: the review chain has never run on aster-tower. It needs a review policy, the second account as a member, a WIP card with a passed verdict, and the second account opening the Sentinel app on the platform, which is unproven.
- 5.1–5.2: the COBie 7D panel has never been clicked in a browser. It needs the new hand-over version, and the old version must still open. Assets ▶ saves a snapshot to the project. The voice-over must say the number actually shown.
- 3.6: the corrected v2 file is v1 with its 224 generic objects deleted. The voice-over must not say it was fixed in Revit.
- 3.5 / 3.6: the ledger number on the Platform deliveries card can take up to 60 s (poller); wait before cutting.
- 6.1: 'Not checked' needs a platform project with no contract that the automations cover. Cut the shot if there is none.
- 6.2: in the terminal shot, the token must never appear on screen. Use the proven aster-office #702 receipt, not an untested new one.
- 6.4: the exact path to Apps & Components on the platform has not been confirmed.
- Left out on purpose: Governed Publish and the IFC Delivery Gate in Revit (the 'Not recorded — HTTP 403' row while signed in, H5 owed), exact clash on ASTR26 (never run), the web On hold list, Run gate, and the 4D/5D/6D panels.

## New short description for the entry form

Sentinel is an app on That Open Platform that keeps a building project's files in order, the ISO 19650 way. The BIM manager sets the rules once. A Sentinel cloud component, started by two That Open automations, checks every IFC that arrives within seconds and writes the verdict on the file. In Revit, the Sentinel add-in shows the same rules, suggests correct names and fixes flagged elements. A second person must approve a file before it is published. Hand-over (COBie) data is checked on every door and window, and every decision gets a receipt that anyone can check.
