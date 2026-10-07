# Certification readiness — ISO 19650 attestation and openCDE (2026-10-07)

The roadmap's "paperwork gap vs. certified CDEs" has two halves that are different in kind:

1. **BSI Kitemark for BIM (ISO 19650-2).** A Kitemark certifies an *organisation's* information-management process
   (an appointing or appointed party), assessed by BSI on site. A software product is not Kitemarked on its own. What
   Sentinel can be is the CDE that makes a customer's Kitemark audit short: every clause's evidence on the ledger, exportable.
2. **openCDE / BCF-API 3.0.** This one *is* a product conformance: buildingSMART's BCF-API 3.0 defines the endpoints a CDE
   must serve, and publishes a test harness. Sentinel serves the inner loop today; the public surface is incomplete.

This page maps what exists to what each needs, names the gaps, and orders the work. Evidence lines cite the handbook's
capability table (`docs/handbook/05-capability-status.md`) and the simulation-room record
(`docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`).

## 1 · ISO 19650-2 clause map (what a Kitemark assessor asks, and where Sentinel's evidence is)

| 19650-2 clause | What is asked | Sentinel today | Evidence | Gap |
|---|---|---|---|---|
| 5.1 Assessment and need | The appointing party's information requirements (EIR), standards, methods, reference information | Standards as artefacts: `ids@n` (element requirements), `naming@n`, `contract@n`, `layers@n`, `lod_matrix@n`, each `@n · source · sha` on the ledger; the Base pack any office adopts; Documents ▸ EIR ▸ Compile to IDS | cap. table rows 13, 16, 43–44; Session B3, BASE | none for the requirements themselves; the **EIR document** is held as a file, not a typed artefact (see G2) |
| 5.2 / 5.3 Invitation and tender response | Tender BEP, capability assessment, mobilisation plan | Tenders (bids per revision, 5D) exist for *cost*; no BEP object | cap. row 35 (tenders) | **G1: no BEP / TIDP artefact** |
| 5.4 Appointment | Confirmed BEP, MIDP, TIDPs | MIDP exists and judges every proposal and the 4D programme (item 5, item 6) | cap. rows 33, 39; Sessions B27–B29 | TIDPs are implicit (per-task rows in the MIDP); **G1** |
| 5.5 Mobilisation | Resources, IT, methods tested | The Next strip (standards in force, the next step), Revit reads every standard from the project (phase 4), per-user sign-in | cap. rows 14–17, 27 | none |
| 5.6 Collaborative production | CDE with WIP / Shared / Published / Archived; container naming; status and revision codes; check, review, approve, authorize | `cde_transition` state machine (the only path since 0031); naming gate (reject); IDS gate; Federation Gate; exact clash; Holding Area for refusals; the review chain (`review@n`) before Published; versions and revisions | cap. rows 9–11, 23–24, 30, 43–45, 54–55; Sessions D2, D3, B13 | none in function; **G2: the documented procedure** (the assessor reads a procedure, then checks the tool follows it) |
| 5.7 Information model delivery | Delivery against the MIDP, acceptance, COBie / asset information | Governed Publish needs a verdict; COBie measured per governed IFC; hand-over readiness | cap. rows 19–20, 36; Session B30 | none |
| 5.8 Project close-out | Archive, lessons learnt | Archived state; Deleted items never erased; the ledger is append-only and hash-chained | cap. rows 31, 45; `03-security-and-ledger.md` | **G3: an evidence-pack export** per project (today: `GET /cde/:key/audit` filtered, and the receipt verifier) |

Security and the ledger (ISO 19650-5 territory, which assessors increasingly ask about): RLS at the database, the
machine credential confined to the bridge's PC (PR-1, H6), per-person sign-in in Revit, the E2E private CDE, and two audits
(`docs/SECURITY_AUDIT_2026-07.md`, `docs/security/2026-09-27-bridge-route-audit.md`). **G4:** no third-party test yet.

**Verdict on half 1:** the *function* is there for every clause; what is missing is paperwork in the literal sense — a BEP/TIDP
object, a written procedure that mirrors the tool, and a one-click evidence pack. A customer could pass a Kitemark audit on
Sentinel today with manual exports; the three gaps make it routine.

## 2 · BCF-API 3.0 / openCDE conformance (the public endpoint)

What the bridge serves now (`WebApp/bridge/bcf-service.mjs`, `/bcf/3.0/projects/:pid/topics…`): list topics, create topic,
update topic status, add comment, add viewpoint — the loop Revit, the web and the gate use, behind the role check (a viewer
reads, a contributor writes, governed topics are a lead's). Through the Funnel a person's session is the bearer (PR-1).

The specification's required surface, and where Sentinel stands:

| BCF-API 3.0 | Required | Sentinel | Gap |
|---|---|---|---|
| `GET /bcf/versions` | yes | — | **C1** |
| `GET /bcf/3.0/auth` (OAuth2 discovery) | yes | — (bearer = Supabase JWT; no discovery document) | **C2**: publish the auth document; OAuth2 authorization-code flow against the sign-in provider |
| `GET /bcf/3.0/current-user` | yes | — (`/me` exists outside the BCF path) | **C3** (an alias) |
| `GET /bcf/3.0/projects`, `GET …/projects/{id}` | yes | — (`/cde/projects` outside the BCF path) | **C3** |
| `GET …/projects/{id}/extensions` | yes | — (topic types, statuses, priorities, users are in code) | **C4** |
| Topics `GET` list / `POST` | yes | ✅ | — |
| Topic `GET` single / `PUT` / `DELETE` | yes | `PUT` ✅ (status); `GET` single and `DELETE` — | **C5** (`DELETE` as the governed close, not an erase — the ledger keeps it) |
| Comments `GET` list / `GET` single / `POST` / `PUT` / `DELETE` | yes | `POST` ✅ | **C6** |
| Viewpoints `GET` list / `GET` single / `POST` / `DELETE`; `…/snapshot`; `selection`, `coloring`, `visibility` | yes | `POST` ✅ (with the viewpoint's components) | **C7** |
| Files (`GET`/`PUT` `…/files`) — the model references | yes | — (versions are the files; `ifc_item_id` + `frag_sha256` on every link) | **C8**: expose the current versions as BCF files |
| Documents, document references, related topics, topic events | yes | — | **C9** |
| Pagination, `$filter`/`$orderBy` (OData subset) | yes | `?status=&model=` | **C10** |

**Verdict on half 2:** 5 of ~30 operations. The missing ones are reads over stores that exist (topics, comments, viewpoints,
versions, members) plus three writes that map onto governed actions already on the ledger. The auth discovery (C2) is the
one design question: BCF clients expect OAuth2 authorization-code; Sentinel's sign-in is Supabase's — the bridge can serve
the discovery document pointing at Supabase's OAuth endpoints, or act as a thin OAuth2 front over its own JWT exchange.
Conformance is then provable with buildingSMART's public BCF-API test suite, run against the Funnel URL.

## 3 · The work, in order

| # | Slice | Size | Why this order |
|---|---|---|---|
| 1 | **openCDE reads** — C1, C3, C4, C5 (`GET`), C6 (`GET`), C7 (`GET` + snapshot), C8, C10 — **built 2026-10-08** (`WebApp/bridge/bcf-open.mjs`: versions, current-user, projects, extensions, one topic, comments, viewpoints with snapshot/selection/coloring/visibility, files; `$filter`/`$skip`/`$top` on the lists; GET only, a write is a 405 in words) | M | reads only; no new store; makes an off-the-shelf BCF client (BIMcollab Zoom, Solibri, Revizto) open Sentinel's issues |
| 2 | **openCDE writes + auth** — C2, C5 (`DELETE` = close), C6 (`PUT`/`DELETE`), C7 (`DELETE`), C9 — **built 2026-10-08**: `GET /bcf/3.0/auth` names this bridge's own `/oauth/authorize` and `/oauth/token` (authorization-code grant; the consent page signs in with Supabase in the browser, the bridge never sees a password, a 60-second single-use code swaps for that session's JWT — the bearer the bridge already takes; `refresh_token` forwarded to Supabase); `DELETE` topic = the governed close (lead for IDS/Federation topics; the ledger keeps it); comment `PUT`/`DELETE` by the author or a lead; viewpoint `DELETE`; related topics, document references, topic events; documents = the containers, their bytes refused in words (end-to-end encrypted) | M | the ledger already records each; the auth document decides the OAuth2 shape |
| 3 | **Conformance run** — the buildingSMART BCF-API test suite against the Funnel; the report filed under `docs/compliance/` | S | the proof, and the openCDE listing's prerequisite |
| 4 | **BEP / TIDP artefacts** (G1) — `bep@n`, `tidp@n` kinds, project → office, read by the Next strip and the MIDP checks | S | closes 5.2–5.4 for the assessor |
| 5 | **Evidence pack** (G3) — one export per project: standards in force with shas, the ledger (chain-verified), versions and verdicts, reviews, hand-over measures, as a signed bundle | S | the Kitemark audit's day-one file |
| 6 | **Written procedure** (G2) — a customer-facing information-management procedure generated from the handbook's workflows, one section per 5.x clause | S | what the assessor reads first |
| 7 | **Third-party security test** (G4) | founder's | a vendor and a budget |

Slices 1–3 are code and belong to the roadmap's "platform-native" line as much as to this one; 4–6 are the paperwork proper.
Nothing here needs a migration except the two artefact kinds in slice 4 (none — kinds are data).

## 4 · What this page does not claim

- Sentinel is not Kitemark-certified and cannot be as a product; a customer organisation is, with Sentinel as its CDE.
- No conformance test has been run; the table in §2 is read from the specification against the routes.
- The clause map is against ISO 19650-2:2018; the 2023 edition's renumbering is not reflected.
