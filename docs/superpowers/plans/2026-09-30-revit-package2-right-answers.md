# Revit package 2 — right answers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The add-in's checks and fixes give the right answer: filled numbers and Yes/No values count as filled, IFC-02 checks the contract's required properties, ⚡ Fix uses the scanner's exact naming pattern and respects REQUEST mode, a BLOCK rule stops the sync, BCF exports carry real IFC GUIDs and shared-coordinate cameras, and every percentage says what it measures.

**Architecture:** Pure rules (`RuleRegex.Matches`, `PsetMap.ForRequired`) with offline checks; Revit-bound reads in one helper (`ParamValue`); the sync gate as one `DocumentSynchronizingWithCentral` handler in `App` (package 3 adds CDE-01 there); proposals as a flag on the existing `ChangeRequest`.

**Tech Stack:** C# (net48 / net8), Revit API, WPF; `tools/*-check` console checks (net8).

**Spec:** `docs/superpowers/specs/2026-09-30-revit-addin-safe-honest-design.md` (Package 2). Audit ids in `docs/strategy/2026-09-30-revit-addin-audit.md`. Package 2b (GATE-E2, per-class coverage in three gate copies) is a separate plan.

## Global Constraints

- Builds for Revit **2024, 2025 and 2026** (`dotnet build -p:RevitVersion=YYYY -p:DeployToRevit=false`); any Revit API used exists in **2021**.
- Revit API only on the API thread; no new `ExternalEvent` per window.
- Pure logic gets offline checks in the existing harnesses (`naming-check` compiles `RuleRegex.cs`; `fixplace-check` and `publish-check` compile `PsetMap.cs`; `artefact-cache-check` reads `HealthScorecard.Headline`).
- Honesty: never an unmeasured pass; "not checked" is said as such; a malformed rule fails closed with its reason.
- BLOCK decision (founder, verbatim): **a BLOCK rule stops the sync, not the edit.** No override in this pass.
- Labels (verbatim): `Rule pass rate`, `Weighted rule score`, `IFC mapping coverage`.
- No new dependencies. Branch `feature/revit-package2`; `--no-ff` merge; secret-scan before push. Commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File structure

| File | Change |
|---|---|
| `SentinelAddin/Engine/RuleRegex.cs` | `Matches(rule, org, text, out error)` — the one pass/fail answer, fails closed |
| `SentinelAddin/UI/FixReviewDialog.xaml.cs`, `UI/SentinelPanelViewModel.cs` | Dialog validates with `RuleRegex.Matches` and the row's org; BLOCK rows get ⚡ Fix; REQUEST rows propose |
| `SentinelAddin/Workflow/AutoFixExecution.cs` | Re-check the de-duplicated name; REQUEST → proposal |
| `SentinelAddin/Workflow/ChangeRequest.cs`, `Workflow/RequestManager.cs` | `Proposal` flag; `CreateProposal`; Approve applies a proposal, Reject leaves it |
| `SentinelAddin/Engine/ParamValue.cs` (new), `Engine/RuleEngineHost.cs` | Typed "is filled" read, instance then type; null-name guard |
| `SentinelAddin/Engine/PsetMap.cs`, `Engine/IfcPreFlightScanner.cs`, `Commands.cs` | IFC-02 from the contract's required properties |
| `SentinelAddin/App.cs`, `Updaters/SentinelUpdater.cs` | BLOCK stops the sync |
| `SentinelAddin/Commands.IfcGate.cs` / `Engine/GateLines.cs` | PASS says what it covers |
| `SentinelAddin/Engine/BcfExporter.cs` | IFC GUID + shared-coordinate camera |
| `SentinelAddin/Engine/RuleModels.cs`, `Engine/HealthScorecard.cs`, `UI/SentinelPanelViewModel.cs`, `Updaters/FailureInterceptor.cs` | Named percentages + formulas; Doctor header counts only auto-resolved/suppressed warnings |

---

### Task 1: One naming answer (BG-5)

**Files:** `Engine/RuleRegex.cs`, `UI/FixReviewDialog.xaml.cs`, `UI/SentinelPanelViewModel.cs` (RequestFix), `Workflow/AutoFixExecution.cs`, `tools/naming-check/Check.cs`

**Interfaces — Produces:** `RuleRegex.Matches(Rule r, string? org, string text, out string? error) : bool`; `FixReviewDialog(string elementName, string ruleId, Rule? rule, string? org, string suggestion)`.

- [ ] **Step 1: failing checks** — in `tools/naming-check/Check.cs` `Main`, after the existing RuleRegex block, add:
```csharp
        Console.WriteLine("\nRuleRegex.Matches — the ⚡ Fix dialog and the scanner give one answer (BG-5)\n");
        var orgRule = new Rule { Id = "VW-01", Tokens = ["ORG", "BODY"], Separator = "_",
            TokenDefs = new() { ["ORG"] = "{org}", ["BODY"] = "[A-Z0-9]+" }, MessageEn = "x" };
        Ok(RuleRegex.Matches(orgRule, "AST", "AST_LOBBY", out var e1) && e1 is null, "a rule with {org} passes the office's own name (the dialog refused it)");
        Ok(!RuleRegex.Matches(orgRule, "AST", "BDS_LOBBY", out _), "another office's code does not pass");
        var bad = new Rule { Id = "X", Tokens = ["A"], TokenDefs = new() { ["A"] = "(" }, MessageEn = "x" };
        Ok(!RuleRegex.Matches(bad, "AST", "anything", out var e2) && e2 is not null && e2.StartsWith("the rule's pattern is malformed"), "a malformed def fails closed, with the reason");
        Ok(RuleRegex.Matches(new Rule { Id = "Y", MessageEn = "x" }, "AST", "whatever", out _), "a rule with no tokens has nothing to match");
```
- [ ] **Step 2:** `dotnet run --project tools/naming-check` → build error (`Matches` missing).
- [ ] **Step 3: implement** — in `RuleRegex.cs` after `For`:
```csharp
    /// BG-5: the one "does this name pass the rule" answer for every surface (scanner, ⚡ Fix dialog, the fix itself).
    /// A rule with no tokens has nothing to match. A malformed token def fails CLOSED with the reason — never a pass.
    public static bool Matches(Rule r, string? org, string text, out string? error)
    {
        error = null;
        if (r.Tokens.Count == 0) return true;
        try { return For(r, org).IsMatch(text); }
        catch (System.ArgumentException ex) { error = "the rule's pattern is malformed: " + ex.Message; return false; }
    }
```
In `FixReviewDialog.xaml.cs`: add `private readonly string? _org;`, constructor gains `string? org` after `rule` (`_org = org;`), and replace `Validate`'s match and `Matches` with:
```csharp
        bool ok = text.Length > 0 && Matches(text, out var why);
        ExecuteBtn.IsEnabled = ok;
        ValidityText.Text = ok ? "✓ Matches the naming schema"
                               : why is not null ? "✕ " + why : "✕ Does not match the token pattern yet";
```
```csharp
    // The scanner's own pattern, with the document's office code — the dialog used its own copy without {org} and
    // refused names the scanner accepts (audit BG-5).
    private bool Matches(string text, out string? why)
    {
        why = null;
        return _rule is null || RuleRegex.Matches(_rule, _org, text, out why);
    }
```
In `SentinelPanelViewModel.RequestFix`: `new FixReviewDialog(row.ElementName, row.RuleId, row.Rule, row.Org, suggestion)`.
In `AutoFixExecution.Run`, right after `candidate = Deduplicate(doc, element, rule, candidate);`:
```csharp
                if (!RuleRegex.Matches(rule, App.OrgFor(doc), candidate, out _))
                {   // the de-duplicated name (a suffix) no longer passes the rule: write nothing (BG-5)
                    t.RollBack();
                    onDone?.Invoke(oldName, null);
                    return;
                }
```
- [ ] **Step 4:** naming-check passes; add-in builds 2024.
- [ ] **Step 5: commit** `feat(revit): one naming answer — the ⚡ Fix dialog and the fix use the scanner's pattern, fail closed (BG-5)`

### Task 2: ⚡ Fix respects REQUEST mode; BLOCK rows get ⚡ Fix (BG-4)

**Files:** `Workflow/ChangeRequest.cs`, `Workflow/RequestManager.cs`, `Workflow/AutoFixExecution.cs`, `UI/SentinelPanelViewModel.cs`

**Interfaces — Produces:** `ChangeRequest.Proposal : bool`; `RequestManager.CreateProposal(Document doc, string ruleId, Element element, string proposed) : bool`.

- [ ] **Step 1:** `ChangeRequest`: add after `NewValue`:
```csharp
    /// BG-4: a proposal filed by ⚡ Fix on a REQUEST rule — the element was NOT renamed; Approve applies NewValue,
    /// Reject leaves the element as it is. Absent in older stored requests (= false: the edit already happened).
    [JsonPropertyName("proposal")] public bool Proposal { get; set; }
```
- [ ] **Step 2:** `RequestManager`: add after `CreatePending`:
```csharp
    /// BG-4: ⚡ Fix on a REQUEST rule proposes instead of renaming. MUST run inside a transaction.
    /// False when a request is already pending for the element or the name would not change.
    public static bool CreateProposal(Document doc, string ruleId, Element element, string proposed)
    {
        long id = element.Id.IdValue();
        if (RequestStore.HasPending(doc, id)) return false;
        var current = element is ViewSheet s ? s.SheetNumber : element.Name;
        if (current == proposed) return false;
        var req = new ChangeRequest
        {
            RuleId = ruleId,
            ElementId = id,
            ElementCategory = element.Category?.Name ?? element.GetType().Name,
            OldValue = current,
            NewValue = proposed,
            RequestedBy = doc.Application.Username,
            Proposal = true,
        };
        RequestStore.Upsert(doc, req, new AuditEntry
        {
            Actor = req.RequestedBy,
            Action = "request.proposed",
            RequestId = req.Id,
            Detail = $"{req.ElementCategory} '{current}' -> '{proposed}' proposed ({ruleId})",
        });
        SetReviewFlag(element, "Pending");
        return true;
    }
```
In `Resolve`: the approve branch becomes
```csharp
            req.Status = RequestStatus.Approved;
            if (element is not null)
            {
                if (req.Proposal) { RevertValue(element, req.NewValue); UpdateSnapshot(doc, req.ElementId, req.NewValue); } // apply the proposal
                SetReviewFlag(element, "");
            }
```
and the reject branch's `if (element is not null)` block starts with:
```csharp
                if (req.Proposal) { SetReviewFlag(element, ""); }   // nothing was renamed: nothing to revert
                else
                {
```
closing the `else` after `req.Status = RequestStatus.Reverted;`.
- [ ] **Step 3:** `AutoFixExecution.Run`: after `if (candidate == oldName) { … }` add
```csharp
            if (rule.Mode == EnforcementMode.Request)
            {   // BG-4: a REQUEST rule is decided by a coordinator — file the proposal, rename nothing
                using var tp = new Transaction(doc, "Sentinel: Propose " + ruleId);
                tp.Start();
                bool filed = RequestManager.CreateProposal(doc, ruleId, element, candidate);
                tp.Commit();
                onDone?.Invoke(oldName, filed ? candidate : null);
                return;
            }
```
- [ ] **Step 4:** `SentinelPanelViewModel`: `ComputeCanFix` allows BLOCK: `if (v.Mode != EnforcementMode.Warn && v.Mode != EnforcementMode.Request && v.Mode != EnforcementMode.Block) return false;` and in `RequestFix`'s onDone, before the removal, handle a proposal:
```csharp
            if (row.Mode == "REQUEST")
            {
                Status = newName is null
                    ? $"✕ No proposal filed for '{row.ElementName}' — one may already be pending (Change Requests)."
                    : $"✓ Proposed '{newName}' for '{row.ElementName}' — a coordinator approves it in Change Requests.";
                return;   // the row stays: the element is unchanged until Approve
            }
```
- [ ] **Step 5:** build 2024; commit `feat(revit): ⚡ Fix files a proposal on REQUEST rules; Approve applies it; BLOCK rows get ⚡ Fix (BG-4)`

### Task 3: Typed parameter reads (SCAN-E1 read part)

**Files:** create `Engine/ParamValue.cs`; modify `Engine/RuleEngineHost.cs` `CheckParameter`.

- [ ] **Step 1:** `Engine/ParamValue.cs`:
```csharp
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>SCAN-E1 (read part): whether a parameter holds a value, by its storage type. AsString() returns null for
/// Integer/Double/ElementId storage, so a filled number or a Yes/No set to "No" read as EMPTY and was flagged
/// (audit 2026-09-30). Instance first, then the element's type — the order GovernedElementExtractor.ReadEntry uses.</summary>
public static class ParamValue
{
    public static bool IsFilled(Parameter? p) => p is { HasValue: true } && p.StorageType switch
    {
        StorageType.String => !string.IsNullOrWhiteSpace(p.AsString()),
        StorageType.Integer or StorageType.Double => true,
        StorageType.ElementId => p.AsElementId() != ElementId.InvalidElementId,
        _ => false,
    };

    public static bool Filled(Element e, string name) =>
        IsFilled(e.LookupParameter(name))
        || (e.Document.GetElement(e.GetTypeId()) is { } type && IsFilled(type.LookupParameter(name)));
}
```
- [ ] **Step 2:** `RuleEngineHost.CheckParameter`:
```csharp
    private static void CheckParameter(Element e, Rule rule, string org, List<Violation> sink)
    {
        if (rule.ParameterName is null) return;   // nothing to check (the live DMU path had no guard)
        if (!ParamValue.Filled(e, rule.ParameterName))
            sink.Add(Make(rule, org, e.Id.IdValue(), e.Name));
    }
```
- [ ] **Step 3:** build 2024; commit `fix(revit): parameter rules read numbers, Yes/No and ids by storage type, instance then type (SCAN-E1)`

### Task 4: IFC-02 checks the contract's required properties (PRE-E2)

**Files:** `Engine/PsetMap.cs`, `Engine/IfcPreFlightScanner.cs`, `Commands.cs` (IfcPreFlightCommand), `tools/fixplace-check/Check.cs`

**Interfaces — Produces:** `PsetMap.ForRequired(string? org, IEnumerable<string> names) : (IReadOnlyList<PsetEntry> Mapped, IReadOnlyList<string> Unmapped)`; `IfcPreFlightScanner.Scan(Document doc, DeliveryContract? contract, string contractLabel)`.

- [ ] **Step 1: failing checks** in `tools/fixplace-check/Check.cs` (a new block in `Main`):
```csharp
        Console.WriteLine("\nPsetMap.ForRequired — the contract's required names → Revit reads (PRE-E2)\n");
        var fr = PsetMap.ForRequired("AST", new[] { "FireRating", "ThermalTransmittance", "Pset_DoorCommon.FireRating", "AcousticRating", " ", "FireRating" });
        Ok(fr.Mapped.Count(m => m.Prop == "FireRating" && m.Pset == "Pset_WallCommon") == 1 && fr.Mapped.Count(m => m.Prop == "FireRating" && m.Pset == "Pset_DoorCommon") == 2,
           "FireRating maps to the wall and door entries; a dotted key adds its one entry");
        Ok(fr.Mapped.Any(m => m.Prop == "ThermalTransmittance" && m.Classes.Contains("IFCWINDOW")), "ThermalTransmittance → IFCWINDOW");
        Ok(fr.Unmapped.SequenceEqual(new[] { "AcousticRating" }), "an unmapped name is listed (never silently passed); blanks and duplicates dropped");
```
- [ ] **Step 2:** run → build error.
- [ ] **Step 3:** `PsetMap.cs` after `Find`:
```csharp
    /// PRE-E2: the contract's required property names ("FireRating" or "Pset_DoorCommon.FireRating") → the Revit reads
    /// Sentinel knows for them (one bare name can map to several classes), plus the names it has no mapping for —
    /// the caller reports those as not checked, never as passed.
    public static (IReadOnlyList<PsetEntry> Mapped, IReadOnlyList<string> Unmapped) ForRequired(string? org, IEnumerable<string> names)
    {
        var entries = Entries(org);
        var mapped = new List<PsetEntry>();
        var unmapped = new List<string>();
        foreach (var n in names.Select(x => (x ?? "").Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var hits = n.Contains('.')
                ? entries.Where(e => string.Equals(e.Key, n, StringComparison.OrdinalIgnoreCase)).ToList()
                : entries.Where(e => e.Pset.Length > 0 && string.Equals(e.Prop, n, StringComparison.OrdinalIgnoreCase)).ToList();
            if (hits.Count == 0) unmapped.Add(n); else mapped.AddRange(hits);
        }
        return (mapped, unmapped);
    }
```
`IfcPreFlightScanner`: signature `Scan(Document doc, DeliveryContract? contract, string contractLabel)`; delete `MandatoryPsetParams` and the office-code branch; before the loop:
```csharp
        var (mapped, unmapped) = contract is null
            ? ((IReadOnlyList<PsetEntry>)Array.Empty<PsetEntry>(), (IReadOnlyList<string>)Array.Empty<string>())
            : PsetMap.ForRequired(org, contract.RequiredProperties);
        if (contract is null)
            violations.Add(new Violation(RuleIdPset, EnforcementMode.Monitor, -1, "IFC pre-flight",
                "No delivery contract installed on this project or its office — required properties not checked.", null, null));
        foreach (var name in unmapped)
            violations.Add(new Violation(RuleIdPset, EnforcementMode.Monitor, -1, "IFC pre-flight",
                $"Required property '{name}' ({contractLabel}) has no Revit mapping in Sentinel — not checked here; the delivery gate checks it in the IFC.", null, bep));
```
and replace the per-element `foreach (var pName in psetParams)` block with:
```csharp
            if (mapped.Count > 0)
            {
                var cls = GovernedElementExtractor.IfcClassOf(e, doc);
                foreach (var entry in mapped)
                {
                    if (entry.Classes.Length > 0 && !entry.Classes.Any(c => cls.StartsWith(c, StringComparison.OrdinalIgnoreCase))) continue;
                    if (GovernedElementExtractor.ReadEntry(e, doc, entry) is null)
                        violations.Add(new Violation(RuleIdPset, EnforcementMode.Warn, e.Id.IdValue(), Describe(e),
                            $"Required property {entry.Pset}.{entry.Prop} is missing or empty — {contractLabel} requires it.", null, bep));
                }
            }
```
Report label: `new ScanReport(...) { ScoreLabel = "IFC mapping coverage" }` (Task 7 adds `ScoreLabel`).
`IfcPreFlightCommand`: load the contract as the gate does, pass it, and word the result honestly:
```csharp
        var key = Sentinel.Engine.ProjectContext.For(doc).Key;
        var (contract, source) = System.Threading.Tasks.Task.Run(() => Sentinel.Engine.DeliveryContract.Load(key)).GetAwaiter().GetResult();
        var label = <the contract@n · source label, built the way Commands.IfcGate.cs builds it>;
        var report = Sentinel.Engine.IfcPreFlightScanner.Scan(doc, contract, label);
```
The result dialog's "✓ Ready to export" becomes `✓ No IFC issues found against {label}` (and, with no contract, `… — required properties not checked (no contract)`).
- [ ] **Step 4:** fixplace-check + publish-check pass; build 2024.
- [ ] **Step 5: commit** `fix(revit): IFC-02 checks the contract's required properties by class, missing or empty; unmapped ones say not checked (PRE-E2)`

### Task 5: BLOCK stops the sync (founder decision)

**Files:** `App.cs`, `Updaters/SentinelUpdater.cs` (comment), `UI/SentinelPanelViewModel.cs` (BLOCK rows first)

- [ ] **Step 1:** `App.OnStartup`: `app.ControlledApplication.DocumentSynchronizingWithCentral += OnSynchronizing;` (and `-=` in `OnShutdown`). Handler:
```csharp
    // BLOCK (founder, 2026-09-30): a BLOCK rule stops the sync, not the edit. The document's full scan runs before
    // Revit syncs; any BLOCK violation cancels the sync and lists what to fix. Local work is untouched.
    private static void OnSynchronizing(object? sender, DocumentSynchronizingWithCentralEventArgs e)
    {
        var doc = e.Document;
        if (doc is null || doc.IsFamilyDocument || Engine is not { } engine || !engine.Has(doc)) return;
        var report = engine.ScanFull(doc);
        var blocks = report.Violations.Where(v => v.Mode == EnforcementMode.Block).ToList();
        if (blocks.Count == 0) return;
        var rules = string.Join(", ", blocks.Select(v => v.RuleId).Distinct());
        if (!e.Cancellable) { PanelVm?.LogDoctor($"{blocks.Count} BLOCK violation(s) ({rules}) — Revit did not allow Sentinel to stop this sync."); return; }
        e.Cancel();
        PanelVm?.PublishReport(doc, report);
        PanelVm?.LogDoctor($"Sync stopped: {blocks.Count} BLOCK violation(s) ({rules}).");
        var sample = string.Join("\n", blocks.Take(8).Select(v => "• " + v.RuleId + ": " + v.ElementName));
        TaskDialog.Show("Sentinel — Sync stopped",
            $"{blocks.Count} BLOCK violation(s) ({rules}) must be fixed before this model syncs.\n\n{sample}{(blocks.Count > 8 ? "\n…" : "")}\n\n" +
            "The Sentinel pane lists them first — fix them (⚡ Fix where offered) and sync again. Your work is safe: save locally.");
    }
```
- [ ] **Step 2:** `SentinelPanelViewModel.PublishReport`: add rows BLOCK first: `foreach (var v in report.Violations.OrderBy(v => v.Mode == EnforcementMode.Block ? 0 : 1))`. `SentinelUpdater` comment: `//  block   -> stops the sync (App.OnSynchronizing)`.
- [ ] **Step 3:** build 2024; commit `feat(revit): a BLOCK rule stops the sync and lists what to fix (founder decision)`

### Task 6: PASS says what it covers (GATE-E5)

- [ ] Find the gate's PASS line (`Commands.IfcGate.cs` / `Engine/GateLines.cs`, "certified for CDE upload") and make it read `contract PASS — IDS not checked here (Governed Publish judges ids@n)`; update any `tools/gate-check` expectation that pins the old words. Build; run gate-check; commit `fix(revit): the gate's PASS names what it covers — contract, not IDS (GATE-E5)`.

### Task 7: BCF export GUIDs and camera (CLM-4)

- [ ] `BcfExporter.GetIfcGuid` fallback: `return Sentinel.Coordination.BcfApplyEvent.ToIfcGuid(ExportUtils.GetExportId(doc, id));`. Camera: before writing the camera,
```csharp
            var toShared = doc.ActiveProjectLocation.GetTotalTransform();   // internal → shared, as CaptureIssue writes
            XYZ eye = toShared.OfPoint(orientation.EyePosition),
                fwd = toShared.OfVector(orientation.ForwardDirection).Normalize(),
                up = toShared.OfVector(orientation.UpDirection).Normalize();
```
Build; commit `fix(revit): BCF export writes IFC GUIDs and a shared-coordinate camera (CLM-4)`.

### Task 8: Named percentages and an honest Doctor header (SCORE-E1)

- [ ] `ScanReport` (`RuleModels.cs`): `public string ScoreLabel { get; set; } = "Rule pass rate";` (copied in `Plus`). Pane `ScoreText`: `$"{_scoreLabel} {Score:F1}%"` with `_scoreLabel = report.ScoreLabel` set in `PublishReport`.
- [ ] `HealthScorecard`: `ScoreCard.PassRate` (= `report.Score`); `Headline` → `$"Weighted rule score {Score:F1}% ({Grade}) · rule pass rate {PassRate:F1}% — {TotalViolations} open issue(s) across {Domains.Count} domain(s)"`; `Render` adds two formula lines: `Rule pass rate = elements without a scored issue ÷ elements checked (MONITOR not scored)` and `Weighted rule score = 100 × (1 − Σ weights ÷ (elements checked × 2)); weights BLOCK 8 · REQUEST 4 · WARN 2 · MONITOR 0.5`. Update `tools/artefact-cache-check` expectations.
- [ ] Doctor: `LogDoctor(string line, bool autoResolved = false)` counts `_autoResolved`; `DoctorHeader` → `$"Doctor — {_autoResolved} warning(s) auto-resolved or suppressed · {DoctorLog.Count} line(s)"`; `FailureInterceptor` passes `autoResolved: true` on its Resolved/Suppressed lines.
- [ ] Build; run artefact-cache-check; commit `fix(revit): every percentage says what it measures, with its formula; the Doctor counts only what it resolved (SCORE-E1)`.

### Task 9: Verify, review, merge

- [ ] Build 2024/2025/2026; run every check (CI list + docpin + artefact-cache).
- [ ] Adversarial review of the branch diff (three lenses: Revit API, behaviour regressions, honesty/coverage); fix confirmed findings.
- [ ] Spec as-built note; `graphify update .`; merge `--no-ff`; secret-scan; push.

### Task 10: Live drill B32 (Revit 2024, founder)

| # | Do | Pass when |
|---|---|---|
| 1 | A view parameter rule on a Yes/No parameter set to "No"; a number parameter set to 0 | Neither is flagged by Scan Now |
| 2 | IFC Pre-Flight on aster with its contract | IFC-02 rows name missing `Pset_…` properties by element; unmapped names show as "not checked"; no `{org}_View Status` rows |
| 3 | ⚡ Fix on an aster row under a `{org}` rule | "✓ Matches the naming schema", Execute enabled, rename lands |
| 4 | ⚡ Fix on a REQUEST-mode row | Status "✓ Proposed …"; the element is unchanged; Change Requests lists it; Approve renames it |
| 5 | A BLOCK rule with one violation; Synchronize with Central | "Sync stopped" dialog; no new central history entry; after ⚡ Fix the sync runs |
| 6 | Clash Manager → Export BCF → open the .bcfzip in the web Issues | The component selects the element; the camera matches the Revit view |
| 7 | Health Scorecard, pane, IFC Pre-Flight | Three distinct labels; the scorecard prints both formulas |
