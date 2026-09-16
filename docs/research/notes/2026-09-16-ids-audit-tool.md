# buildingSMART IDS-Audit-tool

| | |
|---|---|
| **Link** | https://github.com/buildingSMART/IDS-Audit-tool |
| **Seen on** | GitHub — pipeline smoke test (first item through the research inbox) |
| **Collected** | 2026-09-16 · `inbox.md`, then issue #1 once the Claude GitHub App got repo access |
| **Fetched** | ✅ repository README read via WebFetch |
| **Relation to Sentinel** | BUILDING BLOCK |
| **Verdict** | ADAPT — Sentinel already checks *models* against IDS; nothing checks the *rulesets* before they drive a reject. Use the tool where it fits (.NET / real `.ids` files) and add a small lint for our JSON dialect. |

## What it is
buildingSMART's official quality-assurance tool for `.ids` files, in .NET (cross-platform), MIT licence, shipped as a console CLI and as a reusable .NET library. It audits an IDS file for XML-schema (XSD) validity, IFC-schema consistency across facets (entity names, predefined types, attributes, standard property sets and property names), cardinality min/max constraints, type coherence between applicability and requirements, and material / classification relationships. The README lists further audits as planned. Repository activity at fetch time: ~200 commits, 41 stars, 16 forks; the catalog already records v1.0.0 (Oct 2024).

## Why the user saved it
"Sentinel's element gate is driven by swappable IDS rulesets — do we validate the rulesets themselves before they drive a reject?"

## Where it lands in the landscape
Coordination / QA stage, IDS tooling. Already catalogued in `docs/bim-tools-catalog-full.md` (§ IDS addendum, line ~264) as part of the post-IDS-1.0 tooling wave, alongside ifctester, Solibri IDS Editor, usBIM.IDS and Qonic. Does not change any landscape row or the §4 ranking: it is not a competitor, it is infrastructure the whole IDS ecosystem shares.

## What Sentinel has today that touches this
- **IDS engine** (`WebApp/src/sentinel-core/ids.ts`) — validates elements against a spec; `🟩 Built`, same engine in the browser and on the bridge, part of the 99-test suite.
- **Real `.ids` XML ingestion** (`ids-parse.ts`) — namespace-agnostic parse of buildingSMART IDS into `IdsSpec`. It throws on malformed XML but performs **no semantic audit**: an entity name that is not an IFC class, a property name that is not in the named Pset, or an applicability/requirement type mismatch all parse "successfully" and then silently never match or always fail.
- **JSON ruleset dialect** (`demo/bds-pilot/bds-ids.json`, `config/base-standard/ids.json`) — Sentinel's own shape (`applicability.entity` regex, `requirements.attributes/properties`, `enforce`). IDS-Audit-tool cannot read this; it is not IDS XML.
- **Base ruleset swap** `✅ Verified` (handbook 05, 2026-07-26): the gate is config-driven. That is exactly why a bad config is the failure mode that matters — a typo in a Pset name in a `reject` ruleset blocks every publish with a plausible-looking verdict.

## Proposed Sentinel actions
| # | Action | Where (file / subsystem) | Why | Effort | Roadmap lane · item |
|---|---|---|---|---|---|
| 1 | **Ruleset lint for the JSON dialect** — a pure `lintRuleset(spec)` in `sentinel-core` that checks: entity regex compiles and matches at least one known IFC class from a bundled list; Pset names for `Pset_*Common` come with property names that exist in IFC4 (bundled table for the handful of standard psets Sentinel uses); `enforce` is one of `reject/warn/off`; no spec has empty requirements. Run it in the bridge at ruleset load and refuse to start on errors (warn on unknowns), and in `npm run test`. | `WebApp/src/sentinel-core/ruleset-lint.ts` + `bridge` startup | Closes the "bad config = silent bad verdict" hole with the same referee logic Sentinel applies to models. | 1–2 days | Lane 1 · ⬜ Office-agnostic Base template (a Base template people edit needs a linter) |
| 2 | **Run IDS-Audit-tool in CI over every real `.ids` fixture** the repo carries or gains (there are none today; the pilot rulesets are JSON). Add a `dotnet tool` step to `ci.yml` when the first `.ids` lands. | `.github/workflows/ci.yml` | Free, MIT, official. Zero value until a `.ids` file exists in the repo, so gate it on that. | ½ day, when relevant | Lane 1 · ⬜ Certification (paperwork gap vs certified CDEs) |
| 3 | **Audit on import** — when a user drops a real `.ids` into the IDS panel, show the audit result before it becomes the active gate. Two routes: call the .NET library from the Revit add-in side (natural fit, same runtime), or port the subset of checks Sentinel cares about into TypeScript (fits browser + bridge, more work). | `WebApp/src` IDS panel, or `SentinelAddin` | Turns "we consume IDS" into "we consume *verified* IDS", which is a trust-story line for the Solibri comparison (§4 target #1). | 1 week (TS port) / 2–3 days (add-in) | Lane 1 · 🔭 propose API as a public product |

## Open questions for the brainstorm
- Is the JSON dialect staying, or does the Base template move to real `.ids` XML so buildingSMART tooling (and Solibri/BIMcollab users' existing files) work unchanged? Action 1 vs 2/3 depends on that answer.
- Should a ruleset that fails lint block bridge startup (safe, loud) or run with a banner (softer for the pilot)?

## Sources
- https://github.com/buildingSMART/IDS-Audit-tool (README, fetched 2026-09-16)
- `docs/bim-tools-catalog-full.md` IDS addendum (existing entry)
- `WebApp/src/sentinel-core/ids-parse.ts`, `ids.ts`; `demo/bds-pilot/bds-ids.json`
