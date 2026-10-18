# Sentinel: technical, market and security evaluation

**Date:** 2026-10-19 · **Code state:** `master` at b5f7e608 (web 1.0.91, 44 migrations, MCP server v1.1 with 17 tools)

**How this was made:**
- Three research passes, each routed by need:
  - Codebase facts (Sonnet, medium effort).
  - Named-competitor research (Sonnet, medium effort).
  - Wide market and GitHub scan (Haiku, medium effort).
- Synthesis and judgement were done separately (Opus).
- Skills used: competitive-platform-analysis (tiers) and competitive-report-structure (decision-first layout).
- Raw research notes stay in the session scratchpad. Sources are listed in Appendix A.

**Limits, stated up front:**
- **LinkedIn returned 403 to anonymous reads.** None of the five bookmarked posts could be read, and no LinkedIn post text is used as evidence. Market signal comes from vendor pages, release notes, GitHub and trade press.
- **Pricing.** Pricing marked "unverified" came from third-party summaries.
- **Security.** The security assessment is a design and code review, not a penetration test.

---

## 0. Executive summary

1. **The brief describes a product Sentinel does not quite have.** Three corrections matter for every section below:
   - There is no per-micro-patch rollback. "Rollback" means Revit Undo (one entry per Sentinel action, through `TransactionGroup.Assimilate`) plus a ledger row recording the undo (`UndoWatcher`).
   - The web side does not stream fragments. Whole `.frag` files are loaded, and streaming waits on WebGPU, which is blocked upstream.
   - The MCP server cannot execute anything in Revit. It reads, it adjudicates, and it stages changesets that a person ticks in Revit.

   In every case the reality is safer and smaller than the brief. Sell the reality.
2. **Sentinel's defensible position is governed write-back with proof.** No benchmarked incumbent fixes the authoring model:
   - Autodesk Model Checker and ACC (now being rebranded Forma) only report.
   - BIMcollab raises issues but does not fix the model.
   - OpenSpace has no checking rules.
   - Verifi3D no longer exists. Solibri bought it, renamed it CheckPoint, then retired it on 2026-04-13.

   Sentinel checks, proposes, applies after a person approves, and writes a hash-chained ledger. That combination is open ground today.
3. **The AI-in-Revit lane is crowded and about to be squeezed.**
   - More than 15 open-source Revit MCP servers are active. The largest, revit-mcp, has about 470 stars.
   - Aec-model-bridge already pitches "human approval on every change".
   - Autodesk shipped an official read-only Revit MCP in June 2026, and a write server is planned.

   Tool count is not a moat. The moat is the governance spine around writes: approvals, a per-element stale-plan guard, a database-enforced single writer, and an immutable ledger.
4. **The biggest real security risk sits next to Sentinel, not inside it.** The founder's Claude client also loads a third-party Revit MCP that has `send_code_to_revit`, an arbitrary C# execution tool. A prompt-injection string in a parameter value, a BCF comment or a governed document can steer the model into calling it. Sentinel's own MCP has no eval path; the neighbour undoes that.
5. **Enterprise blockers are operational, not features.**
   - The bridge runs on one PC behind Tailscale Funnel.
   - There has been no third-party penetration test.
   - There is no SSO/SCIM, no SOC 2 or ISO 27001, and no data-residency statement.
   - CI builds only Revit 2025 and 2026 (2021–2024 and 2027 are untested in CI).
   - The viewer has only been measured on small models (378 elements; two models at about 48k triangles).

   An enterprise BIM manager will stop at the first two blockers before looking at any feature.

**Top three moves:**
1. **Harden the AI boundary**, now:
   - A profile that excludes `send_code_to_revit`.
   - Untrusted-content fencing in tool outputs.
   - A protected-element policy.
2. **Take the bridge off the PC** onto a container host (H1/H2), commission a penetration test, and publish a security page.
3. **Measure one real large federation** (more than 100k elements) before claiming anything about viewer performance.

---

## 1. System architecture and core functionality

### 1.1 What is actually built

```text
 Claude Desktop ──stdio JSON-RPC──► mcp-server.mjs (17 tools: 15 read, 2 stage-only)
                                          │ HTTPS (Tailscale Serve/Funnel TLS)
 That Open Platform app (web 1.0.91) ─────►  Bridge :4100 (Node, zero-dep, loopback)
   beta engine 3.5.x, .frag files            │  sole writer of governed stores (SEC-1)
                                              ▼
                                   Supabase Postgres (44 migrations, RLS,
                                   4 roles, hash-chained audit_log, triggers
                                   block UPDATE/DELETE/TRUNCATE)
                                              ▲
 Revit add-in (2021–2027; net48/net8/net10) ──┘  pulls changesets, person ticks,
   per-user sign-in, DPAPI refresh token          applies in Transaction, posts result
 Python side tools: survey (E57/LAS/LAZ), drawing reader, photo/splat, e57 panoramas
```

**What is right about it:**
- The single-writer bridge is backed by the database: RLS refuses signed-in direct writes to governed stores.
- The add-in pulls work rather than having it pushed in.
- The ledger is append-only.

Those three choices remove whole classes of concurrency and tampering bugs. They are the most valuable engineering in the product.

**What is wrong about it:**
- The bridge is a single process on a single workstation, reached through a consumer tunnel. Every availability, residency and compliance question lands there.
- `bcf-service.mjs` is a zero-dependency monolith with about 20 route groups. It is easy to reason about while small, but every new route needs hand-rolled body limits, origin checks and role checks. The 2026-09-27 audit found 63 findings mostly because of this. They are closed, but the pattern will keep producing new ones.

### 1.2 MCP orchestrating native Revit work

**Viability:** good, because of how Sentinel chose to use MCP:
- The model never touches the Revit API.
- It calls fixed-schema tools on the bridge.
- The two tools that cause change only stage it (`sentinel_propose_changeset`, where "nothing is created by this call") or record an IDS verdict (`sentinel_propose`).
- Writes happen in the add-in, on Revit's thread, after a person ticks each element.

This is the correct shape. Most open-source Revit MCPs expose `execute_code`, `delete_element` or `operate_element` directly to the model.

**Risks that remain:**

| Risk | Where | Severity |
|---|---|---|
| Cross-server tool hijack: a cloud LLM with Sentinel and a code-exec Revit MCP loaded together | Founder's client config (`send_code_to_revit` exists in the session's tool list) | **High** |
| Indirect prompt injection through model data (parameter values, family names, BCF comments, document text, `ask_app` replies from an open browser tab) | All read tools return user-authored strings verbatim | **High** |
| Natural-language ambiguity becoming a staged changeset that a tired reviewer ticks through | `propose_changeset` → Revit tick dialog | Medium: the control is human, so it decays with volume |
| The `agent` provenance block is self-asserted, and the prompt is hashed but not stored | `mcp-server.mjs` | Low for safety; medium for forensics, because you cannot reconstruct why |
| No per-tool MCP rate limit or budget (the AI gateway has spend control; MCP read tools do not) | bridge | Low |

### 1.3 The deterministic engine and the "atomic rollback"

**How it works:**
- **Per batch:** one `Transaction` per fix-in-place batch. Each write is read back, so a parameter that silently refuses the write is reported, not audited. If the store write throws, the transaction is rolled back.
- **Per action:** a `TransactionGroup` per action (`SentinelUndo`):
  - Keep runs `Assimilate`, so the action is one Undo entry.
  - Decline or an exception runs `RollBack`.
  - `Preview` always rolls back.
- **Changesets:** `GhostFailureHandler` (an `IFailuresPreprocessor`) runs `AllOrNothing`. Any error rolls back the whole changeset, and warnings are counted, never silently deleted.
- **Element guards:** the executor refuses an element that is pinned, grouped, in a design option, borrowed by another user, or changed or deleted in central since the plan was made ("Reload Latest, then run Promote again").

**The honest description:** atomic apply, plus Undo-based reversal, plus ledger-recorded reversal. It is not selective rollback: you cannot revert fix #7 from last Tuesday while keeping #8–#30. Undo is strictly LIFO.

**Edge cases where reversal fails or lies:**

1. **Undo history does not survive the session.** The undo stack dies on close, and in practice it is unusable after Synchronize with Central. `UndoWatcher`'s registry is in memory. After a restart, a Sentinel change can only be reversed by a new forward change, and no such tool exists.
2. **Interleaved edits.** After a Sentinel batch, the user makes edits A and B. Undoing the batch first undoes A and B, or the user gives up. There is no way to back out the Sentinel change alone.
3. **Ledger drift.** The batch commits and the ledger says "applied". The user then Undoes and closes without saving, or Revit crashes between commit and the ledger post. The ledger now records a state the `.rvt` never kept. `changeset_reverted` only fires if the add-in sees the Undo, and it never sees "closed without saving".
4. **Worksharing.**
   - **Ownership:** the add-in refuses borrowed elements, but it never requests checkout. A batch on an element nobody owns borrows it implicitly. Rolling back locally does not release the borrow until the next sync relinquishes it.
   - **Other users:** once synced, other users have the change. Undo after a sync is not a reversal for them.
5. **Other add-ins' updaters (DMU).** A third-party `IUpdater` that reacts to Sentinel's change runs inside the same transaction. Rollback reverts its edits too, and that add-in may keep its own external state (a database or a log) that is not rolled back.
6. **Non-transactional side effects.** Exported IFC files, family files written to disk, files placed in the CDE, bridge posts and SSE events are outside Revit's transaction. Rolling back the document does not roll them back. GP-2 in the 2026-09-30 audit, a partial export leaving the document dirty, was this class of bug.
7. **Failures resolved by Revit itself.**
   - **Warnings:** `AllOrNothing` covers errors. Warnings that Revit auto-resolves (joins, room boundary changes, dimension references) change elements the plan never named, and those changes are kept on commit.
   - **Read-back:** the read-back check compares the named parameter only.
8. **Element identity.**
   - **Ids:** an Undo, then a re-run of Promote, creates new `ElementId`s. Ledger rows keyed by ElementId, rather than UniqueId or IFC GUID, stop matching.
   - **Ghosts:** promote ghosts carry `target.ifc_guid`, which is good. Confirm that every ledger row uses a stable id.
9. **Groups and design options.** These are refused today, which is correct. Do not relax this, because editing group instances and propagating group edits do not behave predictably.
10. **Revit version drift.** The add-in builds for net48, net8 and net10 across 2021–2027. CI compiles only 2025 and 2026. A `FailureDefinition` or API behaviour change in 2027 or 2024 would ship untested.

**Recommendation:** stop calling it "atomic rollback" and call it **"atomic apply, with recorded reversal"**. Then build a real **compensating transaction**:
- Every applied row already stores `OldValue` and `NewValue`.
- A "Revert this changeset" command can re-apply `OldValue`, guarded by the same check, `current == NewValue`. If not, refuse and say so.
- It is ledgered as a new forward change.

That works across sessions, syncs and users. It is the only reversal that holds up in worksharing.

### 1.4 Fragments on That Open versus APS/Forge viewers

| Dimension | Sentinel on That Open (today) | APS Viewer / Forma |
|---|---|---|
| Format | `.frag` (FlatBuffers, instanced geometry, columnar properties) from IFC via web-ifc | SVF2, converted server-side by Model Derivative |
| Loading | Whole file. **No streaming.** Streaming is tied to the WebGPU build, which is blocked upstream | Progressive streaming with an LOD hierarchy; built for very large federations |
| Measured scale | 378 elements: 60 fps, p95 16.8 ms. Two models: about 48k triangles, 241 draw calls per frame | Proven at multi-million elements in production |
| Data ownership and cost | Your files and your server; no per-MB toll | Data-out metering on the AEC Data Model API since 2026-10-06 |
| Openness | IFC-native; BCF 3.0 and openCDE served by Sentinel | Revit-native first; IFC goes through translation |
| Engine maturity | **Private beta** packages (`components-beta` 3.5.18), with a platform sandbox and an opaque origin that already broke localStorage once | GA, with SLA |

**Verdict:**
- **Advantages:** for openBIM QA and governed review, That Open is the right bet (no toll, IFC-native, you control the pipeline).
- **Large federations:** Sentinel has no evidence at all. A typical hospital or tower federation has 200k–2M elements across 10–40 models. Whole-file loading with per-model draw calls will hit browser memory limits (about 2–4 GB per tab) long before then.
- **Beta dependency:** this is a supplier risk. Pin versions, keep a GA-package fallback build, and get a written roadmap commitment from That Open on streaming and WebGPU.

---

## 2. SWOT, for architectural practices and enterprise BIM

### Strengths
- **The model is fixed, not only reported, under governance.** Approve per element, then a stale-plan guard (`from` value, `type_before`, `placed`), then `AllOrNothing`, then read-back verification. No benchmarked competitor writes back.
- **The audit trail is tamper-evident at the database core.** The ledger is hash-chained, and triggers block UPDATE, DELETE and TRUNCATE. A public hash-only receipt check exists, and an audit pack can be downloaded per project. This maps directly onto ISO 19650 "information approval" evidence.
- **The AI boundary is safe by design.** There is no eval tool, writes are stage-only, and the AI gateway defaults to the **local** provider (Ollama), with cloud as opt-in and budgeted.
- **It is openBIM end to end.** It covers:
  - IFC and `.frag`.
  - IDS adjudication.
  - BCF 3.0 and openCDE served, 20/20 routes checked against the official schemas.
  - COBie hand-over gate.
  - MIDP and TIDP.
- **Range.** Scan-to-BIM (E57/LAS/LAZ with deviation), drawing reader, photo evidence and panoramas, 4D–7D panels. That is very broad for its size.
- **Engineering discipline that is visible in the repo.** It has:
  - About 2,400 bridge tests and about 700 web tests.
  - Revit-free C# checks in CI.
  - Live drills per slice.
  - Written security audits with findings closed.

### Weaknesses
- **Operations:**
  - One PC, one bridge, Tailscale Funnel.
  - No SLA, no backups policy, no data-residency statement, and no DR.
  - A deployment playbook that is only a skeleton.
- **Proof:** no third-party penetration test, and no SOC 2 or ISO 27001.
- **Identity:** email and password only; no SSO or SCIM. Leaked-password protection is deliberately off (D-12).
- **Reversal:** LIFO Undo only; nothing works across sessions (§1.3).
- **Scale:** there is no evidence for the viewer on large federations, and no streaming.
- **Supplier risk:** the private beta That Open engine plus the platform sandbox.
- **CI blind spots:** Revit 2021–2024 and 2027 are not built in CI, and there are no Revit API integration tests in CI. Correctness depends on live drills run by one founder.
- **Bus factor:** essentially one person, with Claude, holds the whole system.
- **Breadth before depth:**
  - The 4D/5D panels are thinner than a vibe-coded rival's demo (MODELi).
  - LOIN exists only as a `lod_matrix` artefact.
  - Element-level MIDP-to-element links by GUID are still owed.
- **Docs have drifted.** Stale test counts and capability tables get spotted by technical buyers and erode trust.

### Opportunities
- **"Fix, don't flag" for IDS.** BIMcollab and Solibri are investing heavily in IDS checking, but neither writes back. Sentinel can sell IDS check → staged fix in Revit → ledger receipt as one loop.
- **Certification evidence pack.** Offices seeking BSI Kitemark or ISO 19650 certification need evidence of process. Sentinel's audit pack, review chain and procedure document are that evidence. The *organisation* is certified, not the product; position Sentinel accordingly.
- **The no-toll data feed.** Autodesk meters data-out from 2026-10-06. Sentinel already serves per-revision element rows as JSON; adding CSV and a Power BI connector is cheap and topical.
- **Clash triage, not clash detection.** Cede raw clash to Navisworks, ACC and Revizto. Own grouping, ownership assignment by discipline and workset, and auto-proposed fixes for trivial classes (coincident slabs, duplicate elements, small clearance breaches).
- **Being the safe write layer under Autodesk's read-only MCP.** Autodesk's official MCP reads, and Sentinel's governed changeset can be where the writes go. This is a partnership story, not just a competitive one.
- **Gulf and EU openBIM mandates** reward IFC-native, IDS-driven tooling over Autodesk lock-in.

### Threats
- **Autodesk closing the gap.** The official write MCP is planned and the agentic Assistant was previewed at AU 2026 for 2027. If it ships with approvals inside ACC/Forma, "AI that fixes Revit" becomes a free bundle feature.
- **Solibri consolidating QA.** It bought Verifi3D, launched new editions on 2026-04-13, added an AI assistant (beta), point cloud validation and Security+ air-gapped. It owns the "serious checker" mindshare.
- **CDEs adding MCP.** Catenda Hub already exposes an MCP for agents, so "CDE + AI agent" is now a vendor checkbox.
- **The open-source MCP crowd.** Free, fast and good enough for many BIM coordinators. Approval loops are already being copied.
- **Funded openBIM data-quality players**, for example ONESTRUCTION with about ¥9.1bn raised in April 2026.
- **Revit API churn:**
  - Revit 2025 moved to .NET 8 and 2027 to .NET 10.
  - Model Checker v10 dropped its API.
  - Each yearly release can break the add-in on three runtimes.
- **That Open platform changes:** the sandbox and opaque-origin change already broke the published app once.
- **Market inertia.** Practices standardise on ACC plus Navisworks plus Solibri. Procurement wants SOC 2, SSO and a vendor older than this product.

---

## 3. Competitor benchmark and market fit

### 3.1 Positioning brief (from project records)
- **Offer:** ISO 19650 information management, plus model QA, plus governed automation in Revit, with an openBIM web platform.
- **Buyer:** BIM managers and information managers in architecture and engineering practices (the pilot office first), then lead appointed parties on mid-size projects.
- **Differentiator:** trust (approve → apply → ledger) rather than screens. Dashboards are cheap now, as the MODELi lesson showed.
- **Strategic tension for the map:** **automation depth** (does it change the model?) × **verifiable governance** (can you prove who changed what, under which standard?).

### 3.2 Tiers

| Tier | Players | Why |
|---|---|---|
| **Direct** | BIMcollab (Zoom + Nexus/Twin, merged 2026-05-04), Solibri (incl. ex-Verifi3D), Revit MCP servers with approval (aec-model-bridge, HMK Pilot, horizun-revit-mcp) | Same buyer and the same QA or AI-in-Revit job |
| **Adjacent** | Autodesk Model Checker + ACC/Forma Model Coordination, Revizto, Catenda Hub, Speckle (Automate, Intelligence), Trimble Connect, Dalux | Overlap on coordination, CDE or checks; different centre of gravity |
| **Field / capture** | OpenSpace (BIM+), BIMIT, ReCap Pro auto-segmentation | Overlap only with Sentinel's survey and photo modules |
| **Aspirational** | Autodesk (Forma platform), Nemetschek (Solibri) | Distribution, compliance paperwork and scale Sentinel must eventually match |
| **Substitutes** | pyRevit scripts, Dynamo graphs, in-house BIM teams with Claude, vibe-coded dashboards (MODELi) | Free and good enough per task; no governance |

### 3.3 Positioning map

```text
                         VERIFIABLE GOVERNANCE (ledger, states, approvals, ISO evidence)
                                              ▲
                     Catenda Hub ●            │            ★ Sentinel (target, and today)
            ACC/Forma Docs ●                  │
               BIMcollab Twin/Nexus ●         │
                    Solibri ●                 │
  REPORT ONLY ◄───────────────────────────────┼──────────────────────────► CHANGES THE MODEL
          Model Checker ●   Revizto ●         │       ● aec-model-bridge (approval, no ledger)
            OpenSpace BIM+ ●                  │            ● HMK Pilot / horizun
                                              │   ● revit-mcp et al. (raw exec)
                                              │   ● Autodesk Revit MCP (read-only today; write planned)
                                              ▼
                                    LOW GOVERNANCE
```

The top-right quadrant, changing the model *and* proving it, is **empty apart from Sentinel**. The threat vectors into it are:
- Autodesk, moving up the right side (official write MCP plus Forma governance).
- BIMcollab or Solibri, moving right (adding write-back).
- Approval-loop MCPs, moving up (adding a ledger).

The first is the most dangerous within 12–18 months.

### 3.4 Benchmark matrix

Scale: ●●● strong, ●● partial, ● weak, — none, ? unverified. There is deliberately no total column.

| | Rule/IDS checking | Write-back / fix in authoring model | Approval + audit trail | ISO 19650 CDE workflow | BCF / openCDE | AI shipped | Viewer scale | Enterprise security proof | Price / access |
|---|---|---|---|---|---|---|---|---|---|
| **Sentinel** | ●● (rules, IDS, contract, naming; IDS version not stated) | **●●●** (staged, per-element approve, stale guard) | **●●●** (hash-chained, immutable) | ●●● (states, review chain, holding area, audit pack) | ●●● (serves BCF 3.0 + openCDE; schema-checked) | ●● (MCP read/stage; local-first gateway) | ● (small models only) | ● (audits, RLS; no pen test, SOC 2 or SSO) | Pilot only |
| **Autodesk Model Checker + ACC/Forma** | ● (Model Checker, desktop, Revit only) | — (report only) | ●● (Docs history; not hash-evident) | ●● (naming templates, approvals; partly unverified) | ? | ●● (Assistant GA; agentic is 2027) | ●●● | ●●● (SOC 2 / ISO 27001 claimed, EU residency) | Free checker; ACC subscription + data-out metering |
| **BIMcollab Zoom + Nexus/Twin** | **●●●** (Smart Views, IDS cardinality 2026-08, result grouping 2026-10) | — (issues only) | ●● | ●● (CDE lineage; detail unverified) | ●● (BCF managers, BCF 3.0 XML; openCDE unconfirmed) | ● ("Clara" chatbot) | ●● | ●● (ISO 27001 claimed, older page; SSO) | ≈ €12.50–25/user/month (unverified) + Zoom licence |
| **OpenSpace BIM+** | — | — | ● | — | ● (BCF export) | ●● (progress AI via Disperse, acquired Oct 2025) | ●● | ●●● (SOC 2 Type 2, FedRAMP Moderate) | Add-on to Capture; not public |
| **Verifi3D → Solibri** | ●●● (Solibri rules; IDS editor for all) | — | ●● | ● | ●● | ● (NL search shipped; assistant in beta) | ●●● | ●● (Security+ air-gapped) | Discontinued 2026-04-13; replaced by Solibri editions |
| **Approval-loop Revit MCPs** | ● | ●● (direct writes after a yes) | ● (approval, no tamper-evident ledger) | — | — | ●●● (that is the product) | n/a | — | Free / OSS, or commercial (HMK) |

**Where Sentinel leads:** write-back, approval and audit, and serving openCDE. **Where it trails:** viewer scale, enterprise proof, and IDS depth against BIMcollab and Solibri.

### 3.5 Per competitor

#### Autodesk Model Checker / ACC (Forma) Model Coordination
- **Focus and position:**
  - Default platform for Revit shops. Model Checker is a free desktop rule tool, now v10 for Revit 2026, and it dropped its API.
  - Model Coordination does automatic clash plus issues in BIM Collaborate Pro.
  - ACC is being rebranded Forma.
  - From 2026-10-06, the AEC Data Model API meters data-out (pooled MB per seat, overage via Flex).
- **Sentinel's structural advantage:**
  - It fixes, not just checks.
  - Its audit is tamper-evident, not just a change history.
  - It is IFC- and IDS-native, with no per-MB toll.
  - It works on non-Autodesk models.
- **Where Sentinel is vulnerable:**
  - Autodesk owns the authoring tool, the CDE, identity (Autodesk ID and SSO), compliance paperwork and distribution.
  - An official write MCP with approvals inside Forma would neutralise "AI that fixes Revit" for buyers who already pay.
- **Gaps to bridge:**
  - SSO via the customer's IdP (Entra ID / Okta).
  - Large-model viewer evidence.
  - An ACC/Forma *connector*: read issues and models, publish ledger receipts back. Coexist, don't replace.
  - A one-page "why not just Forma" with the data-out cost arithmetic.

#### BIMcollab Zoom / Nexus (now one platform with Twin)
- **Focus and position:** the openBIM QA leader for EU BIM managers and public clients.
  - Smart Views, clash rules, the most active IDS roadmap found (cardinality 2026-08-04, result grouping in Zoom 9.10 on 2026-10-15).
  - BCF managers for Revit, Navisworks and Archicad. Zoom is now Revit-aware (9.8.8).
- **Sentinel's structural advantage:**
  - The closed loop: a finding becomes a staged fix in Revit and then a ledger receipt.
  - BIMcollab stops at the issue.
  - Sentinel also *serves* openCDE, so other tools can be its clients.
- **Where Sentinel is vulnerable:**
  - IDS authoring and result UX: BIMcollab's grouping, cardinality and Smart View libraries are years ahead.
  - Brand trust with public clients, and multi-authoring-tool reach (Archicad, Tekla).
- **Gaps to bridge:**
  - State IDS 1.0 conformance explicitly, and run the buildingSMART IDS test cases (published as test files).
  - Result grouping and saved views equal to Smart Views.
  - Import BIMcollab BCF without loss, with round-trip tests.
  - Long-term: one more authoring tool through IFC re-import rules (at least Archicad).

#### OpenSpace BIM+ / Verifi3D
- **OpenSpace:**
  - Reality capture leader (SOC 2 Type 2, FedRAMP Moderate).
  - BIM+ is an add-on: BIM compare, overlay, point cloud, offline viewer. AI is for progress (Disperse).
  - No QC rules.
- **Verifi3D:** effectively gone. Solibri bought Xinaps, rebranded it CheckPoint (January 2025) and discontinued it on 2026-04-13. Its capability now lives in Solibri editions, which add Security+ (air-gapped) and an AI assistant in beta.
- **Sentinel's structural advantage:**
  - Against OpenSpace, scan-vs-model *deviation turned into a governed change in Revit*. OpenSpace shows the difference and stops there.
  - Against Solibri, write-back and an approval ledger.
- **Where Sentinel is vulnerable:**
  - Capture hardware workflow, field UX and federal-grade compliance (OpenSpace).
  - Rule library breadth, decades of checker credibility, and an air-gapped option (Solibri).
- **Gaps to bridge:**
  - Capture: field capture from 360 cameras feeding the photo evidence module.
  - **An offline / air-gapped deployment.** Sentinel's local-first AI gateway is close to this already.
  - Packaged rule libraries per discipline.

#### Others that matter (from the wide scan)
- **Catenda Hub:** ISO 19650 CDE on IFC and BCF, *with an MCP server for AI agents*. Closest CDE-side rival.
- **Speckle:** Automate (CI-style checks on model commits) plus Intelligence (natural-language queries). A developer-friendly substitute for Sentinel's checks; integrate rather than fight.
- **Revizto 5.18** (2026-10-13): a draft-first review mode. Strong coordination UX; no IDS found.
- **IfcTester (IfcOpenShell):** a free IDS engine with BCF/JSON output. Use it as a second-opinion validator to prove Sentinel's IDS results.
- **ONESTRUCTION:** a funded openBIM data-quality plus AI platform. Watch it.
- **MODELi:** a vibe-coded 4D/5D project-controls dashboard. It shows that screens are cheap; it is a different lane.

### 3.6 White-space and feature gaps, ranked

**White-space Sentinel can own:**

> *"Every model change by a person or an AI is approved per element, applied atomically in Revit, and provable to an auditor, on open standards, with no data toll."*

**Must-close gaps, ranked by impact × effort:**

| # | Gap | Why buyers stop | Effort |
|---|---|---|---|
| 1 | Hosted bridge (container, managed Postgres already in place), backups, DR, status page | "Where does our data live?" | M |
| 2 | Third-party pen test + public security page (encryption, residency, sub-processors, AI data flow) | Procurement | M (money) |
| 3 | SSO (OIDC/SAML via Supabase or IdP) + SCIM-lite invite | IT will not create passwords | M |
| 4 | Compensating "Revert changeset" (§1.3) | "What if the AI is wrong next week?" | S–M |
| 5 | Large-federation evidence (≥ 100k elements, 10+ models) and streaming | "Will it open our hospital?" | M–L (partly upstream) |
| 6 | IDS 1.0 conformance statement + buildingSMART test files + IfcTester cross-check | "Is your IDS real?" | S |
| 7 | Clash *triage* (grouping, ownership, auto-fix trivial classes) on top of existing Collider results | Daily coordinator pain | M |
| 8 | ACC/Forma and BIMcollab connectors (BCF round trip, receipts back) | Coexistence | M |
| 9 | CI for Revit 2024 (net48) and 2027 (net10) builds | Silent regressions | S |

---

## 4. Threat modelling, data security and privacy

The method is STRIDE per trust boundary. Boundaries:
- **TB1:** user ↔ cloud LLM (Claude).
- **TB2:** LLM ↔ MCP server (stdio, local).
- **TB3:** MCP / web / Revit ↔ bridge (HTTPS through Tailscale).
- **TB4:** bridge ↔ Supabase (service key).
- **TB5:** add-in ↔ Revit document.
- **TB6:** web app ↔ That Open platform (sandboxed iframe, opaque origin).

### 4A. Local execution and AI integration

#### A1. Data privacy and LLM context exposure

**The honest position:** with a *cloud* LLM, zero leakage cannot be guaranteed. Anything a tool returns enters the model provider's context. What *can* be guaranteed:

1. **Data minimisation by contract of the tool.** Sentinel's MCP returns ids, summaries, verdicts, ledger rows and document sections, and never geometry. Make this a tested invariant:
   - A schema-level allow-list of output fields per tool.
   - A test that fails if a coordinate array, mesh or file path appears in output.
   - Today this is true by habit, not by test.
2. **Redaction at the bridge.** Add an office-level policy that masks project names, client names, addresses and person names in MCP outputs, using stable tokens, for example `CLIENT_1`.
3. **Local-only mode as a product tier.**
   - **Bridge gateway:** the AI gateway already defaults to Ollama. Make "no cloud LLM" a switch an office lead can lock, enforced in the bridge and recorded in the ledger.
   - **Claude Desktop:** say plainly that a Claude Desktop session is, by definition, cloud. For sensitive projects, the supported path is the local gateway.
4. **Provider terms.** For cloud use, document the retention position: commercial or API terms with no training on inputs, and zero-data-retention where the customer has it. Point the customer to their own agreement with the provider. Do not promise what Sentinel does not control.
5. **Telemetry.** Write down that the add-in and bridge send no telemetry to Sentinel, and test it with an egress-deny test that runs the add-in with only bridge and Supabase hosts allowed.

#### A2. Code injection and API exploits

| Threat | Today | Control to add |
|---|---|---|
| LLM output executed as code | **Not possible through Sentinel.** No eval, Roslyn or CSharpScript; fixed-schema tools; writes stage only | Keep it that way as a written invariant plus a CI check that fails on `CSharpScript`/`Roslyn` references in `SentinelAddin` and on any tool named `*exec*`/`*code*` in `mcp-server.mjs` |
| **Neighbour code-exec MCP** (`send_code_to_revit` from mcp-server-for-revit) in the same client | Loaded on the founder's PC; governed only by a written rule in a strategy doc | **Remove it from the production Claude profile.** Keep it only in a separate dev profile. In the add-in, detect the community server's assembly in the Revit session and show a banner (both run inside Revit's process with full API access) |
| Indirect prompt injection (parameter values, names, BCF comments, docs, `ask_app` replies) | Strings returned verbatim | Wrap all user-authored strings in tool outputs in explicit untrusted-data fences (`"untrusted_text": …`), cap their length, strip control and zero-width characters, and state in each tool description that content is data. This raises the bar; it is not a full defence |
| Malformed or hostile changeset (huge, nonsense values, wrong classes) | Bridge forces the IFC class from the kind; executor validates; `AllOrNothing` | Hard caps per changeset (elements, distinct categories, deletes = 0 unless a lead flags it), plus value-type validation against the parameter's StorageType *before* staging |
| Reviewer fatigue (rubber-stamping 400 ticks) | Per-element ticks | Risk-tier the tick dialog: "safe" rows grouped, "structural / protected" rows one by one with a typed reason; sample-recheck after apply |

#### A3. Authorisation and scoping for grids, levels, structure and worksets

**Today:**
- A generic `HeldBy` guard: pinned, grouped, design option, borrowed, or changed in central.
- The bridge refuses a Mark on a level or grid.
- There is **no explicit protected-category policy**.

**Recommended design:** this is data plus one check in the executor, not a framework.

1. **`protection.json` per office**, as a versioned standards artefact (it fits the existing artefact pattern). It holds:
   - Protected categories: `OST_Grids`, `OST_Levels`, `OST_StructuralColumns`, `OST_StructuralFraming`, `OST_StructuralFoundation`, `OST_Floors` with structural = true, project base point and survey point, shared coordinates.
   - Protected worksets, by name pattern, for example `*Shared Levels and Grids*`, `*Structure*`.
   - Protected parameters, for example the IFC GUID and the classification on issued models.
2. **The executor refuses** any staged write touching a protected item unless the changeset carries an approval from a user with `lead` or higher on that project, recorded as its own ledger row. Lead approval comes from a bridge-verified signed approval, not a body flag. That is the same lesson as audit finding ai-2, which is now fixed with a server-side role check.
3. **Coordinate safety:** refuse any change that moves the project base point or survey point, or that acquires or publishes coordinates. No override.
4. **Workset ownership:** require the target workset to be editable by the current user. Never implicitly borrow elements on protected worksets. Ask the user to borrow them explicitly.
5. **Default for AI-sourced changesets:** deletes are off, protected categories are off, and the batch is limited to 200 elements. A person can widen this per batch with a reason.

### 4B. Web platform and cloud infrastructure

#### B1. Fragment data security

| Item | Status | Gap / action |
|---|---|---|
| In transit | HTTPS via Tailscale Serve/Funnel (TLS terminated by Tailscale); That Open platform over HTTPS | Document the TLS versions (Tailscale and Funnel use modern TLS; verify TLS 1.3 negotiation with a scan) and add HSTS. On a move to a container host, enforce TLS 1.3 minimum at the edge |
| At rest: database | Supabase Postgres (provider disk encryption, AES-256 per Supabase docs) | Name the region; state backup encryption and retention |
| At rest: files on the bridge PC | `%APPDATA%\Sentinel\cde-files`: **plain files on a workstation disk** unless BitLocker is on | Require BitLocker on any bridge host now; when hosted, use encrypted object storage with per-office prefixes and server-side encryption, ideally with customer-managed keys later |
| At rest: That Open platform | Platform storage; Sentinel does not control its encryption | Get That Open's written statement (encryption, region, sub-processors) for the security page |
| Optional E2E envelope | Per-project DEK wrapped by a passphrase KEK (12-character minimum) | Raise the minimum, use Argon2id for the KEK, and add a recovery story (lost passphrase means data lost, so say it) |

#### B2. Authentication, RBAC and multi-tenant isolation

**Today:**
- Supabase auth, with sign-up closed (invite-only).
- Per-user Revit sign-in with a DPAPI-protected refresh token.
- The machine credential is loopback-only (PR-1).
- Four roles (viewer < contributor < lead < owner) enforced in RLS (`has_min_role`) *and* again in the bridge, plus platform admins.
- Tenancy is by project membership; offices are attached by `office_key`.

**Gaps:**
1. **External consultants need roles scoped to a discipline or container**, not just to a project. ISO 19650 task teams see each other's *shared* information but only their own WIP. Model that as `memberships(project, user, role, task_team)`, with RLS on `information_containers.task_team` for WIP. One column and a policy, not a new system.
2. **Office isolation:** the 2026-09-27 audit found cross-office reads through a client-supplied `office_key`. These were reported closed (H0, 9af6717, plus later migrations). Add a **standing negative test suite**: two offices, two users, every list or read route must return zero foreign rows. Run it in CI against PGlite, the same harness the migrations already use.
3. **SSO / MFA:**
   - MFA (TOTP) for leads and owners now (Supabase supports it).
   - OIDC/SAML SSO for enterprise.
   - Turn leaked-password protection back on (reverse D-12) before any external user.
4. **Session hygiene:** short-lived access tokens are already in place via Supabase. Add revocation-on-role-change and a per-device "sign out everywhere" for the Revit token.

#### B3. Integrity and synchronisation, web ↔ central `.rvt`

The architecture already avoids the worst class of bug: **the web never writes the `.rvt`.** It writes *intents* (changesets), and the add-in applies them on Revit's thread after a person approves. Remaining races:

| Race | Today | Fix |
|---|---|---|
| Plan made on revision N, applied on N+3 | Per-element stale guard (`from`, `type_before`, `placed`); refuses with "re-run Promote" | Keep it. Also stamp each changeset with the model revision id it was planned against and show the drift in the tick dialog |
| Two reviewers approve or apply the same changeset from two Revit sessions | Not explicit | A single-use apply lease: `POST /changesets/:id/claim` with compare-and-set on status (`staged → applying`, by session id, TTL); release on result. This is one conditional UPDATE, `WHERE status = 'staged'` |
| Retry after a network failure double-posts the result | No idempotency key | `Idempotency-Key` header on result posts; unique `(changeset_id, attempt_key)` in the database |
| Ledger says applied, document never saved or synced (§1.3 #3) | Undetected | On the next `DocumentSynchronizedWithCentral` / `DocumentSaved`, the add-in re-reads the applied rows and posts `changeset_confirmed` or `changeset_lost`. The ledger then shows "applied, then persisted", which is what an auditor needs |
| Web edits to metadata (status, naming) while Revit renames | Separate stores; the bridge is the single writer | Optimistic concurrency on governed rows (`version` column, `If-Match` on PATCH). PostgREST supports this with a filter on version |
| SSE fan-out across machines | Poll-based, up to 3 s | Fine for now; Postgres LISTEN/NOTIFY when hosted |

---

## 5. Roadmap and strategic recommendations

Ordered by risk removed per unit of effort. Every item keeps the existing pattern of one spec, tests and a live drill.

### Immediate (0–6 weeks): make what exists safe to show strangers
1. **AI boundary hardening**:
   - A production Claude profile without `send_code_to_revit`, plus an add-in banner if the community server is present.
   - Untrusted-text fencing in MCP outputs.
   - An output-field allow-list test (no geometry, no paths).
   - A CI check forbidding eval or code-exec tools.
2. **`protection.json` plus a protected-write check** in `ChangesetExecutor`:
   - Grids, levels, structure and coordinates are protected.
   - Approval by a lead or owner is checked server-side.
   - AI defaults: no deletes, 200-element cap.
3. **Compensating "Revert changeset"** from the stored `OldValue`, guarded by `current == NewValue` and ledgered as a forward change.
4. **Apply lease plus idempotency key**, and **`changeset_confirmed`/`changeset_lost` after save or sync**.
5. **Identity:** MFA for leads and owners, leaked-password protection back on, a two-office negative RLS suite in CI.
6. **CI:** build Revit 2024 (net48) and 2027 (net10) legs, even compile-only.
7. **Honest docs:**
   - Fix the stale counts.
   - Rename "atomic rollback" to "atomic apply, recorded reversal".
   - Publish an IDS 1.0 conformance statement after running buildingSMART's IDS test files plus an IfcTester cross-check.

### Medium term (1–2 quarters): make it buyable
1. **Hosted bridge** (H1/H2): a container on a managed host, encrypted object storage for CDE files, named region, backups and DR runbook, status page. Retire the Funnel for production.
2. **Third-party pen test** and a public security page covering the AI data flow, sub-processors, encryption and residency. Start the SOC 2 Type 1 readiness checklist; the evidence pack habits already exist.
3. **SSO (OIDC first, Entra ID), task-team-scoped RBAC** for consultants (§4B2).
4. **Large-federation evidence:** a public 100k+ element benchmark, with memory, load time and fps. Push That Open on streaming and WebGPU, and keep a GA-engine fallback build.
5. **Clash triage:** group the Collider results by element pair type, level and workset owner. Auto-assign by discipline. Auto-propose fixes for coincident or duplicate elements as changesets.
6. **Connectors:**
   - BCF round-trip tests with BIMcollab and ACC/Forma.
   - Receipts back to ACC issues.
   - CSV and a Power BI feed (the "no toll" story).

### Long term (2–4 quarters): widen the moat
1. **An Autodesk MCP partnership:** Autodesk reads, Sentinel governs the writes. Ship Sentinel as the approval-and-ledger layer any MCP write can route through.
2. **An air-gapped or on-prem edition**, using the local AI gateway and a self-hosted Postgres. This answers Solibri Security+ and the defence and public sector.
3. **Second authoring tool** through IFC change requests (Archicad first), using IDS → fix proposals → re-import.
4. **LOIN as a first-class object** (per milestone, per actor, per element class), compiled into IDS. Element-level MIDP links by GUID.
5. **Certification support kit:** a mapping from the audit pack to ISO 19650-2 clauses and BSI Kitemark evidence lists, for the *customer's* certification.

### UI/UX guardrails against destructive AI edits
These are not optional:
- **Preview before tick.** Ghost overlay (DirectContext3D) for every staged row; "show me" focuses the element.
- **Risk-tiered review:**
  - Safe parameter edits are grouped.
  - Geometry, rehost and delete are listed one by one.
  - Protected items need a lead and a typed reason.
- **Batch limits with friction.** Above the cap, the user must split the batch or name a reason.
- **Default-deny deletes from AI.**
- **One Undo entry per action**, already in place. Show "Undo this Sentinel action" in the pane next to the ledger receipt.
- **Post-apply diff.** "Changed 37, refused 3 (borrowed by X), warnings 2", with each refusal explained.
- **Plain provenance.** Every row shows *who* approved, *which* rule or IDS required it, and *which* AI or person proposed it.

### Database and backend recommendations
- **Keep Supabase Postgres, RLS and the bridge as the single writer.** It is the right core; do not split into microservices.
- **Concurrency and idempotency:** add a `version` column with `If-Match` on governed mutable rows; an apply lease and idempotency keys on changesets (§4B3).
- **Ledger verification and anchoring:**
  - **Per-project chain:** the chain is global today. Add a per-project chain view or a per-project Merkle root so a customer's audit pack verifies without revealing other projects' hashes.
  - **Periodic anchor:** publish the head hash daily to an external, timestamped place (an RFC 3161 timestamp authority) so even the operator cannot rewrite history unnoticed.
- **Storage:** object storage for IFC, `.frag` and evidence files, with content-addressed sha256 keys (this also closes the N37 immutability note).
- **Events:** LISTEN/NOTIFY or Supabase Realtime instead of 3 s polling when hosted.
- **Backups:** point-in-time recovery on, with a restore drill quarterly. Restore is a test, not a hope.

---

## Trigger questions for the founder

1. Is "changes the model *and* proves it" the line Sentinel sells? If yes, scan, photo and 4D–7D are supporting features, not the headline.
2. Coexist with Autodesk (connector plus write-governance partner) or compete with Forma head-on? The roadmap above assumes coexist.
3. Pen test, hosting and SSO all cost money. Which comes first? The recommended order is hosting, then pen test, then SSO.
4. Remove the community code-exec Revit MCP from the everyday Claude profile, starting today?
5. Which dimension to concede on purpose? The recommendation is raw clash detection and IDS *authoring* UX (use BIMcollab's for authoring), while owning fixing and proof.

---

## Appendix A: sources

**Code and docs (this repo):**
- `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/mcp-server.md`.
- `docs/security/2026-09-27-bridge-route-audit.md` (63 findings; ai-2 now fixed: `WebApp/bridge/ai-tools.mjs:199` `requireMinRole(project,"contributor")`).
- `docs/compliance/CERTIFICATION_READINESS_2026-10.md`, `docs/compliance/BCF_API_CONFORMANCE_2026-10.md`.
- `docs/superpowers/specs/2026-09-28-3d-viewer-design.md`.
- `docs/strategy/2026-09-30-revit-addin-audit.md`, `docs/strategy/2026-09-30-model-automation-design.md:41,1027`.
- `SentinelAddin/Coordination/FixInPlaceService.cs:296-375`, `SentinelAddin/Engine/SentinelUndo.cs:12-40`, `SentinelAddin/Engine/UndoWatcher.cs`.
- `SentinelAddin/GhostBuilder/GhostFailureHandler.cs:18`, `ChangesetExecutor.cs:301,672-681,793,1395,1434,1465-1544`.
- `WebApp/bridge/mcp-server.mjs`, `WebApp/bridge/ai-gateway.mjs:4,179`, `WebApp/db/migrations/0004_auth_rls.sql:15`, `.github/workflows/ci.yml`.

**Market (accessed 2026-10-19):**
- Autodesk: APS AEC Data Model pricing blog; Revit Public MCP Server blog (2026-06-17); interoperability.autodesk.com/modelchecker.php.
- BIMcollab: helpcenter.bimcollab.com release notes and the One Platform FAQ.
- Solibri: solibri.com/checkpoint; solibri.com release notes, April 2026 and June 2026.
- Reviews and acquisitions: aecbytes.com/review/2025/SolibriCheckPoint.html; aecplustech.com (Xinaps acquisition).
- OpenSpace: openspace.ai BIM+ press release.
- Revizto 5.18: constructiondive.com (2026-10-12).
- Catenda Hub: graphisoft.com partner page.
- ONESTRUCTION: thebridge.jp (April 2026 funding).
- GitHub (stars at access): mcp-servers-for-revit/revit-mcp, bimwright/rvt-mcp, Sam-AEC/aec-model-bridge, HorizunGroup/horizun-revit-mcp, IfcOpenShell/IfcOpenShell (IfcTester), ThatOpen/engine_components.
- buildingSMART IDS 1.0 page.

**Not verified:**
- BIMcollab list price; Autodesk overage rates (the rate table is an image).
- KUBUS ownership; OpenSpace pricing.
- IDS status for Dalux, Trimble and Bentley.
- BIMIT funding; ReCap Pro segmentation.
- Anything that would have come from the five LinkedIn bookmarks (403).
