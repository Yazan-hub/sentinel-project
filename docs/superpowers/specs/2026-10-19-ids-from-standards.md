# The IDS from the installed standards (Q5)

2026-10-19 · the founder's decision Q5 ("the whole loop stays in Sentinel"; docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md, Trigger questions). Approved goal; this is the design as built.

## Goal
Nobody writes IDS by hand. A lead opens **Settings ▸ Standards in force ▸ ids ▸ Generate from standards…**, reads in plain words what the IDS will check and what it will not, and presses **Install as the project's IDS**. It becomes `ids@n+1` through the usual `PUT /cde/:key/artefacts/ids`: lead/owner only, validated by the bridge, one `artefact_installed` ledger row, and the F51 supersede of open IDS topics.

## Compiler (`WebApp/bridge/ids-compile.mjs` `standardsToIds`)
It is deterministic, has no model in it, and works the same way as `matrixToIds`. Inputs are the contract, ruleset and naming in force (project → office), and the IDS in force.

| Standard | Becomes | Stays outside the IDS (in `unmatched`, with its reason and the check that still holds it) |
|---|---|---|
| contract `required_properties` `Pset_<Class>Common.Prop` | one spec per class: `{entity: IFC<CLASS>, property {pset, name, required}}` | a bare `Prop` (the contract checks it on whichever classes carry it, but an IDS must name the class); a set that is not `Pset_<Class>Common` (it names no class) |
| contract `required_psets` | — | always. Sentinel's IDS checks named properties, and IDS 1.0 could only say "any property" |
| contract counts, forbidden ratios, schema, georeference | — | always. These are whole-file rules, and Sentinel's IDS judges each element. The contract's delivery gate keeps them |
| contract `min_coverage < 1` | — | said: the IDS asks every element, so it is stricter |
| ruleset `level` rule | `IFCBUILDINGSTOREY` attribute `Name` matching the rule's own pattern (`RuleEngine.compiledPattern` + whitelist) | rules using `{org}`; exclusions (the IDS is stricter) |
| ruleset `parameter` rule with Walls/Floors/Roofs/Ceilings/Doors/Windows | `{pset: null, name}` required on those classes | other categories, `{org}` names |
| ruleset sheet/view/workset/family/type/grid | — | not in an IFC model, or not judged by Sentinel's IDS |
| naming (containers) | — | it names files, not their contents; the naming check at upload and publish keeps it |

* Generated specs carry `origin: "contract" | "ruleset"`. A regenerate replaces those and keeps every other spec of the IDS in force: an EIR's, a pack's, a hand-written one. A requirement that a kept spec already makes is not repeated, and is listed in `unmatched` as "already required".
* `title` and `enforce` come from the IDS in force, else "Sentinel standards IDS" / `warn`.
* `generated_from` holds `{label, sha256}` for each source. `up_to_date` compares those shas with the standards in force, and the ids row shows an amber line when they differ.

## Route
`GET /cde/:key/artefacts/ids/generated` (any member, read only) → `{ids, added, kept, unmatched, current, up_to_date, xml, xml_skipped}`.
* A source that no longer passes its validator is listed and left out entirely; it is never half-read.
* `xml` is the same IDS as buildingSMART IDS 1.0 (`idsToXml`), offered as **Download .ids**:
  * a plain class is written with its standard-case subtypes, as the contract counts it;
  * JS patterns are written in XSD form (anchors and `(?:` removed; an unanchored pattern gets `.*` around it);
  * a pattern XSD cannot hold (lookarounds, `\b`, back-references, lazy quantifiers, an inner anchor) is left out and listed in `xml_skipped`. It is never rewritten into a different rule.

## Install safety
Install re-reads the generated IDS and refuses if it or the IDS in force changed since the preview ("generate it again").

## Known differences from IDS semantics
* Sentinel's `value` compare ignores case; IDS `simpleValue` does not. Generated specs carry no values.
* Sentinel's entity match is an unanchored, case-insensitive regex. Generated specs use plain class names, and the .ids file lists the subtypes explicitly.

## Proof
`tools/ids-proof/compile.mjs` and `check.py` run IfcTester (IfcOpenShell 0.9.0.post1, venv `%APPDATA%\Sentinel\ifctester-venv`) against Sentinel's contract gate and naming engine on real IFCs. The results are in `docs/testing/SIMULATION_ROOM_RUN_2026-09-22.md` § Session IDS-G.
