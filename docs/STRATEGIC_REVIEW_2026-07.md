# Sentinel — Strategic Deep Review & Sector-Defining Positioning

*Prepared 2026-07-19. Synthesis of four parallel research/review streams (internal production-readiness review, 2024–2026 market pain-points, competitive white-space map, emerging-tech futures) fused with the existing strategy docs (`platform-vision.md`, `cde-market-analysis.md`, `killer-features-vision.md`). Internal findings verified against source; where a stream erred, the correction is noted inline.*

---

## 0. Executive summary

Sentinel already sits in an intersection **no other product occupies**: web-native large-model viewing **+** rigorous ISO 19650 governance with an immutable audit trail **+** IDS-gated approvals **+** a live open BCF loop **+** the 5D/6D/7D lifecycle **+** a grounded AI copilot **+** client-side E2E encryption — all over **one governed dataset**. Every serious competitor holds a subset and is structurally unable to assemble the rest quickly (Autodesk/Aconex are governance-strong but closed and mutable-audit; Catenda is openBIM-pure but shallow; Solibri/BIMcollab are validation islands; Motif/Arcol/Qonic are well-funded but have *zero* governance; That Open/Speckle are libraries with no platform).

**The wedge — one sentence:** *Let a thousand authoring tools and AI agents **propose**; Sentinel is the **Governed Element Graph** where their output becomes **true** — validated by IDS, governed by ISO 19650, recorded immutably, portable by right.* Sentinel owns the **referee / trust-and-record layer**, the "disposer" seat, not the editor — the position that (a) every 2024–2027 trend converges on, (b) incumbents cannot take without cannibalizing their seat/lock-in economics, and (c) the BIM-2.0 startups aren't even contesting.

**But the foundation isn't yet real-product-grade.** The single hard truth from the code review: **the entire CDE's only security boundary today is "can you send HTTP to the bridge?"** That must be closed before any of the strategy ships to a second user. The good news — the *hard, differentiating* parts (the 19650 state machine, immutable audit, IDS validation, live BCF, E2EE) are genuinely well-built; the gaps are the *unglamorous* ones (auth, persistence, CI) that are well-understood to fix.

**Three moves, in order:** (1) **Harden the foundation** (auth + durable persistence + CI) — 4–6 weeks, non-negotiable. (2) **Sharpen the wedge into a crisp product story** — "IDS-gated 19650 with a cryptographic golden thread + a live open Revit loop, portable by right." (3) **Time it to the regulatory wave** — BSA Gateway (now), Finland permit mandate (Jan 2026), EU Data Act portability (Sept 2025), EPBD embodied carbon (2028/2030), NIS2 — each is a *buying trigger* for exactly what Sentinel already does.

---

## Part I — Internal Deep Review: Weaknesses & Resolutions

Severity: **Critical** = blocks any real multi-user deployment · **High** = data-loss / integrity risk in realistic use · **Medium** = quality/robustness debt.

| # | Sev | Area | Weakness (verified) |
|---|-----|------|---------------------|
| 1 | 🔴 Critical | AuthZ | Bridge is an **unauthenticated, CORS-`*` proxy holding the Supabase service key** — reaching `:4100` = owning the whole CDE. `actor`/`author` fields are client-asserted, so the audit chain hash-chains *spoofable* identities. `memberships`/`parties` tables exist but are never used — the role model is schema fiction. |
| 2 | 🔴 Critical | Persistence | **Split-brain:** 5 local JSON stores + Supabase. JSON writes are non-atomic full-file rewrites; a crash mid-write truncates the file and the next boot **silently reinterprets corruption as "first run" and starts empty** — total, unsurfaced loss of all BCF/RFI/tender history. |
| 3 | 🟠 High | CI / tests | **No CI and near-zero automated tests.** Only `sentinel-core/self-check.ts` (naming-rule engine), not even wired into an npm script. Phase-1 (hub/switcher) and Phase-2 (encryption) have **zero** coverage. *(Correction: the reviewing stream claimed "no git repo" — that is false; this is a git repo on `master` with this session's commits. The real gap is CI + tests, not VCS.)* |
| 4 | 🟠 High | E2E crypto | Lost passphrase = **irrecoverable data**; no rotation/revocation; the per-browser verifier **fails open on a new device** — a mistyped passphrase silently encrypts uploads under a wrong key, forking the team's blob set. |
| 5 | 🟠 High | Reliability | Single-process SPOF; `/ifc` buffers whole uploads in RAM with **no size limit**; IFC→fragments conversion runs **on the main event loop**, starving SSE/BCF during large conversions; upload pipeline has duplicate-upload + poison-file gaps. |
| 6 | 🟠 High | Blob store | `/cde/files` takes anonymous ≤512 MB writes, unlimited count, no project scoping, no GC → trivial disk-exhaustion DoS (which also triggers #2's corruption path). |
| 7 | 🟡 Med | Secrets | A **duplicate `.env` at `WebApp/config/.env`** (123 B, exists on disk) sits inside the frontend tree — one misconfigured static-serve from shipping a key to browsers. *(Verified: `config/.env` itself **is** gitignored and untracked — that control works. Delete the duplicate; rotate both keys given prior leakage in memory.)* |
| 8 | 🟡 Med | DB integrity | Audit hash-chain trigger reads `last_hash` with **no lock** → two concurrent inserts fork the chain (verifier falsely flags tampering). Serialized today only by the single-threaded bridge — breaks the moment there are two writers. |
| 9 | 🟡 Med | Crypto design | Deterministic public salt (`SHA-256("sentinel-cde:"+projectKey)`) + a human "shared team passphrase" enables per-project offline dictionary attack (PBKDF2-210k only slows it). |
| 10 | 🟡 Med | Revit add-in | Multi-version 2021–2027 handled *well*, but nothing builds all seven targets (no CI) so a 2024+ API breaks 2021–2023 silently; `ExternalEvent` hub swallows **every** exception with no logging (undebuggable support); `DeployToRevit` defaults **true** (overwrites live add-in on any build). |
| 11 | 🟡 Med | Hotspots | `activePid()` — 38 edges across 19 panels (global mutable singleton; any project-switch-semantics change touches 19 files). `bcf-service.mjs` = 511-line monolith over five stores. Clash + IDS run **O(n²) on the UI thread** (a 50k×50k federated pair ≈ 2.5×10⁹ tests → multi-second freeze). |

**What's genuinely production-shaped already** (don't rebuild): the C2 state machine + published-immutability + append-only-audit design; path-traversal guarding on both file endpoints; the outbox watcher's stability-wait/in-flight/re-sweep; correct WebCrypto primitive usage (AES-GCM, random IVs, non-extractable keys, OWASP-level PBKDF2); the Revit multi-version csproj + ExternalEvent threading discipline.

### Resolutions — recommended order of attack

- **Week 0 (stop the bleeding):** delete `WebApp/config/.env`; rotate the Supabase service key + That Open token; bind the bridge to `127.0.0.1`; replace CORS `*` with a platform-origin allowlist; make JSON writes atomic (temp-file + `rename`) and **loud on parse failure** (rename-aside + log, never silent "first run"); add a request body-size cap. *(Days of work; removes every silent-total-loss path.)*
- **Weeks 1–3 (make it a real product):** ship the deferred **C4 — Supabase Auth + RLS policies** keyed on `memberships` (`user_id = auth.uid()` through `project_id`) for all 8 tables; move the browser to a per-user JWT + anon key so the bridge shrinks to only what needs server secrets (`/ifc` upload + outbox). Migrate the 5 JSON stores to Postgres (`0004`; the `cde-store.mjs` PostgREST pattern is the template). Move IFC→fragments to a `worker_thread`/child process. Add the audit-chain advisory lock.
- **Weeks 3–6 (durability + trust):** rework E2E to **envelope encryption** (random per-project data key, wrapped per-member) — *do this before real encrypted data accumulates under the current scheme; migrating ciphertext later is far worse* — with a **server-side wrapped-key + KCV verifier** so a wrong passphrase is caught on any device *before* anything encrypts. Stand up CI (GitHub Actions: `vite build` + `vitest` + `dotnet build` across RevitVersion 2021–2027 with `-p:DeployToRevit=false`) and a `vitest` baseline over the pure `sentinel-core` modules (`clash.ts`, `ids-parse.ts`, the crypto round-trip — afternoon-sized wins guarding user data). Worker-ize `findClashes`.

---

## Part II — The Market: pain, priced and dated

The seven current bottlenecks share one root — **information is not governed as a single validated dataset across the lifecycle; it degrades at every boundary** — and each degradation now carries a 2024–2026 price tag *or* a legal deadline:

| Pain point | The number / the deadline | Why current tools fail |
|---|---|---|
| **Handover / FM gap** | ~**$2.1T/yr** global handover value destroyed; owners re-key O&M at 2–4% of project cost; one hospital = £200k + 6–12 mo | COBie is a one-off end-of-job export, not a governed dataset; substitutions never flow back into the model |
| **Golden thread / BSA** | UK Gateway 2 median **~43 weeks** (48 in London); **~75% rejected** for inadequate information | Audit trails are mutable/time-boxed (ACC log = 12 mo); "compliance" is prose in dead PDFs |
| **Field / site disconnect** | only **41%** use BIM in the field; **62%** saw model-vs-as-built discrepancies; bad data drives ~48% of **$31B/yr** US rework | Models too heavy/desktop-bound for site; the flag-it-see-it-fixed feedback loop is broken, so trust never accrues |
| **Data quality / IDS** | IDS official since **June 2024**; Finland mandates BIM permitting **Jan 2026** | Revit has **no native IDS**; validation happens late, in a separate tool, on an exported IFC — outside the CDE where the accept/reject decision lives |
| **Autodesk lock-in revolt** | AEC Collection +8–12%/yr; **SEC investigation** into billing; Nordic 14,000-architect letter | Grievance moved from "too expensive" to "**we don't control our data**" — a procurement criterion |
| **Embodied carbon** | EPBD WLC disclosure **2028** (>1000 m²) → **2030** (all); CALGreen 50k sf **Jan 2026** | LCA runs on manual takeoffs from stale models; the reported number can't be traced to the governed record |
| **AI-in-BIM** | RICS 2025: **45% use no AI, 1% at scale** vs 86% expecting it | Models trained on raster/text, not the vector/graph BIM data; the prerequisite is a clean governed dataset the industry lacks |

**Competitive landscape (condensed):** governance-strong-but-closed incumbents (**ACC**, **Aconex**); openBIM-pure-but-shallow (**Catenda**); validation islands (**Solibri**, **BIMcollab** — both desktop-executed); live-loop-but-proprietary (**Revizto**); well-funded startups with **zero governance** (**Motif**, **Arcol**, **Snaptrude**, **Qonic**); open libraries with no platform (**That Open** — Sentinel's own substrate — **Speckle**). **Two threats to watch:** **Autodesk Forma** consolidation (ACC folded in; Mar 2026 unification) and **BIMcollab**'s CDE+MQA merge — both assembling adjacent pieces, *neither* has immutability, E2EE, or a live standards-based Revit loop.

---

## Part III — The white space & the wedge

Six openings where nobody is strong and Sentinel already holds the asset:

- **W1 · Cryptographically immutable golden-thread audit inside a *model-native* CDE.** Only Aconex markets immutability (document-centric, dated); ACC's log is mutable + 12-month-capped. Regulatory demand is acute (75% Gateway-2 rejection). **→ Package the shipped immutable audit as BSA/Gateway evidence.**
- **W2 · IDS validation as the *gate* in the 19650 approval flow (validate-on-upload).** Every IDS implementation today is a *standalone checker*; no CDE gates WIP→Shared→Published on IDS. **→ Wire the two systems Sentinel already has together — a capability incumbents can't match without re-architecture.**
- **W3 · Live, standards-based web⇄Revit BCF loop with cross-run clash dedup.** Revit has no native BCF; Revizto's live sync is proprietary; BIMcollab's is manual + desktop. **→ Sentinel's SSE loop + dedup'd clash→BCF is the *open* version of Revizto's moat, inside a governed CDE Revizto lacks.**
- **W4 · 5D/6D/7D as *governed dimensions of one dataset*, not plugin exports.** Cost/carbon/COBie are disconnected silos losing ~30% of lifecycle data. **→ The "one dataset" thesis is the direct answer to the handover gap.**
- **W5 · AI copilot grounded in the *governed CDE dataset*, not PDFs.** Every shipped assistant grounds in documents/drawings; none can answer "who approved this container, does it pass IDS, what clashes touch it?" **→ Sentinel's copilot over model + audit + issues is a category of one.**
- **W6 · E2E-encrypted, sovereignty-first CDE for regulated / critical-infrastructure work.** No mainstream CDE offers client-side E2EE; NIS2 obliges encrypted workflows for ~100k EU orgs; construction was the 3rd-most ransomware-targeted sector in 2025. **→ Target defense, energy, NIS2-scope owners where incumbents can't follow quickly.**

**The synthesized POV — the single most defensible wedge: Sentinel as the Governed Element Graph.** Every trend converges on it (IFC5 makes the element graph the standard's own shape; IDS/bSDD make requirements executable against it; agents need a grounded, permissioned graph to act on and the market is fleeing metered proprietary substrates; the golden thread makes the governed graph a *legal deliverable*; generative design needs a deterministic *disposer*; the EU Data Act makes portability a compliance requirement; real-time collaboration is being commoditized *ungoverned* — governance is the unclaimed layer). It's the position incumbents structurally can't take (it cannibalizes seat/metered-API economics) and the startups aren't contesting (they all want the *proposer*/authoring seat). And Sentinel already holds every required asset — the wedge is not a pivot, it's the thesis sharpened.

---

## Part IV — The sector-changing play

**Positioning line:** *"GitHub for code, Stripe for payments — Sentinel is the trust-and-record layer for the built asset."* Own the layer where output becomes true, not the editor.

**Sequenced plan:**

1. **Foundation (Weeks 0–6, Part I).** Non-negotiable. Nothing below ships to a second customer until auth + durable persistence + CI exist.
2. **Sharpen the three wedge features into ONE demo** (Weeks 6–12): *validate-on-upload IDS gate → immutable golden-thread record → live Revit BCF resolution.* This is the "validate → govern → prove → resolve" loop no incumbent can run end-to-end. Make it the headline of the overview site and every pitch.
3. **Ride the regulatory wave** (ongoing, this is the go-to-market): each mandate is a buying trigger —
   - **BSA Gateway / golden thread (UK, now):** package W1 as "Gateway-3-in-a-click" mapped to the Building Safety Alliance Master Document List.
   - **Finland BIM-permit mandate (Jan 2026) / Norway SIMBA / Estonia:** W2 IDS-gated approvals are exactly what permit-mandate jurisdictions procure against.
   - **EU Data Act portability (Sept 2025):** make **portability the product's trust signature** — one-click full-fidelity export (IFC + IDS results + BCF + signed audit chain), marketed as *"your exit is always loaded."* In a Data-Act world, "we're legally easy to leave" is the sharpest weapon against ACC/Aconex.
   - **EPBD embodied carbon (2028/2030) / CALGreen (2026):** W4 — a regulator-defensible WLC number derived from the same validated model that passed IDS, carrying the audit trail.
   - **NIS2 (EU):** W6 — E2EE CDE for regulated/critical-infrastructure owners.
4. **Open-core business model:** open-source the schema + export tooling (portability credible, not cosmetic — leaning on the That Open foundation); the paid tier is the **govern-and-verify services** (IDS engine, state machine, audit, copilot). **Price per-project, unlimited users** — the CDE anti-pattern is per-seat tolls on subcontractors; unlimited-external-user is a proven wedge (Catenda, Dalux, Bricsys).
5. **Become the neutral agent substrate:** expose the governed graph via an **MCP server** so customers' own AI agents work against Sentinel; agents may only *read* the audited graph and *propose* changes as BCF issues / draft transitions — every agent action lands in the immutable log. Open a **"propose API"** so any generator (Sentinel's copilot, a Text2BIM agent, an MEP solver) submits candidates that the IDS engine + 19650 machine adjudicate deterministically. Sentinel doesn't need to win generative design — it needs to be *the referee every generator must pass.*

**Strategic prep for the next standards epoch:** IFC5's ECS-over-JSON with USD-style layering **is** a governed element graph with per-state overlays — Sentinel's data model is already the target shape while file-centric incumbents must re-platform. Represent elements as components + governed layers now so IFC5 export becomes a serialization, not a migration; ship a public IFC5 sandbox early (small players win standards-transition moments incumbents with frozen cores cannot).

---

## Part V — Honest risks & what to validate

- **The foundation gap is real and gating.** The wedge is worth nothing until Part I Week 0–6 is done; resist the temptation to build more wedge features on an unauthenticated single-process prototype.
- **Distribution, not technology, is the hard part.** Speckle won on bottom-up open-source adoption, not features. The open-core + portability posture is as much go-to-market as engineering.
- **Two fast-moving threats:** Forma's consolidation and BIMcollab's CDE+MQA merge could close adjacent gaps — but neither has immutability, E2EE, or a live open Revit loop, and both carry lock-in. Move on the regulatory-evidence framing (W1/W2/W6) before they do.
- **Verify before betting:** IFC round-trip fidelity is undocumented industry-wide (link/reference, don't round-trip); "certified 19650" claims are self-declared (buildingSMART runs no BCF/OpenCDE certification); enterprise pricing for incumbents is quote-driven/directional.
- **AI framing discipline:** don't sell "AI features" — sell the *substrate* AI needs (IDS-validated, audit-trailed, semantically consistent data), then layer narrow, checkable AI where wrong answers are cheap to catch. Per the 2025 evidence that's the only version of AI-in-BIM that currently works.

---

*Sources: ~60 cited URLs across the four research streams (BSA/Gateway, EPBD, CALGreen, EU Data Act, Finland/Norway/Estonia mandates, Autodesk SEC filing, Speckle/That Open/Qonic/Arcol/Motif, IFC5/OpenUSD, IDS/bSDD, RICS AI, and every platform assessed) retained in the research transcripts. Internal findings verified against the working tree at commit `f5ebe35`.*
