# Sentinel — Full Review, Market Scan & Direction (September 2026)

*Written 2026-09-17 after the unfreeze: collaboration, market-signal P1–P8, fix-in-place + naming manager,
and the office-agnostic sweep all merged to `master` (7f82105) and verified live. Companion to
`STRATEGIC_REVIEW_2026-07.md` (the seat), `MARKET_SIGNAL_2026-09.md` (the feed) and `CAPABILITY_MAP.md`
(the inventory). This one answers: what is Sentinel today, who else is here from every angle, and — for a
consultancy-first path — what to do next.*

**Decision recorded 2026-09-17:** Sentinel serves the AEC sector broadly, but the go-to-market is
**consultancy first, product later** — BDS delivers BIM management to clients *through* Sentinel, and what
proves itself on real projects is packaged for self-serve offices afterwards.

---

## Part I — What Sentinel is today (honest)

### Built and live-verified
| Layer | What exists | Verified how |
|---|---|---|
| **Referee** | IDS adjudication (`/propose`), ISO 19650 container states with lead-gated transitions, hash-chained ledger + verifiable receipts, claimed-never-verified agent provenance, MCP server (12 tools) | Governed Publish, fix-in-place loop (audit 414), receipts verified live |
| **Documents spine** | BEP/EIR templates, docx/pdf ingestion into sections, section↔check bindings, executability score + strip test, compliance + AI-integrity reports, section comments, project roles, prose→IDS compiler | Ingestion of the real BDS BEP; collaboration walkthrough (viewer → contributor → owner) |
| **Delivery plan** | Deliverables with derived status, expected revision/suitability evidence, task teams, TIDP roll-up, rebaseline diff, weekly report, `midp.*` and `roles.*` checks | Unit suites; live data on the BDS project |
| **Revit** | Scan/scorecard/rule set, DMU change requests, IFC pre-flight + delivery gate, Governed Publish, BCF issues with **Fix in Revit**, Naming Manager, family sanitize/heal, MEP openings, clash manager/register, standards extraction/apply/ingest, datum→ghost→annotate chain, AI-proposal review, ROI | Drills 6–8 live on Revit 2024; A2 drills in August |
| **Web** | 25 panels over one dataset: files/versions, clash, issues, RFIs, tenders, packs, cost/carbon/COBie, timeline, copilot, settings/members | External-user run (Aug), collab walkthrough (Sep) |
| **Foundation** | Supabase RLS on every table (zero anon-reachable policies), JWT forwarding (ES256 via JWKS), CORS allowlist, CI (web tests + build, add-in 2025/2026, three Revit-free check tools) | 643 web tests; 48/37/34 checks |

### Not there yet (the gap between "built" and "an office can use it")
1. **No front door.** No sign-up UI, no onboarding, no first-run; configuration is `%AppData%` JSON + a Tailscale URL; one operator. *(Fine for consultancy-first; fatal for self-serve.)*
2. **Production oversight is thin.** The ledger records *decisions*; it does not see *activity* — who modelled what, model health trends, warnings, sync habits, time-in-model. Bimbeats/Kinship own this today.
3. **Role gating** is complete on docs/deliverables/settings/dashboard/files; clash/RFI/issue/pack panels rely on RLS alone; the `/gate` route is not role-gated server-side.
4. **Loose ends**: two Ollama-dependent features, four untested cores, ~40 `tsc` warnings, a stray 500 on signed-out load, owner-email lookup flakiness, no installer/packaging for the add-in, `TN-02` unconfirmed.
5. **Nothing public.** No touchable demo beyond the BEP strip test artifact; no docs site; no pricing.

---

## Part II — The market from every angle (September 2026)

### A. Direct neighbours on the *documents + oversight* thesis
| | Position | They have | Sentinel has instead |
|---|---|---|---|
| **Plannerly** | "The BIM management platform": BEP by templates, Scope (LOD/LOIN, TIDP→MIDP, timeline), **Verify** (IDS/ISO 19650 checks on Revit/IFC, ACC-linked), co-authoring, e-signature; Free/Individual/Team/Enterprise plans (data residency + white-label at Enterprise), 75k teams, AECOM/F+P references, a training academy | Onboarding, templates, e-sign, ACC integration, brand, education funnel | Clauses **bound to executable checks** and scored; the loop closes *inside Revit* (fix-in-place, governed publish); immutable ledger + receipts; open/self-hosted; MCP |
| **Morta** | Structured ISO 19650 tables: BEP, EIR/AIR/OIR, IDPs, naming, responsibility matrix; section tracking; Word export; Asite/Viewpoint integrations; Building Safety Act use-case | UK contractor references, CDE integrations, QMS framing | Model-side enforcement; documents that *test reality*, not just track completion |
| **Bimbeats · Kinship** | Revit model health + team activity + hardware telemetry, dashboards ($12.84/machine/mo for Bimbeats Studio); Kinship adds content management | Continuous telemetry, benchmarks, IT view | Governance context (*which deliverable, which gate*), and the fix path |
| **Glider · Operance** | UK golden thread / asset information, ISO 19650-6, blockchain-style audit claims | Regulatory positioning, owner/operator market | Model-native referee; theirs are registers |

### B. CDEs and checkers (July analysis still holds; deltas)
- **Autodesk Construction Cloud** now carries the BSI Kitemark for ISO 19650 and an ISO-19650 naming/workflow layer; Model Coordination improved; **Autodesk Assistant's project-data agent left beta**. Governance-strong, closed, mutable audit — unchanged wedge for Sentinel.
- **BIMcollab** (from €12.50/user/mo, Zoom strong on IDS), **Solibri** (~$185/user/mo), **Verifi3D** — checking islands; none close the loop into the authoring tool with evidence.
- **Catenda, Dalux, Trimble Connect** — open-BIM CDEs; the "one governed dataset" claim is still Sentinel's alone.

### C. The AI authoring wave (the seat Sentinel deliberately does not take)
- **Motif** ($46M, Redpoint + CapitalG), **Arcol**, **Snaptrude**, **Qonic**, **Hypar** — agent-native/cloud authoring; each targets a phase. All are *proposers*.
- **Autodesk shipped an official Revit Public MCP Server (June 2026, Revit 2027)**; open-source servers (the leading one at ~460 GitHub stars) expose 50–138 write tools for Revit 2023–2026. Any agent can now write into a model in one prompt. **This is the single biggest strategic shift since July**: the referee seat is no longer a thesis, it is the only unfilled seat in a room that just got crowded with writers.

### D. Open-source and self-hosted
- **IfcOpenShell/Bonsai** (150+ contributors) and **That Open** remain the stack; **Speckle** the data hub.
- **iBuilder/massing** (MIT, low traction) — an open, self-hosted IFC-native platform with viewer, IDS authoring, estimating + embodied carbon, a GC portal. Broad and shallow; the closest OSS neighbour by ambition, not by depth of governance.

### E. Regulation and the region
- **ISO 19650 revision (2026)**: BEP → *Information Production Plan*; "information management, not BIM". Sentinel's executable-BEP framing was written for exactly this.
- **UK**: Building Safety Act golden thread — the reason Glider/Operance exist. **UAE**: Dubai now requires the model itself in IFC; Abu Dhabi mandate since 2019. **KSA**: MOMRAH mandates BIM above SAR 100M; NEOM EIRs demand full ISO 19650 with stage-gated delivery milestones. **North America**: ISO 19650 increasingly required in BEPs for public bids.
- Owners "treat BIM as an information management process, not a design service" and weigh the proposal-stage BEP heavily — the consultancy's BEP *is* the sales document.

### F. 4D/5D/6D
Commodity and accelerating (RIB CostX, PriMus IFC, ConWize, CONTEXUS, plus vibe-coded MODELi/Superplan). Hold the July doctrine: thin derivations off the governed dataset, never products.

---

## Part III — Where Sentinel is different, in one paragraph

Every neighbour holds one or two of: documents, checking, coordination, authoring, telemetry, a ledger.
Sentinel is the only one where **a BEP clause is a check, the check runs on the live Revit model, the fix
happens where the model can change, the referee re-judges it, and the whole chain lands in a ledger a
client can verify** — and it is open and self-hostable. Plannerly is the product that will reach an
office first with a smoother path; Sentinel's answer is not to out-template Plannerly but to make the
consultancy's *delivery* visibly better: fewer meetings, evidence instead of assertions, and a golden
thread that survives the handover.

---

## Part IV — Consultancy-first: what "forward" means

**The product for the next two quarters is BDS's own delivery method, instrumented.** Every client
project runs through Sentinel end to end; the artefacts it produces (executability score, delivery status
report, verified receipts, fix evidence) become BDS deliverables. Packaging for other offices comes from
what survives real projects.

Priorities that follow from that (to be confirmed in the brainstorm):
1. **Run a real project through the whole loop** — EIR in → BEP with bound clauses → MIDP/TIDP → models
   published under the gate → issues fixed in place → weekly delivery report → handover pack with receipts.
   The simulation room (Part V) is the rehearsal.
2. **Production oversight** — the one pillar the neighbours have and Sentinel lacks: model health and
   activity per task team, tied to deliverables and gates (not raw telemetry).
3. **Public proof** — one page a client or peer can touch: the BEP strip test (exists), a verified receipt
   viewer, a sample delivery report.
4. **The front door** — sign-up/onboarding/templates — *after* the method is proven, not before.

---

## Part V — The test cycle: a simulation room

Every tool, both surfaces, one fictional-but-realistic project, with the operator playing an office.
Detailed script to follow in `docs/testing/` once the brainstorm settles: the office profile, the
document set (EIR, BEP template, naming standard, IDS, programme, a Revit model with seeded defects),
the roles (owner/lead/contributor/viewer), the day-by-day storyline, and the pass/fail evidence per tool.

---

## Sources
Plannerly [overview](https://help.plannerly.com/en/article/53-what-is-plannerly) · [Verify](https://plannerly.com/verify/) · [MIDP](https://help.plannerly.com/en/article/68-how-to-create-a-master-information-delivery-plan-midp-in-plannerly) · Morta [BEP](https://www.morta.io/solutions/use-cases/bim-execution-plan) · [IM](https://www.morta.io/solutions/information-management) · [Bimbeats](https://www.bimbeats.com/) · [Kinship](https://www.aecplustech.com/tools/kinship) · [Glider](https://glidertech.com/outcomes/golden-thread/) · [Operance](http://extranetevolution.com/2021/07/building-safety-bill-opens-opportunities-operance/) · [ACC Kitemark](https://www.autodesk.com/blogs/construction/driving-digital-standards-autodesk-construction-cloud-achieves-bsi-kitemark-certification-for-iso-19650/) · [ACC 2026](https://resources.imaginit.com/building-solutions-blog/what-s-new-in-autodesk-construction-cloud-2026-a-practical-guide-to-the-latest-features) · [Autodesk Assistant](https://www.autodesk.com/blogs/construction/january-2026-autodesk-construction-cloud-releases-built-for-whats-next/) · [Revit Public MCP Server](https://www.autodesk.com/blogs/aec/2026/06/17/revit-public-mcp-server/) · [OSS Revit MCP](https://github.com/LuDattilo/revit-mcp-server) · [Motif funding](https://barvea.com/en/blog/agentic-bim-startups-challenging-revit-2026) · [NXT BLD 2026](https://aecmag.com/nxt-bld/nxt-bld-2026-a-decade-of-looking-around-corners) · [Bonsai](https://bonsaibim.org/) · [iBuilder/massing](https://github.com/ibuilder/massing) · [BIMcollab pricing](https://www.capterra.com/p/219241/BIMcollab-Cloud/) · [Solibri pricing](https://www.selecthub.com/p/building-information-modeling-software/solibri/) · [ISO 19650 revision](https://barvea.com/en/blog/iso-19650-revision-2026-information-management) · [Middle East mandates](https://www.asite.com/blogs/why-the-iso-19650-standard-matters-for-the-middle-east-aeco-industry) · [Global mandates 2026](https://www.taaltech.com/global-bim-mandates-for-2026/) · [Owners evaluate BIM vendors](https://revicadsolutions.com/blogs/how-owners-epcs-evaluate-bim-vendors-2026/)
