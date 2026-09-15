# Revit-side parity — fix-in-place from a BCF issue + naming manager — design

**Market-signal P4** (`docs/MARKET_SIGNAL_2026-09.md`): the one item the 2026-09-15 run could not build
(no .NET). BIMVAQ's pitch — *keep the context, act where the model can change* — and Hamza Arshad's BIM
Naming Manager, both rebuilt on Sentinel's own referee and request/approve loop, so the Revit side gains
what the market is selling **plus** the thing neither of them has: every fix checked by the same
deterministic gate that raised the issue, and recorded.

Two halves, independent, shipped in order: **fix-in-place first** (it closes the governed loop), the
**naming manager** second. One branch, one plan, each half shippable alone.

## Context and prior art (all merged, all reused)

- **BCF loop in Revit.** `BcfIssuesCommand` → `BcfIssuesWindow` (modeless list + details) →
  `BcfApplyEvent` (ExternalEvent ops: apply viewpoint, isolate all, issues-for-selection).
  `BcfSyncManager` only READS today (`FetchActiveAsync`, SSE). The bridge already has
  `POST /bcf/3.0/projects/:pid/topics/:guid/comments` and `PUT …/topics/:guid {topic_status}`.
- **Referee-raised topics.** `raiseGovernedFailureTopics` (`bcf-service.mjs`) builds the title
  `IDS: <spec> — <requirement> (N failing)` from `groupFailuresForBcf` (`key = specification — requirement`;
  requirement is `Pset.Prop` or `@Attr`), with the failing GUIDs as the viewpoint selection (≤500).
  Dedup treats `Closed` **and** `Resolved` as not-open — a Resolved key that still fails at the next
  publish raises a fresh topic. The Revit list shows everything non-Closed.
- **Revit-side referee client.** `GovernedElementExtractor.Extract` → `ElementProperties` (pset reads
  hardcoded inline) + `GovernedNotify.Propose` → `POST /cde/:key/propose`. The bridge response carries
  `failures[]` (≤200, each `{element GUID, specification, requirement, reason}`), `audit_id`, `receipt`;
  the C# result keeps only counts and 12 strings. The server `SENTINEL_IDS` override beats a client spec.
- **Audited local writes.** `AutoFixExecution.Run` (hub transaction, `RequestStore.Upsert` a
  `ChangeRequest` with `Status=Approved` + `AuditEntry`, ROI, snapshot update), `FixReviewDialog`,
  `RequestManager`. `GovernedNotify.Post("/audit", …)` is the fire-and-forget ledger post the delivery
  gate already uses.
- **Rule engine.** Token-schema JSON `Rule`s, `RuleTarget {View,Sheet,Workset,Family,Level,Grid,Parameter}`,
  `RuleEngineHost.ScanFull`, `RulesetStore` chain, shipped `SentinelAddin/Resources/ruleset.json`
  (`bds-rtg-001 1.4.1`; `FN-01` families = `BDS_BODY`, warn, 7 categories). `Category.MatchesCategoryKey`
  is the locale-safe category match. `AutoFixExecution.Deduplicate` suffixes `_01` on collision.
- **BDS type convention** (`docs/BDS_TEMPLATE_TYPE_AUDIT.md`): walls/floors follow
  `BDS_[LOCATION]_[DISCIPLINE]_[MATERIAL]_[THICKNESS] mm` — undocumented in RTG-001, consistent in the
  template, thickness = real Width on 32/32 conforming types; doors carry a **nominal** size that is NOT
  the Width/Height parameter; legacy duplicates (`BDS_ARCH_WALL_EXT_MTL_50_mm`, `…_5_CM`,
  `BDS_EXT_ARC_MTL_50 mm` = one wall), a non-ASCII `Ê`, mixed units.
- **Fixtures + test convention.** `TypeNameParse` (GhostBuilder) parses thickness / `W x H` from names;
  `tools/*-check` console projects compile Revit-free `.cs` files directly and assert;
  `demo/bds-pilot/bds-type-catalog.json` holds 1,434 harvested types with category/family/type/system/
  width/height. CI builds the add-in for 2025 + 2026 on windows-latest; the check tools are not in CI yet.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Fix mechanism | Local write, referee-checked **before and after**, via the existing `/propose` | Same gate as Governed Publish; no new vocabulary, executor or bridge object |
| Issue closure | Evidence comment + `Resolved`; `Closed` stays human | Segregation of duty; Resolved is re-tested by the gate that raised it |
| Parameter mapping | One `PsetMap` table used for **read and write** | The extractor's inline reads move into it — a value is written exactly where the referee reads it |
| Missing parameter | *Not fixable here*, named | Sentinel never adds parameters or invents a home for a value |
| Apply granularity | One transaction, independent writes, per-row report | No cross-element invariant; partial success is the truth and is reported as such |
| Naming scope | Families **and** types | The audit shows the mess is in type names |
| Proposals | Recovery only; enum tokens are never defaulted | A guessed `EXT` is a lie dressed as a suggestion |
| Collisions | Block, never suffix | Duplicates are the finding, not noise to paper over |
| DMU for types | Not in v1 | Scan-on-demand + the manager are the path; the updater stays quiet |
| Type rules | `TN-01` from the audit; `TN-02` inferred, marked to confirm | Rules are data — the user edits the JSON, not the code |
| Checks in CI | Add the two new `tools/*-check` runs to the add-in job | They are net8 + Revit-free; a check that never runs is decoration |

## Half 1 — Fix-in-place from a BCF issue

### Contracts (the load-bearing pieces, all Revit-free unless marked)

- **`IdsIssueRef.TryParse(title)`** → `{ Spec, Requirement, Kind: Property(pset, name) | Attribute(name), Failing }`
  via `^IDS:\s*(.+?)\s*—\s*(\S+)\s*\((\d+) failing\)$`. Non-match → `null` → no Fix button (tooltip: *only
  referee-raised IDS issues can be fixed here*). The format is owned by `groupFailuresForBcf`; the parser
  is its inverse and a check pins both directions.
- **`PsetMap`** — `{ requirementKey → Candidates[], ValueKind }` with candidate kinds
  `Lookup(name)` · `BuiltIn(BIP)` · `WallFunction` · `ElementName`, and `ValueKind ∈ Text | YesNo | Number`.
  Seed = exactly the extractor's reads today:
  `Pset_BDS.Discipline → [Lookup BDS_Discipline, Lookup Discipline]` ·
  `Pset_WallCommon.IsExternal → [Lookup IsExternal (YesNo), WallFunction]` ·
  `Pset_WallCommon.FireRating`, `Pset_DoorCommon.FireRating → [Lookup FireRating, BuiltIn FIRE_RATING]` ·
  `Pset_WindowCommon.ThermalTransmittance → [Lookup ThermalTransmittance, U-Value, Heat Transfer Coefficient (U), BDS_UValue]` ·
  `@Name → [ElementName]`. `GovernedElementExtractor.AddCanonicalPsets` is rewritten to iterate the map
  (identical output; Governed Publish is the regression check). A requirement with no entry → every row is
  `NotFixable("no parameter mapping for <key>")`.
- **`FixRow`** — `{ Target: Instance(elementId) | Type(typeId, instanceIdsOnIssue[], otherInstanceCount),
  ParamName, ResolvedVia, ValueKind, Current, Proposed, Writable, Verdict }` with
  `Verdict ∈ Unchecked | Pass | Fail(reason) | NotFixable(reason)`. Resolution (Revit API, read-only): first
  candidate that exists and is writable, **instance first, then type**. Rows that resolve to the same type
  parameter collapse into one Type row.
- **`FixPlan.Patch(elementProps, requirement, proposed)`** — the extracted `ElementProperties` with the
  requirement's pset row (or attribute) replaced by the proposed value; a Type row expands to every
  instance on the issue (the referee judges instances).
- **`FixPlan.Fold(response, rows, issueGuids)`** → per-row verdict (Pass iff no failure with
  `element ∈ row GUIDs ∧ requirement == issue requirement`, else Fail with the referee's reason),
  `AllPass` (every issue GUID resolved in this model **and** passes), `Unresolved[]` (issue GUIDs not in the
  model), `OtherOpen` (failures on other requirements — a footnote count, never folded into this issue).

### Flow

1. **Open.** Selecting an `IDS:` topic enables **Fix in Revit**. `BcfApplyEvent` gains a read-only op
   `BuildFixPlan` (GUID → element resolution via the existing `ResolveByIfcGuid`, then `PsetMap`
   resolution). `FixInPlaceWindow` opens modeless, one per topic, Revit as owner.
2. **Edit.** Per-row proposed value (TextBox; YesNo as a toggle); *Set all ticked to…*.
3. **Check** = dry run. `Patch` every ticked row → `GovernedNotify.Propose(elements, ids, source:"revit-fix",
   note:"fix-in-place check <bcf guid>")`. `ids` = local `%AppData%\Sentinel\ids.json` when present (shared
   `IdsSpecFile.Load()` extracted from `GovernedPublishCommand`); the server override wins as in Governed
   Publish. `Fold` → verdicts on screen, status line shows `audit <id>`. A bad value is refused **before**
   it enters the model.
4. **Apply ticked.** Hub op `ApplyFix`: one transaction `Sentinel: fix-in-place <requirement>`; each row
   written by `ValueKind` (Text → `Set(string)`, YesNo → `Set(int)`, WallFunction → type `FUNCTION_PARAM`,
   ElementName → `Name`); per-row outcome (done / read-only / Revit refused: message). Each success →
   `RequestStore.Upsert(ChangeRequest{ RuleId: requirement, Old, New, Status: Approved, VerdictBy: user,
   VerdictNote: "fix-in-place · BCF <guid>" }, AuditEntry "fix.applied")` + `RoiTracker.Log("fix", …)`.
   Failed rows keep their tick.
5. **Re-check** (automatic). Re-extract the issue's elements **from the model as it now is** →
   `/propose` (`note:"fix-in-place re-check <guid>"`) → `Fold`.
6. **Close the loop** (network, off the API thread). `AllPass` → `AddCommentAsync` then
   `SetStatusAsync("Resolved")`. Otherwise comment only, with the exact tally, the still-failing element
   ids and the unresolved GUIDs; status untouched. Comment author = `doc.Application.Username` (the bridge's
   `resolveActor` may relabel to the machine identity — recorded as-is). Template:
   `Fixed in Revit by <user>: <p>/<n> element(s) now pass <requirement>. Referee re-check audit <audit_id> · receipt <ledger_hash[:16]>.`
   `+ "Still failing: …"` / `+ "Not in this model: …"`.

### Client additions

- `BcfSyncManager.AddCommentAsync(pid, guid, comment, author)` → POST comments;
  `SetStatusAsync(pid, guid, status)` → PUT `{topic_status}`. Bearer from `BcfConfig.ServiceToken`.
- `GovernedNotify.ProposalResult` gains `ElementFailures[] {Element, Requirement, Reason}` (all ≤200),
  `AuditId`, `ReceiptHash`; `Propose` gains `source`/`note`. Existing fields and callers unchanged.

### UI states (honesty rules)

- Verdict `recorded` (no IDS anywhere): banner *No IDS available to check against — Apply is allowed;
  the issue cannot be resolved from here.* Step 6 skipped.
- Bridge unreachable at Check: *Could not reach the bridge — nothing was checked. Applying is unverified.*
  At re-check: *Applied. NOT verified — the issue was not touched.* A **Re-check** button retries 5–6.
- Type row scope cell: `TYPE <name> — <k> instance(s) on this issue; <m> other(s) in the model change too`.
- No resolvable elements: the window opens with *None of this issue's <n> element(s) are in the open
  model* and no Apply.
- Comment posted, status PUT failed: *Evidence posted; status unchanged (HTTP …)*.
- Never: a Pass without a referee response; a Resolved with any GUID unresolved; a suffix, default or
  substitute value the user did not type.

## Half 2 — Naming manager (families + types)

### Rules (data)

`RuleTarget.Type` (JSON `type`). Ruleset `bds-rtg-001` → `1.5.0` adds:

```jsonc
{ "id": "TN-01", "target": "type", "mode": "warn",
  "tokens": ["BDS","LOC","DISC","MATERIAL","SIZE"], "separator": "_",
  "token_defs": { "BDS": "BDS", "LOC": "EXT|INT|FND", "DISC": "ARC|STR|LSE|INT|MEP|CIV",
                  "MATERIAL": "[A-Z0-9][A-Z0-9 \\-]*", "SIZE": "\\d+(\\.\\d+)? mm" },
  "categories": ["Walls","Floors","Ceilings","Roofs"],
  "message_en": "Type '{name}' does not match BDS_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm.",
  "doc_ref": "BDS template convention (BDS_TEMPLATE_TYPE_AUDIT §1) — not in RTG-001" },
{ "id": "TN-02", "target": "type", "mode": "warn",
  "tokens": ["BDS","LOC","LEAF","MATERIAL","SIZE"], "separator": "_",
  "token_defs": { "BDS": "BDS", "LOC": "EXT|INT", "LEAF": "\\d+ PNL|[A-Z0-9][A-Z0-9 \\-]*",
                  "MATERIAL": "[A-Z0-9][A-Z0-9 \\-]*", "SIZE": "\\d+ x \\d+ mm" },
  "categories": ["Doors","Windows"],
  "message_en": "Type '{name}' does not match BDS_[LOC]_[LEAF]_[MATERIAL]_[W x H] mm.",
  "doc_ref": "INFERRED from the template (BDS_TEMPLATE_TYPE_AUDIT §3) — confirm before enforcing" }
```

`RuleEngineHost`: `case RuleTarget.Type → ScanTypes` over `WhereElementIsElementType()` filtered by
`rule.Categories` (`MatchesCategoryKey`), `CheckName(et, et.Name, …)`. `EvaluateSingle` (DMU delta) is
unchanged. The token→regex compiler moves to a shared static `RuleRegex.For(rule)` so the proposer
validates with the exact regex the scanner enforces. `ViolationRow.CanFix` returns false for `Type`
violations (message points to the Naming Manager) — the panel's one-row Fix would suffix on collision.

### Proposer (pure, Revit-free — `SentinelAddin/Standards/NamingProposer.cs`)

`Propose(current, rule, ctx)` with `ctx = { Category, FamilyName, IsSystem, WidthMm?, HeightMm?,
ExistingNamesInFamily, SiblingProposals }` → `{ Name?, Verdict ∈ Conforming | Proposed | NeedsHuman | Blocked, Notes[] }`.

1. **Normalise**: Unicode NFD + strip combining marks (`Ê`→`E`); trim; collapse whitespace;
   `(\d+)\s*_?\s*mm` → `$1 mm`; `(\d+)\s*_?\s*cm` → `$1×10 mm`; a number-`X`/`x`-number → `<w> x <h>`.
2. **Tokenise** on `_`; drop the `BDS` literal and category-noise words (`WALL FLOOR CEILING ROOF DOOR WINDOW`).
3. **Enum tokens** (`LOC`, `DISC`, …): find one segment matching the def, with aliases
   `ARCH→ARC · EXTERNAL→EXT · INTERNAL→INT · FOUNDATION→FND`; consume it. Missing → `NeedsHuman("no LOC in name")`.
   Enum tokens are **never defaulted**.
4. **SIZE**: `TN-01` — measured `WidthMm` when the context has one, else `TypeNameParse.ThicknessMm`;
   both present and different → `NeedsHuman("name says 50 mm, Width is 200 mm")`. `TN-02` — name-derived
   `W x H` only; measured never used (audit §3).
5. **Free-text tokens** (`MATERIAL`, `LEAF`): the remaining segments, uppercase-normalised; exactly one
   segment per free-text token, else `NeedsHuman`.
6. **Assemble** in rule order → validate with `RuleRegex.For(rule)`; non-match → `NeedsHuman` (a
   non-conforming string is never shown as a proposal).
7. `Name == current` → `Conforming`. `Name ∈ ExistingNamesInFamily \ {current}` or equal to another row's
   proposal → `Blocked("duplicate of <name> — merge is a human decision")`.

Family rules (`FN-01`): `AutoFixExecution.BuildCompliantName` as the candidate, then steps 6–7 (validated,
collision-blocked, **not** suffixed).

### Window (`UI/NamingManagerWindow`, modeless, single instance, code-built)

Columns: tick · category · family · current · proposed (editable) · verdict + note · instances. Filters:
rule · category · verdict; search box. Buttons: *Propose all* (fills blank proposals; never overwrites a
user edit) · **Rename ticked** · *Select instances* · *Rescan*. Status line.
Data build is a read-only hub op: scan Family/Type rules, per row gather `WidthMm` (`WallType.Width`;
other categories `null` — name-derived only, said in the note), the family's existing names, and instance
counts (one pass over instances of the rule's categories grouped by type id).

### Apply

Hub op, one transaction `Sentinel: Naming Manager (<n>)`. Per row at write time: proposed re-validated
with `RuleRegex.For(rule)` (else *refused: does not match the schema*), uniqueness re-checked live within
the family (else *refused: name now taken*), then `ElementType.Name` / `Family.Name` set;
`ApplicationException` → per-row failure with Revit's message. Each success → `RequestStore.Upsert(
ChangeRequest{ RuleId, ElementId, Old, New, Approved, VerdictBy: user, VerdictNote: "Naming Manager" },
AuditEntry "naming.renamed")` + `RoiTracker.Log("naming", …)` + `RequestManager.UpdateSnapshot`. One
fire-and-forget `GovernedNotify.Post("/audit", { entity_type:"naming", action:"renamed <n>",
new_value:{ rows:[{id, from, to, rule}] } })`. Affected rows rescan; nothing else moves.

### Ribbon

Validate panel: push button **Naming Manager** → `NamingManagerCommand` (icon `family`).

## Error handling (both halves)

- Every Revit write runs on the `App.Events` hub inside a transaction; never from a task or the WPF thread.
- Every network call is off the API thread, short-capped, and its failure is a **state on screen**, never a
  silent fallback: nothing checked / applied-not-verified / evidence posted-status unchanged.
- Per-row failures never abort the batch and are never summarised away — each row shows its own reason.
- Parse failures (title, response) disable the feature for that item with the reason in the tooltip.
- No suffixing, defaulting, or substitution anywhere; when Sentinel cannot recover a token or a home for a
  value it says *needs a human* and stops.

## Testing

- **`tools/fixplace-check`** (net8 console, compiles `IdsIssueRef.cs`, `PsetMap.cs` data half, `FixPlan.cs`):
  title parse round-trip against the exact `groupFailuresForBcf` format (incl. an `@Name` attribute and a
  title with an em-dash inside the spec name); `PsetMap` seed covers every requirement the extractor reads;
  `Patch` replaces only the target row and adds it when absent; `Fold`: pass/fail per row, a type row with a
  mixed instance outcome fails, `AllPass` false with one unresolved GUID, `OtherOpen` counted not folded.
- **`tools/naming-check`** (compiles `NamingProposer.cs`, `RuleRegex.cs`, `RuleModels.cs`, `TypeNameParse.cs`):
  the audit's cases — `BDS_ÊXT_LSE_CONC_100 mm → BDS_EXT_LSE_CONC_100 mm`;
  `BDS_ARCH_WALL_EXT_MTL_50_mm → BDS_EXT_ARC_MTL_50 mm`; its `_5_CM` twin proposes the same and both are
  **Blocked** against the existing `BDS_EXT_ARC_MTL_50 mm`; `BDS_LSE_WALL_CONC_150_mm → NeedsHuman` (LSE is a
  discipline, no LOC); stock `Generic - 200mm → NeedsHuman`; name 50 mm vs Width 200 → NeedsHuman;
  conforming stays Conforming; a door type never takes its size from Width/Height.
  Then a **sweep over the 1,434-type catalogue**: never throws, never proposes a non-conforming name, never
  proposes a duplicate — and prints the real tally (conforming / proposed / needs-human / blocked).
- CI: both checks added as `dotnet run --project tools/<name>` steps in the add-in job; builds 2025 + 2026
  (local: 2023 net48 as well, as in the A2 work).
- Existing behaviour pinned: Governed Publish output after the `PsetMap` refactor is byte-identical for the
  demo model (the extractor's own drill); the panel's family Fix path unchanged.

## Verification (live, user at Revit)

1. Governed Publish a model with a wall missing FireRating → topic `IDS: … — Pset_WallCommon.FireRating`.
2. BCF Issues → Fix in Revit → rows show `TYPE … affects k others` or instance scope honestly.
3. Check with a junk value → ✗ with the referee's reason; with `REI60` → ✓; Apply → re-check → comment +
   Resolved on the web Issues panel, with the audit id resolvable at `/receipt/:key/:auditId`.
4. Bridge stopped → Apply → *applied, NOT verified, issue untouched*; bridge back → Re-check → Resolved.
5. Naming Manager on the BDS template: the audit's duplicates appear Blocked, the `Ê` type proposes
   correctly, Rename ticked renames only ticked rows; `RequestStore` and the ledger show the rows.

## Out of scope (deliberate)

DMU for types · CSV export · instance renames · `.rfa` file renames · merge tooling · adding parameters ·
web-side UI (the web sees the comments and statuses it already renders).
