# Base standard pack

Office-agnostic starter config, generic ISO 19650 / AIA content only. Same
schemas as the pilot standard pack, deliberately different values — proof
that the pack is swappable.

## Files

- **naming-ruleset.json** — container naming fields, read by the bridge
  (`SENTINEL_NAMING_RULESET`) to validate delivered file names.
- **ids.json** — element data requirements (IDS-style specs), read by the
  bridge (`SENTINEL_IDS`) during QA scans.
- **layers.json** — DWG layer → family/category mapping, read by the addin
  from `%AppData%\Sentinel\layers.json`.
- **delivery-contract.json** — IFC delivery contract (required/forbidden
  entities, psets, georeference), read by the addin from
  `%AppData%\Sentinel\delivery-contract.json`.

## Swap procedure for a new office

1. Copy this folder to e.g. `config/<office>-standard/`.
2. Rename naming fields, layer names, and IDS specs to the office's
   convention.
3. Point the bridge at the new files:
   `SENTINEL_NAMING_RULESET=config/<office>-standard/naming-ruleset.json`
   `SENTINEL_IDS=config/<office>-standard/ids.json`
4. Copy `layers.json` and `delivery-contract.json` to
   `%AppData%\Sentinel\` on each workstation.

## Scope note

QA-scan `ruleset.json` and stage gates are not yet swappable — those are
build-time / code, not config, and are out of scope for this pack.
