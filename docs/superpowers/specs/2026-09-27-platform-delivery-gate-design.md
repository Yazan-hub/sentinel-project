# The delivery gate on the platform — design (hackathon entry, plan A)

Status: the founder approved plan A on 2026-09-27 ("run plan A directly after your unfinished tasks and don't split it
into days") and, in chat, publishing the cloud component to his workspace and creating the automation. H0 (the bridge
hardening) is merged (9af6717) and migration 0033 is live, so this builds on master after it. Deadline: the TOP
Founding Members Hackathon closes Sunday 2026-10-04 at midnight CEST.

Sources: the hackathon post and the 2026-09-23 recording (judging: usefulness, creativity, production quality; "counts
in favour": cloud components, automations, a Revit connection; judges do not read code); the That Open usage analysis
(memory `thatopen-hackathon-2026-10`, scratchpad `tou-result.json`); the spike of 2026-09-27 (below); the SDK installed
in `WebApp/node_modules/@thatopen/services` 0.3.11 (paths `client.d.ts`, `platform-client.d.ts`, `types/files.d.ts`).

## The story (one line for the video's title card)

**"The platform project refuses what the contract refuses."** A lead installs a delivery contract in Sentinel. From
then on every IFC that lands in the That Open project — uploaded by a consultant in That Open's own CDE, a new version
of an old file, or published from Revit through Sentinel — is judged on the platform by a Sentinel cloud component that
an automation starts. The verdict is written onto the file itself (a report file and labels on the version) and shown
on Sentinel's CDE board. With no contract installed the answer is **Not checked**, because Sentinel never reports a
pass nobody measured.

## Facts this design rests on

- **The gate is one pure function.** `WebApp/bridge/delivery-gate.mjs` reads the IFC as STEP text, needs only
  `node:crypto` (`createHash`), and returns the same sentences the C# gate and the bridge use (`checkDelivery`,
  `gateNotChecked`). It must not be copied: the component bundles that file, so the platform judges with the bridge's
  own code.
- **A cloud component is a run-once `main()`** with four globals (`thatOpenServices`, `executionParams`,
  `executionContext`, `executionReporter`); parameters are string or number (`declarations.json`); it returns
  `{type: SUCCESS | FAIL | WARNING, message}` (template README in `@thatopen/services/src/cli/templates/cloud-component`).
  The bundle is a Vite IIFE with `@thatopen/services` external; everything else is bundled, and Vite would replace
  `node:crypto` with an empty browser stub — the spike showed a 4.7 kB bundle works when `node:crypto` is aliased to a
  shim that fetches the real module at run time (`process.getBuiltinModule("node:crypto")`, else `require`).
  Measured on 2026-09-27 (scratchpad `planA-spike/`): the bundled gate answers `fail` with the bridge's proxy sentence
  and the same sha256, and `not_checked` with no contract.
- **Automations** (read in the platform UI, read-only, 2026-09-27): triggers File Uploaded (carries `itemId`, `name`,
  `fileExtension`, `folderId`, `projectId`; no versionTag), File Updated (adds `updateType` DETAILS | VERSION and
  `versionTag`), File Archived, Folder Created, Another automation finished, On a schedule; conditions on the
  trigger's fields; a component parameter is either typed or linked to a trigger field. Free defaults: 3 automations
  per project, 512 MB and 60 min per run, 300 min a month. Only components linked to the project can be picked;
  today only That Open's IfcFragmenter (one parameter, "IFC File ID") is linked to the Welcome Project
  (`6a4c4df825f9ecf5f416d4c2`, the platform project `aster-tower` is linked to).
- **Version metadata** is a map of ≤200 keys, keys and values ≤50 characters (`METADATA_LIMITS`); read with
  `getFileVersionMetadata(fileId, versionTag)`, written with `updateFileVersionMetadata` (`client.d.ts:283-292`).
  Files: `listFiles({projectId})`, `getFile(fileId, {includeVersions})`, `downloadFile(fileId, {versionTag})`,
  `createFile({file, name, versionTag, projectId})`, `createVersion(itemId, blob, versionTag)` (`client.d.ts:228-326,
  685`). The app inside the platform has `PlatformClient.fromPlatformContext()` (`WebApp/src/main.ts:107`) and
  `platformProjectId()` (`src/setups/active-project.ts:25`).
- **Sentinel's uploads go to one platform project.** `uploadIfcAsFrag` (`bridge/platform-publish.mjs`) converts to
  `.frag` and uploads that; the raw IFC reaches the platform only when conversion fails. Web intake and the Revit
  outbox watcher both go through it. The delivered IFC bytes are therefore not on the platform (the evidence gap the
  analysis named).
- **The contract in force** for a project is `resolveContract` (`bridge/artefact-store.mjs:324`): project → office →
  none, validated on read. A lead installs it in Settings (`installArtefactFile`, `PUT /cde/:key/artefacts/contract`).
- **Unverified until the first cloud run** (the spike could not reach them without publishing): whether a run may
  write a file and version metadata into the launching project, and the runtime's Node version. The component is
  written so that a refused write is *reported*, never silently dropped (Decision 5).

## Decisions

1. **Where the component lives: `CloudComponents/delivery-gate/`** in the repo — its own `package.json`
   (`@thatopen/services` for types and the CLI, `vite`), `declarations.json`, `vite.config.js` with the `node:crypto`
   alias, `src/main.js`, `src/node-crypto-shim.js`, and `main.test.mjs` run with `node --test` (no test framework:
   the module has no browser code). It imports `../../WebApp/bridge/delivery-gate.mjs` by relative path — one gate,
   never a copy. Published with `thatopen publish` (the CLI's saved login, `~/.thatopen/config.json`) as
   **"Sentinel Delivery Gate"**, version = `package.json` version; the item id lands in `.thatopen`, which this repo git-ignores;
   the id is recorded in this spec and in the B14 run record instead (the CLI keeps its token in the home folder).
2. **Parameters** (all strings): `fileId` (the IFC item), `versionTag` (optional: absent on File Uploaded → the item's
   latest version), `projectId` (optional: `executionContext.projectId` wins when set). The automation links
   `fileId ← itemId`, `versionTag ← versionTag`, `projectId ← projectId`.
3. **The contract on the platform: one root item `sentinel-contract.json`**, one version per install, versionTag =
   the contract ref (`contract@1`). Sentinel writes it when a lead installs a contract (Decision 7); the component
   reads its latest version. A file that is missing → `not_checked` with reason "no contract on the platform project —
   install one in Sentinel"; one that does not parse or lacks the contract fields → `not_checked` with the parse
   reason. The component does a shape check only (`contract_key`, `ifc_schema`, the five arrays, `require_georeference`);
   the full validator stays in the bridge. `checkDelivery` runs inside a try: a throw is `error`, never a verdict.
4. **The verdict is written twice, honestly ordered.** First the report: one root item **`<ifc name>.gate.json`** per
   IFC item, a new version per judged IFC version, versionTag = the IFC's versionTag (`createFile` the first time,
   `createVersion` after). The report is `{kind: "sentinel.gate-report", file: {id, name, versionTag}, result,
   passed, reason, contract: {ref, sha256}, detected_schema, total_entities, failures, warnings, sha256, size,
   run: {executionId, at, component: {toolId, toolVersion}}}` — the same sentences the bridge and Revit print. Second
   the labels on the IFC version: `sentinel_gate` (pass | fail | not_checked | error), `sentinel_contract` (ref or
   `none`), `sentinel_failures` (count), `sentinel_sha256_a` and `sentinel_sha256_b` (the hash in two 32-hex halves —
   values are ≤50 characters), `sentinel_report` (the report item id), `sentinel_run` (the execution id).
5. **The return value never claims more than was written.** `SUCCESS` only for a pass whose report and labels were
   both written; `WARNING` for a refusal or not_checked (message = the one-line reason, e.g. "Refused:
   IFCBUILDINGELEMENTPROXY: 994/… exceeds …"), and for a pass whose labels could not be written ("Passed — report
   written; the version labels were refused: <words>"); `FAIL` only when the component itself broke (no bytes, no
   report written) with the reason. The message always starts with the verdict word.
6. **The automation "Sentinel gate"** on the Welcome Project: triggers File Uploaded and File Updated, condition
   `fileExtension = ifc` (and `updateType = VERSION` on File Updated), the three links of Decision 2. Created by the
   controller in the platform UI (founder-approved), after the component is published and linked to the project. The
   component also refuses to judge its own outputs: an item whose name ends in `.gate.json` or is
   `sentinel-contract.json` returns `WARNING "Skipped: not an IFC"` before any download.
7. **Standards travel:** installing a contract in Settings (`project-settings-panel.ts` → `installArtefactFile`) also
   writes `sentinel-contract.json` to the linked platform project through the app's `PlatformClient` — a new
   `platform-contract.ts` (`publishContractToPlatform(client, platformId, body, ref)`: `createFile` when absent,
   `createVersion` when present, versionTag = ref; a repeated ref is "already on the platform", not an error). The
   Settings line then reads "contract@1 · project · <sha> · also on the platform as sentinel-contract.json contract@1"
   or "… · not copied to the platform — <the platform's words>". A copy that failed never blocks the install: the
   bridge's ledger row is the record; the platform copy is a mirror. If the app's token may not write inside the
   sandbox (unverified), the fallback is a manual upload by the founder, and the line says "not copied".
8. **The board lane "Platform deliveries"** — a new `src/setups/platform-deliveries.ts` (pure logic + fetch) and
   `platform-deliveries-panel.ts` (a strip the CDE panel mounts above its board, one wiring line in `cde-panel.ts`).
   It reads the platform directly (no bridge): `listFiles({projectId: platformProjectId()})` filtered to `.ifc`, each
   item's latest version, its metadata, and the matching `<name>.gate.json` report version. The pure
   `deliveryCard(item, version, metadata, report)` gives: **Passed** (contract ref, sha short); **Refused** (the
   failure sentences); **Not checked** (the reason); **Gate did not run** (`sentinel_gate = error`, the reason — never
   a pass); **Running** (an IFC version newer than any report, no labels yet). A read that failed says "not read — …"
   (the holding rule), never an empty lane. Card look = the Holding Area's (`holding.ts` / the Versions panel), so the
   board reads as one product. Shown only when the app runs inside a platform project with a linked Sentinel project;
   otherwise the strip says why.
9. **Revit connection (the evidence gap closed):** `uploadIfcAsFrag` also uploads the raw IFC as `<name>.ifc` after
   the `.frag` (`uploadBytes`), returning `ifcItemId`; a publish from Revit's Sentinel pane or a web intake therefore
   triggers the same automation and gets the same card. The intake reply and the outbox watcher log the IFC item id.
   The C# gate's verdict (Revit) and the platform's verdict come from the same code on the same bytes; if they ever
   differ the board shows the platform's report and the ledger shows Revit's — the difference is visible, not hidden.
10. **Not built this week** (recorded, not declined): chaining IfcFragmenter behind a pass (the CDE app already
    converts on upload, so the chain would not gate CDE-app uploads; the bridge already produces the `.frag` for
    Sentinel's own uploads); the ledger row from a platform verdict (the bridge re-judging the bytes, post-hackathon);
    a `Sentinel` folder for the report items (root items, one per IFC, are enough); streaming, Collider, the
    `@thatopen/services` upgrade, channels.
11. **Honesty rule, restated for this feature:** "ledger #id · receipt <hash>" never appears on a platform card (no
    ledger row exists for a platform verdict); the card cites the report's `sha256` and `run.executionId` instead.
    Nothing here uses "none" as a score; `not_checked` is a state with a reason.

## Data flow

```
lead installs contract@n ──► bridge (ledger row) ──► app mirrors sentinel-contract.json (versionTag contract@n) ──► platform project
IFC arrives (CDE app upload · new version · Revit publish via bridge) ──► automation "Sentinel gate" (File Uploaded / Updated, .ifc)
   ──► component: download IFC version + latest sentinel-contract.json ──► checkDelivery / gateNotChecked
   ──► <name>.gate.json version (report) ──► version labels sentinel_* ──► return SUCCESS | WARNING | FAIL
app "Platform deliveries" lane ──► listFiles + metadata + report ──► Passed / Refused / Not checked / Gate did not run / Running
```

## Testing

- **Component** (`node --test CloudComponents/delivery-gate/main.test.mjs`, a fake `thatOpenServices` and the four
  globals): pass → report + labels + SUCCESS; refusal → WARNING with the proxy sentence, labels `fail`; no contract →
  `not_checked` with the reason; malformed contract → `not_checked` with the parse reason; labels refused → WARNING
  says so, report still written; a `.gate.json` item → skipped; a download that fails → FAIL, nothing written; the
  sha256 in the report equals the bridge's for the same bytes (import `checkDelivery` and compare).
- **Web** (vitest): `deliveryCard` for the five states and the "not read" case; `publishContractToPlatform`
  create/version/repeat/refused; the Settings line words.
- **Bridge** (vitest): `uploadIfcAsFrag` uploads `.frag` then `.ifc` and returns both ids; a conversion failure still
  uploads the IFC once.
- **Live (recorded in `docs/testing/`, B14):** publish the component; link it to the Welcome Project; create the
  automation; upload the Demo IFC that fails the pilot contract (994 proxies, run of 2026-09-22) through That Open's
  CDE → the execution log, the report version, the labels, the Refused card; a corrected version → Passed; a project
  with no contract → Not checked; a Revit publish → the same card. Every row names what was measured.

## The video (≤5 min, silent, captions, the platform header and URL visible throughout)

0:00 an IFC lands in the project — is it deliverable? · 0:20 the lead installs contract@1 in Sentinel; it appears on
the platform · 0:50 the automation and the component in the workspace · 1:20 a consultant drops the failing IFC into
That Open's CDE; the run log; the report and labels appear · 2:10 the Sentinel board: Refused, with the exact sentences ·
2:40 a corrected version: Passed · 3:30 a publish from Revit through Sentinel: the same card · 4:10 a project with no
contract: Not checked · 4:40 the sha256 on the report, "governance that runs on the platform". Recorded by the founder;
the shot list and captions are written by the controller after the live rows pass.

## Open questions (answered by the first cloud run)

- Can a run write a file and version labels into the launching project? If labels are refused, Decision 5 already
  words it; if the report file is refused, the component can only return the verdict in its message, and the lane
  falls back to "Gate ran — no report could be written: <words>" (the run id still names the execution).
- The runtime Node version (the shim covers 20+ through `require`).
