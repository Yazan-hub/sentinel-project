# The Holding Area and the review chain with the referee as reviewer zero — design (phase 6: U-1 + U-20)

Status: approved 2026-09-27 (founder: "go", after the U-1/U-20 map, the two-build split, the three contested choices
— held files keep no bytes, the chain is project-wide first, `review@n` is opt-in and a lead's reason never skips a
human step — and the rejected alternatives were presented). Source: `docs/UPGRADE_MAP_2026-09.md` U-1 (:42-46) and U-20
(:157-163), ranked third after 1.1/3.0 and the clash UX (:283); `docs/reviews/cohesion-review-2026-09-23.md:121`
("deferred, not declined … after phase 5, because reviewer zero needs a verdict that names its kind@version and a
transition that reads it"). The code map is the 2026-09-27 mapping run (four readers — CDE states, rejection paths,
ledger and roles, web surfaces — and a completeness critic), on master 05010e6. This text was then reviewed against the
code by three adversarial lenses (cited facts, bypasses, buildability), each finding checked by two refuters; the 17
that survived are folded in below.

## Facts this design rests on

- **Nothing is held.** A rejected Governed Publish or auto-publish discards its temp IFC and stages nothing
  (`SentinelAddin/Engine/Publisher.cs:69, 108-117`); a rejected intake keeps its bytes only in the request
  (`WebApp/bridge/intake-logic.mjs:42, 57-61`); a rejected `/propose … register` registers nothing
  (`WebApp/bridge/cde-store.mjs:1143`). 5a/5b made this a rule (spec 2026-09-26 Decisions 3 and 8). The only parking is
  the machine-local `outbox\unbound\` (`watch-outbox.mjs:111-117`).
- **A refusal cannot be found as a file.** The proposal row has `entity_id` null and no `container_name`, `sha256` or
  `size_bytes` (`cde-store.mjs:1127-1130`); the gate row carries the file name and hash but only a failure *count*
  (`GateLines.cs:105`, `intake-logic.mjs:37`); nothing joins a gate row to its proposal row, and `entity_id` is a uuid
  while ledger ids are bigints (`0001_cde_core_c1.sql:75-87`), so a link can live only in `new_value`. Intake's audit
  adapter discards `audit()`'s returned row (`bcf-service.mjs:1213`).
- **Two unjudged doors.** The web Versions upload posts the bytes to `POST /ifc` — onto the platform, before any
  judgement, with no key or membership check — then registers a verdict-less wip version (`files-panel.ts:503-529`,
  `bcf-service.mjs:944-953`); its picker takes only `.ifc`. The modeler bake does the same (`model-panel.ts:660-695`).
  `POST /cde/:key/intake` exists and judges before uploading; it requires a `source` (`intake-logic.mjs:15`).
- **Forgeable facts.** The open audit route refuses only `verdict:`, `gate:`, `roi:`, `state:` and entity_type
  `stage_gate` (`cde-store.mjs:758-770`). Revit writes its `delivery_gate` row through that open route
  (`GovernedNotify.cs:71-78`), computed in Revit — the bridge never sees Revit's bytes — so any member can post one.
  `/propose` has no role check (`bcf-service.mjs:1129-1140`) and a client naming ruleset outranks the installed one on a
  plain proposal.
- **The state machine.** `container_state` is `wip | shared | published | archived` (`0001:6`); state changes only
  inside `cde_transition` (`0031:124-144`); a signed-in caller must be lead or owner for every move (`0031:56-58`) —
  `auth.uid()` reads the request's JWT claims, so a SECURITY DEFINER wrapper does not change it; the service key skips
  the role check but can never override (`0031:97-100`); `shared→published` reads the latest `verdict:%` row on the
  version (`0031:69-103`); every move writes one `state:` row with `coalesce(p_actor, auth.uid())` as actor
  (`0031:109-115`), where `p_actor` is whatever the caller sends.
- **Bridge-only enforcement is bypassable.** The keyless `POST /cde/versions/:vid/transition` (`bcf-service.mjs:1311-1314`),
  the AI tool `transition` (`ai-tools.mjs:140`) and any `BCF_TOKEN` caller can publish an accepted version with no
  human (probe P12, `probes/0031_probe.sql:139-153`), and can send a shared version back to wip. Only a rule inside the
  database holds against them.
- **Folders exist but hold nothing governed.** `folders` is a per-project tree (`0003_project_folders.sql:6-27`) with
  no metadata column; `registerFileVersion` never sets `folder_id` (`cde-store.mjs:603-608`), so every governed file is
  unfiled; folder names are renamable by contributors (`cde-store.mjs:407-413`).
- **Roles and identity.** Exactly owner 4 > lead 3 > contributor 2 > viewer 1, one per user per project (`0004:14-41`);
  `requireMinRole` passes every machine caller as `service` (`members-store.mjs:124-142`); the bridge stamps a signed-in
  actor as the JWT's e-mail, else its `sub` (`bridge-auth.mjs:28`), while SQL sees `auth.uid()`, a uuid.
- **Independence is already measured.** `midp.review` compares the actor of the newest `state:wip->shared` with the
  actor of `state:shared->published`; a closed list of generic actors counts as unmeasured (`check-registry.mjs:351-420`).
- **Artefacts.** A standard is a `bridge_docs` pair — pointer doc `<kind>` and body doc `<kind>@<n>` in store
  `artefact`, keyed by the project uuid, each carrying the canonical body sha256 written at install
  (`artefact-store.mjs:10, 224-235`); writes are service-only since 0030; project → office resolution
  (`artefact-store.mjs:40-48, 260-274`, `office-scope.mjs:23-27`, `0029:6-10`). `KINDS` is a closed list.
- **No notification channel** (no mail, no inbox), and the SSE feed carries BCF topics only (`bcf-service.mjs:354-428`).

## Goal

A file the referee refuses is not lost and never reaches a human reviewer: it is listed on the project as held — with
the stage that refused it, every failure and the refusal's ledger line — until the author sends a corrected file or a
lead dismisses it. And a project can require a review chain: once `review@n` with steps is in force, a version enters
review only with an accepted verdict (reviewer zero) or a signed-in lead's recorded reason, each human step is a
signed-in person of at least the step's role recording a decision on the ledger, and the version is published by the
last approval and by nothing else.

Definition of done:
- *6a (Holding Area):* a refusal by Governed Publish, auto-publish, intake (CLI or web) or the web Versions upload
  appears in Versions ▸ On hold with its stage, failures and `ledger #id · receipt …`; a corrected file registered
  under the same name clears it; a lead's dismissal clears it with the reason on the ledger; a rejected web upload is
  not on the platform; `hold:`, entity_type `hold` and entity_type `delivery_gate` are refused by the open audit route;
  a signed-in member cannot post a gate row; a viewer's or a client standard's refusal writes no hold.
- *6b (review chain):* with `review@n` (with steps) in force, sharing a version is refused to anyone not signed in, and
  to a signed-in lead unless its latest verdict is an accepted one that measured something or the lead gives a reason;
  a shared version under review cannot be published or sent back to wip by any machine caller — the service key, the
  keyless route, the AI tool — and cannot be published by anyone until every step is approved by distinct signed-in
  people of at least the step's role, none of them the submitter; the last approval publishes it with that approver as
  the actor; a rejection returns it to wip with the reason and a BCF topic; without `review@n`, or with `steps: []`,
  nothing changes.

## Decisions

1. **Two builds, 6a then 6b.** 6a has no migration; 6b carries migration 0032, applied only after the founder's
   explicit approval, like 0030 and 0031. Each build has its own plan, branch, drill (Sessions B12, B13) and merge.
2. **Held files keep no bytes.** A hold is a ledger record of the refusal, not a copy of the file. Resubmitting means
   sending the corrected file from its source: Governed Publish again in Revit (the fix is in the model; fix-in-place
   already re-checks per BCF topic), the intake CLI again, or a new pick on the web. This keeps 5a/5b's "a rejected
   verdict registers and uploads nothing" and needs no new storage, no retention rule and no second copy of client
   data. "One-click resubmit" becomes one click to the right way to resubmit, per source.
3. **The web upload is judged before anything is stored.** The Versions upload sends the file to `POST
   /cde/:key/intake` with `source=web`, the file name, `revision=v{N+1}` and the note `uploaded via web by <who>` (the
   actor is the signed-in identity; BCF raising stays on, as for every intake) instead of `POST /ifc` + `POST /files`:
   gate, naming and IDS run first; accepted or recorded uploads and registers as intake does today, and the panel says
   which verdict it carries; rejected uploads nothing and is held. `POST /ifc` stays for the modeler bake, which stays
   unjudged, as does the encrypted attach (ciphertext the bridge cannot read) — both out of scope.
4. **A hold is a reserved ledger row the bridge writes itself, for refusals it can stand behind.** On a refusal of a
   named file the bridge writes, through the internal `audit()`, one row: entity_type `hold`, entity_id the
   container's uuid when the container exists (else null), action `hold:<stage> <container_name>`, and
   `new_value {container_name, sha256, size_bytes, stage, verdict, failures (≤ 50, each with requirement and detail),
   source, gate_row_id, proposal_row_id, contract_ref, ids_ref, naming_ref}`. The stage is `gate` for a delivery-gate
   FAIL; otherwise `naming` when the naming judge rejected, else `ids` — decided in `adjudicateProposal`, not by the
   caller. The source is set by the writer: `revit` or `auto-publish` from the Publisher's call, `web` for an intake
   with `source=web`, else `intake`. A hold is written only when all hold: the request registers a file (`/propose`
   with `register`, or intake through an internal argument the HTTP body cannot set); the IDS and the naming standard
   that judged are the installed ones (`ids_source` and `naming_source` not `client`); and the caller could register
   the file (the machine credential, or a signed-in contributor or above). Any other refusal still writes its proposal
   or gate row, and no hold. A hold records a refusal reported by a credentialed caller: Revit's gate result is Revit's
   attestation, since the bridge never sees Revit's bytes. `hold:` joins `RESERVED_ACTIONS` and entity_type `hold` is
   refused like `stage_gate`, so the open audit route cannot forge or pad the list.
5. **Revit's gate row moves to a bridge route open only to the machine credential.** `POST /cde/:key/delivery-gate
   {file, result, passed, contract…, failures[], sha256, size_bytes, source: "revit" | "auto-publish" | "check",
   publish: true | false}` refuses any signed-in caller (403 unless `myRole(key)` is `service`; Revit is its only
   client), validates the body, writes the `delivery_gate` row through `audit()` with the full failure list (today only
   a count reaches the ledger) and returns it; when `passed` is false and `publish` is true it also writes the
   `hold:gate` row. `Publisher.Prepare` takes the caller's source (Governed Publish or auto-publish, as `Judge` already
   does) and sends `publish: true`; the standalone IFC Gate sends `source: "check", publish: false`. The open audit
   route then refuses entity_type `delivery_gate`: no signed-in member can forge a gate row any more, though a
   `BCF_TOKEN` holder still can — ROI's gate count is Revit's attestation, and its `naming` and `family_heal` counts
   stay open. The add-in and the bridge deploy together: an add-in from before 6a gets a 400 on the open route and
   prints its `not recorded — …` line.
6. **The refusal rows name their file and each other.** `adjudicateProposal` adds `container_name`, `sha256` and
   `size_bytes` to the proposal row's `new_value` whenever the request carries them, and `gate_row_id` when given.
   Revit's `/propose` sends `gate_row_id` (the gate row's ledger id from `plan.GateRow`); intake's audit adapter returns
   the gate row and `runIntake` passes its id, the name, sha256 and size into the adjudication. So the refusal, the
   gate row and the hold agree on what was refused.
7. **The held list is derived, never stored.** `GET /cde/:key/holding` → `{items}` from a pure `holding-logic.mjs`
   over the project's hold rows and container versions: one item per container name whose newest refusal row
   (`hold:gate`, `hold:naming` or `hold:ids`) is newer than both its newest registered version and its newest
   `hold:dismissed` row. The item carries that refusal (stage, verdict, failures, source, actor, when,
   `ledger {id, hash}`) and the count of refusals since the item opened (auto-publish repeats collapse into one item).
   A registration clears the item whatever verdict it carries; a clearance by a `recorded` registration is labelled
   "cleared by a registration that was not judged (recorded)", and the version keeps its verdict for all to see. A
   naming-stage hold does not clear by a corrected file — the corrected file has a new name — and says so; a lead
   dismisses it. A failed read is `not read — <reason>`, never an empty list.
8. **A lead dismisses.** `POST /cde/:key/holding/dismiss {container_name, reason}` (lead, as every lead-only route —
   the machine credential passes; reason required) writes `hold:dismissed <container_name>` with the reason. Dismissal
   changes nothing else; the refusal rows stay.
9. **Where it shows.** Web: an "On hold (n)" section in Versions, built like "Archived (n)" (`files-panel.ts:173-181`),
   each item with its stage, failures, the refusal's ledger line and its resubmit action — "Upload the corrected file"
   (opens the picker, through intake) for `web`/`intake`, the Revit instruction for `revit`/`auto-publish`, and
   "Dismiss…" for a lead with an inline reason (the platform iframe blocks `window.prompt`). Revit: the rejection
   dialog and the auto-publish Doctor line gain `Held on the web: Versions ▸ On hold · ledger #id · receipt …` when the
   bridge returned the hold row. The Next strip is unchanged.
10. **`review@n` is an artefact kind, project-wide, opt-in.** Body `{steps: [{name, role, approvals}]}`: 0–6 steps;
    `name` a non-empty string ≤ 80; `role` one of `contributor`, `lead`, `owner` (the approver's rank must be at least
    the role's); `approvals` 1–5 distinct approvers, which is how a step runs in parallel; any other key refused. Lead
    install, audited, office-inherited like every kind; `steps: []` means no chain, so a project's own `review@n` with
    no steps overrides an office's. Per-folder templates wait until governed files are filed into folders. With none
    in force, or none with steps, a project behaves exactly as today.
11. **Step 0 is enforced at the entrance, in the database (migration 0032).** When `review@n` with steps is in force
    for the version's project (resolved in SQL from `bridge_docs`, project then office, reading the stored pointer and
    body — the store only the service key writes), `cde_transition(wip→shared)` requires a signed-in caller
    (`auth.uid()` not null; the service key, Revit and the AI tool cannot share such a version) and the same predicate
    0031 applies to publishing — the latest `verdict:%` row is `verdict:accepted` with `summary.in_scope > 0` and a
    non-null `ids_ref` — or the lead's `p_override`. On success it writes, beside its `state:` row, one `review:start`
    row (entity_type `review`, entity_id the version) whose `new_value` carries `submitter_uid` (= `auth.uid()`), the
    template's ref, stored sha256 and step list, and the share's override reason if one was given — so a template
    changed mid-review does not change a running chain. Stamping a verdict on an existing version (`/propose` with
    `version_id`) needs the lead role, since that stamp is now what opens the door; binding a verdict to the file's
    bytes stays out of scope.
12. **Human steps are recorded by a database function.** `review_decide(p_version, p_decision 'approve' | 'reject',
    p_note)`, SECURITY DEFINER, reached through `POST /cde/:key/versions/:vid/review {decision, note}` (a caller with
    no JWT is a 403 before any call; the version must be on the key; P0001→409, P0002→404, 42501→403). It first locks
    the version row (`select … for update`), then: the caller must be signed in; the version must be shared with an
    open chain (a `review:start` newer than the newest `state:shared->wip`); the caller's rank must reach the current
    step's role; the caller must not be the submitter (`auth.uid()` = the chain's `submitter_uid`) nor an approver
    already recorded on this chain (by the `approver_uid` each approval stores); a reject needs a non-blank note. It
    writes `review:approve <step>` or `review:reject <step>` (entity_type `review`, `new_value {step, of, name, role,
    note, approver_uid, chain_start_id}`), with the actor stamped as the bridge stamps a signed-in user —
    `coalesce(auth.jwt()->>'email', auth.uid()::text)` — never a caller-sent `p_actor`. An approval is judged when it is
    given and stays counted if the approver's role later changes. When the approvals recorded after its own insert
    complete the last step, it publishes the version in the same call through `cde_transition(shared→published)`, with
    the same stamped actor and, if the share carried a lead's reason, that recorded reason as the override (the
    `state:` row names it); a reject moves the version shared→wip through `cde_transition` with the note, closing the
    chain, and the bridge then raises one BCF topic `Review: <container> rejected at <step> — <note>` (best-effort, as
    today's raises). Inside `review_decide` — marked by a transaction-local setting, the pattern 0031 uses for its own
    state update — `cde_transition` skips its lead check for that one move (the step's role, checked by
    `review_decide`, is the role check); 0031's verdict read still applies, and if it refuses, nothing is written and
    the refusal is returned. `review:` joins `RESERVED_ACTIONS` and entity_type `review` is refused on the open route.
13. **Nothing else publishes a version under review, and no machine closes a chain.** While a version has an open
    chain, `cde_transition(shared→published)` refuses every call not made by `review_decide` completing it — the
    service key, the keyless route, the AI tool and a lead included — and `cde_transition(shared→wip)` requires a
    signed-in lead or owner (the machine path cannot close a chain). A lead's reason overrides a missing verdict at the
    entrance as in 0031; it never skips a human step. A lead who sends a shared version back to wip closes its chain;
    sharing it again starts a new chain, with the lead as submitter.
14. **Where reviewers see it.** The CDE board's Shared cards show `Review: step k of n — <name> (<role>)` and the
    approvals so far; a signed-in user whose role reaches the current step and who is neither the submitter nor a prior
    approver on this chain sees Approve / Reject with an inline note; a "My reviews (n)" filter narrows the board to
    them. Every decision prints the review row's `ledger #id · receipt …`. No mail, no push: the list is read when the
    board loads.
15. **The ledger stays honest.** Review and hold rows are appended, never edited; a withdrawn decision does not exist
    — a reject and a new chain do. `midp.review` compares like with like: the chain's share and its completing publish
    are both stamped with the signed-in person's identity, so the submitter is the sharer and the authorizer the last
    approver.

## Behaviour changes (accepted)

6a: a web upload is judged before it is stored — a file that fails its gate, naming or IDS is not on the platform and
not registered (today it is registered verdict-less); Revit's gate row goes through the new route, so the add-in and
the bridge deploy together; a signed-in member can no longer post gate rows. 6b: on a project with `review@n` (with
steps), only a signed-in lead can share, sharing needs an accepted verdict or the lead's reason, publishing a version
under review happens only through its last approval, and only a signed-in lead can send it back — the CDE board's
Publish button is replaced by the review controls on such versions; stamping a verdict on an existing version needs the
lead role on every project; a solo lead cannot review their own share (the submitter never approves), so a one-person
project should not have a chain — its own `review@n` with `steps: []` turns an inherited one off; the decisions need a
bridge that forwards the user's JWT (`SUPABASE_ANON_KEY` set) — without it no one can decide. A version shared while no
`review@n` with steps was in force carries no chain and publishes as today, even after one is installed.

## Testing

6a: vitest for `holding-logic.mjs` (open, clear by a later registration, the `recorded` clearance label, clear by
dismissal, naming holds that do not clear by name, collapse of repeats, a failed read), the hold writers and their
three conditions (register or intake, installed standards only, a caller who could register), the stage decided by the
naming result, the gate route (403 to a signed-in caller, validation, the returned row, `hold:gate` only when `publish`
is true), the reserved refusals (`hold:`, entity_types `hold` and `delivery_gate`, case- and space-insensitive), the
proposal row's file fields and `gate_row_id`, intake passing its gate row id, the dismiss route (lead, reason required),
the web upload through intake (mocked `bfetch`: accepted registers, rejected uploads nothing and shows the hold);
`tools/publish-check` for the gate route body, the Prepare source and the held line; both add-in builds; Session B12
live (a Revit naming reject, an intake CLI IDS reject, a web upload reject — each on hold with its ledger line — a
corrected file clearing one, a lead's dismissal, the forged rows refused). 6b: `probes/0032_probe.sql` in a rolled-back
transaction with simulated JWT claims, as 0031's probe did: share by the service key refused, share without a verdict
refused, share on a lead's reason, the `review:start` snapshot with `submitter_uid`, decide by the service key, by a
viewer, by the submitter and twice by one person refused, a contributor completing a chain and a contributor
rejecting, approvals up to completion publishing with the approver as actor, completion of a reason-shared chain
publishing under the recorded reason, reject returning to wip, publish by the service key and by a lead refused while a
chain is open, shared→wip by the service key refused while a chain is open, no chain with `steps: []` or none
installed, a `version_id` stamp below lead refused; vitest for the `review` validator, the decide route's error mapping
and the board's review controls; Session B13 (the signed-in rows need two accounts; without a second account they are
marked not run and the probe carries them).

## Out of scope

Keeping held bytes (Decision 2); per-folder templates and filing governed registrations into folders; Sync Guard hits
(the guard holds no file and blocks nothing); non-model containers in the Holding Area (U-17); the modeler bake and the
encrypted attach (still unjudged); notifications (mail, push, the SSE feed for CDE events); letting contributors share
wip→shared (0031 keeps it lead-only); a verdict bound to the file's bytes and `cv_update` changing `sha256` or the
platform item on a judged version (the known follow-up from 5a); making the machine credential's gate rows
unforgeable; refusing `archiveFile`'s or `deleteFile`'s removal of a shared version under review (its review rows stay
on the ledger); review of BIM documents (their own state machine).
