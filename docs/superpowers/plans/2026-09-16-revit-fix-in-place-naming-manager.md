# Revit-side fix-in-place + naming manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Revit, fix a referee-raised BCF issue in place (parameter values, checked by the same referee before and after, issue resolved with evidence) and bulk-review/rename families and types against the office naming rules — with the office code as data, never a literal.

**Architecture:** Two independent halves on one branch. Half 1 reuses the BCF window → `RevitEventHub` (ExternalEvent) → `POST /cde/:key/propose` path: a Revit-free `FixPlan` builds/patches/folds payloads, a Revit-side `FixInPlaceService` resolves parameters and writes them in one transaction, and two new `BcfSyncManager` calls comment + resolve the topic. Half 2 adds a `type` rule target, a Revit-free `NamingProposer` (recovery only, never defaults, never suffixes) and a grid window that renames ticked rows through the same audited hub path `AutoFixExecution` uses. Both halves get a `tools/*-check` console project (the repo's Revit-free test convention) and CI steps.

**Tech Stack:** C# (`SentinelAddin`, `<Nullable>enable</Nullable>`, `LangVersion latest`, builds `-p:RevitVersion=2026` net8.0-windows and `2023` net48), WPF code-built windows, `System.Text.Json`, net8 console check projects under `tools/`, GitHub Actions.

Spec: `docs/superpowers/specs/2026-09-16-revit-fix-in-place-naming-manager-design.md`.

## Global Constraints

- Revit API writes run ONLY inside `App.Events.Enqueue(uiapp => …)` (the `RevitEventHub` ExternalEvent) and inside a `Transaction`; never from `Task.Run` or the WPF thread.
- Network calls run off the API thread (`Task.Run`), are short-capped, and every failure is a **state on screen** (`nothing checked` / `applied, NOT verified` / `evidence posted, status unchanged`), never a silent fallback.
- The office code lives in `Ruleset.Org` (JSON `"org"`); rules reference it as `{org}`. No C# file, message template or check asserts the literal `BDS` except as pilot **fixtures**; examples use `XXX`.
- No suffixing, defaulting of enum tokens, or substituting a value the user did not type. Collisions block. Missing parameters are *not fixable here* and say so.
- A `Pass` needs a referee response; `Resolved` needs every issue GUID resolved in this model AND passing.
- Dry-run and re-check proposals pass `raise_bcf: false` so a check never opens topics.
- Per-row outcomes are reported individually; a failed row never aborts the batch and is never summarised away.
- Build both target years locally before each commit: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2023`. Run the check projects with `dotnet run --project tools/<name>`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Branch: `feature/revit-fix-in-place`, created from `feature/project-collaboration` (`git checkout -b feature/revit-fix-in-place`).

## File map

| File | Responsibility | Task |
|---|---|---|
| `SentinelAddin/Engine/RuleModels.cs` (modify) | `RuleTarget.Type`; `Ruleset.Org` | 1 |
| `SentinelAddin/Engine/RuleRegex.cs` (new, Revit-free) | the one token→regex compiler; `{org}` substitution; `NeedsOrg` | 1 |
| `SentinelAddin/Engine/RuleEngineHost.cs` (modify) | uses `RuleRegex`; `{org}` in messages; unconfigured-org violation; `ScanTypes` | 1, 8 |
| `SentinelAddin/Resources/ruleset.json` (modify) | 1.5.0: `org`, `ORG` token in FN-01, TN-01, TN-02 | 1 |
| `tools/naming-check/` (new) | Revit-free checks for RuleRegex + NamingProposer + catalogue sweep | 1, 7 |
| `SentinelAddin/Engine/GovElement.cs` (new, Revit-free) | the ElementProperties DTOs, moved out of the extractor | 2 |
| `SentinelAddin/Engine/PsetMap.cs` (new, Revit-free) | requirement → candidate parameters, read AND write | 2 |
| `SentinelAddin/Engine/GovernedElementExtractor.cs` (modify) | iterates `PsetMap`; `ExtractByIds` | 2 |
| `tools/fixplace-check/` (new) | Revit-free checks for PsetMap, IdsIssueRef, FixPlan | 2, 3 |
| `SentinelAddin/Coordination/IdsIssueRef.cs` (new, Revit-free) | parse the referee's topic title | 3 |
| `SentinelAddin/Coordination/FixPlan.cs` (new, Revit-free) | `FixRow`, `Patch`, `Fold`, yes/no normalisation | 3 |
| `SentinelAddin/Coordination/GovernedNotify.cs` (modify) | `Propose` gains source/note/raiseBcf + per-element failures, audit id, receipt hash; `NamingRenamed` | 4, 8 |
| `SentinelAddin/Coordination/BcfSyncManager.cs` (modify) | `AddCommentAsync`, `SetStatusAsync` | 4 |
| `SentinelAddin/Engine/IdsSpecFile.cs` (new) | `%AppData%\Sentinel\ids.json` loader (from GovernedPublish) | 4 |
| `SentinelAddin/Coordination/BcfApplyEvent.cs` (modify) | `MapByIfcGuid` (GUID → ElementId) | 4 |
| `SentinelAddin/Coordination/FixInPlaceService.cs` (new) | Revit half: build plan, extract rows, apply | 5 |
| `SentinelAddin/UI/FixInPlaceWindow.cs` (new) | the review grid | 6 |
| `SentinelAddin/UI/BcfIssuesWindow.cs`, `SentinelAddin/Commands.BcfIssues.cs` (modify) | Fix button + the check/apply/re-check/close wiring | 6 |
| `SentinelAddin/Workflow/NameSynth.cs` (new, Revit-free) | `BuildCompliantName` & co. moved out of `AutoFixExecution`, org-aware | 7 |
| `SentinelAddin/Standards/NamingProposer.cs` (new, Revit-free) | recovery-only proposals, collisions block | 7 |
| `SentinelAddin/Workflow/NamingManagerService.cs` (new) | Revit half: rows with context, audited apply | 8 |
| `SentinelAddin/UI/SentinelPanelViewModel.cs` (modify) | no per-row Fix for type violations | 8 |
| `SentinelAddin/UI/NamingManagerWindow.cs`, `SentinelAddin/Commands.NamingManager.cs`, `SentinelAddin/App.cs` (new/modify) | the grid, the command, the ribbon button | 9 |
| `.github/workflows/ci.yml`, `SENTINEL-USER-GUIDE.md` (modify) | check steps in CI; two guide entries | 10 |

---

### Task 1: Ruleset foundation — `RuleTarget.Type`, `Ruleset.Org`, `RuleRegex`, ruleset 1.5.0

**Files:**
- Modify: `SentinelAddin/Engine/RuleModels.cs`
- Create: `SentinelAddin/Engine/RuleRegex.cs`
- Modify: `SentinelAddin/Engine/RuleEngineHost.cs` (the `CompiledPattern`, `ScanFull`, `Make` members)
- Modify: `SentinelAddin/Resources/ruleset.json`
- Create: `tools/naming-check/naming-check.csproj`, `tools/naming-check/Check.cs`

**Interfaces:**
- Produces: `enum RuleTarget { …, Type }`; `Ruleset.Org : string` (JSON `org`, default `""`);
  `RuleRegex.OrgPlaceholder = "{org}"`, `RuleRegex.DefWithOrg(string def, string? org)`, `RuleRegex.TextWithOrg(string text, string? org)`, `RuleRegex.NeedsOrg(Rule r)`, `RuleRegex.For(Rule r, string? org) : Regex`.
- Consumed by: Tasks 2, 7, 8 (`Ruleset.Org`, `RuleRegex.For`).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/revit-fix-in-place
```

- [ ] **Step 2: Write the failing check (RuleRegex)**

Create `tools/naming-check/naming-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <AssemblyName>naming-check</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\RuleModels.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\RuleRegex.cs" />
  </ItemGroup>
</Project>
```

Create `tools/naming-check/Check.cs`:

```csharp
using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    /// Walk up from the binary until the repo root (the folder that contains SentinelAddin/).
    static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !Directory.Exists(Path.Combine(dir.FullName, "SentinelAddin"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower) },
    };

    static Rule Tn01() => new()
    {
        Id = "TN-01", Target = RuleTarget.Type, Mode = EnforcementMode.Warn,
        Tokens = ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"], Separator = "_",
        TokenDefs = new()
        {
            ["ORG"] = "{org}", ["LOC"] = "EXT|INT|FND", ["DISC"] = "ARC|STR|LSE|INT|MEP|CIV",
            ["MATERIAL"] = @"[A-Z0-9][A-Z0-9 \-]*", ["SIZE"] = @"\d+(\.\d+)? mm",
        },
        MessageEn = "Type '{name}' does not match {org}_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm.",
    };

    static int Main()
    {
        Console.WriteLine("RuleRegex — the one compiler, org as data\n");
        var tn = Tn01();
        Ok(RuleRegex.For(tn, "XXX").IsMatch("XXX_EXT_ARC_CMU_200 mm"), "org XXX matches an XXX name");
        Ok(!RuleRegex.For(tn, "XXX").IsMatch("BDS_EXT_ARC_CMU_200 mm"), "org XXX does not match a BDS name");
        Ok(RuleRegex.For(tn, "BDS").IsMatch("BDS_EXT_ARC_CMU_200 mm"), "org BDS matches the pilot's name");
        Ok(RuleRegex.For(tn, "A+B").IsMatch("A+B_INT_STR_CONC_300 mm"), "org with regex metachars is escaped");
        Ok(!RuleRegex.For(tn, "").IsMatch("XXX_EXT_ARC_CMU_200 mm") && !RuleRegex.For(tn, "").IsMatch("_EXT_ARC_CMU_200 mm"),
           "empty org matches nothing real (fails closed)");
        Ok(RuleRegex.NeedsOrg(tn), "TN-01 needs an org");
        Ok(!RuleRegex.NeedsOrg(new Rule { Tokens = ["LEVEL"], TokenDefs = new() { ["LEVEL"] = @"L\d{2}" }, MessageEn = "x" }), "a rule without {org} does not");
        Ok(RuleRegex.TextWithOrg("Type '{name}' does not match {org}_[LOC]", "XXX") == "Type '{name}' does not match XXX_[LOC]", "message substitution keeps {name}");
        Ok(RuleRegex.TextWithOrg("{org}_x", "") == "{org}_x", "empty org leaves the placeholder visible in text");

        Console.WriteLine("\nShipped ruleset.json — 1.5.0 shape");
        var rs = JsonSerializer.Deserialize<Ruleset>(File.ReadAllText(Path.Combine(RepoRoot(), "SentinelAddin", "Resources", "ruleset.json")), JsonOpts)!;
        Ok(rs.Semver == "1.5.0", "semver 1.5.0");
        Ok(rs.Org == "BDS", "pilot copy carries org = BDS as DATA");
        var fn = rs.Rules.First(r => r.Id == "FN-01");
        Ok(fn.Tokens[0] == "ORG" && fn.TokenDefs["ORG"] == "{org}", "FN-01 token renamed ORG with {org} def");
        Ok(RuleRegex.For(fn, rs.Org).IsMatch("BDS_EXT_Door_Single"), "FN-01 still matches the pilot's family names");
        var t1 = rs.Rules.First(r => r.Id == "TN-01"); var t2 = rs.Rules.First(r => r.Id == "TN-02");
        Ok(t1.Target == RuleTarget.Type && t2.Target == RuleTarget.Type, "TN-01/TN-02 are type rules");
        Ok(RuleRegex.For(t1, rs.Org).IsMatch("BDS_FND_STR_CONC-RAFT_2500 mm"), "TN-01 accepts a hyphenated material");
        Ok(RuleRegex.For(t2, rs.Org).IsMatch("BDS_EXT_1 PNL_WOOD_1000 x 2100 mm"), "TN-02 accepts the pilot's door shape");
        Ok(rs.Rules.All(r => !r.MessageEn.Contains("BDS_")), "no message hardcodes the office prefix");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `dotnet run --project tools/naming-check`
Expected: build error — `RuleRegex` does not exist, `RuleTarget.Type` does not exist, `Ruleset.Org` does not exist.

- [ ] **Step 4: Add `Type` and `Org` to the models**

In `SentinelAddin/Engine/RuleModels.cs` change the enum line to:

```csharp
public enum RuleTarget { View, Sheet, Workset, Family, Level, Grid, Parameter, Type }
```

and inside `public sealed class Ruleset`, after the `Semver` property, add:

```csharp
    /// The office code (e.g. "XXX"). The ONE place an office name lives: rules reference it as `{org}` in
    /// token defs and messages (see RuleRegex). Empty ⇒ rules that need it report themselves unconfigured
    /// instead of matching anything.
    [JsonPropertyName("org")] public string Org { get; set; } = string.Empty;
```

- [ ] **Step 5: Create `RuleRegex`**

Create `SentinelAddin/Engine/RuleRegex.cs`:

```csharp
using System.Linq;
using System.Text.RegularExpressions;

namespace Sentinel.Engine;

/// <summary>
/// The one token→regex compiler (moved out of RuleEngineHost so the Revit-free proposer validates with the
/// EXACT pattern the scanner enforces). Substitutes the office code for `{org}` first: escaped inside a
/// token def (it becomes regex), verbatim inside a message. An empty org leaves `{org}` in place — inside a
/// regex that literal matches no real name, so an unconfigured rule fails closed rather than open.
/// </summary>
public static class RuleRegex
{
    public const string OrgPlaceholder = "{org}";

    public static string DefWithOrg(string def, string? org) =>
        string.IsNullOrWhiteSpace(org) ? def : def.Replace(OrgPlaceholder, Regex.Escape(org.Trim()));

    public static string TextWithOrg(string text, string? org) =>
        string.IsNullOrWhiteSpace(org) ? text : text.Replace(OrgPlaceholder, org.Trim());

    /// Does this rule reference the office code anywhere?
    public static bool NeedsOrg(Rule r) =>
        r.TokenDefs.Values.Any(d => d.Contains(OrgPlaceholder))
        || r.MessageEn.Contains(OrgPlaceholder)
        || (r.MessageAr?.Contains(OrgPlaceholder) ?? false);

    /// Anchored pattern: each token resolves through token_defs (unknown tokens match a safe default),
    /// joined by the escaped separator. Callers cache; this compiles a fresh Regex every call.
    public static Regex For(Rule r, string? org)
    {
        var parts = r.Tokens.Select(t =>
            r.TokenDefs.TryGetValue(t, out var def) ? "(?:" + DefWithOrg(def, org) + ")" : @"[A-Za-z0-9\-]+");
        return new Regex("^" + string.Join(Regex.Escape(r.Separator), parts) + "$",
                         RegexOptions.CultureInvariant);
    }
}
```

- [ ] **Step 6: Route `RuleEngineHost` through it and report an unconfigured org**

In `SentinelAddin/Engine/RuleEngineHost.cs` replace the whole `CompiledPattern` method with:

```csharp
    private Regex CompiledPattern(Rule r)
    {
        if (_compiled.TryGetValue(r.Id, out var rx)) return rx;
        return _compiled[r.Id] = RuleRegex.For(r, Ruleset.Org);
    }
```

In `ScanFull`, replace the `foreach (var rule in Ruleset.Rules)` loop header + first line so the loop begins:

```csharp
        foreach (var rule in Ruleset.Rules)
        {
            // A rule that references the office code cannot be evaluated without one — say so once, per
            // rule, instead of scanning with a pattern that matches nothing (which would read as "all clean").
            if (RuleRegex.NeedsOrg(rule) && string.IsNullOrWhiteSpace(Ruleset.Org))
            {
                violations.Add(Make(rule, -1, "(ruleset.org is empty — rule not evaluated)"));
                continue;
            }
            switch (rule.Target)
```

Replace the `Make` method with:

```csharp
    private Violation Make(Rule r, long id, string name) =>
        new(r.Id, r.Mode, id, name,
            RuleRegex.TextWithOrg(r.MessageEn.Replace("{name}", name), Ruleset.Org),
            r.MessageAr is null ? null : RuleRegex.TextWithOrg(r.MessageAr.Replace("{name}", name), Ruleset.Org),
            r.DocRef);
```

(`Make` was `static`; it now reads `Ruleset.Org`, so drop the `static` keyword.)

- [ ] **Step 7: Bump the shipped ruleset to 1.5.0**

In `SentinelAddin/Resources/ruleset.json`:
- change `"semver": "1.4.1"` to `"semver": "1.5.0"` and add `"org": "BDS",` on the next line (the pilot's copy — data);
- in `FN-01` replace `"tokens": ["BDS", "BODY"]` with `"tokens": ["ORG", "BODY"]`, the token def line `"BDS": "BDS",` with `"ORG": "{org}",`, `"message_en"` with `"Family '{name}' does not match {org}_[LOCATION]_[TYPE]_[VARIANT]."` and `"message_ar"` with `"العائلة '{name}' لا تطابق نمط تسمية {org}."`;
- after the `FN-01` object (before `LV-01`) insert:

```json
    {
      "id": "TN-01",
      "target": "type",
      "mode": "warn",
      "tokens": ["ORG", "LOC", "DISC", "MATERIAL", "SIZE"],
      "token_defs": {
        "ORG": "{org}",
        "LOC": "EXT|INT|FND",
        "DISC": "ARC|STR|LSE|INT|MEP|CIV",
        "MATERIAL": "[A-Z0-9][A-Z0-9 \\-]*",
        "SIZE": "\\d+(\\.\\d+)? mm"
      },
      "separator": "_",
      "categories": ["Walls", "Floors", "Ceilings", "Roofs"],
      "message_en": "Type '{name}' does not match {org}_[LOC]_[DISC]_[MATERIAL]_[SIZE] mm.",
      "doc_ref": "office type convention (pilot: BDS_TEMPLATE_TYPE_AUDIT §1) — not in RTG-001"
    },
    {
      "id": "TN-02",
      "target": "type",
      "mode": "warn",
      "tokens": ["ORG", "LOC", "LEAF", "MATERIAL", "SIZE"],
      "token_defs": {
        "ORG": "{org}",
        "LOC": "EXT|INT",
        "LEAF": "\\d+ PNL|[A-Z0-9][A-Z0-9 \\-]*",
        "MATERIAL": "[A-Z0-9][A-Z0-9 \\-]*",
        "SIZE": "\\d+ x \\d+ mm"
      },
      "separator": "_",
      "categories": ["Doors", "Windows"],
      "message_en": "Type '{name}' does not match {org}_[LOC]_[LEAF]_[MATERIAL]_[W x H] mm.",
      "doc_ref": "INFERRED from the pilot template (BDS_TEMPLATE_TYPE_AUDIT §3) — confirm before enforcing"
    },
```

- [ ] **Step 8: Run the check and build both years**

Run: `dotnet run --project tools/naming-check`
Expected: `17/17 checks pass`, exit 0.
Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2023` — both `Build succeeded`.

- [ ] **Step 9: Commit**

```bash
git add SentinelAddin/Engine/RuleModels.cs SentinelAddin/Engine/RuleRegex.cs SentinelAddin/Engine/RuleEngineHost.cs SentinelAddin/Resources/ruleset.json tools/naming-check
git commit -m "feat(rules): office code as data — Ruleset.org + {org} substitution, RuleTarget.Type, TN-01/TN-02 (1.5.0)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: `GovElement` DTOs + `PsetMap` (read and write from one table) + `ExtractByIds`

**Files:**
- Create: `SentinelAddin/Engine/GovElement.cs`
- Create: `SentinelAddin/Engine/PsetMap.cs`
- Modify: `SentinelAddin/Engine/GovernedElementExtractor.cs` (whole file replaced below)
- Modify: `SentinelAddin/Commands.GovernedPublish.cs:76` (one call site)
- Create: `tools/fixplace-check/fixplace-check.csproj`, `tools/fixplace-check/Check.cs`

**Interfaces:**
- Consumes: `Ruleset.Org` (Task 1) via `App.Engine?.Ruleset.Org`.
- Produces: `GovRow{name,value}`, `GovGroup{name,rows}`, `GovIdentity{GlobalId,Name,Class,Tag}`, `GovElement{modelId,localId,identity,psets,quantities}`;
  `enum ParamKind { Lookup, BuiltIn, WallFunction, ElementName }`, `enum ValueKind { Text, YesNo, Number }`, `ParamCandidate(Kind, Name)`, `PsetEntry{Pset,Prop,Key,Classes,Candidates,ValueKind}`, `PsetMap.Entries(string? org)`, `PsetMap.Find(string? org, string requirementKey)`;
  `GovernedElementExtractor.Extract(Document, string modelId, string? org = null)`, `ExtractByIds(Document, string modelId, IEnumerable<ElementId>, string? org = null)`, `IfcClassOf(Element, Document)` (now `internal`).

- [ ] **Step 1: Write the failing check (PsetMap)**

Create `tools/fixplace-check/fixplace-check.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <AssemblyName>fixplace-check</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\..\SentinelAddin\Engine\GovElement.cs" />
    <Compile Include="..\..\SentinelAddin\Engine\PsetMap.cs" />
  </ItemGroup>
</Project>
```

Create `tools/fixplace-check/Check.cs`:

```csharp
using System;
using System.Linq;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }

    static int Main()
    {
        Console.WriteLine("PsetMap — one table, office code as data\n");
        var xxx = PsetMap.Entries("XXX");
        var disc = xxx.FirstOrDefault(e => e.Key == "Pset_XXX.Discipline");
        Ok(disc != null && disc.Candidates.Select(c => c.Name).SequenceEqual(new[] { "XXX_Discipline", "Discipline" }),
           "org XXX yields Pset_XXX.Discipline ← XXX_Discipline, Discipline");
        Ok(!PsetMap.Entries("").Any(e => e.Pset.StartsWith("Pset_") && e.Prop == "Discipline"), "empty org yields no office pset entry");
        Ok(PsetMap.Entries("").Count == PsetMap.Entries("XXX").Count - 1, "empty org drops exactly the office entry");
        Ok(PsetMap.Find("XXX", "pset_wallcommon.firerating")?.Candidates.Any(c => c.Kind == ParamKind.BuiltIn && c.Name == "FIRE_RATING") == true,
           "Find is case-insensitive and FireRating falls back to the built-in");
        Ok(PsetMap.Find("XXX", "@Name")?.Candidates.Single().Kind == ParamKind.ElementName, "@Name maps to the element name");
        Ok(PsetMap.Find("XXX", "Pset_WallCommon.IsExternal")?.ValueKind == ValueKind.YesNo, "IsExternal is a yes/no value");
        Ok(PsetMap.Find("XXX", "Pset_WallCommon.IsExternal")?.Candidates.Last().Kind == ParamKind.WallFunction, "IsExternal falls back to the wall Function");
        foreach (var key in new[] { "Pset_WallCommon.IsExternal", "Pset_WallCommon.FireRating", "Pset_DoorCommon.FireRating", "Pset_WindowCommon.ThermalTransmittance" })
            Ok(PsetMap.Find("XXX", key) != null, "extractor requirement present: " + key);
        Ok(PsetMap.Find("XXX", "Pset_WindowCommon.ThermalTransmittance")!.Candidates.Any(c => c.Name == "XXX_UValue"), "office U-value alias derives from org");
        Ok(PsetMap.Find("XXX", "Pset_Nope.Thing") == null, "unknown requirement → null (caller says 'no mapping')");

        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `dotnet run --project tools/fixplace-check`
Expected: build error — `GovElement.cs` / `PsetMap.cs` missing.

- [ ] **Step 3: Create the DTO file**

Create `SentinelAddin/Engine/GovElement.cs`:

```csharp
using System.Collections.Generic;

namespace Sentinel.Engine;

// The IDS-ready ElementProperties shape the referee core expects — {identity:{Class,GlobalId,Name,Tag},
// psets:[{name,rows:[{name,value}]}], quantities:[]}. Revit-free, so the fix-in-place planner and its check
// tool can build and patch payloads without the API. NOTE: these MUST be properties (get/set), not fields —
// System.Text.Json serializes properties only; fields would emit empty {} groups and the referee would see
// no pset data at all.
public sealed class GovRow { public string name { get; set; } = ""; public string value { get; set; } = ""; }
public sealed class GovGroup { public string name { get; set; } = ""; public List<GovRow> rows { get; set; } = new(); }

public sealed class GovIdentity
{
    public string? GlobalId { get; set; }
    public string? Name { get; set; }
    public string? Class { get; set; }
    public string? Tag { get; set; }
}

/// <summary>One element, serialized straight into the propose payload's <c>elements[]</c>.</summary>
public sealed class GovElement
{
    public string modelId { get; set; } = "";
    public long localId { get; set; }
    public GovIdentity identity { get; set; } = new();
    public List<GovGroup> psets { get; set; } = new();
    public List<GovGroup> quantities { get; set; } = new();
}
```

- [ ] **Step 4: Create `PsetMap`**

Create `SentinelAddin/Engine/PsetMap.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sentinel.Engine;

public enum ParamKind { Lookup, BuiltIn, WallFunction, ElementName }
public enum ValueKind { Text, YesNo, Number }

public sealed class ParamCandidate
{
    public ParamKind Kind;
    public string Name;   // Lookup: the parameter name · BuiltIn: the BuiltInParameter enum name · else ""
    public ParamCandidate(ParamKind kind, string name = "") { Kind = kind; Name = name; }
}

public sealed class PsetEntry
{
    public string Pset = "";                       // "" ⇒ an attribute (@Prop)
    public string Prop = "";
    public string Key => Pset.Length == 0 ? "@" + Prop : Pset + "." + Prop;
    public string[] Classes = Array.Empty<string>(); // IFC classes this is read/written for; empty = all
    public List<ParamCandidate> Candidates = new();
    public ValueKind ValueKind = ValueKind.Text;
}

/// <summary>
/// ONE table for READ (GovernedElementExtractor) and WRITE (FixInPlaceService): a value is written exactly
/// where the referee reads it. The office-specific rows derive from <paramref name="org"/> (Ruleset.Org);
/// an empty org DROPS them rather than guessing a prefix. Revit-free — the Revit half resolves candidates
/// against real parameters.
/// </summary>
public static class PsetMap
{
    public static IReadOnlyList<PsetEntry> Entries(string? org)
    {
        var o = (org ?? "").Trim();
        var list = new List<PsetEntry>();
        if (o.Length > 0)
            list.Add(new PsetEntry
            {
                Pset = "Pset_" + o, Prop = "Discipline",
                Candidates = { new(ParamKind.Lookup, o + "_Discipline"), new(ParamKind.Lookup, "Discipline") },
            });
        list.Add(new PsetEntry
        {
            Pset = "Pset_WallCommon", Prop = "IsExternal", Classes = new[] { "IFCWALL" }, ValueKind = ValueKind.YesNo,
            Candidates = { new(ParamKind.Lookup, "IsExternal"), new(ParamKind.WallFunction) },
        });
        list.Add(new PsetEntry
        {
            Pset = "Pset_WallCommon", Prop = "FireRating", Classes = new[] { "IFCWALL" },
            Candidates = { new(ParamKind.Lookup, "FireRating"), new(ParamKind.BuiltIn, "FIRE_RATING") },
        });
        list.Add(new PsetEntry
        {
            Pset = "Pset_DoorCommon", Prop = "FireRating", Classes = new[] { "IFCDOOR" },
            Candidates = { new(ParamKind.Lookup, "FireRating"), new(ParamKind.BuiltIn, "FIRE_RATING") },
        });
        var u = new PsetEntry
        {
            Pset = "Pset_WindowCommon", Prop = "ThermalTransmittance", Classes = new[] { "IFCWINDOW" }, ValueKind = ValueKind.Number,
            Candidates =
            {
                new(ParamKind.Lookup, "ThermalTransmittance"), new(ParamKind.Lookup, "U-Value"),
                new(ParamKind.Lookup, "Heat Transfer Coefficient (U)"),
            },
        };
        if (o.Length > 0) u.Candidates.Add(new(ParamKind.Lookup, o + "_UValue"));
        list.Add(u);
        list.Add(new PsetEntry { Prop = "Name", Candidates = { new(ParamKind.ElementName) } });
        return list;
    }

    public static PsetEntry? Find(string? org, string requirementKey) =>
        Entries(org).FirstOrDefault(e => string.Equals(e.Key, (requirementKey ?? "").Trim(), StringComparison.OrdinalIgnoreCase));
}
```

- [ ] **Step 5: Run the check — it should pass now**

Run: `dotnet run --project tools/fixplace-check`
Expected: `13/13 checks pass`.

- [ ] **Step 6: Replace the extractor so it reads through the map**

Replace the whole of `SentinelAddin/Engine/GovernedElementExtractor.cs` with:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace Sentinel.Engine;

/// <summary>
/// Read a model's exportable elements into the IDS-ready <see cref="GovElement"/> shape the referee core
/// expects. This is the Revit side of the "propose" contract — the extracted elements are POSTed to
/// <c>/cde/:key/propose</c> and adjudicated against an IDS server-side by the SAME pure core the web app uses.
///
/// Read-only (no transaction) — safe to call on the API thread. The property mapping lives in
/// <see cref="PsetMap"/> — ONE table shared with the fix-in-place writer, so a value is written exactly where
/// it is read. The office code comes from the effective ruleset (<c>Ruleset.Org</c>) unless a caller passes
/// one. Extraction never throws; a category the model doesn't use simply yields no rows.
/// </summary>
public static class GovernedElementExtractor
{
    // Revit category → canonical IFC class (the subset that materially matters in a coordination deliverable).
    // Mirrors the exporter's default mapping; an explicit "IfcExportAs" on the element/type overrides it.
    private static readonly (BuiltInCategory cat, string ifc)[] CategoryToIfc =
    {
        (BuiltInCategory.OST_Walls, "IFCWALL"),
        (BuiltInCategory.OST_Floors, "IFCSLAB"),
        (BuiltInCategory.OST_Roofs, "IFCROOF"),
        (BuiltInCategory.OST_Ceilings, "IFCCOVERING"),
        (BuiltInCategory.OST_Doors, "IFCDOOR"),
        (BuiltInCategory.OST_Windows, "IFCWINDOW"),
        (BuiltInCategory.OST_Stairs, "IFCSTAIR"),
        (BuiltInCategory.OST_StructuralColumns, "IFCCOLUMN"),
        (BuiltInCategory.OST_Columns, "IFCCOLUMN"),
        (BuiltInCategory.OST_StructuralFraming, "IFCBEAM"),
        (BuiltInCategory.OST_StructuralFoundation, "IFCFOOTING"),
    };

    private static readonly BuiltInCategory[] ExportCategories = CategoryToIfc.Select(x => x.cat).ToArray();

    private static string OrgOrConfigured(string? org) => org ?? App.Engine?.Ruleset.Org ?? "";

    /// <summary>Extract every exportable element. Read-only.</summary>
    public static List<GovElement> Extract(Document doc, string modelId, string? org = null)
    {
        var o = OrgOrConfigured(org);
        var elements = new FilteredElementCollector(doc)
            .WherePasses(new ElementMulticategoryFilter(ExportCategories))
            .WhereElementIsNotElementType()
            .ToElements();
        return elements.Select(e => ToGovElement(e, doc, modelId, o)).ToList();
    }

    /// <summary>Extract exactly these elements (the fix-in-place check / re-check). Ids that no longer
    /// resolve are skipped — the caller compares what came back against what it asked for.</summary>
    public static List<GovElement> ExtractByIds(Document doc, string modelId, IEnumerable<ElementId> ids, string? org = null)
    {
        var o = OrgOrConfigured(org);
        var result = new List<GovElement>();
        foreach (var id in ids)
            if (doc.GetElement(id) is { } e) result.Add(ToGovElement(e, doc, modelId, o));
        return result;
    }

    private static GovElement ToGovElement(Element e, Document doc, string modelId, string org)
    {
        var cls = IfcClassOf(e, doc);
        var el = new GovElement
        {
            modelId = modelId,
            localId = e.Id.IdValue(),
            identity = new GovIdentity
            {
                GlobalId = GlobalIdOf(e),
                Name = string.IsNullOrWhiteSpace(e.Name) ? null : e.Name,
                Class = cls,
                Tag = e.Id.IdValue().ToString(),
            },
        };
        AddCanonicalPsets(e, doc, cls, el, org);
        return el;
    }

    // Explicit IfcExportAs (instance, then type) wins; else the category default; else a generic proxy.
    internal static string IfcClassOf(Element e, Document doc)
    {
        var explicitAs = FirstNonEmpty(e, "IfcExportAs")
            ?? (doc.GetElement(e.GetTypeId()) is { } et ? FirstNonEmpty(et, "IfcExportAs") : null);
        if (!string.IsNullOrWhiteSpace(explicitAs))
            return explicitAs!.Trim().ToUpperInvariant();

        long catId = e.Category?.Id.IdValue() ?? 0;
        foreach (var (cat, ifc) in CategoryToIfc)
            if ((long)(int)cat == catId) return ifc;
        return "IFCBUILDINGELEMENTPROXY";
    }

    // The IFC GlobalId Revit writes at export (BuiltInParameter.IFC_GUID) when present, else the stable
    // UniqueId — the IDS checks GlobalId presence/uniqueness, both satisfy it.
    private static string GlobalIdOf(Element e)
    {
        var g = e.get_Parameter(BuiltInParameter.IFC_GUID);
        if (g is { HasValue: true } && g.AsString() is { Length: > 0 } s) return s;
        return e.UniqueId;
    }

    // Walk the shared table: every pset entry whose IFC class applies, first candidate with a value wins.
    private static void AddCanonicalPsets(Element e, Document doc, string cls, GovElement el, string org)
    {
        foreach (var entry in PsetMap.Entries(org))
        {
            if (entry.Pset.Length == 0) continue;                                  // attributes live in identity
            if (entry.Classes.Length > 0 && Array.IndexOf(entry.Classes, cls) < 0) continue;
            var value = ReadEntry(e, doc, entry);
            if (value == null) continue;
            var group = el.psets.Find(g => g.name == entry.Pset);
            if (group == null) { group = new GovGroup { name = entry.Pset }; el.psets.Add(group); }
            group.rows.Add(new GovRow { name = entry.Prop, value = value });
        }
    }

    /// <summary>Lookups first — instance pass, then type pass, the order the inline reads always used —
    /// then the built-in / wall-function candidates in table order. Null when nothing is authored (⇒ the
    /// IDS reports it missing). Used by the fix-in-place writer to show the current value too.</summary>
    internal static string? ReadEntry(Element e, Document doc, PsetEntry entry)
    {
        var lookups = entry.Candidates.Where(c => c.Kind == ParamKind.Lookup).Select(c => c.Name).ToArray();
        if (lookups.Length > 0)
        {
            var v = entry.ValueKind == ValueKind.YesNo ? ReadYesNoInstOrType(e, doc, lookups) : ReadInstOrType(e, doc, lookups);
            if (v != null) return v;
        }
        foreach (var c in entry.Candidates)
        {
            if (c.Kind == ParamKind.BuiltIn && Enum.TryParse<BuiltInParameter>(c.Name, out var bip))
            {
                var b = ReadBip(e, bip);
                if (b != null) return b;
            }
            else if (c.Kind == ParamKind.WallFunction)
            {
                var w = ReadWallFunction(e, doc);
                if (w != null) return w;
            }
        }
        return null;
    }

    // First non-empty value among the named parameters — instance first, then the element's type.
    private static string? ReadInstOrType(Element e, Document doc, params string[] names)
    {
        foreach (var n in names) { var v = ReadString(e, n); if (v != null) return v; }
        if (doc.GetElement(e.GetTypeId()) is { } type)
            foreach (var n in names) { var v = ReadString(type, n); if (v != null) return v; }
        return null;
    }

    // A yes/no parameter as IFC expects it ("TRUE"/"FALSE"): instance first, then type.
    private static string? ReadYesNoInstOrType(Element e, Document doc, params string[] names)
    {
        foreach (var n in names) { var v = ReadYesNo(e, n); if (v != null) return v; }
        if (doc.GetElement(e.GetTypeId()) is { } type)
            foreach (var n in names) { var v = ReadYesNo(type, n); if (v != null) return v; }
        return null;
    }

    private static string? ReadYesNo(Element e, string name)
    {
        var p = e.LookupParameter(name);
        if (p is { HasValue: true } && p.StorageType == StorageType.Integer) return p.AsInteger() == 1 ? "TRUE" : "FALSE";
        return null;
    }

    // Infer IsExternal from the wall type's Function (Exterior ⇒ external). Null when not a wall / not set.
    private static string? ReadWallFunction(Element e, Document doc)
    {
        if (doc.GetElement(e.GetTypeId()) is not { } type) return null;
        var fn = type.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
        if (fn is { HasValue: true } && fn.StorageType == StorageType.Integer)
            return fn.AsInteger() == (int)WallFunction.Exterior ? "TRUE" : "FALSE";
        return null;
    }

    private static string? ReadString(Element e, string name)
    {
        var p = e.LookupParameter(name);
        if (p is { HasValue: true })
        {
            var v = p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
            if (!string.IsNullOrWhiteSpace(v)) return v;
        }
        return null;
    }

    private static string? ReadBip(Element e, BuiltInParameter bip)
    {
        var p = e.get_Parameter(bip);
        if (p is { HasValue: true })
        {
            var v = p.StorageType == StorageType.String ? p.AsString() : p.AsValueString();
            if (!string.IsNullOrWhiteSpace(v)) return v;
        }
        return null;
    }

    private static string? FirstNonEmpty(Element e, string name)
    {
        var p = e.LookupParameter(name);
        return p is { HasValue: true } && !string.IsNullOrWhiteSpace(p.AsString()) ? p.AsString() : null;
    }
}
```

Behaviour note for the reviewer: output is identical to the inline reads for the pilot (`org = "BDS"`) with one deliberate widening — `IsExternal` as an explicit yes/no parameter is now also read from the **type** (the inline read checked the instance only) before falling back to the wall Function.

- [ ] **Step 7: Keep the one caller compiling**

`SentinelAddin/Commands.GovernedPublish.cs:76` stays `Sentinel.Engine.GovernedElementExtractor.Extract(doc, projectKey);` — the new optional `org` defaults to the configured ruleset. No edit needed; confirm with the build.

- [ ] **Step 8: Build both years and re-run the check**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` then `-p:RevitVersion=2023` — both `Build succeeded`.
Run: `dotnet run --project tools/fixplace-check` — `13/13 checks pass`.

- [ ] **Step 9: Commit**

```bash
git add SentinelAddin/Engine/GovElement.cs SentinelAddin/Engine/PsetMap.cs SentinelAddin/Engine/GovernedElementExtractor.cs tools/fixplace-check
git commit -m "refactor(extractor): PsetMap — one read/write table with the office code as data; ExtractByIds" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: `IdsIssueRef` + `FixPlan` (Revit-free: parse, patch, fold)

**Files:**
- Create: `SentinelAddin/Coordination/IdsIssueRef.cs`
- Create: `SentinelAddin/Coordination/FixPlan.cs`
- Modify: `tools/fixplace-check/fixplace-check.csproj`, `tools/fixplace-check/Check.cs`

**Interfaces:**
- Consumes: `GovElement`, `GovGroup`, `GovRow`, `GovIdentity`, `ValueKind` (Task 2).
- Produces: `IdsIssueRef{Spec, Requirement, Failing, IsAttribute, Pset, Prop}`, `IdsIssueRef.TryParse(string?)`, `IdsIssueRef.TitleOf(spec, requirement, failing)`;
  `enum FixVerdict { Unchecked, Pass, Fail, NotFixable }`; `FixRow{Key, IsType, TargetId, InstanceIds, IssueGuids, OtherInstanceCount, Label, ParamName, ResolvedVia, ValueKind, Current, Proposed, Writable, NotFixableReason, Verdict, Reason, Ticked, ScopeText}`;
  `ElementFailure{Element, Requirement, Reason}`; `FoldResult{AllPass, Pass, Fail, Unresolved, OtherOpen}`;
  `FixPlan.NormalizeYesNo(string?)`, `FixPlan.Patch(GovElement, IdsIssueRef, string proposed, string issueGuid)`, `FixPlan.Fold(IReadOnlyList<ElementFailure>, IReadOnlyList<FixRow> allRows, ISet<string> sentKeys, IReadOnlyList<string> issueGuids, string requirement)`.

- [ ] **Step 1: Add the failing checks**

In `tools/fixplace-check/fixplace-check.csproj` add two includes inside the `<ItemGroup>`:

```xml
    <Compile Include="..\..\SentinelAddin\Coordination\IdsIssueRef.cs" />
    <Compile Include="..\..\SentinelAddin\Coordination\FixPlan.cs" />
```

In `tools/fixplace-check/Check.cs` add `using System.Collections.Generic;` and `using Sentinel.Coordination;` at the top, and insert before the final `Console.WriteLine($"\n{_pass}/…` line:

```csharp
        Console.WriteLine("\nIdsIssueRef — the bridge title, inverted");
        var t = IdsIssueRef.TryParse(IdsIssueRef.TitleOf("Walls carry fire rating", "Pset_WallCommon.FireRating", 12));
        Ok(t != null && t.Spec == "Walls carry fire rating" && t.Pset == "Pset_WallCommon" && t.Prop == "FireRating" && t.Failing == 12 && !t.IsAttribute,
           "round-trips a property requirement");
        var a = IdsIssueRef.TryParse("IDS: All elements have a name — @Name (3 failing)");
        Ok(a != null && a.IsAttribute && a.Prop == "Name" && a.Pset == "", "parses an attribute requirement");
        var d = IdsIssueRef.TryParse("IDS: Fire — safety walls — Pset_WallCommon.FireRating (1 failing)");
        Ok(d != null && d.Spec == "Fire — safety walls" && d.Requirement == "Pset_WallCommon.FireRating", "an em-dash inside the spec name does not confuse the split");
        Ok(IdsIssueRef.TryParse("Clash: wall vs duct") == null && IdsIssueRef.TryParse("IDS: x — nodot (1 failing)") == null && IdsIssueRef.TryParse(null) == null,
           "hand-raised, malformed and null titles → null");

        Console.WriteLine("\nFixPlan.Patch");
        var req = t!;
        var el = new GovElement
        {
            modelId = "p", localId = 5, identity = new GovIdentity { GlobalId = "uid-5", Class = "IFCWALL", Name = "W" },
            psets = { new GovGroup { name = "Pset_WallCommon", rows = { new GovRow { name = "IsExternal", value = "TRUE" } } } },
        };
        var p1 = FixPlan.Patch(el, req, "REI60", "guid-A");
        Ok(p1.identity.GlobalId == "guid-A" && el.identity.GlobalId == "uid-5", "GlobalId becomes the issue GUID; the source is untouched");
        Ok(p1.psets.Single().rows.Count == 2
           && p1.psets.Single().rows.Any(r => r.name == "FireRating" && r.value == "REI60")
           && p1.psets.Single().rows.Any(r => r.name == "IsExternal" && r.value == "TRUE"), "adds the missing row, keeps the others");
        var p2 = FixPlan.Patch(p1, req, "REI120", "guid-A");
        Ok(p2.psets.Single().rows.Count == 2 && p2.psets.Single().rows.Single(r => r.name == "FireRating").value == "REI120", "replaces an existing row in place");
        var p3 = FixPlan.Patch(el, a!, "Wall-01", "guid-B");
        Ok(p3.identity.Name == "Wall-01" && p3.psets.Single().rows.Count == 1, "@Name patches identity, not psets");
        var p4 = FixPlan.Patch(new GovElement(), new IdsIssueRef { Spec = "s", Requirement = "Pset_SlabCommon.LoadBearing" }, "TRUE", "g");
        Ok(p4.psets.Single().name == "Pset_SlabCommon" && p4.psets.Single().rows.Single().value == "TRUE", "creates the pset when absent");
        Ok(FixPlan.NormalizeYesNo("yes") == "TRUE" && FixPlan.NormalizeYesNo(" No ") == "FALSE" && FixPlan.NormalizeYesNo("maybe") == null, "yes/no normalisation");

        Console.WriteLine("\nFixPlan.Fold");
        FixRow Inst(long id, string guid) => new() { Key = "i:" + id, TargetId = id, InstanceIds = { id }, IssueGuids = { guid } };
        var rows = new List<FixRow>
        {
            Inst(1, "g1"), Inst(2, "g2"),
            new FixRow { Key = "t:9", IsType = true, TargetId = 9, InstanceIds = { 3, 4 }, IssueGuids = { "g3", "g4" } },
        };
        var sent = new HashSet<string> { "i:1", "i:2", "t:9" };
        var guids = new[] { "g1", "g2", "g3", "g4" };
        const string R = "Pset_WallCommon.FireRating";
        var f1 = FixPlan.Fold(new[]
        {
            new ElementFailure { Element = "g2", Requirement = R, Reason = "missing" },
            new ElementFailure { Element = "g4", Requirement = R, Reason = "missing" },
            new ElementFailure { Element = "g1", Requirement = "@Name", Reason = "missing" },
        }, rows, sent, guids, R);
        Ok(rows[0].Verdict == FixVerdict.Pass && rows[1].Verdict == FixVerdict.Fail && rows[1].Reason == "missing", "instance rows: pass / fail with the referee's reason");
        Ok(rows[2].Verdict == FixVerdict.Fail && rows[2].Reason!.StartsWith("1 of 2 instance(s) still fail"), "a type row with a mixed outcome FAILS and names the count");
        Ok(!f1.AllPass && f1.Pass == 1 && f1.Fail == 2 && f1.OtherOpen == 1, "AllPass false; other-requirement failures counted, not folded");
        var f2 = FixPlan.Fold(Array.Empty<ElementFailure>(), rows, sent, guids, R);
        Ok(f2.AllPass && rows.All(r => r.Verdict == FixVerdict.Pass), "no failures on this requirement → all pass");
        var f3 = FixPlan.Fold(Array.Empty<ElementFailure>(), rows, sent, new[] { "g1", "g2", "g3", "g4", "g5" }, R);
        Ok(!f3.AllPass && f3.Unresolved.SequenceEqual(new[] { "g5" }), "an issue GUID not in this model blocks AllPass and is named");
        foreach (var r in rows) r.Verdict = FixVerdict.Unchecked;
        var f4 = FixPlan.Fold(Array.Empty<ElementFailure>(), rows, new HashSet<string> { "i:1" }, guids, R);
        Ok(rows[0].Verdict == FixVerdict.Pass && rows[1].Verdict == FixVerdict.Unchecked && !f4.AllPass, "unsent rows stay Unchecked and block AllPass");
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet run --project tools/fixplace-check`
Expected: build error — the two new files do not exist.

- [ ] **Step 3: Create `IdsIssueRef`**

Create `SentinelAddin/Coordination/IdsIssueRef.cs`:

```csharp
using System;
using System.Text.RegularExpressions;

namespace Sentinel.Coordination;

/// <summary>
/// The inverse of the bridge's referee-raised topic title — <c>IDS: &lt;spec&gt; — &lt;requirement&gt; (N failing)</c>,
/// built by <c>groupFailuresForBcf</c> where requirement is <c>Pset.Prop</c> or <c>@Attr</c>. Anything that does
/// not parse is not a referee issue and gets no Fix button. Revit-free.
/// </summary>
public sealed class IdsIssueRef
{
    public string Spec = "";
    public string Requirement = "";
    public int Failing;

    public bool IsAttribute => Requirement.StartsWith("@", StringComparison.Ordinal);
    public string Pset => IsAttribute ? "" : Requirement.Substring(0, Requirement.LastIndexOf('.'));
    public string Prop => IsAttribute ? Requirement.Substring(1) : Requirement.Substring(Requirement.LastIndexOf('.') + 1);

    // Lazy spec, then the em-dash the bridge writes, then a space-free requirement, then the count.
    private static readonly Regex Rx = new(@"^IDS:\s*(.+?)\s*—\s*(\S+)\s*\((\d+) failing\)\s*$", RegexOptions.CultureInvariant);

    public static IdsIssueRef? TryParse(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return null;
        var m = Rx.Match(title!.Trim());
        if (!m.Success) return null;
        var req = m.Groups[2].Value;
        var wellFormed = req.StartsWith("@", StringComparison.Ordinal)
            ? req.Length > 1
            : req.IndexOf('.') > 0 && req.LastIndexOf('.') < req.Length - 1;
        if (!wellFormed) return null;
        return new IdsIssueRef { Spec = m.Groups[1].Value, Requirement = req, Failing = int.Parse(m.Groups[3].Value) };
    }

    /// The bridge's exact format — for the round-trip check.
    public static string TitleOf(string spec, string requirement, int failing) => $"IDS: {spec} — {requirement} ({failing} failing)";
}
```

- [ ] **Step 4: Create `FixPlan`**

Create `SentinelAddin/Coordination/FixPlan.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Engine;

namespace Sentinel.Coordination;

public enum FixVerdict { Unchecked, Pass, Fail, NotFixable }

/// <summary>One row of the fix-in-place grid: an instance, or a TYPE covering several instances on the issue.</summary>
public sealed class FixRow
{
    public string Key = "";                  // "i:<elementId>" or "t:<typeId>" — stable across check/apply
    public bool IsType;
    public long TargetId;                    // the element (instance row) or the type (type row) that is written
    public List<long> InstanceIds = new();   // instances on the issue this row covers (one for an instance row)
    public List<string> IssueGuids = new();  // their topic GUIDs, same order as InstanceIds
    public int OtherInstanceCount;           // type rows: instances in the model NOT on the issue that change too
    public string Label = "";                // "Walls · Basic Wall: XXX_EXT_ARC_CMU_200 mm · 123456"
    public string ParamName = "";
    public string ResolvedVia = "";          // "instance parameter" / "type parameter" / "wall Function" / …
    public ValueKind ValueKind = ValueKind.Text;
    public string Current = "";
    public string Proposed = "";
    public bool Writable;
    public string? NotFixableReason;
    public FixVerdict Verdict = FixVerdict.Unchecked;
    public string? Reason;
    public bool Ticked;

    public string ScopeText => IsType
        ? $"TYPE — {InstanceIds.Count} instance(s) on this issue; {OtherInstanceCount} other(s) in the model change too"
        : "instance";
}

public sealed class ElementFailure { public string Element = ""; public string Requirement = ""; public string Reason = ""; }

public sealed class FoldResult
{
    public bool AllPass;
    public int Pass, Fail;
    public List<string> Unresolved = new();  // issue GUIDs no row covers — not in this model
    public int OtherOpen;                    // failures on OTHER requirements: a footnote, never folded in
}

/// <summary>Pure payload logic for fix-in-place: patch a proposed value in, fold a referee response back.</summary>
public static class FixPlan
{
    /// "yes"/"no"/"true"/"false"/"1"/"0" → "TRUE"/"FALSE"; anything else null (never coerced).
    public static string? NormalizeYesNo(string? s) => (s ?? "").Trim().ToUpperInvariant() switch
    {
        "TRUE" or "YES" or "Y" or "1" => "TRUE",
        "FALSE" or "NO" or "N" or "0" => "FALSE",
        _ => null,
    };

    /// A deep copy of <paramref name="el"/> with the requirement's value replaced by <paramref name="proposed"/>
    /// (inserted when absent) and identity.GlobalId set to the topic's GUID, so the referee's per-element echo
    /// matches the issue rather than whatever GlobalId the extractor computed.
    public static GovElement Patch(GovElement el, IdsIssueRef req, string proposed, string issueGuid)
    {
        static List<GovGroup> Copy(List<GovGroup> groups) => groups
            .Select(g => new GovGroup { name = g.name, rows = g.rows.Select(r => new GovRow { name = r.name, value = r.value }).ToList() })
            .ToList();
        var copy = new GovElement
        {
            modelId = el.modelId, localId = el.localId,
            identity = new GovIdentity { GlobalId = issueGuid, Name = el.identity.Name, Class = el.identity.Class, Tag = el.identity.Tag },
            psets = Copy(el.psets), quantities = Copy(el.quantities),
        };
        if (req.IsAttribute)
        {
            if (req.Prop.Equals("Name", StringComparison.OrdinalIgnoreCase)) copy.identity.Name = proposed;
            return copy;
        }
        var group = copy.psets.Find(g => string.Equals(g.name, req.Pset, StringComparison.OrdinalIgnoreCase));
        if (group == null) { group = new GovGroup { name = req.Pset }; copy.psets.Add(group); }
        var row = group.rows.Find(r => string.Equals(r.name, req.Prop, StringComparison.OrdinalIgnoreCase));
        if (row == null) group.rows.Add(new GovRow { name = req.Prop, value = proposed });
        else row.value = proposed;
        return copy;
    }

    /// Fold a referee response onto the rows that were SENT (by Key); unsent rows are left as they are.
    /// AllPass needs every issue GUID covered by a sent row that passed — an unresolved GUID, an unsent row,
    /// or one failing instance of a type row is a no.
    public static FoldResult Fold(IReadOnlyList<ElementFailure> failures, IReadOnlyList<FixRow> allRows,
                                  ISet<string> sentKeys, IReadOnlyList<string> issueGuids, string requirement)
    {
        var res = new FoldResult();
        var failing = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var f in failures)
        {
            if (string.Equals(f.Requirement, requirement, StringComparison.OrdinalIgnoreCase))
            {
                if (!failing.ContainsKey(f.Element)) failing[f.Element] = f.Reason;
            }
            else res.OtherOpen++;
        }

        var passGuids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in allRows)
        {
            if (!sentKeys.Contains(row.Key)) continue;
            var bad = row.IssueGuids.Where(failing.ContainsKey).ToList();
            if (bad.Count == 0)
            {
                row.Verdict = FixVerdict.Pass; row.Reason = null; res.Pass++;
                foreach (var g in row.IssueGuids) passGuids.Add(g);
            }
            else
            {
                row.Verdict = FixVerdict.Fail; res.Fail++;
                row.Reason = row.IsType && bad.Count < row.IssueGuids.Count
                    ? $"{bad.Count} of {row.IssueGuids.Count} instance(s) still fail — {failing[bad[0]]}"
                    : failing[bad[0]];
                foreach (var g in row.IssueGuids.Except(bad)) passGuids.Add(g);
            }
        }

        var covered = new HashSet<string>(allRows.SelectMany(r => r.IssueGuids), StringComparer.Ordinal);
        res.Unresolved = issueGuids.Where(g => !covered.Contains(g)).ToList();
        res.AllPass = issueGuids.Count > 0 && issueGuids.All(passGuids.Contains);
        return res;
    }
}
```

- [ ] **Step 5: Run the check and the build**

Run: `dotnet run --project tools/fixplace-check` — expected `28/28 checks pass`.
Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` — `Build succeeded` (2023 too).

- [ ] **Step 6: Commit**

```bash
git add SentinelAddin/Coordination/IdsIssueRef.cs SentinelAddin/Coordination/FixPlan.cs tools/fixplace-check
git commit -m "feat(fix-in-place): IdsIssueRef parser + FixPlan patch/fold — Revit-free, checked" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Bridge clients — `ProposalResult.Parse`, `Propose` options, BCF comment/status, `IdsSpecFile`, `MapByIfcGuid`

**Files:**
- Create: `SentinelAddin/Coordination/ProposalResult.cs` (Revit-free)
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (`ProposalResult` nested class removed; `Propose` signature + body)
- Modify: `SentinelAddin/Coordination/BcfSyncManager.cs` (two methods + a helper)
- Create: `SentinelAddin/Engine/IdsSpecFile.cs`
- Modify: `SentinelAddin/Commands.GovernedPublish.cs` (use `IdsSpecFile`; delete `LoadIdsSpec`)
- Modify: `SentinelAddin/Coordination/BcfApplyEvent.cs` (`MapByIfcGuid`)
- Modify: `tools/fixplace-check/fixplace-check.csproj`, `tools/fixplace-check/Check.cs`

**Interfaces:**
- Consumes: `ElementFailure` (Task 3).
- Produces: `ProposalResult{Reached, Verdict, InScope, Passing, Failing, BcfRaised, Failures, ElementFailures, AuditId, ReceiptHash, Error, NamingOk, NamingFailures}`, `ProposalResult.Parse(string json)`;
  `GovernedNotify.Propose(object elements, object? idsSpec, string? versionId, string actor, string? containerName = null, string? projectKey = null, string? source = null, string? note = null, bool raiseBcf = true) : ProposalResult`;
  `BcfSyncManager.AddCommentAsync(pid, guid, comment, author) : Task<int>` and `SetStatusAsync(pid, guid, status, author) : Task<int>` (HTTP status; 0 = transport failure);
  `IdsSpecFile.Path`, `IdsSpecFile.Load() : JsonElement?`; `BcfApplyEvent.MapByIfcGuid(Document, HashSet<string>) : Dictionary<string, ElementId>`.

- [ ] **Step 1: Add the failing check for the response parser**

In `tools/fixplace-check/fixplace-check.csproj` add:

```xml
    <Compile Include="..\..\SentinelAddin\Coordination\ProposalResult.cs" />
```

In `tools/fixplace-check/Check.cs` insert before the final tally line:

```csharp
        Console.WriteLine("\nProposalResult.Parse — the bridge verdict, every failure kept");
        var many = string.Join(",", Enumerable.Range(0, 30).Select(i =>
            $"{{\"element\":\"g{i}\",\"specification\":\"s\",\"requirement\":\"Pset_WallCommon.FireRating\",\"reason\":\"missing\"}}"));
        var pr = ProposalResult.Parse("{\"verdict\":\"rejected\",\"summary\":{\"in_scope\":30,\"passing\":0,\"failing\":30},\"failures\":[" + many +
                                      "],\"audit_id\":4711,\"receipt\":{\"ledger_hash\":\"abc123\"},\"bcf\":{\"raised\":0,\"skipped\":1}}");
        Ok(pr.Reached && pr.Verdict == "rejected" && pr.InScope == 30 && pr.Failing == 30, "verdict + summary");
        Ok(pr.ElementFailures.Count == 30 && pr.ElementFailures[29].Element == "g29", "ALL element failures kept (not the 12-line dialog cap)");
        Ok(pr.Failures.Count == 12, "dialog list still capped at 12");
        Ok(pr.AuditId == "4711" && pr.ReceiptHash == "abc123", "audit id (numeric) and receipt hash");
        var pr2 = ProposalResult.Parse("{\"verdict\":\"recorded\",\"audit_id\":\"uuid-1\",\"failures\":[{\"element\":42,\"requirement\":\"@Name\",\"reason\":\"x\"}]}");
        Ok(pr2.AuditId == "uuid-1" && pr2.ElementFailures.Single().Element == "42" && pr2.ReceiptHash == null, "string audit id, numeric element, no receipt → null");
        Ok(ProposalResult.Parse("{}").Verdict == "recorded" && ProposalResult.Parse("{}").ElementFailures.Count == 0, "an empty object reads as recorded, nothing certified");
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet run --project tools/fixplace-check` — build error, `ProposalResult.cs` missing.

- [ ] **Step 3: Create `ProposalResult`**

Create `SentinelAddin/Coordination/ProposalResult.cs`:

```csharp
using System.Collections.Generic;
using System.Text.Json;

namespace Sentinel.Coordination;

/// <summary>
/// The parsed verdict of <c>POST /cde/:key/propose</c>. <see cref="Parse"/> is Revit-free and checked;
/// <c>GovernedNotify.Propose</c> only transports. A missing field stays at its default, and every default
/// reads as "recorded / nothing certified" — never as a pass.
/// </summary>
public sealed class ProposalResult
{
    public bool Reached;                            // false ⇒ bridge/CDE unreachable (caller falls back)
    public string Verdict = "recorded";             // accepted | rejected | recorded (no IDS)
    public int InScope, Passing, Failing;
    public int BcfRaised;                           // issues auto-opened on a reject (bridge G2)
    public List<string> Failures = new();           // "<requirement>: <reason>", capped at 12 for dialogs
    public List<ElementFailure> ElementFailures = new(); // every failure the bridge returned (≤200), per element
    public string? AuditId;                         // the proposal's audit row
    public string? ReceiptHash;                     // receipt.ledger_hash — the row's own chain hash
    public string? Error;                           // why Reached is false (timeout / refused / status)
    public bool? NamingOk;                          // null = name not checked; false = container name failed
    public List<string> NamingFailures = new();

    public static ProposalResult Parse(string json)
    {
        var r = new ProposalResult();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        r.Reached = true;
        r.Verdict = Str(root, "verdict") ?? "recorded";
        if (root.TryGetProperty("summary", out var s) && s.ValueKind == JsonValueKind.Object)
        {
            if (s.TryGetProperty("in_scope", out var i) && i.TryGetInt32(out var iv)) r.InScope = iv;
            if (s.TryGetProperty("passing", out var p) && p.TryGetInt32(out var pv)) r.Passing = pv;
            if (s.TryGetProperty("failing", out var f) && f.TryGetInt32(out var fv)) r.Failing = fv;
        }
        if (root.TryGetProperty("bcf", out var b) && b.ValueKind == JsonValueKind.Object
            && b.TryGetProperty("raised", out var br) && br.TryGetInt32(out var brv)) r.BcfRaised = brv;
        if (root.TryGetProperty("failures", out var fl) && fl.ValueKind == JsonValueKind.Array)
        {
            foreach (var it in fl.EnumerateArray())
            {
                var req = Str(it, "requirement") ?? "requirement";
                var reason = Str(it, "reason") ?? "failed";
                r.ElementFailures.Add(new ElementFailure { Element = Scalar(it, "element") ?? "", Requirement = req, Reason = reason });
                if (r.Failures.Count < 12) r.Failures.Add(req + ": " + reason);
            }
        }
        r.AuditId = Scalar(root, "audit_id");
        if (root.TryGetProperty("receipt", out var rc) && rc.ValueKind == JsonValueKind.Object) r.ReceiptHash = Str(rc, "ledger_hash");
        if (root.TryGetProperty("naming", out var nm) && nm.ValueKind == JsonValueKind.Object)
        {
            r.NamingOk = nm.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True;
            if (nm.TryGetProperty("failures", out var nf) && nf.ValueKind == JsonValueKind.Array)
                foreach (var it in nf.EnumerateArray())
                {
                    if (r.NamingFailures.Count >= 12) break;
                    r.NamingFailures.Add(Str(it, "reason") ?? "invalid");
                }
        }
        return r;
    }

    private static string? Str(JsonElement o, string name) =>
        o.ValueKind == JsonValueKind.Object && o.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

    // A string or a number, as text (audit ids and element ids arrive as either).
    private static string? Scalar(JsonElement o, string name)
    {
        if (o.ValueKind != JsonValueKind.Object || !o.TryGetProperty(name, out var p)) return null;
        return p.ValueKind switch { JsonValueKind.String => p.GetString(), JsonValueKind.Number => p.GetRawText(), _ => null };
    }
}
```

- [ ] **Step 4: Run the check**

Run: `dotnet run --project tools/fixplace-check` — `34/34 checks pass`.

- [ ] **Step 5: Slim `GovernedNotify.Propose` onto the parser and add the options**

In `SentinelAddin/Coordination/GovernedNotify.cs`:
- delete the whole nested `public sealed class ProposalResult { … }` block (its doc comment too);
- replace the `Propose` method with:

```csharp
        /// <summary>
        /// The referee call: POST the extracted <paramref name="elements"/> (+ optional JSON <paramref name="idsSpec"/>)
        /// to <c>/cde/:key/propose</c> and return the deterministic verdict. When <paramref name="versionId"/> is
        /// set, the bridge also stamps the verdict onto that file version (the web verdict badge, G3); on a reject
        /// it auto-opens a BCF issue per failing requirement (G2) unless <paramref name="raiseBcf"/> is false —
        /// a fix-in-place check or re-check must never open topics. <paramref name="source"/> and
        /// <paramref name="note"/> land on the audit row. Blocking (120s cap); never throws:
        /// <see cref="ProposalResult.Reached"/> is false on any transport/parse failure.
        /// </summary>
        public static ProposalResult Propose(object elements, object? idsSpec, string? versionId, string actor,
                                             string? containerName = null, string? projectKey = null,
                                             string? source = null, string? note = null, bool raiseBcf = true)
        {
            var r = new ProposalResult();
            try
            {
                var cfg = BcfConfig.Load();
                var url = cfg.ServiceUrl.TrimEnd('/') + "/cde/" + Uri.EscapeDataString(KeyOf(cfg, projectKey)) + "/propose";
                var body = new Dictionary<string, object?>
                {
                    ["source"] = source ?? "Governed Publish",
                    ["actor"] = actor,
                    ["elements"] = elements,
                };
                if (idsSpec != null) body["ids"] = idsSpec;
                if (versionId != null) body["version_id"] = versionId;
                if (containerName != null) body["container_name"] = containerName; // ISO 19650 naming gate
                if (note != null) body["note"] = note;
                if (!raiseBcf) body["raise_bcf"] = false;

                var content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
                var resp = Send(GovHttp, HttpMethod.Post, url, content, cfg);
                var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!resp.IsSuccessStatusCode) { r.Error = "bridge returned HTTP " + (int)resp.StatusCode; return r; }
                return ProposalResult.Parse(json);
            }
            catch (Exception ex)
            {
                // Distinguish a timeout (large model, still adjudicating) from a real connection failure.
                r.Error = ex is TaskCanceledException or OperationCanceledException
                    ? "timed out after 120s (model may be very large)"
                    : ex.InnerException?.Message ?? ex.Message;
            }
            return r;
        }
```

Run `grep -rn "GovernedNotify.ProposalResult" SentinelAddin --include=*.cs` — expected: no hits (callers use `var`). If any appear, change them to `ProposalResult`.

- [ ] **Step 6: Add the two BCF write calls**

In `SentinelAddin/Coordination/BcfSyncManager.cs` add `using System.Text;` to the usings, and insert before `public void Dispose()`:

```csharp
    /// <summary>POST a comment on a topic. Returns the HTTP status (0 = transport failure) — the caller
    /// shows it; nothing here decides what the failure means.</summary>
    public Task<int> AddCommentAsync(string projectId, string topicGuid, string comment, string author, CancellationToken ct = default) =>
        SendJsonAsync(HttpMethod.Post,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}/comments",
            new { comment, author }, ct);

    /// <summary>PUT topic_status (Open / Resolved / Closed …); the bridge logs the change to the topic's
    /// history under <paramref name="author"/>. Returns the HTTP status (0 = transport failure).</summary>
    public Task<int> SetStatusAsync(string projectId, string topicGuid, string status, string author, CancellationToken ct = default) =>
        SendJsonAsync(HttpMethod.Put,
            $"{_base}/bcf/3.0/projects/{Uri.EscapeDataString(projectId)}/topics/{Uri.EscapeDataString(topicGuid)}",
            new { topic_status = status, author }, ct);

    private async Task<int> SendJsonAsync(HttpMethod method, string url, object body, CancellationToken ct)
    {
        try
        {
            using var msg = new HttpRequestMessage(method, url)
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            using HttpResponseMessage resp = await _http.SendAsync(msg, ct).ConfigureAwait(false);
            return (int)resp.StatusCode;
        }
        catch { return 0; }
    }
```

- [ ] **Step 7: Extract `IdsSpecFile`**

Create `SentinelAddin/Engine/IdsSpecFile.cs`:

```csharp
using System;
using System.IO;
using System.Text.Json;

namespace Sentinel.Engine;

/// <summary>
/// The project IDS spec (JSON IdsSpec) the referee adjudicates against, beside the delivery contract in
/// <c>%AppData%\Sentinel</c>. Absent ⇒ null (the model is recorded, not judged). The bridge's
/// <c>SENTINEL_IDS</c> override still wins over whatever the client sends.
/// </summary>
public static class IdsSpecFile
{
    public static string Path => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "ids.json");

    public static JsonElement? Load()
    {
        try
        {
            if (!File.Exists(Path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(Path));
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }
}
```

In `SentinelAddin/Commands.GovernedPublish.cs`: replace `var ids = LoadIdsSpec();` with `var ids = Sentinel.Engine.IdsSpecFile.Load();` and delete the private `LoadIdsSpec()` method (and its comment).

- [ ] **Step 8: Add `MapByIfcGuid` to `BcfApplyEvent`**

In `SentinelAddin/Coordination/BcfApplyEvent.cs` replace the `ResolveByIfcGuid` method with:

```csharp
    /// <summary>Map IFC GlobalIds → Revit ElementIds (IFC_GUID param, else computed from the export id).
    /// Only GUIDs present in this model appear — the caller names the rest as unresolved, it never guesses.</summary>
    internal static Dictionary<string, ElementId> MapByIfcGuid(Document doc, HashSet<string> wanted)
    {
        var result = new Dictionary<string, ElementId>(StringComparer.Ordinal);
        if (wanted.Count == 0) return result;

        foreach (Element e in new FilteredElementCollector(doc).WhereElementIsNotElementType())
        {
            string? g = e.get_Parameter(BuiltInParameter.IFC_GUID)?.AsString();
            if (string.IsNullOrWhiteSpace(g))
            {
                try { g = ToIfcGuid(ExportUtils.GetExportId(doc, e.Id)); } catch { continue; }
            }
            if (wanted.Contains(g!) && !result.ContainsKey(g!))
            {
                result[g!] = e.Id;
                if (result.Count == wanted.Count) break; // found them all — stop scanning
            }
        }
        return result;
    }

    /// <summary>The ids only (viewpoint apply / isolate).</summary>
    private static IList<ElementId> ResolveByIfcGuid(Document doc, HashSet<string> wanted) =>
        MapByIfcGuid(doc, wanted).Values.ToList();
```

- [ ] **Step 9: Build both years, re-run the check, commit**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2023` — both succeed.
Run: `dotnet run --project tools/fixplace-check` — `34/34 checks pass`.

```bash
git add SentinelAddin/Coordination/ProposalResult.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/Coordination/BcfSyncManager.cs SentinelAddin/Engine/IdsSpecFile.cs SentinelAddin/Commands.GovernedPublish.cs SentinelAddin/Coordination/BcfApplyEvent.cs tools/fixplace-check
git commit -m "feat(bridge-clients): per-element propose results + raise_bcf/note, BCF comment + status writes, IdsSpecFile, MapByIfcGuid" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: `FixInPlaceService` — resolve, extract, apply (Revit half)

**Files:**
- Modify: `SentinelAddin/Coordination/FixPlan.cs` (one field on `FixRow`)
- Create: `SentinelAddin/Coordination/FixInPlaceService.cs`

**Interfaces:**
- Consumes: `IdsIssueRef`, `FixRow`, `FixPlan.Patch/NormalizeYesNo` (Task 3); `PsetMap`, `GovernedElementExtractor.ExtractByIds/ReadEntry`, `GovElement` (Task 2); `BcfApplyEvent.MapByIfcGuid` (Task 4); `RequestStore.Upsert`, `ChangeRequest`, `AuditEntry`, `RoiTracker.Log` (existing).
- Produces: `FixRow.BuiltIn : string`; `FixInPlaceService.Plan{Rows, Unresolved, GuidOf}`; `FixInPlaceService.RowOutcome{Row, Ok, Message}`;
  `BuildPlan(Document, IdsIssueRef, IReadOnlyList<string> issueGuids, string? org) : Plan`;
  `Extract(Document, string modelId, Plan, IEnumerable<FixRow>, string? org) : List<GovElement>`;
  `ExtractPatched(Document, string modelId, Plan, IEnumerable<FixRow>, IdsIssueRef, string? org) : List<GovElement>`;
  `Apply(Document, IEnumerable<FixRow>, IdsIssueRef, string bcfGuid) : List<RowOutcome>`.
  All four run on the API thread (inside `App.Events.Enqueue`).

- [ ] **Step 1: Add the built-in name to `FixRow`**

In `SentinelAddin/Coordination/FixPlan.cs`, inside `FixRow`, after `public string ResolvedVia = "";` add:

```csharp
    public string BuiltIn = "";              // BuiltInParameter enum name when resolved via a built-in ("" = by name)
```

Run `dotnet run --project tools/fixplace-check` — still `34/34`.

- [ ] **Step 2: Create the service**

Create `SentinelAddin/Coordination/FixInPlaceService.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Engine;
using Sentinel.Workflow;

namespace Sentinel.Coordination;

/// <summary>
/// The Revit half of fix-in-place: resolve an issue's elements and the parameter each fix lands on, extract
/// them for the referee, and write ticked values in ONE transaction with a per-row outcome. Every method
/// runs on the API thread (call from <c>App.Events.Enqueue</c>); nothing here touches the network.
/// Sentinel never adds a parameter or invents a home for a value — a missing parameter is "not fixable here".
/// </summary>
public static class FixInPlaceService
{
    public sealed class Plan
    {
        public List<FixRow> Rows = new();
        public List<string> Unresolved = new();          // issue GUIDs not in this model
        public Dictionary<long, string> GuidOf = new();  // instance id → issue GUID
    }

    public sealed class RowOutcome { public FixRow Row = null!; public bool Ok; public string Message = ""; }

    public static Plan BuildPlan(Document doc, IdsIssueRef req, IReadOnlyList<string> issueGuids, string? org)
    {
        var plan = new Plan();
        var wanted = new HashSet<string>(issueGuids.Where(g => !string.IsNullOrWhiteSpace(g)), StringComparer.Ordinal);
        var map = BcfApplyEvent.MapByIfcGuid(doc, wanted);
        plan.Unresolved = wanted.Where(g => !map.ContainsKey(g)).ToList();
        var entry = PsetMap.Find(org, req.Requirement);
        var typeRows = new Dictionary<long, FixRow>();

        foreach (var kv in map)
        {
            var guid = kv.Key;
            var id = kv.Value;
            if (doc.GetElement(id) is not { } e) continue;
            plan.GuidOf[id.IdValue()] = guid;

            var t = Resolve(e, doc, entry, req);
            var targetId = t.Elem.Id.IdValue();
            if (t.IsType && typeRows.TryGetValue(targetId, out var existing))
            {
                existing.InstanceIds.Add(id.IdValue());
                existing.IssueGuids.Add(guid);
                continue;
            }
            var row = new FixRow
            {
                Key = (t.IsType ? "t:" : "i:") + targetId,
                IsType = t.IsType, TargetId = targetId,
                InstanceIds = { id.IdValue() }, IssueGuids = { guid },
                Label = LabelOf(e, doc),
                ParamName = t.ParamName, ResolvedVia = t.Via, BuiltIn = t.BuiltIn, ValueKind = t.ValueKind,
                Current = t.Current, Writable = t.Writable, NotFixableReason = t.Reason,
                Verdict = t.Writable ? FixVerdict.Unchecked : FixVerdict.NotFixable, Reason = t.Reason,
                Ticked = t.Writable,
            };
            if (t.IsType) typeRows[targetId] = row;
            plan.Rows.Add(row);
        }

        // Type rows: how many OTHER instances of that type exist in the model — the blast radius, on screen.
        foreach (var row in plan.Rows.Where(r => r.IsType))
        {
            var typeId = row.TargetId.ToElementId();
            var total = new FilteredElementCollector(doc).WhereElementIsNotElementType().Count(x => x.GetTypeId() == typeId);
            row.OtherInstanceCount = Math.Max(0, total - row.InstanceIds.Count);
        }
        return plan;
    }

    private sealed class Target
    {
        public Element Elem = null!;       // the instance, or the TYPE the parameter lives on
        public bool IsType;
        public string ParamName = "", Via = "", BuiltIn = "", Current = "";
        public ValueKind ValueKind;
        public bool Writable;
        public string? Reason;
    }

    /// First candidate that exists and is writable — instance first, then type. The storage must fit the
    /// value kind (text → String, yes/no → Integer); a unit-bearing number is refused rather than mis-set.
    private static Target Resolve(Element e, Document doc, PsetEntry? entry, IdsIssueRef req)
    {
        var t = new Target { Elem = e, ValueKind = entry?.ValueKind ?? ValueKind.Text };
        if (entry == null)
        {
            t.Reason = $"no parameter mapping for {req.Requirement} — Sentinel does not know where this value lives";
            return t;
        }
        t.Current = GovernedElementExtractor.ReadEntry(e, doc, entry) ?? "";
        var type = doc.GetElement(e.GetTypeId());
        string? whyNot = null;

        foreach (var c in entry.Candidates)
        {
            if (c.Kind == ParamKind.ElementName)
            {
                t.Reason = "an instance's Name comes from its type — rename the type with the Naming Manager";
                return t;
            }
            if (c.Kind == ParamKind.WallFunction)
            {
                var fn = type?.get_Parameter(BuiltInParameter.FUNCTION_PARAM);
                if (fn == null || fn.IsReadOnly) continue;
                t.Elem = type!; t.IsType = true; t.ParamName = fn.Definition.Name; t.BuiltIn = "FUNCTION_PARAM";
                t.Via = "wall type Function (Exterior = TRUE)"; t.ValueKind = ValueKind.YesNo; t.Writable = true;
                return t;
            }
            foreach (var (holder, isType) in new (Element?, bool)[] { (e, false), (type, true) })
            {
                if (holder == null) continue;
                Parameter? p = c.Kind == ParamKind.Lookup
                    ? holder.LookupParameter(c.Name)
                    : Enum.TryParse<BuiltInParameter>(c.Name, out var bip) ? holder.get_Parameter(bip) : null;
                if (p == null) continue;
                var where = isType ? "type" : "instance";
                if (p.IsReadOnly) { whyNot ??= $"{p.Definition.Name} is read-only on the {where}"; continue; }
                if (!StorageFits(p, entry.ValueKind, out var why)) { whyNot ??= why; continue; }
                t.Elem = holder; t.IsType = isType; t.ParamName = p.Definition.Name;
                t.BuiltIn = c.Kind == ParamKind.BuiltIn ? c.Name : "";
                t.Via = where + " parameter"; t.Writable = true;
                return t;
            }
        }
        var names = string.Join(" / ", entry.Candidates.Where(c => c.Name.Length > 0).Select(c => c.Name));
        t.Reason = whyNot ?? $"no parameter for {req.Requirement} on the element or its type ({names}) — add it before fixing here";
        return t;
    }

    private static bool StorageFits(Parameter p, ValueKind kind, out string why)
    {
        why = "";
        switch (kind)
        {
            case ValueKind.YesNo when p.StorageType == StorageType.Integer: return true;
            case ValueKind.Text when p.StorageType == StorageType.String: return true;
            case ValueKind.Number when p.StorageType == StorageType.String: return true;
            case ValueKind.Number when p.StorageType == StorageType.Double:
                why = $"{p.Definition.Name} is a unit-bearing number — set it in Revit's properties; fix-in-place writes text and yes/no only";
                return false;
            default:
                why = $"{p.Definition.Name} is stored as {p.StorageType}, not as {kind}";
                return false;
        }
    }

    private static string LabelOf(Element e, Document doc)
    {
        var type = doc.GetElement(e.GetTypeId()) as ElementType;
        var fam = type?.FamilyName;
        return $"{e.Category?.Name ?? "?"} · {(string.IsNullOrEmpty(fam) ? "" : fam + ": ")}{e.Name} · {e.Id.IdValue()}";
    }

    /// <summary>The rows' instances as the referee sees them NOW, each identity.GlobalId set to the issue GUID
    /// so the referee's per-element echo matches the topic. Type rows expand to their instances.</summary>
    public static List<GovElement> Extract(Document doc, string modelId, Plan plan, IEnumerable<FixRow> rows, string? org)
    {
        var ids = rows.SelectMany(r => r.InstanceIds).Distinct().Select(i => i.ToElementId()).ToList();
        var els = GovernedElementExtractor.ExtractByIds(doc, modelId, ids, org);
        foreach (var el in els)
            if (plan.GuidOf.TryGetValue(el.localId, out var g)) el.identity.GlobalId = g;
        return els;
    }

    /// <summary>The dry run's payload: the rows' instances with each proposed value patched in. Nothing is written.</summary>
    public static List<GovElement> ExtractPatched(Document doc, string modelId, Plan plan, IEnumerable<FixRow> rows, IdsIssueRef req, string? org)
    {
        var list = rows.ToList();
        var rowOf = new Dictionary<long, FixRow>();
        foreach (var r in list) foreach (var i in r.InstanceIds) rowOf[i] = r;
        return Extract(doc, modelId, plan, list, org)
            .Select(el => FixPlan.Patch(el, req, rowOf[el.localId].Proposed.Trim(), el.identity.GlobalId ?? ""))
            .ToList();
    }

    /// <summary>ONE transaction; each write independent; every row gets its own outcome. Successes are audited
    /// to the model's request store (Approved, VerdictNote names the BCF guid) + ROI. If the transaction does
    /// not commit, every "done" becomes "nothing was written" — the outcome list never overstates.</summary>
    public static List<RowOutcome> Apply(Document doc, IEnumerable<FixRow> rows, IdsIssueRef req, string bcfGuid)
    {
        var outcomes = new List<RowOutcome>();
        var user = doc.Application.Username;
        using var t = new Transaction(doc, $"Sentinel: fix-in-place {req.Requirement}");
        t.Start();
        foreach (var row in rows)
        {
            var o = new RowOutcome { Row = row };
            outcomes.Add(o);
            try
            {
                if (!row.Writable) { o.Message = row.NotFixableReason ?? "not fixable here"; continue; }
                var holder = doc.GetElement(row.TargetId.ToElementId());
                if (holder == null) { o.Message = "element no longer exists"; continue; }
                Parameter? p = row.BuiltIn.Length > 0 && Enum.TryParse<BuiltInParameter>(row.BuiltIn, out var bip)
                    ? holder.get_Parameter(bip)
                    : holder.LookupParameter(row.ParamName);
                if (p == null || p.IsReadOnly) { o.Message = $"{row.ParamName} is no longer writable"; continue; }

                var value = row.Proposed.Trim();
                if (value.Length == 0) { o.Message = "no value entered"; continue; }
                bool set;
                if (row.ValueKind == ValueKind.YesNo)
                {
                    var yn = FixPlan.NormalizeYesNo(value);
                    if (yn == null) { o.Message = $"'{value}' is not a yes/no value"; continue; }
                    set = row.BuiltIn == "FUNCTION_PARAM"
                        ? p.Set((int)(yn == "TRUE" ? WallFunction.Exterior : WallFunction.Interior))
                        : p.Set(yn == "TRUE" ? 1 : 0);
                    value = yn;
                }
                else set = p.Set(value);
                if (!set) { o.Message = "Revit refused the value"; continue; }

                RequestStore.Upsert(doc, new ChangeRequest
                {
                    RuleId = req.Requirement, ElementId = row.TargetId,
                    ElementCategory = holder.Category?.Name ?? holder.GetType().Name,
                    OldValue = row.Current, NewValue = value, RequestedBy = user,
                    Status = RequestStatus.Approved, VerdictBy = user, VerdictAt = DateTimeOffset.Now,
                    VerdictNote = $"fix-in-place · BCF {bcfGuid}",
                }, new AuditEntry
                {
                    Actor = user, Action = "fix.applied",
                    Detail = $"{req.Requirement}: '{row.Current}' -> '{value}' ({row.ScopeText})",
                });
                row.Current = value;
                o.Ok = true; o.Message = "done";
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { o.Message = "Revit refused: " + ex.Message; }
        }
        if (t.Commit() != TransactionStatus.Committed)
        {
            foreach (var o in outcomes.Where(x => x.Ok)) { o.Ok = false; o.Message = "transaction did not commit — nothing was written"; }
            return outcomes;
        }
        foreach (var o in outcomes.Where(x => x.Ok))
            RoiTracker.Log("fix", $"{req.Requirement}: '{o.Row.Current}' via {o.Row.ResolvedVia} (BCF {bcfGuid})");
        return outcomes;
    }
}
```

- [ ] **Step 3: Build both years**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2023` — both `Build succeeded`. (If 2023/net48 rejects the tuple-array `foreach`, replace it with two explicit iterations over `(e,false)` then `(type,true)` — the logic must stay instance-first.)

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/Coordination/FixPlan.cs SentinelAddin/Coordination/FixInPlaceService.cs
git commit -m "feat(fix-in-place): FixInPlaceService — resolve instance-then-type, extract for the referee, one-transaction apply with per-row outcomes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: `FixInPlaceWindow` + the BCF window wiring (check → apply → re-check → close the loop)

**Files:**
- Create: `SentinelAddin/UI/FixInPlaceWindow.cs`
- Modify: `SentinelAddin/UI/BcfIssuesWindow.cs` (Fix button + `FixRequested` event)
- Modify: `SentinelAddin/Commands.BcfIssues.cs` (the wiring)

**Interfaces:**
- Consumes: everything from Tasks 3–5; `BcfSyncManager.AddCommentAsync/SetStatusAsync`, `GovernedNotify.Propose(… source, note, raiseBcf)`, `IdsSpecFile.Load()` (Task 4); `App.Events.Enqueue`, `DialogOwner.Attach`, `SettingsManager.WebProjectKeyFor(doc)`, `BcfConfig` (existing).
- Produces: `FixInPlaceWindow(BcfTopic topic, IdsIssueRef req, FixInPlaceService.Plan plan)` with events `CheckRequested(List<FixRow>)`, `ApplyRequested(List<FixRow>)`, `RecheckRequested()`, `ZoomRequested(FixRow)` and methods `SetStatus(string)`, `SetBanner(string?)`, `RefreshRows()`, `SetBusy(bool)`; `BcfIssuesWindow.FixRequested : Action<BcfTopic>`.

- [ ] **Step 1: The window**

Create `SentinelAddin/UI/FixInPlaceWindow.cs`:

```csharp
// Fix-in-place: the human gate between a referee-raised BCF issue and the model. One row per instance (or
// per TYPE, with its blast radius spelled out), the current and proposed value, and the referee's verdict
// for the proposed value BEFORE anything is written. Modeless, code-only WPF, in ChangesetReviewWindow's
// visual family. The window never touches the Revit API or the network — it raises events.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;
using Sentinel.Engine;

namespace Sentinel.UI;

public sealed class FixInPlaceWindow : Window
{
    public event Action<List<FixRow>>? CheckRequested;
    public event Action<List<FixRow>>? ApplyRequested;
    public event Action? RecheckRequested;
    public event Action<FixRow>? ZoomRequested;

    private readonly FixInPlaceService.Plan _plan;
    private readonly StackPanel _list = new();
    private readonly TextBlock _status = new() { Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private readonly Border _banner = new() { Visibility = Visibility.Collapsed, Background = new SolidColorBrush(Color.FromRgb(0x5c, 0x45, 0x00)), CornerRadius = new CornerRadius(3), Padding = new Thickness(6, 3, 6, 3), Margin = new Thickness(0, 6, 0, 0) };
    private readonly TextBlock _bannerText = new() { Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap };
    private readonly TextBox _setAll = new() { Width = 160, Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center };
    private readonly List<(CheckBox Box, TextBox Value, TextBlock Verdict, FixRow Row)> _rows = new();
    private readonly List<Button> _actions = new();

    public FixInPlaceWindow(BcfTopic topic, IdsIssueRef req, FixInPlaceService.Plan plan)
    {
        _plan = plan;
        Title = $"Sentinel — Fix in Revit: {req.Requirement}";
        Width = 860; Height = 600; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: the issue, the requirement, what resolved and what did not.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = topic.Title, FontSize = 15, FontWeight = FontWeights.Bold, TextWrapping = TextWrapping.Wrap });
        head.Children.Add(new TextBlock
        {
            Text = $"Requirement {req.Requirement} · spec “{req.Spec}” · {plan.Rows.Count} row(s) covering {plan.Rows.Sum(r => r.InstanceIds.Count)} of {req.Failing} element(s)",
            Foreground = Brushes.Gray, Margin = new Thickness(0, 2, 0, 0), TextWrapping = TextWrapping.Wrap,
        });
        if (plan.Unresolved.Count > 0)
            head.Children.Add(new TextBlock
            {
                Text = $"⚠ {plan.Unresolved.Count} element(s) on this issue are not in the open model — the issue cannot be resolved from here until they are: {string.Join(", ", plan.Unresolved.Take(5))}{(plan.Unresolved.Count > 5 ? ", …" : "")}",
                Foreground = Brushes.Orange, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 0),
            });
        _banner.Child = _bannerText;
        head.Children.Add(_banner);
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // Footer: set-all, actions, status.
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        var line = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        line.Children.Add(new TextBlock { Text = "Set all ticked to:", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) });
        line.Children.Add(_setAll);
        line.Children.Add(Btn("Set", () => { foreach (var r in _rows.Where(r => r.Box.IsChecked == true && r.Row.Writable)) r.Value.Text = _setAll.Text; }));
        line.Children.Add(Btn("Zoom", () => { var r = _rows.FirstOrDefault(x => x.Box.IsChecked == true); if (r.Row != null) ZoomRequested?.Invoke(r.Row); }));
        line.Children.Add(Btn("Check", () => Fire(CheckRequested), bold: true));
        line.Children.Add(Btn("Apply ticked", () => Fire(ApplyRequested), bold: true));
        line.Children.Add(Btn("Re-check", () => RecheckRequested?.Invoke()));
        foot.Children.Add(line);
        foot.Children.Add(_status);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows.
        foreach (var row in plan.Rows) _list.Children.Add(MakeRow(row));
        if (plan.Rows.Count == 0)
            _list.Children.Add(new TextBlock { Text = $"None of this issue's {req.Failing} element(s) are in the open model.", Foreground = Brushes.Orange, Margin = new Thickness(0, 12, 0, 0) });
        root.Children.Add(new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
        SetStatus(plan.Rows.Count == 0 ? "Nothing to fix here." : "Enter values, then Check — the referee judges the proposed values before anything is written.");
    }

    private Button Btn(string text, Action click, bool bold = false)
    {
        var b = new Button { Content = text, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(6, 0, 0, 0), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal };
        b.Click += (_, _) => click();
        _actions.Add(b);
        return b;
    }

    private void Fire(Action<List<FixRow>>? ev)
    {
        foreach (var r in _rows) { r.Row.Ticked = r.Box.IsChecked == true; r.Row.Proposed = r.Value.Text; }
        var ticked = _rows.Where(r => r.Row.Ticked && r.Row.Writable).Select(r => r.Row).ToList();
        if (ticked.Count == 0) { SetStatus("Tick at least one fixable row."); return; }
        ev?.Invoke(ticked);
    }

    private UIElement MakeRow(FixRow row)
    {
        var grid = new Grid { Margin = new Thickness(0, 3, 0, 3) };
        foreach (var w in new[] { 24.0, 300.0, 120.0, 140.0, 0.0 })
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });

        var box = new CheckBox { IsChecked = row.Writable, IsEnabled = row.Writable, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(box, 0); grid.Children.Add(box);

        var label = new TextBlock { TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(4, 0, 8, 0) };
        label.Inlines.Add(row.Label);
        label.Inlines.Add(new System.Windows.Documents.LineBreak());
        label.Inlines.Add(new System.Windows.Documents.Run(row.Writable ? $"{row.ScopeText} · {row.ParamName} ({row.ResolvedVia})" : row.ScopeText)
        { Foreground = row.IsType ? Brushes.DarkOrange : Brushes.Gray, FontSize = 11 });
        Grid.SetColumn(label, 1); grid.Children.Add(label);

        var current = new TextBlock { Text = row.Current.Length == 0 ? "(empty)" : row.Current, Foreground = Brushes.Gray, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
        current.ToolTip = "current value";
        Grid.SetColumn(current, 2); grid.Children.Add(current);

        var value = new TextBox { Text = row.Proposed, IsEnabled = row.Writable, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };
        value.ToolTip = row.ValueKind == ValueKind.YesNo ? "yes / no" : "proposed value";
        Grid.SetColumn(value, 3); grid.Children.Add(value);

        var verdict = new TextBlock { VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold };
        Grid.SetColumn(verdict, 4); grid.Children.Add(verdict);

        _rows.Add((box, value, verdict, row));
        Paint(verdict, row);
        return grid;
    }

    private static void Paint(TextBlock tb, FixRow row)
    {
        (tb.Text, tb.Foreground, tb.ToolTip) = row.Verdict switch
        {
            FixVerdict.Pass => ("✓ passes", Brushes.LightGreen, "The referee accepted this value."),
            FixVerdict.Fail => ($"✗ {row.Reason}", Brushes.IndianRed, row.Reason),
            FixVerdict.NotFixable => ($"— not fixable here: {row.NotFixableReason}", Brushes.Orange, row.NotFixableReason),
            _ => ("unchecked", Brushes.Gray, "Not yet checked by the referee."),
        };
    }

    // ---- called from the command (marshalled via the dispatcher) ----
    public void RefreshRows() => Dispatcher.Invoke(() => { foreach (var r in _rows) Paint(r.Verdict, r.Row); });
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
    public void SetBanner(string? text) => Dispatcher.Invoke(() => { _bannerText.Text = text ?? ""; _banner.Visibility = text == null ? Visibility.Collapsed : Visibility.Visible; });
    public void SetBusy(bool busy) => Dispatcher.Invoke(() => { foreach (var b in _actions) b.IsEnabled = !busy; });
}
```

- [ ] **Step 2: The Fix button on the issues window**

In `SentinelAddin/UI/BcfIssuesWindow.cs`:
- add `using Sentinel.Coordination;` is already there; add after `public event Action? IssuesForSelectionRequested;`:

```csharp
    public event Action<BcfTopic>? FixRequested;
    private readonly Button _fix;
```

- in the constructor, after `var refresh = Btn("Refresh", …);` add:

```csharp
        _fix = Btn("Fix in Revit (referee-raised IDS issues only)", () => { if (_list.SelectedItem is BcfTopic t) FixRequested?.Invoke(t); });
        _fix.IsEnabled = false;
        _fix.ToolTip = "Only issues the referee raised (title “IDS: … — … (N failing)”) can be fixed in place.";
```

- in the `foreach (var (el, dock) in new (UIElement, Dock)[] { … })` list, add `(_fix, Dock.Bottom),` immediately before `(refresh, Dock.Bottom),`;
- in `ShowDetails(BcfTopic? t)`, as the first line inside the method body add:

```csharp
        _fix.IsEnabled = t != null && IdsIssueRef.TryParse(t.Title) != null;
```

(Because `_fix` is assigned in the constructor after `_list` wiring, make the field assignment happen before `_list.SelectionChanged` fires — the list has no items yet, so no ordering issue.)

- [ ] **Step 3: The wiring in the command**

In `SentinelAddin/Commands.BcfIssues.cs` add `using System.Collections.Generic;`, `using System.Threading.Tasks;`, `using Sentinel.Engine;` to the usings, and inside `Execute`, after `window.Closed += (_, __) => { liveCts.Cancel(); sync.Dispose(); };`, insert:

```csharp
        // Fix-in-place: plan on the API thread, check/re-check through the referee off it, apply on the
        // API thread, and close the loop on the topic only with evidence (every GUID resolved AND passing).
        var doc = uiapp.ActiveUIDocument.Document;
        var projectKey = Sentinel.Engine.SettingsManager.WebProjectKeyFor(doc);
        var org = App.Engine?.Ruleset.Org;
        var ids = IdsSpecFile.Load();
        var user = doc.Application.Username;
        window.FixRequested += topic =>
        {
            var req = IdsIssueRef.TryParse(topic.Title);
            if (req == null) { window.SetStatus("Only referee-raised IDS issues can be fixed here."); return; }
            var guids = topic.Viewpoints.SelectMany(v => v.Components?.Selection?.Select(s => s.IfcGuid) ?? Enumerable.Empty<string>())
                             .Where(g => !string.IsNullOrWhiteSpace(g)).Distinct().ToList();
            if (App.Events == null) { window.SetStatus("Sentinel's event hub is not running — restart Revit."); return; }
            window.SetStatus("Resolving the issue's elements in this model…");
            App.Events.Enqueue(ua =>
            {
                var d = ua.ActiveUIDocument?.Document;
                if (d == null) return;
                var plan = FixInPlaceService.BuildPlan(d, req, guids, org);
                window.Dispatcher.BeginInvoke(new Action(() => OpenFixWindow(ua, d, topic, req, plan)));
            });
        };

        void OpenFixWindow(UIApplication ua, Document d, BcfTopic topic, IdsIssueRef req, FixInPlaceService.Plan plan)
        {
            var fix = new FixInPlaceWindow(topic, req, plan);
            DialogOwner.Attach(fix, ua);
            if (ids == null)
                fix.SetBanner("No IDS available to check against (no %AppData%\\Sentinel\\ids.json; the bridge may still hold a server IDS). Apply is allowed; the issue cannot be resolved from here unless the bridge adjudicates.");

            // Check = dry run: patched payload → referee; verdicts painted per row. raise_bcf:false always.
            fix.CheckRequested += ticked =>
            {
                fix.SetBusy(true); fix.SetStatus("Checking proposed values with the referee…");
                App.Events!.Enqueue(ua2 =>
                {
                    var payload = FixInPlaceService.ExtractPatched(d, projectKey, plan, ticked, req, org);
                    var keys = new HashSet<string>(ticked.Select(r => r.Key));
                    Task.Run(() =>
                    {
                        var res = GovernedNotify.Propose(payload, ids, null, user, projectKey: projectKey,
                            source: "revit-fix", note: $"fix-in-place check · BCF {topic.Guid}", raiseBcf: false);
                        if (!res.Reached)
                        {
                            fix.SetStatus($"Could not reach the bridge — nothing was checked ({res.Error}). Applying is unverified.");
                            fix.SetBusy(false); return;
                        }
                        if (res.Verdict == "recorded")
                        {
                            fix.SetBanner("The bridge has no IDS to judge against — verdict “recorded”. Apply is allowed; nothing can be certified or resolved.");
                            fix.SetStatus("Not checkable: no IDS on the bridge or locally."); fix.SetBusy(false); return;
                        }
                        var fold = FixPlan.Fold(res.ElementFailures, plan.Rows, keys, guids, req.Requirement);
                        fix.RefreshRows();
                        fix.SetStatus($"Check: {fold.Pass} would pass, {fold.Fail} would fail{(fold.OtherOpen > 0 ? $" · {fold.OtherOpen} failure(s) on other requirements not part of this issue" : "")} · audit {res.AuditId}");
                        fix.SetBusy(false);
                    });
                });
            };

            // Apply = one transaction on the API thread, then an automatic re-check of the REAL model state.
            fix.ApplyRequested += ticked =>
            {
                fix.SetBusy(true); fix.SetStatus("Applying ticked values…");
                App.Events!.Enqueue(ua2 =>
                {
                    var outcomes = FixInPlaceService.Apply(d, ticked, req, topic.Guid);
                    var done = outcomes.Count(o => o.Ok);
                    foreach (var o in outcomes.Where(o => !o.Ok)) { o.Row.Verdict = FixVerdict.Fail; o.Row.Reason = "not written: " + o.Message; }
                    fix.RefreshRows();
                    fix.SetStatus($"Applied {done}/{outcomes.Count} row(s). Re-checking the model with the referee…");
                    Recheck(ua2);
                });
            };
            fix.RecheckRequested += () => { fix.SetBusy(true); fix.SetStatus("Re-checking…"); App.Events!.Enqueue(Recheck); };
            fix.ZoomRequested += row => App.Events?.SelectAndShow(row.IsType ? row.InstanceIds[0] : row.TargetId);

            // Re-check: extract what the model holds NOW, judge it, and close the loop only on full evidence.
            void Recheck(UIApplication ua2)
            {
                var payload = FixInPlaceService.Extract(d, projectKey, plan, plan.Rows, org);
                var keys = new HashSet<string>(plan.Rows.Select(r => r.Key));
                Task.Run(async () =>
                {
                    var res = GovernedNotify.Propose(payload, ids, null, user, projectKey: projectKey,
                        source: "revit-fix", note: $"fix-in-place re-check · BCF {topic.Guid}", raiseBcf: false);
                    if (!res.Reached)
                    {
                        fix.SetStatus($"Applied. NOT verified — the bridge could not be reached ({res.Error}); the issue was not touched. Use Re-check when it is back.");
                        fix.SetBusy(false); return;
                    }
                    if (res.Verdict == "recorded")
                    {
                        fix.SetStatus("Applied. NOT verified — the bridge has no IDS to judge against; the issue was not touched.");
                        fix.SetBusy(false); return;
                    }
                    var fold = FixPlan.Fold(res.ElementFailures, plan.Rows, keys, guids, req.Requirement);
                    fix.RefreshRows();
                    var total = guids.Count;
                    var passed = total - fold.Unresolved.Count - plan.Rows.Where(r => r.Verdict == FixVerdict.Fail).Sum(r => r.IssueGuids.Count);
                    var receipt = string.IsNullOrEmpty(res.ReceiptHash) ? "" : $" · receipt {res.ReceiptHash!.Substring(0, Math.Min(16, res.ReceiptHash.Length))}";
                    var evidence = $"Fixed in Revit by {user}: {passed}/{total} element(s) now pass {req.Requirement}. Referee re-check audit {res.AuditId}{receipt}.";
                    var still = plan.Rows.Where(r => r.Verdict == FixVerdict.Fail).SelectMany(r => r.InstanceIds).ToList();
                    if (still.Count > 0) evidence += $" Still failing: {string.Join(", ", still.Take(20))}{(still.Count > 20 ? ", …" : "")}.";
                    if (fold.Unresolved.Count > 0) evidence += $" Not in this model: {string.Join(", ", fold.Unresolved.Take(10))}{(fold.Unresolved.Count > 10 ? ", …" : "")}.";

                    var c = await sync.AddCommentAsync(cfg.ProjectId, topic.Guid, evidence, user).ConfigureAwait(false);
                    if (c < 200 || c >= 300) { fix.SetStatus($"Re-check done ({passed}/{total} pass) but the evidence comment was not posted (HTTP {c}); the issue is unchanged."); fix.SetBusy(false); return; }
                    if (!fold.AllPass)
                    {
                        fix.SetStatus($"Re-check: {passed}/{total} pass. Evidence posted; the issue stays {topic.Status} until every element passes.");
                        fix.SetBusy(false); return;
                    }
                    var s = await sync.SetStatusAsync(cfg.ProjectId, topic.Guid, "Resolved", user).ConfigureAwait(false);
                    fix.SetStatus(s >= 200 && s < 300
                        ? $"✓ {passed}/{total} pass — evidence posted and the issue is now Resolved (audit {res.AuditId}). Closing it stays a human decision on the web."
                        : $"Evidence posted; status unchanged (HTTP {s}).");
                    fix.SetBusy(false);
                    try { window.Dispatcher.BeginInvoke(new Action(Refresh)); } catch { /* window closed */ }
                });
            }

            fix.Show();
        }
```

Note for the implementer: `Refresh` is the existing local function declared earlier in `Execute`; `cfg` and `sync` are the existing locals. The `doc` local shadows nothing — `Execute` had no `doc` variable before (it used `uiapp.ActiveUIDocument?.Document` inline).

- [ ] **Step 4: Build both years**

Run: `dotnet build SentinelAddin -c Release -p:RevitVersion=2026 -p:DeployToRevit=false` and `-p:RevitVersion=2023` — both `Build succeeded`.

- [ ] **Step 5: Commit**

```bash
git add SentinelAddin/UI/FixInPlaceWindow.cs SentinelAddin/UI/BcfIssuesWindow.cs SentinelAddin/Commands.BcfIssues.cs
git commit -m "feat(fix-in-place): Fix in Revit from a referee-raised BCF issue — check before write, re-check after, Resolved only with evidence" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: `NameSynth` extraction + `NamingProposer` (Revit-free) + catalogue sweep

**Files:**
- Create: `SentinelAddin/Workflow/NameSynth.cs`
- Modify: `SentinelAddin/Workflow/AutoFixExecution.cs` (delete the four synthesis members; call `NameSynth`)
- Create: `SentinelAddin/Standards/NamingProposer.cs`
- Modify: `tools/naming-check/naming-check.csproj`, `tools/naming-check/Check.cs`

**Interfaces:**
- Consumes: `Rule`, `RuleTarget`, `RuleRegex.For/DefWithOrg` (Task 1); `TypeNameParse.ThicknessMm/TrySection` (existing, `Sentinel.GhostBuilder`).
- Produces: `NameSynth.BuildCompliantName(string current, Rule rule, string? org)`, `NameSynth.DefaultFor(string? def, string token)`, `NameSynth.Sanitize(string text, string? def)`;
  `enum NameVerdict { Conforming, Proposed, NeedsHuman, Blocked }`; `NamingContext{Category, FamilyName, IsSystem, WidthMm, HeightMm, ExistingNamesInFamily, SiblingProposals}`; `NameProposal{Name, Verdict, Notes}`; `NamingProposer.Propose(string current, Rule rule, string? org, NamingContext ctx) : NameProposal`.

- [ ] **Step 1: Add the failing checks**

In `tools/naming-check/naming-check.csproj` add includes:

```xml
    <Compile Include="..\..\SentinelAddin\Workflow\NameSynth.cs" />
    <Compile Include="..\..\SentinelAddin\Standards\NamingProposer.cs" />
    <Compile Include="..\..\SentinelAddin\GhostBuilder\TypeNameParse.cs" />
```

In `tools/naming-check/Check.cs` add `using System.Collections.Generic;` and `using Sentinel.Standards;` and, before the tally line, insert:

```csharp
        Console.WriteLine("\nNamingProposer — recovery only, no guesses, no suffixes");
        NamingContext Ctx(double? width = null, params string[] existing) =>
            new() { Category = "Walls", FamilyName = "Basic Wall", IsSystem = true, WidthMm = width, ExistingNamesInFamily = new HashSet<string>(existing) };
        NameProposal P(string name, string org, NamingContext? c = null, Rule? r = null) => NamingProposer.Propose(name, r ?? Tn01(), org, c ?? Ctx());

        var x1 = P("XXX_ÊXT_ARC_CMU_200 mm", "XXX");
        Ok(x1.Verdict == NameVerdict.Proposed && x1.Name == "XXX_EXT_ARC_CMU_200 mm", "org XXX: folds Ê → E");
        var x2 = P("ACME_ÊXT_ARC_CMU_200 mm", "ACME");
        Ok(x2.Verdict == NameVerdict.Proposed && x2.Name == "ACME_EXT_ARC_CMU_200 mm", "org ACME: same shape, nothing hardcoded");
        Ok(P("XXX_EXT_ARC_CMU_200 mm", "").Verdict == NameVerdict.NeedsHuman, "empty org → NeedsHuman for an ORG rule");

        var b1 = P("BDS_ÊXT_LSE_CONC_100 mm", "BDS");
        Ok(b1.Verdict == NameVerdict.Proposed && b1.Name == "BDS_EXT_LSE_CONC_100 mm", "audit: non-ASCII Ê repaired");
        var b2 = P("BDS_ARCH_WALL_EXT_MTL_50_mm", "BDS", Ctx(50));
        Ok(b2.Verdict == NameVerdict.Proposed && b2.Name == "BDS_EXT_ARC_MTL_50 mm", "audit: legacy token order + ARCH alias + WALL noise + _mm");
        var b3 = P("BDS_ARCH_WALL_EXT_MTL_5_CM", "BDS", Ctx(50, "BDS_EXT_ARC_MTL_50 mm"));
        Ok(b3.Verdict == NameVerdict.Blocked && b3.Name == "BDS_EXT_ARC_MTL_50 mm" && b3.Notes.Any(n => n.Contains("duplicate")), "audit: 5_CM twin → same name → BLOCKED against the existing type, never suffixed");
        var sib = Ctx(50); sib.SiblingProposals.Add("BDS_EXT_ARC_MTL_50 mm");
        Ok(P("BDS_ARCH_WALL_EXT_MTL_50_mm", "BDS", sib).Verdict == NameVerdict.Blocked, "two rows proposing the same name → the second is BLOCKED");
        var b4 = P("BDS_LSE_WALL_CONC_150_mm", "BDS", Ctx(150));
        Ok(b4.Verdict == NameVerdict.NeedsHuman && b4.Notes.Any(n => n.Contains("LOC")), "audit: LSE is a discipline, no LOC → NeedsHuman");
        Ok(P("Generic - 200mm", "BDS", Ctx(200)).Verdict == NameVerdict.NeedsHuman, "stock Revit type → NeedsHuman");
        var b5 = P("BDS_EXT_ARC_MTL_50 mm", "BDS", Ctx(200));
        Ok(b5.Verdict == NameVerdict.NeedsHuman && b5.Notes.Any(n => n.Contains("Width")), "name says 50 mm, Width is 200 → NeedsHuman, never silently corrected");
        Ok(P("BDS_EXT_ARC_CMU_200 mm", "BDS", Ctx(200)).Verdict == NameVerdict.Conforming, "conforming stays Conforming");
        Ok(P("BDS_EXT_ARC_CMU_200 mm", "BDS", Ctx(200, "BDS_EXT_ARC_CMU_200 mm")).Verdict == NameVerdict.Conforming, "its own name in the family list is not a collision");
        var tn2 = new Rule
        {
            Id = "TN-02", Target = RuleTarget.Type, Tokens = ["ORG", "LOC", "LEAF", "MATERIAL", "SIZE"], Separator = "_",
            TokenDefs = new() { ["ORG"] = "{org}", ["LOC"] = "EXT|INT", ["LEAF"] = @"\d+ PNL|[A-Z0-9][A-Z0-9 \-]*", ["MATERIAL"] = @"[A-Z0-9][A-Z0-9 \-]*", ["SIZE"] = @"\d+ x \d+ mm" },
            MessageEn = "{org}",
        };
        var door = new NamingContext { Category = "Doors", FamilyName = "BDS_Door", WidthMm = 960, HeightMm = 1980 };
        var d1 = NamingProposer.Propose("BDS_EXT_1 PNL_WOOD_1000x2100mm", tn2, "BDS", door);
        Ok(d1.Verdict == NameVerdict.Proposed && d1.Name == "BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", "door: nominal size from the NAME, never from Width/Height");
        Ok(NamingProposer.Propose("BDS_EXT_1 PNL_WOOD_1000 x 2100 mm", tn2, "BDS", door).Verdict == NameVerdict.Conforming, "door: conforming");
        var fn = new Rule { Id = "FN-01", Target = RuleTarget.Family, Tokens = ["ORG", "BODY"], Separator = "_",
            TokenDefs = new() { ["ORG"] = "{org}", ["BODY"] = @"((INT|EXT|STR)_)?[A-Za-z0-9][A-Za-z0-9 \-\+]*(_[A-Za-z0-9][A-Za-z0-9 \-\+]*)+" }, MessageEn = "{org}" };
        var f1 = NamingProposer.Propose("Single Flush_Wood", fn, "XXX", new NamingContext { Category = "Doors", FamilyName = "Single Flush_Wood" });
        Ok(f1.Verdict == NameVerdict.Proposed && f1.Name == "XXX_Single Flush_Wood", "family rule: NameSynth candidate, org from data");
        Ok(NamingProposer.Propose("Single Flush_Wood", fn, "XXX", new NamingContext { ExistingNamesInFamily = new HashSet<string> { "XXX_Single Flush_Wood" } }).Verdict == NameVerdict.Blocked,
           "family rule: collision is Blocked, not suffixed");

        Console.WriteLine("\nCatalogue sweep — 1,434 harvested types (pilot fixture, org BDS)");
        var cat = JsonSerializer.Deserialize<Catalog>(File.ReadAllText(Path.Combine(RepoRoot(), "demo", "bds-pilot", "bds-type-catalog.json")), JsonOpts)!;
        var rules = new[] { (rule: Tn01(), cats: new[] { "Walls", "Floors", "Ceilings", "Roofs" }), (rule: tn2, cats: new[] { "Doors", "Windows" }) };
        int conforming = 0, proposed = 0, needs = 0, blocked = 0, threw = 0, nonConforming = 0, dupes = 0;
        var proposedNames = new HashSet<string>();
        foreach (var (rule, cats) in rules)
        {
            var rx = RuleRegex.For(rule, "BDS");
            foreach (var group in cat.Types.Where(t => cats.Contains(t.Category)).GroupBy(t => t.Family))
            {
                var existing = new HashSet<string>(group.Select(t => t.Type));
                var siblings = new HashSet<string>();
                foreach (var t in group)
                {
                    var ctx = new NamingContext { Category = t.Category, FamilyName = t.Family, IsSystem = t.System,
                        WidthMm = rule.Id == "TN-01" ? t.WidthMm : null, ExistingNamesInFamily = existing, SiblingProposals = siblings };
                    NameProposal p;
                    try { p = NamingProposer.Propose(t.Type, rule, "BDS", ctx); } catch { threw++; continue; }
                    switch (p.Verdict)
                    {
                        case NameVerdict.Conforming: conforming++; break;
                        case NameVerdict.Proposed:
                            proposed++;
                            if (!rx.IsMatch(p.Name!)) nonConforming++;
                            if (!proposedNames.Add(t.Family + "|" + p.Name)) dupes++;
                            siblings.Add(p.Name!);
                            break;
                        case NameVerdict.NeedsHuman: needs++; break;
                        case NameVerdict.Blocked: blocked++; break;
                    }
                }
            }
        }
        Console.WriteLine($"  tally: conforming {conforming} · proposed {proposed} · needs-human {needs} · blocked {blocked}");
        Ok(threw == 0, "sweep never throws");
        Ok(nonConforming == 0, "sweep never proposes a non-conforming name");
        Ok(dupes == 0, "sweep never proposes a duplicate within a family");
        Ok(conforming + proposed + needs + blocked > 100, "sweep covered the wall/floor/door/window types");
```

and add at the bottom of the `Check` class (inside it):

```csharp
    sealed class Catalog { public List<CatType> Types { get; set; } = new(); }
    sealed class CatType
    {
        public string Category { get; set; } = ""; public string Family { get; set; } = ""; public string Type { get; set; } = "";
        public bool System { get; set; }
        [JsonPropertyName("width_mm")] public double? WidthMm { get; set; }
        [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet run --project tools/naming-check` — build error, `NameSynth` / `NamingProposer` missing.

- [ ] **Step 3: Extract `NameSynth`**

Create `SentinelAddin/Workflow/NameSynth.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Sentinel.Engine;

namespace Sentinel.Workflow;

/// <summary>
/// Name synthesis for token rules (moved out of AutoFixExecution so it is Revit-free and checkable).
/// Strategy per token, left to right: keep a segment that already matches the token def; fold the rest into
/// the trailing free-text token; else synthesize the def's default (first alternative). Token defs are
/// resolved with the office code first — a `{org}` token yields the org, never the literal "{org}".
/// NOTE: this synthesizes defaults for enum tokens ("EXT|INT" → "EXT"); the naming manager deliberately
/// does NOT use it for type rules — see NamingProposer.
/// </summary>
public static class NameSynth
{
    public static string BuildCompliantName(string current, Rule rule, string? org)
    {
        var sep = rule.Separator;
        var segments = current.Split(new[] { sep }, StringSplitOptions.RemoveEmptyEntries);
        var output = new List<string>(rule.Tokens.Count);
        int consumed = 0;

        foreach (var token in rule.Tokens)
        {
            rule.TokenDefs.TryGetValue(token, out var rawDef);
            var def = rawDef is null ? null : RuleRegex.DefWithOrg(rawDef, org);
            var rx = def is null ? null : new Regex("^(?:" + def + ")$", RegexOptions.CultureInvariant);

            if (consumed < segments.Length && rx is not null && rx.IsMatch(segments[consumed]))
            {
                output.Add(segments[consumed]);                   // keep valid segment
                consumed++;
            }
            else if (IsLastFreeTextToken(token, rule) && consumed < segments.Length)
            {
                var rest = Sanitize(string.Join(sep, segments.Skip(consumed)), def);
                output.Add(rest.Length > 0 ? rest : DefaultFor(def, token));
                consumed = segments.Length;
            }
            else
            {
                output.Add(DefaultFor(def, token));               // synthesize
            }
        }
        return string.Join(sep, output);
    }

    private static bool IsLastFreeTextToken(string token, Rule rule) =>
        rule.Tokens.Count > 0 && rule.Tokens[rule.Tokens.Count - 1] == token;

    /// First alternative of a top-level alternation is the schema's canonical default ("WIP|SH|…" → "WIP").
    /// Regex escapes are unwrapped so an escaped org ("A\+B") comes back as text ("A+B").
    public static string DefaultFor(string? def, string token)
    {
        if (string.IsNullOrEmpty(def)) return token.ToUpperInvariant();
        int depth = 0; var first = new StringBuilder();
        foreach (var ch in def!)
        {
            if (ch == '(') depth++;
            else if (ch == ')') depth--;
            else if (ch == '|' && depth == 0) break;
            else if (depth == 0) first.Append(ch);
        }
        var candidate = Regex.Replace(first.ToString(), @"\\d\{(\d+)(,\d*)?\}", m => new string('0', int.Parse(m.Groups[1].Value)));
        candidate = Regex.Replace(candidate, @"\\d", "0");
        candidate = Regex.Replace(candidate, @"\[[^\]]*\][*+?]?(\{[^}]*\})?", "X");
        candidate = Regex.Replace(candidate, @"\\(.)", "$1");                  // unescape (\+ → +, \- → -)
        candidate = Regex.Replace(candidate, @"[\^\$\?\*\+\(\)]", "");
        return candidate.Length > 0 ? candidate : token.ToUpperInvariant();
    }

    /// Strip characters the token def cannot accept; collapse whitespace.
    public static string Sanitize(string text, string? def)
    {
        var cleaned = Regex.Replace(text, @"[^\w /&\+\-]", " ");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        if (def is null) return cleaned;
        var rx = new Regex("^(?:" + def + ")$", RegexOptions.CultureInvariant);
        if (rx.IsMatch(cleaned)) return cleaned;
        var upper = cleaned.ToUpperInvariant();
        return rx.IsMatch(upper) ? upper : cleaned;
    }
}
```

In `SentinelAddin/Workflow/AutoFixExecution.cs`: delete the `BuildCompliantName`, `IsLastFreeTextToken`, `DefaultFor` and `Sanitize` members (from the `// ---------------- Name synthesis ----------------` comment down to just before `Deduplicate`), and change the two callers:
- in `Suggest`: `return rule is null || rule.Tokens.Count == 0 ? null : NameSynth.BuildCompliantName(currentName, rule, App.Engine?.Ruleset.Org);`
- in `Run`: `? NameSynth.BuildCompliantName(oldName, rule, App.Engine?.Ruleset.Org)`.
Remove the now-unused `using System.Text;` if the compiler flags it.

- [ ] **Step 4: Create `NamingProposer`**

Create `SentinelAddin/Standards/NamingProposer.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.Workflow;

namespace Sentinel.Standards;

public enum NameVerdict { Conforming, Proposed, NeedsHuman, Blocked }

public sealed class NamingContext
{
    public string Category = "";
    public string FamilyName = "";
    public bool IsSystem;
    public double? WidthMm;                 // measured thickness (walls); null when the category has none
    public double? HeightMm;
    public ISet<string> ExistingNamesInFamily = new HashSet<string>(StringComparer.Ordinal);
    public ISet<string> SiblingProposals = new HashSet<string>(StringComparer.Ordinal); // other rows' proposals
}

public sealed class NameProposal
{
    public string? Name;
    public NameVerdict Verdict;
    public List<string> Notes = new();
}

/// <summary>
/// Recovery-only name proposals. A token is emitted only when the name (or, for size, the measured width)
/// carries it — enum tokens are NEVER defaulted, a non-conforming result is NEVER shown as a proposal, and a
/// collision is BLOCKED, never suffixed. Revit-free; the office code comes in as `org`.
/// </summary>
public static class NamingProposer
{
    private static readonly string[] NoiseWords = { "WALL", "FLOOR", "CEILING", "ROOF", "DOOR", "WINDOW" };
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ARCH"] = "ARC", ["EXTERNAL"] = "EXT", ["INTERNAL"] = "INT", ["FOUNDATION"] = "FND",
    };
    private static readonly Regex EnumDef = new(@"^[A-Z0-9]+(\|[A-Z0-9]+)*$", RegexOptions.CultureInvariant);

    public static NameProposal Propose(string current, Rule rule, string? org, NamingContext ctx)
    {
        var p = new NameProposal();
        current = (current ?? "").Trim();
        if (rule.Tokens.Count == 0) return Fail(p, "rule has no token schema");
        if (RuleRegex.NeedsOrg(rule) && string.IsNullOrWhiteSpace(org)) return Fail(p, "ruleset has no org code");
        var rx = RuleRegex.For(rule, org);
        if (rx.IsMatch(current)) { p.Name = current; p.Verdict = NameVerdict.Conforming; return p; }

        string? candidate = rule.Target == RuleTarget.Family
            ? NameSynth.BuildCompliantName(current, rule, org)
            : Recover(current, rule, org, ctx, p);
        if (candidate == null) return p;                              // Recover already explained
        if (!rx.IsMatch(candidate)) return Fail(p, $"recovered '{candidate}' does not match the schema");
        p.Name = candidate;
        if (candidate == current) { p.Verdict = NameVerdict.Conforming; return p; }
        if (ctx.ExistingNamesInFamily.Contains(candidate) || ctx.SiblingProposals.Contains(candidate))
        {
            p.Verdict = NameVerdict.Blocked;
            p.Notes.Add($"duplicate of {candidate} — merge is a human decision");
            return p;
        }
        p.Verdict = NameVerdict.Proposed;
        return p;
    }

    private static NameProposal Fail(NameProposal p, string note) { p.Verdict = NameVerdict.NeedsHuman; p.Notes.Add(note); return p; }

    // ---- type rules: recover tokens from the name + measured size ----
    private static string? Recover(string current, Rule rule, string? org, NamingContext ctx, NameProposal p)
    {
        var norm = Normalize(current);
        var o = (org ?? "").Trim();
        var segments = norm.Split(new[] { rule.Separator }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim()).Where(s => s.Length > 0)
            .Where(s => !s.Equals(o, StringComparison.OrdinalIgnoreCase) && !NoiseWords.Contains(s.ToUpperInvariant()))
            .ToList();
        var values = new Dictionary<string, string>();
        var freeText = new List<string>();

        // Pass 1: literal / enum / size tokens consume their segment; nothing is defaulted.
        foreach (var token in rule.Tokens)
        {
            rule.TokenDefs.TryGetValue(token, out var rawDef);
            var def = rawDef ?? "";
            if (def == RuleRegex.OrgPlaceholder) { values[token] = o; continue; }
            if (token.Equals("SIZE", StringComparison.OrdinalIgnoreCase))
            {
                var size = RecoverSize(norm, def, ctx, segments, p);
                if (size == null) return null;
                values[token] = size; continue;
            }
            if (EnumDef.IsMatch(def))
            {
                var allowed = def.Split('|');
                var hit = segments.FirstOrDefault(s => allowed.Contains(Canon(s), StringComparer.OrdinalIgnoreCase));
                if (hit == null) { Fail(p, $"no {token} in name (expected one of {def})"); return null; }
                values[token] = allowed.First(a => a.Equals(Canon(hit), StringComparison.OrdinalIgnoreCase));
                segments.Remove(hit); continue;
            }
            freeText.Add(token);
        }
        // Pass 2: free-text tokens take the leftovers, in order, one segment each.
        if (segments.Count != freeText.Count)
        {
            Fail(p, freeText.Count == 0
                ? $"leftover text '{string.Join(" ", segments)}' has no token to go to"
                : $"cannot tell {string.Join("/", freeText)} from the leftover '{string.Join(" | ", segments)}'");
            return null;
        }
        for (int i = 0; i < freeText.Count; i++) values[freeText[i]] = segments[i].ToUpperInvariant();
        return string.Join(rule.Separator, rule.Tokens.Select(t => values[t]));
    }

    private static string Canon(string segment) => Aliases.TryGetValue(segment, out var a) ? a : segment.ToUpperInvariant();

    private static string? RecoverSize(string norm, string def, NamingContext ctx, List<string> segments, NameProposal p)
    {
        var isSection = def.Contains(" x ");
        string? seg = null;
        string? value = null;
        if (isSection)
        {
            // Nominal size lives in the NAME only (audit §3) — the Width/Height parameters are never used.
            if (!TypeNameParse.TrySection(norm, out var w, out var h)) { Fail(p, "no W x H in name"); return null; }
            value = $"{Mm(w)} x {Mm(h)} mm";
            seg = segments.FirstOrDefault(s => Regex.IsMatch(s, @"\d+(\.\d+)?\s*x\s*\d+(\.\d+)?\s*mm", RegexOptions.IgnoreCase));
        }
        else
        {
            var fromName = TypeNameParse.ThicknessMm(norm);
            double? named = fromName == double.MaxValue ? null : fromName;
            if (named != null && ctx.WidthMm != null && Math.Abs(named.Value - ctx.WidthMm.Value) > 0.5)
            { Fail(p, $"name says {Mm(named.Value)} mm, Width is {Mm(ctx.WidthMm.Value)} mm"); return null; }
            var v = ctx.WidthMm ?? named;
            if (v == null) { Fail(p, "no size in name and no measured Width"); return null; }
            value = $"{Mm(v.Value)} mm";
            seg = segments.FirstOrDefault(s => Regex.IsMatch(s, @"^\d+(\.\d+)?\s*mm$", RegexOptions.IgnoreCase));
        }
        if (seg != null) segments.Remove(seg);
        return value;
    }

    private static string Mm(double v) => v % 1 == 0 ? ((long)v).ToString(CultureInfo.InvariantCulture) : v.ToString("0.##", CultureInfo.InvariantCulture);

    /// Diacritics folded, units and separators normalised. Case is left alone (free text is uppercased later).
    internal static string Normalize(string s)
    {
        var sb = new StringBuilder();
        foreach (var ch in s.Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
        var t = sb.ToString().Normalize(NormalizationForm.FormC);
        t = Regex.Replace(t, @"(\d+(?:\.\d+)?)\s*_?\s*cm\b", m => Mm(double.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) * 10) + " mm", RegexOptions.IgnoreCase);
        t = Regex.Replace(t, @"(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)", "$1 x $2");
        t = Regex.Replace(t, @"(\d+(?:\.\d+)?)\s*_?\s*mm\b", "$1 mm", RegexOptions.IgnoreCase);
        return Regex.Replace(t, @"[ ]{2,}", " ").Trim();
    }
}
```

- [ ] **Step 5: Run the check and the build**

Run: `dotnet run --project tools/naming-check` — expected `41/41 checks pass` (17 + 20 proposer + 4 sweep) with the tally line printed. If a proposer case fails, fix the proposer — not the expectation — unless the expectation contradicts the spec.
Run both `dotnet build` targets — succeed.

- [ ] **Step 6: Commit**

```bash
git add SentinelAddin/Workflow/NameSynth.cs SentinelAddin/Workflow/AutoFixExecution.cs SentinelAddin/Standards/NamingProposer.cs tools/naming-check
git commit -m "feat(naming): NamingProposer — recovery only, org as data, collisions block; NameSynth extracted Revit-free" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: `ScanTypes` + `NamingManagerService` (rows with context, audited apply) + no panel Fix for types

**Files:**
- Modify: `SentinelAddin/Engine/RuleEngineHost.cs` (`ScanFull` switch + new `ScanTypes`)
- Create: `SentinelAddin/Workflow/NamingManagerService.cs`
- Modify: `SentinelAddin/Coordination/GovernedNotify.cs` (add `NamingRenamed`)
- Modify: `SentinelAddin/UI/SentinelPanelViewModel.cs` (`ComputeCanFix`)

**Interfaces:**
- Consumes: `NamingProposer`, `NamingContext`, `NameVerdict` (Task 7); `RuleRegex.For` (Task 1); `RequestStore`, `ChangeRequest`, `AuditEntry`, `RequestManager.UpdateSnapshot`, `RoiTracker.Log` (existing).
- Produces: `NamingRow{ElementId, IsType, RuleId, Category, FamilyName, Current, Proposed, Verdict, Note, Instances, Ticked}`; `NamingManagerService.BuildRows(Document, Ruleset) : List<NamingRow>`; `NamingManagerService.Apply(Document, IEnumerable<NamingRow>, Ruleset, string? projectKey) : List<(NamingRow Row, bool Ok, string Message)>`; `GovernedNotify.NamingRenamed(IEnumerable<object> rows, string actor, string? projectKey)`.

- [ ] **Step 1: Teach the engine to scan types**

In `SentinelAddin/Engine/RuleEngineHost.cs`, in `ScanFull`'s switch add:

```csharp
                case RuleTarget.Type:     checkedCount += ScanTypes(doc, rule, violations); break;
```

and after `ScanFamilies` add:

```csharp
    // Type names (system families included). Locale-safe category scope like ScanFamilies. Not wired to
    // the DMU delta — scan-on-demand and the Naming Manager are the path for types.
    private int ScanTypes(Document doc, Rule rule, List<Violation> sink)
    {
        int n = 0;
        foreach (ElementType et in new FilteredElementCollector(doc).WhereElementIsElementType().Cast<ElementType>())
        {
            var cat = et.Category;
            if (cat is null) continue;
            if (rule.Categories.Count > 0 && !rule.Categories.Any(cat.MatchesCategoryKey)) continue;
            n++;
            CheckName(et, et.Name, rule, sink);
        }
        return n;
    }
```

- [ ] **Step 2: No per-row panel Fix for type violations**

In `SentinelAddin/UI/SentinelPanelViewModel.cs` `ComputeCanFix`, change the last line to:

```csharp
        // Type renames go through the Naming Manager: the one-row Fix would suffix on a collision.
        return rule is not null && rule.Tokens.Count > 0 && rule.Target != RuleTarget.Type;
```

- [ ] **Step 3: The ledger post**

In `SentinelAddin/Coordination/GovernedNotify.cs` add after `DeliveryGate`:

```csharp
        /// <summary>Record a Naming Manager batch in the governed audit trail (fire-and-forget).</summary>
        public static void NamingRenamed(IEnumerable<object> rows, string actor, string? projectKey = null)
        {
            var list = rows.ToList();
            Post("/audit", new
            {
                entity_type = "naming",
                actor,
                action = $"Naming Manager renamed {list.Count} item(s) in Revit",
                new_value = new { rows = list, source = "revit", at = DateTime.UtcNow.ToString("o") },
            }, projectKey);
        }
```

(add `using System.Linq;` to the file's usings).

- [ ] **Step 4: The service**

Create `SentinelAddin/Workflow/NamingManagerService.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.Standards;

namespace Sentinel.Workflow;

public sealed class NamingRow
{
    public long ElementId;
    public bool IsType;                 // ElementType (types) vs Family
    public string RuleId = "";
    public string Category = "";
    public string FamilyName = "";
    public string Current = "";
    public string Proposed = "";        // editable; pre-filled from the proposer when it had a name
    public NameVerdict Verdict;
    public string Note = "";
    public int Instances;
    public bool Ticked;
}

/// <summary>Revit half of the Naming Manager: rows with the context the proposer needs, and the audited
/// rename. Both run on the API thread (App.Events.Enqueue).</summary>
public static class NamingManagerService
{
    private const double FeetToMm = 304.8;

    public static List<NamingRow> BuildRows(Document doc, Ruleset rs)
    {
        var rows = new List<NamingRow>();
        var org = rs.Org;

        // Instance counts per type id, one pass.
        var instancesOfType = new Dictionary<long, int>();
        foreach (var e in new FilteredElementCollector(doc).WhereElementIsNotElementType())
        {
            var tid = e.GetTypeId();
            if (tid == ElementId.InvalidElementId) continue;
            instancesOfType[tid.IdValue()] = instancesOfType.TryGetValue(tid.IdValue(), out var n) ? n + 1 : 1;
        }

        foreach (var rule in rs.Rules.Where(r => r.Target is RuleTarget.Type or RuleTarget.Family && r.Tokens.Count > 0))
        {
            if (rule.Target == RuleTarget.Type)
            {
                var types = new FilteredElementCollector(doc).WhereElementIsElementType().Cast<ElementType>()
                    .Where(et => et.Category is { } c && (rule.Categories.Count == 0 || rule.Categories.Any(c.MatchesCategoryKey)))
                    .ToList();
                foreach (var fam in types.GroupBy(et => et.Category!.Id.IdValue() + "|" + SafeFamilyName(et)))
                {
                    var existing = new HashSet<string>(fam.Select(et => et.Name), StringComparer.Ordinal);
                    var siblings = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var et in fam)
                    {
                        var ctx = new NamingContext
                        {
                            Category = et.Category!.Name, FamilyName = SafeFamilyName(et), IsSystem = et is not FamilySymbol,
                            WidthMm = et is WallType wt ? wt.Width * FeetToMm : null,
                            ExistingNamesInFamily = existing, SiblingProposals = siblings,
                        };
                        var p = NamingProposer.Propose(et.Name, rule, org, ctx);
                        if (p.Verdict == NameVerdict.Proposed) siblings.Add(p.Name!);
                        rows.Add(new NamingRow
                        {
                            ElementId = et.Id.IdValue(), IsType = true, RuleId = rule.Id, Category = ctx.Category, FamilyName = ctx.FamilyName,
                            Current = et.Name, Proposed = p.Verdict is NameVerdict.Proposed or NameVerdict.Blocked ? p.Name ?? "" : "",
                            Verdict = p.Verdict, Note = string.Join("; ", p.Notes),
                            Instances = instancesOfType.TryGetValue(et.Id.IdValue(), out var n) ? n : 0,
                        });
                    }
                }
            }
            else
            {
                var fams = new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>()
                    .Where(f => f.FamilyCategory is { CategoryType: CategoryType.Model } c && (rule.Categories.Count == 0 || rule.Categories.Any(c.MatchesCategoryKey)))
                    .ToList();
                foreach (var byCat in fams.GroupBy(f => f.FamilyCategory!.Id.IdValue()))
                {
                    var existing = new HashSet<string>(byCat.Select(f => f.Name), StringComparer.Ordinal);
                    var siblings = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var f in byCat)
                    {
                        var ctx = new NamingContext { Category = f.FamilyCategory!.Name, FamilyName = f.Name, ExistingNamesInFamily = existing, SiblingProposals = siblings };
                        var p = NamingProposer.Propose(f.Name, rule, org, ctx);
                        if (p.Verdict == NameVerdict.Proposed) siblings.Add(p.Name!);
                        rows.Add(new NamingRow
                        {
                            ElementId = f.Id.IdValue(), IsType = false, RuleId = rule.Id, Category = ctx.Category, FamilyName = f.Name,
                            Current = f.Name, Proposed = p.Verdict is NameVerdict.Proposed or NameVerdict.Blocked ? p.Name ?? "" : "",
                            Verdict = p.Verdict, Note = string.Join("; ", p.Notes),
                            Instances = f.GetFamilySymbolIds().Sum(id => instancesOfType.TryGetValue(id.IdValue(), out var n) ? n : 0),
                        });
                    }
                }
            }
        }
        return rows;
    }

    private static string SafeFamilyName(ElementType t) { try { return t.FamilyName ?? ""; } catch { return ""; } }

    /// <summary>ONE transaction; per row: re-validate against the rule, re-check uniqueness LIVE, rename;
    /// each success audited (request store + ROI), then one ledger post for the batch.</summary>
    public static List<(NamingRow Row, bool Ok, string Message)> Apply(Document doc, IEnumerable<NamingRow> rows, Ruleset rs, string? projectKey)
    {
        var results = new List<(NamingRow, bool, string)>();
        var user = doc.Application.Username;
        var list = rows.ToList();
        using var t = new Transaction(doc, $"Sentinel: Naming Manager ({list.Count})");
        t.Start();
        foreach (var row in list)
        {
            var proposed = (row.Proposed ?? "").Trim();
            var rule = rs.Rules.FirstOrDefault(r => r.Id == row.RuleId);
            if (rule == null) { results.Add((row, false, "refused: rule no longer in the ruleset")); continue; }
            if (proposed.Length == 0) { results.Add((row, false, "refused: no name entered")); continue; }
            if (!RuleRegex.For(rule, rs.Org).IsMatch(proposed)) { results.Add((row, false, "refused: does not match the schema")); continue; }
            var el = doc.GetElement(row.ElementId.ToElementId());
            if (el == null) { results.Add((row, false, "element no longer exists")); continue; }
            if (proposed == el.Name) { results.Add((row, true, "already named so")); continue; }
            if (TakenLive(doc, el, proposed)) { results.Add((row, false, $"refused: '{proposed}' is now taken in this family")); continue; }
            try
            {
                el.Name = proposed;
                RequestManager.UpdateSnapshot(doc, row.ElementId, proposed);
                RequestStore.Upsert(doc, new ChangeRequest
                {
                    RuleId = row.RuleId, ElementId = row.ElementId, ElementCategory = row.Category,
                    OldValue = row.Current, NewValue = proposed, RequestedBy = user,
                    Status = RequestStatus.Approved, VerdictBy = user, VerdictAt = DateTimeOffset.Now, VerdictNote = "Naming Manager",
                }, new AuditEntry { Actor = user, Action = "naming.renamed", Detail = $"{row.RuleId}: '{row.Current}' -> '{proposed}'" });
                results.Add((row, true, "renamed"));
            }
            catch (Autodesk.Revit.Exceptions.ApplicationException ex) { results.Add((row, false, "Revit refused: " + ex.Message)); }
        }
        if (t.Commit() != TransactionStatus.Committed)
            return results.Select(r => r.Item2 ? (r.Item1, false, "transaction did not commit — nothing was renamed") : r).ToList();

        var done = results.Where(r => r.Item2 && r.Item3 == "renamed").ToList();
        foreach (var (row, _, _) in done) RoiTracker.Log("naming", $"{row.RuleId}: '{row.Current}' -> '{row.Proposed}'");
        if (done.Count > 0)
            GovernedNotify.NamingRenamed(done.Select(r => (object)new { id = r.Item1.ElementId, from = r.Item1.Current, to = r.Item1.Proposed, rule = r.Item1.RuleId }), user, projectKey);
        return results;
    }

    // Uniqueness at write time, within the same family (types) or category (families).
    private static bool TakenLive(Document doc, Element el, string name)
    {
        if (el is ElementType et)
            return new FilteredElementCollector(doc).WhereElementIsElementType().Cast<ElementType>()
                .Any(x => x.Id != et.Id && x.Category?.Id == et.Category?.Id && SafeFamilyName(x) == SafeFamilyName(et) && x.Name == name);
        if (el is Family f)
            return new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>()
                .Any(x => x.Id != f.Id && x.FamilyCategory?.Id == f.FamilyCategory?.Id && x.Name == name);
        return false;
    }
}
```

- [ ] **Step 5: Build both years and commit**

Run both `dotnet build` targets — succeed. Run `dotnet run --project tools/naming-check` — still `41/41`.

```bash
git add SentinelAddin/Engine/RuleEngineHost.cs SentinelAddin/Workflow/NamingManagerService.cs SentinelAddin/Coordination/GovernedNotify.cs SentinelAddin/UI/SentinelPanelViewModel.cs
git commit -m "feat(naming): type scanning + NamingManagerService — rows with measured width and family context, audited one-transaction rename" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 9: `NamingManagerWindow` + `NamingManagerCommand` + ribbon button

**Files:**
- Create: `SentinelAddin/UI/NamingManagerWindow.cs`
- Create: `SentinelAddin/Commands.NamingManager.cs`
- Modify: `SentinelAddin/App.cs` (one `Push` in the Validate panel)

**Interfaces:**
- Consumes: `NamingRow`, `NamingManagerService.BuildRows/Apply` (Task 8); `NameVerdict` (Task 7); `App.Events`, `App.Engine`, `DialogOwner.Attach`, `SettingsManager.WebProjectKeyFor` (existing).
- Produces: `NamingManagerWindow(List<NamingRow>)` with events `RenameRequested(List<NamingRow>)`, `SelectRequested(NamingRow)`, `RescanRequested()` and methods `SetRows(List<NamingRow>)`, `SetStatus(string)`, `SetBusy(bool)`.

- [ ] **Step 1: The window**

Create `SentinelAddin/UI/NamingManagerWindow.cs`:

```csharp
// Naming Manager: every family/type in scope of a Family/Type rule, current name → proposed name, the
// proposer's verdict with its reason, filters, and Rename ticked. Proposals are suggestions — a blank
// proposal means "needs a human", a Blocked row is a duplicate to merge, never to suffix. Modeless,
// code-only WPF. Never touches the Revit API — it raises events.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Standards;
using Sentinel.Workflow;

namespace Sentinel.UI;

public sealed class NamingManagerWindow : Window
{
    public event Action<List<NamingRow>>? RenameRequested;
    public event Action<NamingRow>? SelectRequested;
    public event Action? RescanRequested;

    private List<NamingRow> _rows;
    private readonly StackPanel _list = new();
    private readonly ComboBox _rule = new() { Width = 90, Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _category = new() { Width = 130, Margin = new Thickness(0, 0, 6, 0) };
    private readonly ComboBox _verdict = new() { Width = 120, Margin = new Thickness(0, 0, 6, 0) };
    private readonly TextBox _search = new() { Width = 160, Margin = new Thickness(0, 0, 6, 0) };
    private readonly TextBlock _status = new() { Foreground = Brushes.Gray, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private readonly List<(CheckBox Box, TextBox Value, NamingRow Row)> _visible = new();
    private readonly List<Button> _actions = new();

    public NamingManagerWindow(List<NamingRow> rows)
    {
        _rows = rows;
        Title = "Sentinel — Naming Manager";
        Width = 980; Height = 640; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };
        var filters = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
        filters.Children.Add(new TextBlock { Text = "Rule", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_rule);
        filters.Children.Add(new TextBlock { Text = "Category", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_category);
        filters.Children.Add(new TextBlock { Text = "Verdict", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_verdict);
        filters.Children.Add(new TextBlock { Text = "Search", VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) });
        filters.Children.Add(_search);
        foreach (var cb in new[] { _rule, _category, _verdict }) cb.SelectionChanged += (_, _) => Render();
        _search.TextChanged += (_, _) => Render();
        DockPanel.SetDock(filters, Dock.Top);
        root.Children.Add(filters);

        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(Btn("Tick all proposed", () => { foreach (var v in _visible.Where(v => v.Row.Verdict == NameVerdict.Proposed)) v.Box.IsChecked = true; }));
        buttons.Children.Add(Btn("Untick all", () => { foreach (var v in _visible) v.Box.IsChecked = false; }));
        buttons.Children.Add(Btn("Select instances", () => { var v = _visible.FirstOrDefault(x => x.Box.IsChecked == true); if (v.Row != null) SelectRequested?.Invoke(v.Row); }));
        buttons.Children.Add(Btn("Rescan", () => RescanRequested?.Invoke()));
        buttons.Children.Add(Btn("Rename ticked", Rename, bold: true));
        foot.Children.Add(buttons);
        foot.Children.Add(_status);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        root.Children.Add(new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
        FillFilters();
        Render();
    }

    private Button Btn(string text, Action click, bool bold = false)
    {
        var b = new Button { Content = text, Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(6, 0, 0, 0), FontWeight = bold ? FontWeights.Bold : FontWeights.Normal };
        b.Click += (_, _) => click();
        _actions.Add(b);
        return b;
    }

    private void FillFilters()
    {
        void Fill(ComboBox cb, IEnumerable<string> items)
        {
            var keep = cb.SelectedItem as string;
            cb.ItemsSource = new[] { "(all)" }.Concat(items.Distinct().OrderBy(s => s)).ToList();
            cb.SelectedItem = keep != null && ((List<string>)cb.ItemsSource).Contains(keep) ? keep : "(all)";
        }
        Fill(_rule, _rows.Select(r => r.RuleId));
        Fill(_category, _rows.Select(r => r.Category));
        Fill(_verdict, Enum.GetNames(typeof(NameVerdict)));
    }

    private void Render()
    {
        CommitEdits();
        _visible.Clear();
        _list.Children.Clear();
        string? Sel(ComboBox cb) => cb.SelectedItem as string is { } s && s != "(all)" ? s : null;
        var rule = Sel(_rule); var cat = Sel(_category); var verdict = Sel(_verdict); var q = _search.Text.Trim();
        var shown = _rows.Where(r => (rule == null || r.RuleId == rule) && (cat == null || r.Category == cat)
                                     && (verdict == null || r.Verdict.ToString() == verdict)
                                     && (q.Length == 0 || r.Current.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0 || r.Proposed.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0))
                         .OrderBy(r => r.Verdict == NameVerdict.Conforming).ThenBy(r => r.Category).ThenBy(r => r.Current).ToList();
        foreach (var row in shown) _list.Children.Add(MakeRow(row));
        var counts = _rows.GroupBy(r => r.Verdict).ToDictionary(g => g.Key, g => g.Count());
        int C(NameVerdict v) => counts.TryGetValue(v, out var n) ? n : 0;
        SetStatus($"{shown.Count} shown of {_rows.Count} · conforming {C(NameVerdict.Conforming)} · proposed {C(NameVerdict.Proposed)} · needs human {C(NameVerdict.NeedsHuman)} · blocked {C(NameVerdict.Blocked)}");
    }

    private UIElement MakeRow(NamingRow row)
    {
        var grid = new Grid { Margin = new Thickness(0, 2, 0, 2) };
        foreach (var w in new[] { 24.0, 200.0, 260.0, 260.0, 0.0, 60.0 })
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });
        var editable = row.Verdict is NameVerdict.Proposed or NameVerdict.NeedsHuman;
        var box = new CheckBox { IsChecked = row.Ticked, IsEnabled = editable, VerticalAlignment = VerticalAlignment.Center };
        Grid.SetColumn(box, 0); grid.Children.Add(box);
        var meta = new TextBlock { Text = $"{row.Category}\n{row.FamilyName}", Foreground = Brushes.Gray, FontSize = 11, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
        Grid.SetColumn(meta, 1); grid.Children.Add(meta);
        var cur = new TextBlock { Text = row.Current, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(4, 0, 8, 0) };
        cur.ToolTip = row.Current;
        Grid.SetColumn(cur, 2); grid.Children.Add(cur);
        var val = new TextBox { Text = row.Proposed, IsEnabled = editable, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };
        Grid.SetColumn(val, 3); grid.Children.Add(val);
        var (text, brush) = row.Verdict switch
        {
            NameVerdict.Conforming => ("✓ conforming", Brushes.LightGreen),
            NameVerdict.Proposed => ("proposed", Brushes.DodgerBlue),
            NameVerdict.NeedsHuman => ("needs a human — " + row.Note, Brushes.Orange),
            _ => ("BLOCKED — " + row.Note, Brushes.IndianRed),
        };
        var v = new TextBlock { Text = text, Foreground = brush, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
        v.ToolTip = row.Note.Length == 0 ? text : row.Note;
        Grid.SetColumn(v, 4); grid.Children.Add(v);
        var inst = new TextBlock { Text = row.Instances.ToString(), Foreground = Brushes.Gray, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
        inst.ToolTip = "instances in the model";
        Grid.SetColumn(inst, 5); grid.Children.Add(inst);
        _visible.Add((box, val, row));
        return grid;
    }

    private void CommitEdits()
    {
        foreach (var v in _visible) { v.Row.Ticked = v.Box.IsChecked == true; v.Row.Proposed = v.Value.Text; }
    }

    private void Rename()
    {
        CommitEdits();
        var ticked = _rows.Where(r => r.Ticked && r.Verdict is NameVerdict.Proposed or NameVerdict.NeedsHuman && r.Proposed.Trim().Length > 0).ToList();
        if (ticked.Count == 0) { SetStatus("Tick at least one row with a name to rename."); return; }
        RenameRequested?.Invoke(ticked);
    }

    public void SetRows(List<NamingRow> rows) => Dispatcher.Invoke(() => { _rows = rows; FillFilters(); Render(); });
    public void SetStatus(string text) => Dispatcher.Invoke(() => _status.Text = text);
    public void SetBusy(bool busy) => Dispatcher.Invoke(() => { foreach (var b in _actions) b.IsEnabled = !busy; });
}
```

- [ ] **Step 2: The command**

Create `SentinelAddin/Commands.NamingManager.cs`:

```csharp
using System;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Engine;
using Sentinel.UI;
using Sentinel.Workflow;

namespace Sentinel.Commands;

/// <summary>Naming Manager: scan families/types against the Family/Type rules, review proposals, rename the
/// ticked rows. Scan + rename run on the event hub (API thread); the window only raises events.</summary>
[Transaction(TransactionMode.Manual)]
public sealed class NamingManagerCommand : IExternalCommand
{
    private static bool _open;

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;
        if (_open) { TaskDialog.Show("Sentinel — Naming Manager", "The Naming Manager is already open."); return Result.Cancelled; }
        if (App.Engine is null || App.Events is null) { TaskDialog.Show("Sentinel — Naming Manager", "Sentinel's rule engine is not running — restart Revit."); return Result.Failed; }

        var rs = App.Engine.Ruleset;
        if (!rs.Rules.Any(r => r.Target is RuleTarget.Type or RuleTarget.Family))
        {
            TaskDialog.Show("Sentinel — Naming Manager", "The effective ruleset has no family or type naming rule (targets `family` / `type`). Add one to the ruleset first.");
            return Result.Succeeded;
        }
        if (rs.Rules.Any(r => RuleRegex.NeedsOrg(r)) && string.IsNullOrWhiteSpace(rs.Org))
            TaskDialog.Show("Sentinel — Naming Manager", "The ruleset has no office code (\"org\") — every ORG-bearing rule will read 'needs a human' until it is set.");

        var projectKey = SettingsManager.WebProjectKeyFor(doc);
        var rows = NamingManagerService.BuildRows(doc, rs);           // read-only, on this command's API thread
        var window = new NamingManagerWindow(rows);
        DialogOwner.Attach(window, c);
        _open = true;
        window.Closed += (_, _) => _open = false;

        window.RescanRequested += () =>
        {
            window.SetBusy(true);
            App.Events.Enqueue(ua =>
            {
                var d = ua.ActiveUIDocument?.Document; if (d == null) return;
                window.SetRows(NamingManagerService.BuildRows(d, App.Engine!.Ruleset));
                window.SetBusy(false);
            });
        };
        window.SelectRequested += row => App.Events.Enqueue(ua =>
        {
            var d = ua.ActiveUIDocument; if (d == null) return;
            var typeIds = row.IsType
                ? new[] { row.ElementId.ToElementId() }
                : (d.Document.GetElement(row.ElementId.ToElementId()) as Family)?.GetFamilySymbolIds().ToArray() ?? Array.Empty<ElementId>();
            var ids = new FilteredElementCollector(d.Document).WhereElementIsNotElementType().Where(e => typeIds.Contains(e.GetTypeId())).Select(e => e.Id).ToList();
            if (ids.Count == 0) { window.SetStatus("No instances of that type in the model."); return; }
            d.Selection.SetElementIds(ids); d.ShowElements(ids);
        });
        window.RenameRequested += ticked =>
        {
            window.SetBusy(true); window.SetStatus($"Renaming {ticked.Count} row(s)…");
            App.Events.Enqueue(ua =>
            {
                var d = ua.ActiveUIDocument?.Document; if (d == null) return;
                var results = NamingManagerService.Apply(d, ticked, App.Engine!.Ruleset, projectKey);
                var ok = results.Count(r => r.Ok);
                var failed = results.Where(r => !r.Ok).Select(r => $"{r.Row.Current}: {r.Message}").ToList();
                window.SetRows(NamingManagerService.BuildRows(d, App.Engine.Ruleset));
                window.SetStatus($"Renamed {ok}/{results.Count}." + (failed.Count > 0 ? " Not renamed — " + string.Join(" · ", failed.Take(6)) + (failed.Count > 6 ? " · …" : "") : ""));
                window.SetBusy(false);
            });
        };
        window.Show();
        return Result.Succeeded;
    }
}
```

- [ ] **Step 3: The ribbon button**

In `SentinelAddin/App.cs`, in the Validate panel block, after the `Sentinel_MepVoids` `Push(...)` add:

```csharp
        Push(va, "Sentinel_NamingManager", "Naming\nManager", "Sentinel.Commands.NamingManagerCommand", "family",
            "Review family and type names against the office naming rules: recovered proposals, duplicates blocked, rename only what you tick. Everything is audited.");
```

- [ ] **Step 4: Build both years and commit**

Run both `dotnet build` targets — succeed.

```bash
git add SentinelAddin/UI/NamingManagerWindow.cs SentinelAddin/Commands.NamingManager.cs SentinelAddin/App.cs
git commit -m "feat(naming): Naming Manager window + ribbon — review-before-rename for families and types" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: CI check steps, user guide, live verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `SENTINEL-USER-GUIDE.md`

- [ ] **Step 1: CI runs the two checks once per push**

In `.github/workflows/ci.yml`, in the `addin` job after the `dotnet build` step, add:

```yaml
      - name: Revit-free checks (fix-in-place + naming)
        if: matrix.revit == 2026
        run: |
          dotnet run --project tools/fixplace-check
          dotnet run --project tools/naming-check
```

- [ ] **Step 2: Two guide entries**

In `SENTINEL-USER-GUIDE.md` under `## Ribbon — Coordination panel` add:

```markdown
- **BCF Issues → Fix in Revit** — for an issue the referee raised (`IDS: … — … (N failing)`): the failing elements resolve to rows (instance, or TYPE with its blast radius), you enter values, **Check** sends them to the referee *before* anything is written, **Apply ticked** writes in one transaction, a re-check judges the real model, and the issue gets an evidence comment and `Resolved` only when every element passes. Bridge down → *applied, NOT verified*; nothing on the issue changes.
```

and under `## Ribbon — Quality panel` add:

```markdown
- **Naming Manager** — every family/type in scope of a `family`/`type` rule: current → proposed name, why (conforming / proposed / needs a human / BLOCKED duplicate), instance count. Proposals are recovered from the name and the measured width, never guessed; duplicates are blocked, never suffixed. Rename only the ticked rows; each rename lands in the request store, ROI and the ledger. The office code comes from the ruleset's `org`.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml SENTINEL-USER-GUIDE.md
git commit -m "ci+docs: run the Revit-free checks; guide entries for Fix in Revit and the Naming Manager" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4 (user, live at Revit — record outcomes in `.superpowers/sdd/progress.md`):**

1. Deploy (`dotnet build SentinelAddin -c Release -p:RevitVersion=<your version>` with Revit closed), start the bridge (`npm run bcf:serve`), open the demo model.
2. Make a wall miss `FireRating` → **Governed Publish** → expect a rejection with a topic `IDS: … — Pset_WallCommon.FireRating (N failing)`.
3. **BCF Issues** → select it → **Fix in Revit** → rows show scope honestly (a type parameter says `TYPE … k other(s) … change too`).
4. Enter `junk` → **Check** → ✗ with the referee's reason (if the IDS has a value/pattern) or ✓ (if only `required`); enter `REI60` → **Check** → ✓ · `audit <id>`.
5. **Apply ticked** → status `Applied n/n … Re-checking` → then `✓ n/n pass — evidence posted and the issue is now Resolved`. On the web Issues panel: the comment with the audit id, status Resolved; `GET /receipt/<key>/<auditId>` resolves.
6. Stop the bridge → Apply another fix → expect `Applied. NOT verified — … the issue was not touched.` Start the bridge → **Re-check** → Resolved.
7. **Naming Manager** on the pilot template: the audit's duplicates appear BLOCKED, the `Ê` type proposes `…EXT…`, a name/Width mismatch reads *needs a human*; tick two Proposed rows → **Rename ticked** → only those two change; **Change Requests** shows the rows; the web timeline shows `Naming Manager renamed 2 item(s)`.
8. Governed Publish once more on an unchanged model → verdict identical to before Task 2 (the `PsetMap` refactor changed nothing for the pilot).

---

## Self-review (done while writing)

- **Spec coverage:** contracts (IdsIssueRef, PsetMap, FixRow, Patch, Fold) → Tasks 2–3; flow steps 1–6 → Tasks 5–6; client additions → Task 4; UI honesty states → Task 6 (`SetBanner`/`SetStatus` texts); rules + `{org}` + `RuleRegex` + `ScanTypes` + `CanFix` → Tasks 1, 8; proposer algorithm steps 1–7 → Task 7; window/apply/ribbon → Tasks 8–9; tests + CI → Tasks 1–4, 7, 10; live verification → Task 10. Out-of-scope list respected (no DMU for types, no CSV, no instance renames, no parameter creation).
- **Placeholders:** none; every code step is complete.
- **Type consistency:** `ProposalResult` is top-level (Task 4) and consumed as such in Task 6; `FixRow.BuiltIn` added in Task 5 before its use; `NameSynth.BuildCompliantName(current, rule, org)` matches its two callers; `NamingManagerService.Apply` returns `(Row, Ok, Message)` tuples as Task 9 reads them; `GovernedNotify.NamingRenamed(IEnumerable<object>, string, string?)` matches Task 8's call.

