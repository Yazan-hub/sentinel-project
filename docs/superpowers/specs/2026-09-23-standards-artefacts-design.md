# Standards as artefacts — design (cohesion phase 3)

Status: approved 2026-09-23 (amended after plan drafting: mode vocabulary, naming-candidate source, two item statuses). Source: `docs/reviews/cohesion-review-2026-09-23.md` §5–6 (phase 3),
seams D2 (ruleset in six unlinked places), D4 (bridge half: the bridge naming default), D6 ("ruleset" is
three shapes in one slot); findings F8, F13, F15, F19, F51 in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md`.
Builds on phase 1 (artefact store, `2026-09-23-governed-intake-design.md` §3) and phase 2 (office entity,
`2026-09-23-office-entity-design.md`).

## Goal

The scan ruleset and the container-naming pack become artefacts on the project, exactly as the IDS is:
immutable `kind@n` documents with a sha, one pointer per kind, resolved project → office → none. Every
judge on the bridge and the web reads through that resolver. The bundled web ruleset and the bridge naming
file are deleted; when nothing is installed the answer is "no <kind> installed for this project", never
the pilot's data.

Definition of done: *on a project with nothing installed, the QA scan, the container-naming check and
the federation naming check each report not_checkable naming the missing kind; after installing
`ruleset@1` and `naming@1` on the office alone, a child project's scan, naming check and readiness
evidence each name `kind@1 · office · sha`.*

## The three shapes today (D6)

| Shape | Fields | Who writes it | Who reads it |
|---|---|---|---|
| Scan ruleset (`Ruleset` in `src/sentinel-core/types.ts:42`) | `standard_key`, `semver`, `rules[]` (`id`, `target`, `mode`, …) | pack install (`packs-panel.ts:98` → `PUT /projects/:key {active_ruleset}`), office snapshot (`office-store.mjs:61`) | web scan panels via `activeRuleset` (`active-ruleset.ts:11`, falls back to `bdsRuleset`), Revit `RulesetStore` (phase 4) |
| Naming pack (`NamingRuleset` in `src/sentinel-core/naming.ts:20`) | `title`, `separator`, `fields[]`, `enforce`, `strip_extensions`, and in practice `standard_key`, `semver` | Aster kit merged it into `active_ruleset` by hand | `projectNamingRuleset` (`cde-store.mjs:818`, falls back to `bridge/naming-ruleset.json`), `naming.containers`, federation FG-02, `bimdocs-ai` grounding, `/propose` naming |
| Marketplace pack (`/packs` registry, `bcf-service.mjs:729`) | `{key, version, name, ruleset}` | packs panel seed and publish | packs panel |

All three are written into `projects.metadata.active_ruleset`; the Aster row carries the first two merged.

## Approaches considered

1. **Two artefact kinds on the existing store, fallbacks deleted** *(chosen)*. `ruleset` = scan rules,
   `naming` = container fields. Reuses the phase 1 store, routes, install button pattern and audit.
2. Keep `metadata.active_ruleset` and add a version stamp beside it. Leaves D6 open: one slot, three shapes.
3. One combined `standards` artefact. One install, but a naming change re-versions the scan rules, and
   phase 4's Revit pull wants the scan rules alone.

## Design

### 1. Artefact store — validators and a generic resolver (`bridge/artefact-store.mjs`)

`validateArtefact(kind, body)` gains two real checks (today only `ids` has one):

- `ruleset`: `standard_key` (non-empty string), `semver` (`x.y.z`), `rules` a non-empty array whose
  every item has `id`, `target` in `workset | view | parameter | sheet | family | type | level | grid`,
  `mode` in `monitor | warn | request | block` (the real `EnforcementMode`). `org` optional string. Anything else → 400 naming the
  path (`rules[3].mode`).
- `naming`: `standard_key`, `semver`, `title`, `separator` (one character), `fields` a non-empty array
  whose every item has `key` and `label` and either `pattern` or `enum[]`; `enforce` in
  `reject | warn | off` (default `reject`); `strip_extensions` optional string array.

New `resolveArtefact(key, kind, deps) → { body, source: "project" | "office" | "none", ref: "kind@n" |
null, sha256, pointer_sha_mismatch }`, the generalisation of `resolveIdsSpec`'s first two steps
(project via `getArtefact`, office via the service read `officeArtefactAsService`). `resolveIdsSpec`
calls it and keeps its client and none steps. A `GET /cde/:key/artefacts/:kind` already answers
project → office → 404; unchanged.

### 2. Bridge judges read through the resolver

- `projectNamingRuleset(key)` (`cde-store.mjs:818`) → `resolveArtefact(key, "naming")`; returns
  `{ ruleset: body | null, source, ref, sha256 }`. `defaultNamingRuleset()` and
  `bridge/naming-ruleset.json` are deleted; `SENTINEL_NAMING_RULESET` is removed from `load-env` docs.
- `naming.containers` (`check-registry.mjs:412`): source `none` → `not_checkable`, reason "no naming
  standard installed for this project or its office (PUT /cde/:key/artefacts/naming)"; otherwise the
  summary names `naming@n · source`.
- `/propose` naming (`cde-store.mjs:899`): a client-sent `body.naming` is still honoured for the
  proposal (it is the model's own name check), but the verdict row records `naming_ref` (`naming@n` or
  `client` or `null`).
- Federation FG-02 (`federation-store.mjs:34`): the type rule comes from `resolveArtefact(key,
  "ruleset")` (rule `TN-01` family) and the container-name shape from `naming`; the check result names
  both refs. No artefact → the existing "naming shapes only" path, with the reason.
- `bimdocs-ai` grounding: `rulesetSource` becomes the ref string (`naming@2 · office`) or `none`.
- `office.naming_standard` (`office-checks.mjs:176`): these two items ask whether a standard is installed at all, so
  absence is a measured fact and stays `violations` naming the install route (not `not_checkable`); met when `resolveArtefact(key, "naming")` finds
  one, evidence `naming@n · source · sha[0:12]`; `project.standards_pack` (`check-registry.mjs:120`)
  is re-pointed the same way at the `ruleset` kind, label unchanged. `metadata.standards_pack` stays
  as a display name only.
- Snapshot (`office-store.mjs:61-70`, F13): the stored `ruleset` block keeps `standard_key`, `semver`
  and adds `ref`/`sha256` when the snapshot was taken against an installed artefact (the add-in sends
  what it has; phase 4 makes it always the artefact). The readiness snapshot line names them.

### 3. Web reads through the bridge, bundle deleted

- `activeRuleset(base)` (`active-ruleset.ts`) → `GET /cde/:key/artefacts/ruleset`; returns
  `{ ruleset, ref, source } | null`. On 404 it returns `null`; every caller (`qa-panel.ts:74`,
  `project-shell.ts:93`, `copilot-panel.ts:102`, `copilot/engine.ts`) renders "No ruleset installed
  for this project — install one from Packs" and skips the scan. No caller may substitute a bundle.
- `bdsRuleset` and `src/sentinel-core/ruleset.json` are deleted from the core index. The two seed
  packs (`packs-panel.ts:65-66`) move to JSON files under `WebApp/packs/` (`bds-house.json`,
  `iso-19650-lite.json`) loaded by the bridge's pack seed, so the pilot's profile is data offered on
  the web, not code (D-03).
- Pack install (`packs-panel.ts:98`): `PUT /cde/:key/artefacts/ruleset` with `pack.ruleset` and, when
  the pack carries `naming`, `PUT …/artefacts/naming`. It no longer writes `active_ruleset`; the panel
  shows the installed refs. The `POST /packs/:id/install` counter stays.
- Documents panel: the existing "Install on this project" button pattern gains the same button for a
  naming ruleset produced by the standards extraction (§5) — one handler, kind as a parameter.
- Settings panel: a read-only "Standards in force" block listing each kind's `ref · source · installed_by
  · date`, from `GET /cde/:key/artefacts`.

### 4. `metadata.active_ruleset` retired

- One-shot CLI `bridge/artefact-import.mjs --from-metadata [--key k]`: for every project row whose
  `metadata.active_ruleset` exists, split it — `{standard_key, semver, rules}` → `ruleset@1`,
  `{title, separator, fields, enforce, strip_extensions, standard_key, semver}` → `naming@1` — each
  validated, each installed with actor `import`, audit note naming the source slot. Rows that fail
  validation are listed, not installed.
- After the import, `active_ruleset` is removed from the `updateProject` whitelist
  (`cde-store.mjs:116`) and from `PUT /projects/:key`; the column value is left in place (read by
  nothing; phase 4's Revit path reads the artefact).

### 5. Document-sourced naming pack (F15 product side)

No extraction produces a naming ruleset today; the smallest honest source is a fenced ```json block holding a
`NamingRuleset` inside a document section (`findNamingCandidate`). When one is found, the result is offered
as a candidate `naming@n+1`: the panel shows a field-by-field diff against the version in force
(added, removed, changed pattern/enum) and the install writes the candidate whole. There is no merge
into the installed version; a candidate that removes fields says so before install. The candidate body
carries `source: { document_id, section }` in its pointer provenance.

### 6. Superseded IDS topics (F51)

Topics raised by the IDS today carry no version (`raiseGovernedFailureTopics`, `bcf-service.mjs:293`, writes the
spec title, the requirement and the count). It gains `ids_ref` in the topic's custom fields and the audit row.
When `ids@n` is installed and open `IDS:` topics exist whose `ids_ref` is `ids@m`, m < n, or is absent
(raised before this phase), the install marks each with
`superseded_by: "ids@n"` in the topic's custom fields and the audit row lists their ids. The Issues
panel groups them under "Raised by a superseded IDS" with a one-click "close all as superseded"
(lead only, audited). No auto-close: a superseded topic may still be a real defect.

### 7. Honesty and ledger

Every judge names what judged: `ref · source · sha` in the verdict row, the readiness evidence, the
federation result, the scan header and the settings block. `source: none` is a not_checkable with the
install route in the reason, never a pass and never a scan by shipped data. The install audit row carries
the previous pointer and the new one; the import CLI audits with actor `import`. Statuses stay
`met | violations | not_checkable | error`.

## Testing

- `artefact-store.test.mjs`: the two validators (each required field, one bad item path); `resolveArtefact`
  project → office → none with the injected deps; `resolveIdsSpec` unchanged behaviour through it.
- `cde-store` naming: `projectNamingRuleset` with an injected resolver returns `source: none` and no
  ruleset when nothing is installed (the file is gone).
- `check-registry.test.mjs`: `naming.containers` not_checkable when none; summary names `naming@n · office`.
- `federation` test: FG-02 names `ruleset@n`/`naming@n`; no artefact → reason.
- `office-checks.test.mjs`: `office.naming_standard` met with evidence ref; `project.standards_pack` likewise.
- Import CLI test over an in-memory project list: split, validate, skip-with-reason.
- Web: type-check and build with the bundle deleted (every `bdsRuleset` import gone).
- Live drill (Session B3 in `docs/TESTING_PROTOCOL.md`): on `aster-villa` (nothing installed)
  `naming.containers` and the QA scan report not_checkable naming the kind; `artefact-import --from-metadata
  --key aster-office` installs `ruleset@1` and `naming@1` on the office; `GET /cde/aster-villa/artefacts/naming`
  → source office; `aster-villa` readiness evidence names `naming@1 · office`; pack install on `aster-villa`
  from the web (if the platform loads) or a PUT installs `ruleset@1` on the project and the scan header names it.

## Out of scope

The Next strip (its own spec after this phase); Revit reading artefacts (`ArtefactClient`, phase 4);
contract, guideline, layers, type_catalog kinds beyond the validator placeholder they already have;
an office-plus-project rule-level merge; a ruleset editor.

## Files

- Create: `WebApp/packs/bds-house.json`, `WebApp/packs/iso-19650-lite.json`, tests as above.
- Modify: `WebApp/bridge/artefact-store.mjs`, `cde-store.mjs`, `check-registry.mjs`, `office-checks.mjs`,
  `office-store.mjs`, `federation-store.mjs`, `bimdocs-ai.mjs`, `bcf-service.mjs` (pack seed, install,
  topics superseded), `artefact-import.mjs`, `WebApp/src/setups/active-ruleset.ts`, `qa-panel.ts`,
  `project-shell.ts`, `copilot-panel.ts`, `copilot/engine.ts`, `packs-panel.ts`, `docs-panel.ts`,
  `project-settings-panel.ts`, `issue-panel.ts` (superseded group), `src/sentinel-core/index.ts`,
  `docs/TESTING_PROTOCOL.md`, `docs/handbook/05-capability-status.md`.
- Delete: `WebApp/bridge/naming-ruleset.json`, `WebApp/src/sentinel-core/ruleset.json`.
