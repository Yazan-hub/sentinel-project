# Information-management procedure on Sentinel (ISO 19650-2, one section per clause)

This is the procedure a customer organisation adopts when it runs its projects on Sentinel, written so an assessor can
read a clause, then watch the tool do it. Every step names the screen (web or Revit) and the ledger row it leaves. The
functions are the ones in `docs/handbook/04-core-workflows.md` and `05-capability-status.md`; nothing here is planned.

## 5.1 Assessment and need (the appointing party)

1. **State the requirements as installed standards, not prose alone.** The information requirements are installed on
   the office (its projects inherit) or on the project: element data requirements as `ids@n` (Documents ▸ EIR ▸ Compile
   to IDS ▸ Install, or Settings ▸ Standards), container naming as `naming@n`, the IFC delivery contract as `contract@n`,
   the DWG layer map as `layers@n`, the level-of-information-need matrix as `lod_matrix@n`. The Base pack (Packs ▸ Base
   standard ▸ Install on office) is the generic starting point any office overlays.
2. **Every standard is a versioned artefact on the ledger** (`kind@n · source · sha256`): every judge — the naming gate,
   the IDS gate, the delivery gate, the Federation Gate, Revit's own checks — names which version judged what.
3. **The EIR is a governed document** (Documents ▸ + New document ▸ EIR), versioned and reviewable like any other.

## 5.2–5.3 Invitation to tender and tender response

1. **Tender and bids** are recorded per revision (Coordination ▸ Tenders): the issuing lead, the bids a contributor
   enters, the award — each a ledger row by the person's own identity.
2. **The pre-appointment BEP** is drafted as the BEP document (Documents ▸ + New document ▸ BEP) and kept in draft until
   appointment.

## 5.4 Appointment

1. **The BEP is confirmed** as a published version of the BEP document; the Next strip's step "BEP drafted" turns done.
2. **The MIDP** is the project's delivery plan: every proposal that names a container records the MIDP's word on its
   ledger row (planned / unplanned), and the 4D programme shows each container ready, late or at risk against it.
3. **Each task team's TIDP** is a governed document (Documents ▸ + New document ▸ TIDP; the Next strip's "TIDP drafted"):
   deliverables as the naming standard writes them, milestones from the MIDP, the review and authorisation route.

## 5.5 Mobilisation

1. **Everyone signs in as themselves** — on the web and in Revit (Sentinel ▸ Sign in). No workstation holds a shared
   credential; the bridge accepts its machine credential from its own PC only.
2. **Revit reads every standard from the project** (Sentinel ▸ Project Setup binds the model to its project key): the
   ruleset, the IDS, the naming, the contract, the layers, the type catalogue — nothing is copied to a workstation.
3. **The Next strip** (web and the Revit pane) says the next step for the project or the office, from stored facts.
4. **Members see each other.** Every member of a project, a viewer included, can read the project's member list with each
   person's e-mail and role (the bridge's members route and the BCF extensions' users), as the ledger already names every
   actor to every member; only a lead or owner changes it (Settings ▸ Members), and only an owner grants or removes an owner.
   Decided by the founder on 2026-10-08 after the two-account drill (W-2).

## 5.6 Collaborative production of information

1. **The CDE states** WIP → Shared → Published → Archived are the database's state machine (`cde_transition`, the only
   path since migration 0031); each transition is a ledger row with the actor.
2. **Container naming** is judged on every upload and every publish by `naming@n` (enforce = reject): a wrong name is
   refused in words; a candidate name is proposed (Naming Manager).
3. **Check (the delivery gate).** Any IFC — from Revit's Governed Publish or dropped on Governed Intake — is judged
   by the IDS in force, the contract in force and the naming in force before it becomes a version. A refusal is held
   (Project Files ▸ On hold) with its reasons; nothing enters the CDE un-judged. The verdict is a ledger row
   (`verdict: accepted | refused`) and a receipt a client can verify (`GET /receipt/:key/:id`).
4. **Review and authorise.** A version enters the project's review chain (`review@n`: named steps, roles, approvals)
   only on an accepted verdict; each decision is a `review:` row by the reviewer's identity; the Published state is set
   on the web after the chain closes.
5. **Federation.** The Federation Gate's six data checks run across the live models before any clash run; the clash
   register is locked until the gate passes; clashes are raised as BCF issues, each with its elements' IFC GlobalIds.
6. **Issues** are BCF topics, inside Sentinel and over the open BCF-API 3.0 surface (`/bcf/3.0/…`, OAuth2 sign-in): a
   stock BCF client sees the same issues, comments and viewpoints; a governed issue (IDS, Federation) closes by a lead.
7. **Status and revision codes** ride on every version (suitability, revision); a deleted file or version is never
   erased (Project Files ▸ Deleted items).

## 5.7 Information model delivery

1. **Delivery against the MIDP:** the proposal rows and the 4D programme show each container's standing.
2. **Acceptance:** a version is accepted by the delivery gate's verdict and the review chain's decisions; both are on
   the ledger.
3. **Asset information:** each governed IFC's COBie hand-over measure (maintainable assets and their FM fields) is
   stored on the version's manifest and shown for hand-over readiness.

## 5.8 Project close-out

1. **Archive:** the Archived state; published versions are immutable at the database.
2. **The record:** the ledger is append-only and hash-chained at the database (migrations 0002, 0015); the project's
   **audit pack** (`GET /cde/:key/audit-pack`, a lead's; named the evidence pack until MA-4a) gathers the standards in force, the documents, the
   containers and versions, the review chains and every ledger row with its hashes into one JSON sealed by sha256 — the
   file to hand an assessor.

## Security (ISO 19650-5 questions)

Row-level security at the database; per-person sign-in everywhere; the machine credential confined to the bridge's PC;
the private CDE end-to-end encrypted with per-project keys and a rotation path; two audits on file
(`docs/SECURITY_AUDIT_2026-07.md`, `docs/security/2026-09-27-bridge-route-audit.md`).
