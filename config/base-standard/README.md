# Base standard pack

Office-agnostic starter config, generic ISO 19650 / AIA content only. Same
schemas as the pilot standard pack, deliberately different values — proof
that the pack is swappable.

## Files

- **naming-ruleset.json** — container naming fields, installed as the project's
  (or office's) `naming` artefact; every naming judge reads it from there.
- **ids.json** — element data requirements (IDS-style specs), installed on the
  project via `Documents → EIR → Compile to IDS → Install on this project`.
- **layers.json** — DWG layer → family/category mapping, read by the addin
  from `%AppData%\Sentinel\layers.json`.
- **delivery-contract.json** — IFC delivery contract (required/forbidden
  entities, psets, georeference), read by the addin from
  `%AppData%\Sentinel\delivery-contract.json`.

## Swap procedure for a new office

1. Copy this folder to e.g. `config/<office>-standard/`.
2. Rename naming fields, layer names, and IDS specs to the office's
   convention.
3. Install the IDS on the project: `Documents → EIR → Compile to IDS → Install on this project`, or `node bridge/artefact-import.mjs config/<office>-standard/ids.json --project <key> --kind ids`.
4. Install the naming ruleset on the office (its projects inherit it) or on a project: `node bridge/artefact-import.mjs config/<office>-standard/naming-ruleset.json --project <key> --kind naming`. With nothing installed, naming checks report not checkable — there is no bridge default.
5. Copy `layers.json` and `delivery-contract.json` to
   `%AppData%\Sentinel\` on each workstation.

## Scope note

QA-scan `ruleset.json` and stage gates are not yet swappable — those are
build-time / code, not config, and are out of scope for this pack.
