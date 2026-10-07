# Base standard pack

Office-agnostic starter config, generic ISO 19650 / AIA content only. Same
schemas as the pilot standard pack, deliberately different values — proof
that the pack is swappable.

## Files

- **naming-ruleset.json** — container naming fields, installed as the project's
  (or office's) `naming` artefact; every naming judge reads it from there.
- **ids.json** — element data requirements (IDS-style specs), installed on the
  project via `Documents → EIR → Compile to IDS → Install on this project`.
- **layers.json** — DWG layer → category/family mapping (the Base AIA-style
  profile; the pilot's is `demo/bds-pilot/bds-layers.json`), installed as the
  project's (or office's) `layers` artefact; Ghost Builder reads it from there
  and names it `layers@n · source · sha`. Revit reads `standard`, `layers[]`
  (`layer`, `category`, `family`, `aliases`) and `ignore[]`; `enforce`,
  `extensions`, `params`, `disciplines`, `match` and `format` stay in the body,
  unread by Revit.
- **delivery-contract.json** — IFC delivery contract (required/forbidden
  entities, psets, georeference), installed as the project's (or office's)
  `contract` artefact; the IFC Delivery Gate, Governed Publish and Governed
  Intake read it from there and name it `contract@n · source · sha`.

## In Packs

The same files are offered in the marketplace as **`base-standard@1.0.0`** (`WebApp/packs/base-standard.json`, pinned equal to
this folder by `bridge/seed-packs.test.mjs`), with a generic 7-field sheet-number rule as its QA ruleset. An office lead installs it
from **Settings ▸ Packs ▸ Install on office <key>**: the office's projects inherit every kind (`ruleset`, `naming`, `ids`, `layers`,
`contract`, each `@n · office · sha`). A project **overlays** the Base by installing its own artefact of any one kind — the resolver
is project → office, so the project's `naming@1` wins over the office's Base naming while the office's IDS still judges it.

## Swap procedure for a new office

1. Copy this folder to e.g. `config/<office>-standard/`.
2. Rename naming fields, layer names, and IDS specs to the office's
   convention.
3. Install the IDS on the project: `Documents → EIR → Compile to IDS → Install on this project`, or `node bridge/artefact-import.mjs config/<office>-standard/ids.json --project <key> --kind ids`.
4. Install the naming ruleset on the office (its projects inherit it) or on a project: `node bridge/artefact-import.mjs config/<office>-standard/naming-ruleset.json --project <key> --kind naming`. With nothing installed, naming checks report not checkable — there is no bridge default.
5. Install the delivery contract on the office (its projects inherit it) or on a project:
   `node bridge/artefact-import.mjs config/<office>-standard/delivery-contract.json --project <key> --kind contract`,
   or Project Settings ▸ Standards in force ▸ contract ▸ Install JSON… (lead or owner). With none installed,
   the IFC Delivery Gate, Governed Publish and Governed Intake report the gate NOT CHECKED — there is no
   workstation or bundled contract.
6. Install the layers standard the same way:
   `node bridge/artefact-import.mjs config/<office>-standard/layers.json --project <key> --kind layers`.
   The office's modelling guideline (`--kind guideline`) and the type catalogue of its template have no
   seed here — they are the office's own. Build Office System exports the catalogue to
   `%AppData%\Sentinel\exports\type-catalog-<template title>.json` and names its install command
   (`--kind type_catalog`). With none installed, Ghost Builder, Photo Massing and Annotate Views say so
   ("none — not installed for <key> or its office"), and Annotate Views refuses. Nothing in this pack is
   copied to a workstation: Revit reads every standard from the project (or its office) like the web does.

## Scope note

The QA-scan ruleset is the project's `ruleset` artefact, and Revit scans by it as well. A model bound to a
project (Sentinel ▸ Project Setup) judges by that project's `ruleset@n`, or by its office's. This pack ships
no ruleset. Install one from Packs or with
`node bridge/artefact-import.mjs <ruleset.json> --project <key> --kind ruleset`. With nothing installed,
Revit's score reads `Not scored — no ruleset judged this model` and its status line reads
`<doc title> — none — not installed for <key> or its office`. Stage gates are code, not
config, and are out of scope for this pack.
