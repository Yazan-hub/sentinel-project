# Sentinel — Implementation Roadmap

Two parallel lanes: the **product** that ships, and the **pilot** that proves it in a real studio (Badran Design Studio). Status is honest — `shipped` is verified, not aspirational.

Legend: ✅ shipped & verified · 🟠 in progress · ⬜ next · 🔭 later

---

## Lane 1 — Product / build

### ✅ Foundation & governance core *(shipped)*
- **Governed Publish loop, live end-to-end** — one Revit button: export → IFC delivery gate → IDS adjudication → immutable verdict → publish-on-pass → live BCF. Verified on a real building (the Snowdon Towers sample).
- **Pure governance engine** (`sentinel-core`) — IDS validation, ISO 19650 gates, naming, clash/quantities/carbon — the *same* code in the browser and, bundled, on the bridge. **85 passing unit tests.**
- **ISO 19650 CDE** on Supabase — container state machine (WIP→Shared→Published→Archived), suitability, versioning, folders; single source of truth (all stores consolidated into Postgres).

### ✅ Trust & security hardening *(shipped)*
- **Immutable audit ledger** — hash-chained, and made **physically truncate-proof at the Postgres core**: UPDATE/DELETE/TRUNCATE blocked by triggers + least-privilege grants, so even a compromised bridge or DBA cannot rewrite, delete, or wipe it. Verified on the live database.
- **RLS + JWT-forwarding** — row-level security across the schema; the signed-in user's token drives RLS, verified end-to-end. **Envelope encryption** for zero-knowledge project keys.
- **CSRF origin-gating**, loopback bind, atomic writes, hardened SECURITY DEFINER functions (closed an anon privilege-escalation path).

### ✅ Config-driven gates *(shipped)*
- **Naming gate** — the file name is validated against a swappable JSON ruleset (BDS's 11-field ISO 19650 form), enforced `reject`.
- **Element gate** — a swappable IDS ruleset with per-ruleset enforcement (`reject` / `warn` / `off`), so a pilot loosens data checks at schematic and tightens by stage.
- **Reject → BCF** — failing requirements auto-raise deduped issues that live-sync into Revit; the governed version gets a ✓/✗ badge and the uploaded geometry (Open 3D).
- **Referee API + MCP server** — an AI agent can propose elements and get a deterministic, immutably-recorded verdict.

### 🟠 BDS ruleset activation *(in progress)*
- Real BDS **LOD-300 element checks** (named + `Pset_BDS.Discipline` + wall/door `FireRating` + window `ThermalTransmittance`) live as `enforce: warn`; the Revit extractor emits those parameters. Deploying to the pilot workstations.

### ⬜ Office-agnostic Base template & certification *(next)*
- A **Base ruleset** (naming + element IDS) that any office adopts and overlays — the BDS docs are the pilot's reference, not the product standard.
- **BSI Kitemark / ISO 19650 attestation** and a public **BCF-API 3.0 / openCDE** endpoint (the loop runs internally already — this is the paperwork gap vs. certified CDEs).

### ⬜ Production readiness *(next)*
- Retire the **service-key fallback** (a few audit writes still use it by design) in favour of full forwarded-JWT writes.
- **Multi-user rollout** (memberships + roles are built; verify at team scale), **CI running on the remote**, and a **hosted deployment** of the bridge.

### 🔭 Later — the platform bets
- **Auto-4D** and **5D revision-diff** from the shared element-snapshot spine; **6D carbon** via the EC3 EPD API by reference.
- **Living handover / owner-FM portal**; **cross-model referee** at portfolio scale.
- The **"propose API" as a public product** — the referee AI-generated BIM validates against before a human sees it.

---

## Lane 2 — BDS pilot deployment

A 10-person boutique studio moving to LOD-300 schematic deliverables under remote management (Amman ↔ Germany). Sentinel is the automated enforcer on the studio floor.

### 🟠 Phase 1 — Foundation *(≈ month 1)*
- Stand up the **Supabase CDE with RLS**; configure the **ISO 19650 ruleset** (naming + element IDS) for BDS in the two config files.
- Set the **trust boundary**: the bridge is the referee between local authoring and the cloud CDE (ACC or local storage).
- **Hardware**: upgrade the two pilot workstations (i7/i9 12th-gen+, 32 GB RAM, RTX 3060+) to prevent local IFC-export timeouts.
- **Data minimisation**: swap the default rate/EPD tables for local Jordanian cost + regional EPD data (by reference — 5D/6D stay derivation-only); cede geometric clash to Navisworks/Revizto.

### ⬜ Phase 2 — Training *(≈ months 2–3)*
- Onboard the **2-person pilot team** to the streamlined **4-panel Revit ribbon**.
- Because the interface is clean, training focuses on **data integrity** — unlearning 2D drafting lines, learning correct category/parameter assignment so schematic models pass the automated gate.

### ⬜ Phase 3 — The pilot *(≈ months 3–5)*
- **Governed Publish goes live** on a mid-sized LOD-300 schematic project.
- Every design update is a one-button publish; missing parameters or naming violations are **auto-logged as BCF tasks** that sync back into Revit — resolved locally, without waiting on the remote consultant.
- Weekly coordination reviews of the audit ledger; data checks tighten from `warn` toward `reject` as the model matures.

### 🔭 Phase 4 — Expansion *(6 months+)*
- Roll the **verified template** out to the full studio; add multidisciplinary coordination routines and cross-discipline referee checks.

### Roles
- **BIM Manager (external consultant)** — system architecture, ruleset updates, audits the cryptographic ledger.
- **BIM Coordinator (senior architect)** — on-site first responder; model health, workspace file structure; geometric clashes in Navisworks (Sentinel handles data clashes).
- **BIM Modellers (production)** — component authoring to LOD-300; resolve the live-synced BCF feedback locally.

---

## How the lanes connect

The pilot is the product's proving ground and its source of hardening: the live Snowdon run surfaced real bugs (large-model timeouts, a NUL-byte Postgres 500, a field-vs-property serialization crash) that no unit test caught — all fixed. Each pilot phase feeds the product lane, and the config-driven gates mean the pilot's BDS rulesets are swapped for the office-agnostic **Base template** with no code change.

See also: [`docs/BDS_GATE_CONFIG.md`](docs/BDS_GATE_CONFIG.md) (how to configure the gate), [`docs/PILOT_DEMO_RUNBOOK.md`](docs/PILOT_DEMO_RUNBOOK.md) (run the demo), [`docs/STRATEGIC_REVIEW_2026-07.md`](docs/STRATEGIC_REVIEW_2026-07.md) (the strategic wedge), and [`docs/roadmap.html`](docs/roadmap.html) (the interactive build map).
