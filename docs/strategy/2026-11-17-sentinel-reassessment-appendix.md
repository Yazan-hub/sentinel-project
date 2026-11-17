# Sentinel reassessment, 2026-11-17: technical appendix

Supersedes `docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md`. The decision page is
`docs/strategy/2026-11-17-sentinel-reassessment-ar.html`. This file holds the evidence behind it.

Status tags (from `docs/handbook/00-INDEX.md:7-13`, with "absent" added):

- ✅ **run live**: proven in a live run or drill.
- 🟩 **built**: the code exists and builds, but it has not been run live.
- 🟨 **partial**: only part is built, or it is built but not switched on.
- ⬜ **absent**: there is nothing yet, or no evidence was found.

Scope of the evidence: 331 non-merge commits since 2026-10-19 (`git log --since=2026-10-19 --no-merges`),
migrations `WebApp/db/migrations/0044` to `0058`, and the Snowdon run logs in
`docs/testing/snowdon-lifecycle/`. No code was changed for this report. CI was not re-run for it.

## 1. What landed since 2026-10-19

| Area | Status | Evidence |
|---|---|---|
| Documents workspace R1a to R3 (BEP/EIR blocks, register, people, access, comments, review rounds, templates) | ✅ | Migrations 0049 to 0056. The `feat(r1c)`, `feat(r2a)`, `feat(r2c)`, `feat(r2d)` and `feat(r3)` commits (for example 378319cc, eca326b8, fedd8ddc). Drill logs are in `docs/testing/snowdon-lifecycle/R1a..R3/`. |
| Party invitations and code sign-in | ✅ | 0050, eca326b8, 7913f664; R2a run log |
| Review rounds, with the Client step recorded outside Sentinel | ✅ | 0053, 0054, 0055 and 0056 were applied and probed (`WebApp/db/migrations/probes/0053..0056_probe.sql`) |
| Task team outside Sentinel / owns no container | ✅ | 0057 and 0058 (F-RUN-7). 18ce6f52, 6096cd91, 692c80af. Web 1.0.127 (f5ccdf21) |
| Ledger verification (per-project chain, global tip, RFC 3161) | ✅ | 0045 and 0047. The audit pack was verified with `node WebApp/bridge/ledger-verify.mjs`: seal PASS, 444 rows PASS, 9 DigiCert timestamps PASS (`P0-P4-RUN_2026-11-16.md:70`). |
| AI privacy (office/project AI lock, name masking, no telemetry) | 🟩 web/bridge ✅ DB | Merge 99134176. Migration 0046 applied (probe 5/5, per the memory note). The Revit and web rows are still owed. |
| Human-error guards (risk tiers, ledgered tick reasons) | ✅ | 0048, drill GUARD (78cc6475) |
| Apply claim and idempotent retry, two-office isolation suite | ✅ | e8b5defc, drill CLM |
| Revert changeset and the applied-then-saved check | ✅ | 279433bc, drill REV |
| Official IDS 1.0 conformance | ✅ | 43985656, then 2fc90479. Viewer 286/26/1, bridge 285/28/0, IfcTester 288 of 313. |
| BCF file round trip (2.1 for ACC, 3.0) and the no-toll feed | ✅ | 44c3ff78, 0044 |
| CI legs for Revit 2021 to 2027 | 🟩 compile only | `.github/workflows/*.yml:63-65` (matrix 2021–2027) |
| Ops keeper (bridge, watcher, Funnel) and daily backups | ✅ B1–B4, ⬜ B5 restore | 33e3e93f, a842e9ad, 7676a872. The restore drill B5 is still owed. |

## 2. Snowdon lifecycle test (the freeze gate)

| Phase | Status | Evidence |
|---|---|---|
| P0 bid, P1 appointment, P2 mobilisation, P4 M1 acceptance | ✅ | `P0-P4-RUN_2026-11-16.md`, 70fb752b. Findings F-RUN-1 to F-RUN-18. F-RUN-1 to F-RUN-18 were fixed in web 1.0.126 to 1.0.128 (f5ccdf21, cb50fa5d). |
| P3 M2: naming, Governed Publish ARC v4 and STR v4 | ✅ | `P3-P4-RUN_2026-11-17.md:11-17`. Ledger #4173 to #4187. Delivery gate PASS. IDS 725/1800 passed (ARC), 90/1191 passed (STR), the rest kept as warnings. |
| P4 M2: three-step acceptance chain | ✅ | Same file, #4197 to #4203 |
| P3 M3: type edit, ARC v5 | ✅ | #4205 to #4209 |
| Federation Gate | ✅ ran, result FAIL | FG-01..05 fail, Raise is locked (`P3-P4-RUN_2026-11-17.md:16`) |
| 3D clash, M2 and M3 | ✅ | 6,836 elements, 4,333 clashes, 238 groups (deecf501) |
| MEP and SIT Governed Publish | ✅ refused, as designed | Proxies at 69% and 100% exceed the limit of 25% (#4226 to #4229, 6741de80) |
| Clash → issue path | ⬜ not exercised | Raise stayed locked behind the FAILing gate (`P3-P4-RUN_2026-11-17.md:80`) |

**Reading.** The governed chain works end to end: author, check, publish, three-party acceptance, a verified
audit pack. What fails is data and coverage, not the chain itself:

- Only 21 of 106 type names could be fixed automatically (F-LC-4).
- One architect contract refuses MEP and Site (F-RUN-16).
- A new office has no screen for writing naming rules (F-LC-1).

### Open findings from P3/P4

| ID | Severity | Note |
|---|---|---|
| F-LC-1 | high | There is no web editor for family/type naming rules. A new office cannot use the Naming Manager. |
| F-LC-2 | medium | A signed-in user cannot fork or publish a standards pack (the registry is written only by the machine credential). |
| F-LC-3 | low | Revit reads a new ruleset only after Project Setup, Save. |
| F-LC-7 | ops note | The computer-use tool pasted a DB connection string from the clipboard into Revit. It was cleared at once. The founder should clear the clipboard. |
| F-LC-8 | low | A hidden model stays in the clash set. |
| F-RUN-13 | medium | Build Office System still tells the user to run a CLI command (this breaks the no-CLI rule). |
| F-RUN-15 | medium | That Open platform deliveries are judged by another contract (F-SNW-4). |
| F-RUN-17 | medium | There is no scan report without Synchronize with Central (affects non-workshared models). |

## 3. The 2026-10-19 recommendations, point by point

| # | 10-19 recommendation | Now | Evidence |
|---|---|---|---|
| 1 | Harden the AI boundary: a profile without `send_code_to_revit`, fencing of untrusted text, a CI ban on code-exec tools | 🟨 | The AI lock and masking are built (99134176). No profile, guard or CI check naming `send_code_to_revit` was found in code: grep over `WebApp/bridge` and `.github` found it only in docs. **Still open, and still the top risk.** |
| 2 | Protected elements, AI default of no deletes, cap on element count | ✅ | Risk tiers and guards in 0048, drill GUARD |
| 3 | Compensating revert | ✅ | 279433bc, drill REV |
| 4 | Apply lease plus idempotency key; confirmed/lost after save | ✅ | e8b5defc, 279433bc |
| 5 | Identity: MFA, leaked-password protection, two-office RLS suite | 🟨 | The two-office suite exists (e8b5defc). No MFA or leaked-password change was evidenced. |
| 6 | CI legs for Revit 2024 and 2027 | 🟩 | Workflow matrix 2021–2027, compile only |
| 7 | Honest docs plus an IDS conformance statement | ✅ | 43985656, 2fc90479 |
| M1 | Hosted bridge, retire the Funnel | ⬜ | The bridge still runs on the founder's PC. A keeper restarts it (33e3e93f). |
| M2 | Third-party pen test, public security page, SOC 2 readiness | ⬜ | Nothing found in the repo |
| M3 | SSO (OIDC/Entra), task-team RBAC | 🟨 | Party, task team and per-document access are built (0050, 0052, 9a39bd3b). SSO is absent. |
| M4 | Public large-federation benchmark at 100k+ elements | 🟨 | 63k hospital and a 126k doubled set: iGPU 33 fps, clash 17–20 s (memory note `sentinel-2026-10-19-large-model-benchmark`). There is no single building over 100k and no RTX run. |

### New since 10-19 (not in the old report)

- **The documents workspace became the product's centre.** ISO 19650 BEP/EIR, rounds, parties and templates
  (§1) now make up most of the surface a buyer would see.
- **A single point of failure, plus a backup with no restore test.** The keeper and the daily backups depend on one
  Windows PC, and restore (B5) has never been run.
- **Clipboard leak via computer use** (F-LC-7). The secret-hygiene rules cover the repo but not the desktop.
- **Data quality, not the platform, now blocks a green federation.** See the Snowdon gate FAIL in §2.

## 4. Competitors (web pass, 2026-11-17, standard search)

Most sources are vendor pages, so treat them as claims.

| Product | 2026 change that matters for Sentinel | Source |
|---|---|---|
| Autodesk ACC / Forma | Point clouds in Model Coordination. Autodesk Assistant (natural-language Q&A over RFIs, submittals, meeting minutes). AI Insights shown at AU 2026. No IDS item found. | autodesk.com/blogs/construction/?p=21749 ; resources.imaginit.com (Jan 2026 updates) |
| BIMcollab | Nexus and Twin merged into one platform (tiers from 2026-05). The web release of 2026-08 added IDS cardinality and IFC 4.3 materials. | helpcenter.bimcollab.com/en/articles/326485-release-notes |
| Solibri | Office, CheckPoint, Site and Anywhere are moving to legacy status, with no new sales. IDS Editor and Validator are in the desktop product (26.4–26.6). | help.solibri.com/.../39899281429911 ; solibri.com/articles/solibri-ids-editor-release-notes-july-2026 |
| Revizto | 5.18 (Oct 2026): Draft Mode reviews, ISO 19650 title-block naming, 4× faster loading. **MCP server for AI assistants (Aug 2026).** Issue workflow automation. | constructiondive.com press release 2026-10-12 ; architosh.com 2026/08 |
| Dalux | Free viewer tier, Field Basic free. Only generic AI claims. | support.dalux.com ; capterra.com Dalux Field pricing |
| New: Kestrel Labs | Code-compliance checks inside Revit in about 30 s, linked to elements. $2.15M pre-seed. Spacial ($10M) is in the same lane. | architosh.com 2026/06 ; diginomica.com |

**Reading.**

- The 10-19 claim still holds: no incumbent fixes the authoring model under approval and then proves it with a
  timestamped ledger.
- The gap is narrowing on two sides:
  - Revizto now speaks MCP and ISO 19650.
  - BIMcollab and Solibri are both deepening IDS.
- Solibri retiring its cloud and lighter lines leaves room for an affordable checker.
- AI code-compliance entrants (Kestrel, Spacial) compete for the "AI checker inside Revit" story, not for governance.

## 5. Top risks (the decision page lists the same five)

1. ⬜ **Code-exec neighbour.** A community MCP with `send_code_to_revit` still sits in the founder's client, and
   there is no guard (§3 #1).
2. ⬜ **One PC.** The bridge, the Funnel and the backups all run on one Windows machine, with no restore drill (B5).
3. ⬜ **No external trust proof.** There is no pen test, no SSO and no security page (§3 M2, M3).
4. 🟨 **Onboarding needs the founder.** There is no naming-rule editor (F-LC-1), the user is sent to a CLI
   (F-RUN-13), and only one contract exists (F-RUN-16). A new office cannot reach a green gate alone.
5. 🟨 **Competitors converging.** Revizto's MCP plus ISO 19650 naming, and IDS depth in BIMcollab and Solibri.

## 6. Next three moves (inside the freeze: only fixes that block a phase, then the unfreeze)

1. **Close the freeze.** Exercise clash → issue: make one federation pass FG-01..05 on a trimmed set, or allow Raise
   on a failed gate under a lead's tick. Then declare P3/P4 complete.
2. **First work after the unfreeze is trust, not features:**
   - the `send_code_to_revit` guard and the CI ban;
   - the B5 restore drill;
   - a one-page security statement.
3. **Make onboarding self-serve:**
   - a web editor for naming rules (F-LC-1);
   - a screen in place of the CLI step (F-RUN-13);
   - an MEP/Site contract (F-RUN-16).

   Then run the external-user test.
