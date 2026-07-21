# 07 · Decision log — the *why*

The reasoning behind every major call. This is the page that lets you **defend** Sentinel in a conversation — when someone asks "why not just do X?", the answer is here, with the trade-off named honestly. Format: Context → Decision → Why → Trade-off.

---

### D-01 · Compete on *data* clash, not geometric clash
- **Context:** Clash detection is a crowded space; Navisworks and Solibri own hard-surface geometric clash.
- **Decision:** Deliberately **cede geometric clash** and compete entirely on **data clash + standards compliance** (is the information correct, complete, conformant?).
- **Why:** It's a defensible, under-served wedge that rides the regulatory wave; fighting Navisworks head-on is a losing battle; and *data* correctness is what regulators and the golden thread actually demand.
- **Trade-off:** Prospects who equate "BIM checking" with "clash detection" need re-education. We answer "we're the layer that checks the *information*, and we hand geometric clash to the tool you already use."

### D-02 · 5D/6D are derivation-only, never an estimating product
- **Context:** Cost (5D) and carbon (6D) are tempting to build out fully.
- **Decision:** Keep them as **lightweight, read-only panels** that derive from already-validated quantities, referencing external data.
- **Why:** Full estimating is a different, deep product with entrenched incumbents; our value is *trustworthy quantities*, and once quantities are governed, cost/carbon are a cheap by-product that showcases the moat without a huge build.
- **Trade-off:** We won't win an evaluation run as "the cost tool." That's intended — it's a proof-point, not the pitch.

### D-03 · Gates are swappable config, and BDS is a *reference*, not a bible
- **Context:** The pilot needed a concrete standard; BDS BIM documents were available.
- **Decision:** Drive both gates from **config files** (`naming-ruleset.json`, `ids.json`) and treat BDS as *one profile*. A future office-agnostic **Base template** just replaces two files — no code change.
- **Why:** Hard-coding one firm's standard would make Sentinel unsellable to anyone else; config-driven gates make "install a standard → the platform enforces it" real.
- **Trade-off:** More upfront design than hard-coding; the Base template is still ⬜ planned.

### D-04 · Immutability enforced at the database core, not in app code
- **Context:** An audit trail is only trustworthy if it can't be quietly edited — including by us.
- **Decision:** Enforce append-only with **PostgreSQL triggers** (`BEFORE UPDATE/DELETE/TRUNCATE`), hash-chain the rows, revoke write grants, and **own the table as `postgres`** so even the service key can't drop the triggers.
- **Why:** Application-level "please don't edit" is theatre; a notary's ledger must resist its own operator. This is what makes "on the record" a real claim.
- **Trade-off:** Rigid by design (you genuinely can't fix a bad row — only append a correction). That rigidity *is* the feature.

### D-05 · One pure engine runs in both the browser and the bridge
- **Context:** The same validation could be written twice (client + server) and drift.
- **Decision:** A single **pure `sentinel-core`** (no DOM/Node/platform deps), bundled for both.
- **Why:** Guarantees the referee gives an identical verdict everywhere; enables the client-side Sandbox to run the *real* engine, not a mock; easier to test (85 tests on pure functions).
- **Trade-off:** The engine must stay dependency-free — a discipline to maintain.

### D-06 · A single Node bridge is the trust boundary
- **Context:** The browser and Revit can't be trusted with the service key.
- **Decision:** Put **all secrets in one small Node bridge**; forward the user's JWT so the database (RLS) is the real access boundary; use the service key only for deliberate internal writes.
- **Why:** One place to secure, reason about, and audit; keeps untrusted clients truly untrusted.
- **Trade-off:** The bridge is a single point that must be hardened (the F2 auth-gate work) and, for production, networked with care.

### D-07 · Position downstream of authoring — a referee, not a rival
- **Context:** Building yet another authoring tool or CDE would mean fighting giants.
- **Decision:** Sit **downstream of every tool** as the governance/verdict layer.
- **Why:** Any tool or AI agent can propose; being the neutral referee is a seat nobody else holds and that gets *more* valuable as authoring proliferates.
- **Trade-off:** Depends on interop being solid (hence D-08); we don't own the authoring relationship.

### D-08 · buildingSMART open standards as the spine
- **Context:** Could use proprietary formats.
- **Decision:** Build on **IFC + IDS + BCF** (open standards).
- **Why:** Tool-agnostic by construction, credible to a standards-literate audience, and future-proof against any single vendor.
- **Trade-off:** Bound to the standards' maturity and quirks.

### D-09 · Warn-first enforcement (naming = reject, data = warn)
- **Context:** A gate that blocks everything early gets switched off by frustrated users.
- **Decision:** Default **naming to `reject`** (cheap to fix, unambiguous) and **element data to `warn`** (incomplete early-stage models shouldn't be blocked), each independently configurable.
- **Why:** Adoption. A gate people leave on beats a strict gate people disable.
- **Trade-off:** "Warn" means non-conformant data can still pass early — deliberate, and tightened as a project matures.

### D-10 · Supabase / PostgreSQL + RLS as the backend
- **Context:** Needed auth, a relational DB, and row-level access control fast.
- **Decision:** Use **Supabase (managed Postgres)** and lean on **RLS** for tenancy.
- **Why:** Real Postgres (triggers, ownership → the ledger), RLS for per-user access without hand-rolling authz, fast to build.
- **Trade-off:** The service key bypasses RLS, so the bridge boundary and RLS policy correctness are load-bearing (see the security audit).

### D-11 · The regulatory wave (golden thread) as the GTM wedge
- **Context:** "Better BIM QA" is a weak, crowded sell.
- **Decision:** Target the **compliance / golden-thread** need created by regulation (e.g. UK Building Safety Act), aimed first at boutique studios moving to LOD 300.
- **Why:** Regulation creates a *must-have*, not a nice-to-have, and Sentinel's ledger produces the required record for free.
- **Trade-off:** Tied to regulatory timelines and jurisdictions; needs the certification/hosting work (⬜ planned) to fully land enterprise.

---

*When you make a new significant decision, add it here the same day — the reasoning is worth more than the outcome, and it's the first thing that fades from memory.*
