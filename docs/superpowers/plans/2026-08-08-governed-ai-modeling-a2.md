# Governed AI Modeling A2 (Revit Add-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The human gate in Revit: a ribbon button fetches proposed changesets, a tick-list shows per-element IDS verdicts, ticked elements are created in ONE transaction, and the result (real ElementIds or rejection) is reported back — completing the propose → adjudicate → human → model → audit thread A1 opened.

**Architecture:** One bridge hardening task (the CAS guard the A1 final review deferred to A2), then four C# units in the add-in's established idioms: a `ChangesetClient` (System.Text.Json DTOs + the GovHttp blocking pattern), a code-only WPF `ChangesetReviewWindow` (GhostReviewWindow's shape, but pre-tick = the referee's verdict, not a heuristic), a `ChangesetExecutor` + `IExternalEventHandler` (GhostBuilder's transaction/threading pattern, plus the ElementId collection GhostBuilder never needed), and a `ReviewChangesetsCommand` wiring them FIFO one-changeset-at-a-time. Build is autonomous; deploy + live run need the user (Revit must be closed to deploy).

**Tech Stack:** C# (LangVersion latest, x64), Revit API via Nice3point NuGet, WPF code-only, System.Text.Json; bridge side Node ESM + vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-07-governed-ai-modeling-design.md` (A2 section) — normative.
- **The referee rule, Revit side:** the add-in executes ONLY elements the human ticked, ONLY after re-fetching the changeset and confirming status `proposed`. A transaction failure rolls back the WHOLE changeset and reports `declined` with the exception note — `partially_applied` only ever means "human unticked some".
- **Honesty in the window:** pre-ticked ⇔ verdict `accepted`. `rejected` rows are tickable (overrule with eyes open — the result records it) but start unticked with the failures visible. `recorded` rows start unticked with "no spec to adjudicate against". A non-zero `adjudication.unattributed` count renders a warning banner.
- **Threading law (quoted from the codebase):** "Revit API writes must NEVER run from Task.Run." All model writes go through the `ExternalEvent` handler; HTTP runs blocking on the calling thread (GovHttp pattern) or in the handler's completion callback — never a Revit API call from a background task.
- **Units:** the changeset contract is millimetres; Revit internal units are feet. `MmToFeet = 1.0 / 304.8` (the module's existing constant), applied ONLY in the executor.
- **Result reporting must confirm:** blocking POST with a retry dialog on failure. The bridge's status is the truth; the add-in never pretends locally.
- C# files follow the module's conventions: `namespace Sentinel.Commands;` / `Sentinel.Coordination` / `Sentinel.UI` / `Sentinel.GhostBuilder`, sealed classes, `#nullable disable` in GhostBuilder-adjacent files, `#if REVIT2022_OR_GREATER` / `#if NET48` gates where the Floor API differs.
- Bridge side: ESM `.mjs`, no new dependencies, baseline **462 tests**.
- Commits: conventional, ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Build gate per C# task:** `dotnet build .\SentinelAddin\Sentinel.csproj -c Release -p:RevitVersion=2026` clean (no DeployToRevit — deploying needs Revit closed and is the user's step in Task 6).

## Existing interfaces consumed (verified verbatim by exploration)

```csharp
// App.cs:247-274 ribbon helpers; className = fully-qualified type string:
static void Push(RibbonPanel panel, string name, string text, string className, string icon, string tooltip)
// Commands pattern (Commands.Datum.cs): [Transaction(TransactionMode.Manual)] sealed class X : IExternalCommand
// BcfConfig.Load() → {ServiceUrl, ProjectId, ModelId, ServiceToken} (Commands.BcfIssues.cs:99-133)
// SettingsManager.WebProjectKeyFor(doc) → project key (falls back to BcfConfig.ProjectId)
// GovernedNotify's GovHttp: HttpClient{Timeout=120s}, Bearer via AuthenticationHeaderValue
// GhostBuilderPlacementEvent (GhostBuilderExternalEvent.cs): IExternalEventHandler with SetRequest + Completed event — the pattern to mirror
// Placement calls: Wall.Create(doc, curve, wallTypeId, levelId, height, offset, false, false);
//   Floor.Create(doc, loops, floorTypeId, levelId) #if REVIT2022_OR_GREATER else doc.Create.NewFloor(arr, ft, level, false);
//   Level.Create(doc, elevFt); Grid.Create(doc, Line.CreateBound(p1, p2))
// MmToFeet = 1.0 / 304.8 (DatumBuilder.cs:19)
// PlacementReport counts only — ElementIds are NOT collected anywhere in GhostBuilder today (executor adds this)
```

```js
// Bridge (A1, merged): GET /changesets/:key?status=proposed · GET /changesets/:key/:id ·
// POST /changesets/:key/:id/result {applied:[{proposal_guid, revit_element_id, revit_unique_id}], rejected:[guid], note, actor}
// changesets-store.mjs wire(): ensureProject, adjudicateProposal, docInsert, docGet, docList, docUpsert, audit
```

## File Structure

| File | Responsibility |
|---|---|
| `WebApp/bridge/cde-store.mjs` (modify) | `docReplaceIfStatus` — the conditional-PATCH CAS primitive. |
| `WebApp/bridge/changesets-store.mjs` (modify) | reportResult/withdraw go through the CAS; 0 rows = re-read + 409. |
| `WebApp/bridge/changesets-store.test.mjs` (extend) | The race guard pinned. |
| `SentinelAddin/Coordination/ChangesetClient.cs` (new) | DTOs + fetch/report HTTP. |
| `SentinelAddin/UI/ChangesetReviewWindow.cs` (new) | The tick-list keyed on verdicts. |
| `SentinelAddin/GhostBuilder/ChangesetExecutor.cs` (new) | mm→ft translation + one-transaction placement + ElementId collection. |
| `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs` (new) | The ExternalEvent handler. |
| `SentinelAddin/Commands.ReviewChangesets.cs` (new) | The command: fetch FIFO → window → execute → report. |
| `SentinelAddin/App.cs` (modify) | Ribbon button on the Coordinate panel. |

---

### Task 1: Bridge CAS guard (the deferred race fix)

**Files:**
- Modify: `WebApp/bridge/cde-store.mjs` (one new export beside the doc* helpers)
- Modify: `WebApp/bridge/changesets-store.mjs`
- Test: `WebApp/bridge/changesets-store.test.mjs` (extend)

**Interfaces:**
- Produces: `docReplaceIfStatus(store, pid, docId, data, expectedStatus) → data | null` (null = the row's `data->>status` was no longer `expectedStatus` — nothing written).
- `reportResult`/`withdrawChangeset` switch from `docUpsert` to it; on null they re-read and throw the existing 409 with the CURRENT status. `wire()` gains `docReplaceIfStatus`.

- [ ] **Step 1: Write the failing tests** — append to `WebApp/bridge/changesets-store.test.mjs`:

```javascript
describe("CAS guard — concurrent result/withdraw cannot both land", () => {
  const casDeps = () => {
    const deps = baseDeps();
    // Simulate the race: the conditional write says "status was no longer proposed" (0 rows),
    // and the re-read shows a completed changeset written by the concurrent winner.
    deps.docReplaceIfStatus = vi.fn(async () => null);
    return deps;
  };

  it("reportResult: a lost CAS is a 409 carrying the winner's status, and audits NOTHING", async () => {
    const deps = baseDeps();
    deps.docReplaceIfStatus = vi.fn(async () => null);
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const guids = cs.elements.map((e) => e.proposal_guid);
    deps.audit.mockClear();
    deps.saved.set(cs.id, { ...cs, status: "withdrawn" }); // the concurrent winner
    await expect(reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/withdrawn/) });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("withdrawChangeset: same — lost CAS is a 409, no audit row", async () => {
    const deps = baseDeps();
    deps.docReplaceIfStatus = vi.fn(async () => null);
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    deps.audit.mockClear();
    deps.saved.set(cs.id, { ...cs, status: "applied" });
    await expect(withdrawChangeset("demo", cs.id, "agent", deps))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/applied/) });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("the happy path still works when the CAS wins", async () => {
    const deps = baseDeps();
    deps.docReplaceIfStatus = vi.fn(async (store, pid, id, data) => { deps.saved.set(id, data); return data; });
    const cs = await proposeChangeset("demo", BODY, "agent", deps);
    const guids = cs.elements.map((e) => e.proposal_guid);
    const out = await reportResult("demo", cs.id, { applied: [], rejected: guids }, "r", deps);
    expect(out.status).toBe("declined");
    expect(deps.docReplaceIfStatus.mock.calls[0][4]).toBe("proposed"); // expectedStatus threaded
  });
});
```

Also update `baseDeps` to include a default `docReplaceIfStatus: vi.fn(async (store, pid, id, data) => { saved.set(id, data); return data; })` so every EXISTING lifecycle test keeps passing unchanged.

- [ ] **Step 2: Run to verify failure** — `cd WebApp && npx vitest run bridge/changesets-store.test.mjs` → FAIL (unknown dep / docUpsert still used).

- [ ] **Step 3: Implement.** In `cde-store.mjs`, directly after `docUpsert`:

```javascript
/** Compare-and-swap replace: overwrite the doc ONLY if its current data->>status equals
 *  `expectedStatus`. Returns the data on success, null when the condition lost (0 rows patched) —
 *  the caller re-reads and 409s. Closes the docGet→check→docUpsert race for status transitions. */
export async function docReplaceIfStatus(store, pid, docId, data, expectedStatus) {
  const rows = await sb(
    `bridge_docs?store=eq.${enc(store)}&project_id=eq.${enc(pid)}&doc_id=eq.${enc(docId)}&data->>status=eq.${enc(expectedStatus)}`,
    { method: "PATCH", body: { data, updated_at: new Date().toISOString() }, prefer: "return=representation" },
  );
  return Array.isArray(rows) && rows.length ? data : null;
}
```

In `changesets-store.mjs`: add `docReplaceIfStatus: deps.docReplaceIfStatus || cde.docReplaceIfStatus` to `wire()`. In `reportResult`, replace `await d.docUpsert(STORE, proj.id, id, updated);` with:

```javascript
  // CAS: the write itself re-checks status server-side, so a concurrent withdraw/report can't
  // both land. The loser re-reads and 409s with the winner's status; no audit row for the loser.
  const won = await d.docReplaceIfStatus(STORE, proj.id, id, updated, "proposed");
  if (!won) {
    const now2 = await d.docGet(STORE, proj.id, id);
    throw err(409, `changeset is ${now2?.status ?? "gone"} — a result can be reported exactly once, from proposed`);
  }
```

Same in `withdrawChangeset` (replace its `docUpsert` call; 409 message `only a proposed changeset can be withdrawn`, carrying the re-read status).

- [ ] **Step 4: Run** — file + FULL suite (`npx vitest run`, baseline 462) green.

- [ ] **Step 5: Live CAS probe** — restart the bridge (kill PID on :4100, `Start-ScheduledTask SentinelBridge`); propose a scratch changeset on `demo`; withdraw it; then POST a result → expect 409 naming `withdrawn` (the conditional PATCH path exercised live); clean up the scratch doc via `sb` DELETE; paste output.

- [ ] **Step 6: Commit**

```bash
git add WebApp/bridge/cde-store.mjs WebApp/bridge/changesets-store.mjs WebApp/bridge/changesets-store.test.mjs
git commit -m "fix(changesets): CAS on result/withdraw — conditional PATCH on data->>status

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: ChangesetClient (C#)

**Files:**
- Create: `SentinelAddin/Coordination/ChangesetClient.cs`

**Interfaces produced:**
- DTOs: `ChangesetDto`, `ChangesetElementDto`, `ElementVerdictDto`, `AdjudicationDto`, `PlaceDto`, `CurveDto`, `AppliedEntry`
- `ChangesetClient.FetchProposed(BcfConfig cfg, string projectKey, out string error) → List<ChangesetDto>` (oldest first; null on error with a human message in `error`)
- `ChangesetClient.FetchOne(cfg, key, id, out error) → ChangesetDto`
- `ChangesetClient.ReportResult(cfg, key, id, List<AppliedEntry> applied, List<string> rejected, string note, out error) → bool` (blocking, 120s)

- [ ] **Step 1: Write the file**

Create `SentinelAddin/Coordination/ChangesetClient.cs`:

```csharp
#nullable disable
// Governed AI modeling (A2): HTTP client for staged changesets. Blocking calls in the add-in's
// established idioms — the short-timeout read (GovernedQuery) and the long-timeout confirmed
// write (GovernedNotify's GovHttp). The bridge's status is the truth; this client never caches.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Sentinel.Coordination;

public sealed class CurveDto
{
    [JsonPropertyName("start")] public double[] Start { get; set; }
    [JsonPropertyName("end")] public double[] End { get; set; }
}

public sealed class PlaceDto
{
    [JsonPropertyName("TypeName")] public string TypeName { get; set; }
    [JsonPropertyName("LevelName")] public string LevelName { get; set; }
    [JsonPropertyName("LocationCurve")] public CurveDto LocationCurve { get; set; }
    [JsonPropertyName("LocationLoop")] public double[][] LocationLoop { get; set; }
    [JsonPropertyName("BaseElevation")] public double? BaseElevation { get; set; }
    [JsonPropertyName("TopElevation")] public double? TopElevation { get; set; }
    [JsonPropertyName("Name")] public string Name { get; set; }
}

public sealed class ElementVerdictDto
{
    [JsonPropertyName("status")] public string Status { get; set; } = "recorded";
    [JsonPropertyName("failures")] public List<JsonElement> Failures { get; set; } = new();
}

public sealed class IdentityDto
{
    [JsonPropertyName("Class")] public string Class { get; set; }
    [JsonPropertyName("Name")] public string Name { get; set; }
    [JsonPropertyName("GlobalId")] public string GlobalId { get; set; }
}

public sealed class ValidateDto
{
    [JsonPropertyName("identity")] public IdentityDto Identity { get; set; }
}

public sealed class ChangesetElementDto
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("kind")] public string Kind { get; set; }
    [JsonPropertyName("validate")] public ValidateDto Validate { get; set; }
    [JsonPropertyName("place")] public PlaceDto Place { get; set; }
    [JsonPropertyName("verdict")] public ElementVerdictDto Verdict { get; set; }
}

public sealed class AdjudicationDto
{
    [JsonPropertyName("verdict")] public string Verdict { get; set; }
    [JsonPropertyName("ids_source")] public string IdsSource { get; set; }
    [JsonPropertyName("unattributed")] public List<JsonElement> Unattributed { get; set; } = new();
}

public sealed class ChangesetDto
{
    [JsonPropertyName("id")] public string Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("source")] public string Source { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; }
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; }
    [JsonPropertyName("adjudication")] public AdjudicationDto Adjudication { get; set; }
    [JsonPropertyName("elements")] public List<ChangesetElementDto> Elements { get; set; } = new();
}

public sealed class AppliedEntry
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("revit_element_id")] public long RevitElementId { get; set; }
    [JsonPropertyName("revit_unique_id")] public string RevitUniqueId { get; set; }
}

public static class ChangesetClient
{
    // Reads: short timeout, errors surfaced (the review flow must tell the human, unlike the
    // fire-and-forget notify paths). Writes: 120s — result reporting must confirm.
    private static readonly HttpClient ReadHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly HttpClient WriteHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };

    private static HttpRequestMessage Req(HttpMethod m, string url, string token)
    {
        var msg = new HttpRequestMessage(m, url);
        if (!string.IsNullOrWhiteSpace(token))
            msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return msg;
    }

    public static List<ChangesetDto> FetchProposed(BcfConfig cfg, string projectKey, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}?status=proposed";
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
            return list.OrderBy(c => c.CreatedAt, StringComparer.Ordinal).ToList(); // FIFO — oldest first
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    public static ChangesetDto FetchOne(BcfConfig cfg, string projectKey, string id, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}";
            var resp = ReadHttp.SendAsync(Req(HttpMethod.Get, url, cfg.ServiceToken)).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            return JsonSerializer.Deserialize<ChangesetDto>(body);
        }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result";
            var payload = JsonSerializer.Serialize(new { applied, rejected, note, actor = Environment.UserName });
            var msg = Req(HttpMethod.Post, url, cfg.ServiceToken);
            msg.Content = new StringContent(payload, Encoding.UTF8, "application/json");
            var resp = WriteHttp.SendAsync(msg).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return false; }
            return true;
        }
        catch (Exception ex) { error = ex.Message; return false; }
    }
}
```

Note: `applied`/`rejected` serialize with their `JsonPropertyName`s (snake_case) inside the anonymous payload; `actor = Environment.UserName` is the machine self-label — the bridge's `resolveActor` upgrades it when a JWT is ever in play, and the route defaults `"revit"` when absent.

- [ ] **Step 2: Build** — `dotnet build .\SentinelAddin\Sentinel.csproj -c Release -p:RevitVersion=2026` → clean.

- [ ] **Step 3: Commit**

```bash
git add SentinelAddin/Coordination/ChangesetClient.cs
git commit -m "feat(addin): ChangesetClient — fetch proposed FIFO, confirmed result reporting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: ChangesetReviewWindow (C#)

**Files:**
- Create: `SentinelAddin/UI/ChangesetReviewWindow.cs`

**Interfaces produced:**
- `ChangesetReviewWindow(ChangesetDto changeset)` — code-only WPF, modeless (`Show()`), GhostReviewWindow's visual family.
- `event Action<List<string> tickedGuids, List<string> untickedGuids, string note> DecideRequested;`
- Pre-tick rule: ticked ⇔ `Verdict.Status == "accepted"`. Badges: `✓ accepted` green · `✗ rejected` red (failures in tooltip; tickable) · `— recorded` grey ("no spec to adjudicate against"). Header: name, source, model verdict + ids_source; amber banner when `Adjudication.Unattributed.Count > 0` ("N failure(s) could not be attributed to a specific element — clean rows are NOT certified").

- [ ] **Step 1: Write the file**

Create `SentinelAddin/UI/ChangesetReviewWindow.cs`:

```csharp
#nullable disable
// Governed AI modeling (A2): the human gate. One row per proposed element with the REFEREE'S
// verdict — pre-ticked only when the IDS accepted it. A human may tick a rejected row (overrule,
// with the failures on screen — the result records that they did); recorded rows say honestly
// that no spec adjudicated them. Modeless, code-only WPF, in GhostReviewWindow's visual family.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Sentinel.Coordination;

namespace Sentinel.UI;

public sealed class ChangesetReviewWindow : Window
{
    public event Action<List<string>, List<string>, string> DecideRequested;

    private readonly List<(CheckBox Box, ChangesetElementDto El)> _rows = new();
    private readonly TextBox _note = new() { MinHeight = 40, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
    private readonly ChangesetDto _cs;

    public ChangesetReviewWindow(ChangesetDto changeset)
    {
        _cs = changeset;
        Title = $"Sentinel — Review AI proposal: {_cs.Name}";
        Width = 640; Height = 560; WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var root = new DockPanel { Margin = new Thickness(10) };

        // Header: what this is, who proposed it, what the referee said.
        var head = new StackPanel { Margin = new Thickness(0, 0, 0, 8) };
        head.Children.Add(new TextBlock { Text = _cs.Name, FontSize = 15, FontWeight = FontWeights.Bold });
        head.Children.Add(new TextBlock
        {
            Text = $"Proposed by {_cs.Source} · adjudication: {_cs.Adjudication?.Verdict ?? "?"} (spec: {_cs.Adjudication?.IdsSource ?? "?"})",
            Foreground = Brushes.Gray, Margin = new Thickness(0, 2, 0, 0),
        });
        var unattributed = _cs.Adjudication?.Unattributed?.Count ?? 0;
        if (unattributed > 0)
            head.Children.Add(new Border
            {
                Background = new SolidColorBrush(Color.FromRgb(0x5c, 0x45, 0x00)),
                CornerRadius = new CornerRadius(3), Padding = new Thickness(6, 3, 6, 3), Margin = new Thickness(0, 6, 0, 0),
                Child = new TextBlock
                {
                    Text = $"⚠ {unattributed} failure(s) could not be attributed to a specific element — clean rows are NOT certified.",
                    Foreground = Brushes.Khaki, TextWrapping = TextWrapping.Wrap,
                },
            });
        DockPanel.SetDock(head, Dock.Top);
        root.Children.Add(head);

        // Footer: reviewer note + actions. (Top/bottom docked before the fill so the list scrolls.)
        var foot = new StackPanel { Margin = new Thickness(0, 8, 0, 0) };
        foot.Children.Add(new TextBlock { Text = "Reviewer note (recorded with the result):", Foreground = Brushes.Gray });
        foot.Children.Add(_note);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 8, 0, 0) };
        var all = new Button { Content = "Tick accepted", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var none = new Button { Content = "Untick all", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 6, 0) };
        var go = new Button { Content = "Create ticked in Revit", Padding = new Thickness(12, 4, 12, 4), FontWeight = FontWeights.Bold };
        all.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = r.El.Verdict?.Status == "accepted"; };
        none.Click += (_, _) => { foreach (var r in _rows) r.Box.IsChecked = false; };
        go.Click += (_, _) => Decide();
        buttons.Children.Add(all); buttons.Children.Add(none); buttons.Children.Add(go);
        foot.Children.Add(buttons);
        DockPanel.SetDock(foot, Dock.Bottom);
        root.Children.Add(foot);

        // Rows.
        var list = new StackPanel();
        foreach (var el in _cs.Elements ?? new List<ChangesetElementDto>())
        {
            var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
            var box = new CheckBox
            {
                VerticalAlignment = VerticalAlignment.Center,
                IsChecked = el.Verdict?.Status == "accepted", // pre-tick = the referee's verdict, nothing else
            };
            _rows.Add((box, el));
            DockPanel.SetDock(box, Dock.Left);
            row.Children.Add(box);

            var badge = MakeBadge(el.Verdict);
            DockPanel.SetDock(badge, Dock.Right);
            row.Children.Add(badge);

            var label = new TextBlock { Margin = new Thickness(8, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
            var name = el.Validate?.Identity?.Name ?? el.ProposalGuid;
            var type = el.Place?.TypeName; var lvl = el.Place?.LevelName;
            label.Text = $"{el.Kind}: {name}" + (type != null ? $"  ·  {type}" : "") + (lvl != null ? $"  ·  {lvl}" : "");
            row.Children.Add(label);
            list.Children.Add(row);
        }
        root.Children.Add(new ScrollViewer { Content = list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = root;
    }

    private static UIElement MakeBadge(ElementVerdictDto v)
    {
        var status = v?.Status ?? "recorded";
        var (text, fg) = status switch
        {
            "accepted" => ("✓ accepted", Brushes.LightGreen),
            "rejected" => ($"✗ rejected ({v.Failures?.Count ?? 0})", Brushes.IndianRed),
            _ => ("— recorded", Brushes.Gray),
        };
        var tb = new TextBlock { Text = text, Foreground = fg, VerticalAlignment = VerticalAlignment.Center, FontWeight = FontWeights.SemiBold };
        tb.ToolTip = status switch
        {
            "rejected" => string.Join("\n", (v.Failures ?? new List<JsonElement>()).Take(10).Select(f => f.ToString())),
            "recorded" => "No spec to adjudicate against — nothing was certified for this element.",
            _ => "Passed the project's IDS adjudication.",
        };
        return tb;
    }

    private void Decide()
    {
        var ticked = _rows.Where(r => r.Box.IsChecked == true).Select(r => r.El.ProposalGuid).ToList();
        var unticked = _rows.Where(r => r.Box.IsChecked != true).Select(r => r.El.ProposalGuid).ToList();
        DecideRequested?.Invoke(ticked, unticked, _note.Text?.Trim() ?? "");
        Close();
    }
}
```

- [ ] **Step 2: Build** — same command, clean.

- [ ] **Step 3: Commit**

```bash
git add SentinelAddin/UI/ChangesetReviewWindow.cs
git commit -m "feat(addin): ChangesetReviewWindow — tick-list keyed on referee verdicts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Executor + ExternalEvent (C#)

**Files:**
- Create: `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`
- Create: `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`

**Interfaces produced:**
- `ChangesetExecutor.Execute(Document doc, ChangesetDto cs, HashSet<string> tickedGuids) → ExecutionResult` — ONE transaction `"Sentinel AI changeset: <name>"`; throws nothing (catches, rolls back, returns the exception in the result).
- `ExecutionResult { List<AppliedEntry> Applied; string Error; }` — `Error != null` ⇒ transaction rolled back, NOTHING placed.
- `ChangesetPlacementEvent : IExternalEventHandler` — `SetRequest(doc-independent payload)`, `event Action<ExecutionResult> Completed` (GhostBuilderPlacementEvent's snapshot pattern).

- [ ] **Step 1: Write the executor**

Create `SentinelAddin/GhostBuilder/ChangesetExecutor.cs`:

```csharp
#nullable disable
// Governed AI modeling (A2): places the elements a human ticked, in ONE transaction, collecting
// the created ElementIds per proposal_guid — the golden thread back to the audit trail. Any
// failure rolls back the WHOLE changeset (partially_applied means "human unticked some", never
// "some failed silently"). Contract geometry is MILLIMETRES; Revit internal units are feet.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetExecutor
{
    private const double MmToFeet = 1.0 / 304.8;

    public sealed class ExecutionResult
    {
        public List<AppliedEntry> Applied { get; } = new();
        public string Error { get; set; }
    }

    private static XYZ Pt(double[] p) => new XYZ(p[0] * MmToFeet, p[1] * MmToFeet, p[2] * MmToFeet);

    private static Level ResolveLevel(Document doc, PlaceDto place)
    {
        var levels = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().ToList();
        if (!levels.Any()) throw new InvalidOperationException("the model has no levels");
        if (!string.IsNullOrWhiteSpace(place?.LevelName))
        {
            var byName = levels.FirstOrDefault(l => string.Equals(l.Name, place.LevelName, StringComparison.OrdinalIgnoreCase));
            if (byName != null) return byName;
        }
        if (place?.BaseElevation is double mm)
        {
            var ft = mm * MmToFeet;
            return levels.OrderBy(l => Math.Abs(l.Elevation - ft)).First();
        }
        return levels.OrderBy(l => l.Elevation).First();
    }

    private static WallType ResolveWallType(Document doc, string typeName)
    {
        var types = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>()
            .Where(t => t.Kind == WallKind.Basic).ToList();
        if (!types.Any()) throw new InvalidOperationException("the model has no basic wall types");
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? types.First(); // fall back to A basic type; the row's TypeName stays on record
    }

    private static FloorType ResolveFloorType(Document doc, string typeName)
    {
        var types = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().ToList();
        if (!types.Any()) throw new InvalidOperationException("the model has no floor types");
        return types.FirstOrDefault(t => string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase))
               ?? types.First();
    }

    public ExecutionResult Execute(Document doc, ChangesetDto cs, HashSet<string> tickedGuids)
    {
        var result = new ExecutionResult();
        var toPlace = (cs.Elements ?? new List<ChangesetElementDto>())
            .Where(e => tickedGuids.Contains(e.ProposalGuid)).ToList();
        if (!toPlace.Any()) return result;

        using var t = new Transaction(doc, $"Sentinel AI changeset: {cs.Name}");
        t.Start();
        try
        {
            // Levels first: walls/floors in the same changeset may target them by name.
            foreach (var el in toPlace.Where(e => e.Kind == "level"))
            {
                var lvl = Level.Create(doc, (el.Place?.BaseElevation ?? 0) * MmToFeet);
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) lvl.Name = el.Validate.Identity.Name;
                Collect(result, el, lvl);
            }
            doc.Regenerate();

            foreach (var el in toPlace.Where(e => e.Kind == "grid"))
            {
                var c = el.Place.LocationCurve;
                var grid = Grid.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)));
                if (!string.IsNullOrWhiteSpace(el.Validate?.Identity?.Name)) grid.Name = el.Validate.Identity.Name;
                Collect(result, el, grid);
            }

            foreach (var el in toPlace.Where(e => e.Kind == "wall"))
            {
                var c = el.Place.LocationCurve;
                var level = ResolveLevel(doc, el.Place);
                var wt = ResolveWallType(doc, el.Place.TypeName);
                var baseMm = el.Place.BaseElevation ?? 0;
                var topMm = el.Place.TopElevation ?? (baseMm + 3000);
                var heightFt = Math.Max((topMm - baseMm) * MmToFeet, 0.5);
                var offsetFt = baseMm * MmToFeet - level.Elevation;
                var wall = Wall.Create(doc, Line.CreateBound(Pt(c.Start), Pt(c.End)), wt.Id, level.Id, heightFt, offsetFt, false, false);
                Collect(result, el, wall);
            }

            foreach (var el in toPlace.Where(e => e.Kind == "floor"))
            {
                var level = ResolveLevel(doc, el.Place);
                var ft2 = ResolveFloorType(doc, el.Place.TypeName);
                var pts = el.Place.LocationLoop.Select(Pt).ToList();
                var loop = new CurveLoop();
                for (var i = 0; i < pts.Count; i++)
                    loop.Append(Line.CreateBound(pts[i], pts[(i + 1) % pts.Count]));
#if REVIT2022_OR_GREATER
                var floor = Floor.Create(doc, new List<CurveLoop> { loop }, ft2.Id, level.Id);
#else
                var arr = new CurveArray();
                foreach (var seg in loop) arr.Append(seg);
                var floor = doc.Create.NewFloor(arr, ft2, level, false);
#endif
                Collect(result, el, floor);
            }

            t.Commit();
            return result;
        }
        catch (Exception ex)
        {
            if (t.HasStarted() && !t.HasEnded()) t.RollBack();
            return new ExecutionResult { Error = ex.Message }; // fresh result: NOTHING was applied
        }
    }

    private static void Collect(ExecutionResult result, ChangesetElementDto el, Element created)
    {
        result.Applied.Add(new AppliedEntry
        {
            ProposalGuid = el.ProposalGuid,
#if NET48
            RevitElementId = created.Id.IntegerValue,
#else
            RevitElementId = created.Id.Value,
#endif
            RevitUniqueId = created.UniqueId,
        });
    }
}
```

- [ ] **Step 2: Write the ExternalEvent handler**

Create `SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs`:

```csharp
#nullable disable
// Revit API writes must NEVER run from Task.Run — the executor runs here, on the API context the
// ExternalEvent provides, mirroring GhostBuilderPlacementEvent's snapshot pattern.
using System;
using System.Collections.Generic;
using Autodesk.Revit.UI;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder;

public sealed class ChangesetPlacementEvent : IExternalEventHandler
{
    public event Action<ChangesetExecutor.ExecutionResult> Completed;

    private ChangesetDto _cs;
    private HashSet<string> _ticked;

    public void SetRequest(ChangesetDto cs, HashSet<string> ticked) { _cs = cs; _ticked = ticked; }

    public void Execute(UIApplication app)
    {
        var cs = _cs; var ticked = _ticked;
        _cs = null; _ticked = null;
        if (cs == null || ticked == null) return;
        var doc = app.ActiveUIDocument?.Document;
        if (doc == null)
        {
            Completed?.Invoke(new ChangesetExecutor.ExecutionResult { Error = "no active document" });
            return;
        }
        var result = new ChangesetExecutor().Execute(doc, cs, ticked);
        Completed?.Invoke(result);
    }

    public string GetName() => "Sentinel - AI Changeset Placement";
}
```

- [ ] **Step 3: Build** — clean.

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/GhostBuilder/ChangesetExecutor.cs SentinelAddin/GhostBuilder/ChangesetPlacementEvent.cs
git commit -m "feat(addin): ChangesetExecutor — one transaction, mm→ft, ElementIds collected

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Command + ribbon (C#)

**Files:**
- Create: `SentinelAddin/Commands.ReviewChangesets.cs`
- Modify: `SentinelAddin/App.cs` (one `Push` on the Coordinate panel)

- [ ] **Step 1: Write the command**

Create `SentinelAddin/Commands.ReviewChangesets.cs`:

```csharp
#nullable disable
// Governed AI modeling (A2): the ribbon entry. Fetch proposed changesets (FIFO), show the review
// window, execute the human's ticks via ExternalEvent, report the result — with a retry dialog,
// because the bridge's recorded status is the truth and an unreported application is a lie by
// omission. Re-fetches the changeset right before executing: if an agent withdrew it meanwhile,
// nothing runs (the bridge's CAS makes the report side race-safe too).
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;
using Sentinel.UI;

namespace Sentinel.Commands;

[Transaction(TransactionMode.Manual)]
public sealed class ReviewChangesetsCommand : IExternalCommand
{
    private static ChangesetPlacementEvent _handler;
    private static ExternalEvent _event;

    public Result Execute(ExternalCommandData c, ref string msg, ElementSet els)
    {
        var uidoc = c.Application.ActiveUIDocument;
        if (uidoc?.Document is not { } doc) return Result.Cancelled;

        var cfg = BcfConfig.Load();
        var key = SettingsManager.WebProjectKeyFor(doc);

        var pending = ChangesetClient.FetchProposed(cfg, key, out var fetchErr);
        if (pending == null)
        {
            TaskDialog.Show("Sentinel — AI proposals", $"Couldn't reach the bridge:\n{fetchErr}");
            return Result.Failed;
        }
        if (pending.Count == 0)
        {
            TaskDialog.Show("Sentinel — AI proposals", $"No pending proposals for project \"{key}\".");
            return Result.Succeeded;
        }

        var cs = pending[0]; // FIFO; the dialog says how many wait behind it
        if (pending.Count > 1)
            TaskDialog.Show("Sentinel — AI proposals", $"{pending.Count} proposals pending — reviewing the oldest first ({cs.Name}). Run again for the next.");

        _handler ??= new ChangesetPlacementEvent();
        _event ??= ExternalEvent.Create(_handler);

        var window = new ChangesetReviewWindow(cs);
        window.DecideRequested += (ticked, unticked, note) =>
        {
            // Re-fetch: only a still-proposed changeset may run (an agent may have withdrawn it).
            var fresh = ChangesetClient.FetchOne(cfg, key, cs.Id, out var oneErr);
            if (fresh == null || fresh.Status != "proposed")
            {
                TaskDialog.Show("Sentinel — AI proposals",
                    fresh == null ? $"Couldn't re-check the changeset:\n{oneErr}" : $"Changeset is now \"{fresh.Status}\" — nothing was created.");
                return;
            }

            if (ticked.Count == 0)
            {
                Report(cfg, key, cs.Id, new List<AppliedEntry>(), unticked, note); // declined — no transaction at all
                return;
            }

            Action<ChangesetExecutor.ExecutionResult> onDone = null;
            onDone = result =>
            {
                _handler.Completed -= onDone;
                if (result.Error != null)
                {
                    // Whole changeset rolled back: report declined with the reason — honestly.
                    Report(cfg, key, cs.Id, new List<AppliedEntry>(),
                        cs.Elements.Select(e => e.ProposalGuid).ToList(),
                        $"Revit transaction failed — rolled back: {result.Error}" + (string.IsNullOrEmpty(note) ? "" : $" | reviewer: {note}"));
                    TaskDialog.Show("Sentinel — AI proposals", $"Transaction failed and was rolled back:\n{result.Error}\n\nReported as declined.");
                    return;
                }
                Report(cfg, key, cs.Id, result.Applied, unticked, note);
                TaskDialog.Show("Sentinel — AI proposals",
                    $"Created {result.Applied.Count} element(s) from \"{cs.Name}\"." + (unticked.Count > 0 ? $"\n{unticked.Count} unticked element(s) reported as rejected." : ""));
            };
            _handler.Completed += onDone;
            _handler.SetRequest(fresh, new HashSet<string>(ticked));
            _event.Raise();
        };
        window.Show();
        return Result.Succeeded;
    }

    private static void Report(BcfConfig cfg, string key, string id, List<AppliedEntry> applied, List<string> rejected, string note)
    {
        while (true)
        {
            if (ChangesetClient.ReportResult(cfg, key, id, applied, rejected, note, out var err)) return;
            var d = new TaskDialog("Sentinel — AI proposals")
            {
                MainInstruction = "The result could not be reported to the bridge.",
                MainContent = $"{err}\n\nThe governed record does NOT yet reflect what happened in Revit. Retry?",
                CommonButtons = TaskDialogCommonButtons.Retry | TaskDialogCommonButtons.Cancel,
            };
            if (d.Show() != TaskDialogResult.Retry) return;
        }
    }
}
```

- [ ] **Step 2: Ribbon** — in `App.cs`, in `BuildRibbon` where the **Coordinate** panel (`co`) buttons are added, append:

```csharp
        Push(co, "Sentinel_ReviewChangesets", "Review AI\nProposals", "Sentinel.Commands.ReviewChangesetsCommand", "dashboard",
            "Review staged AI element proposals: the referee's verdict per element, your tick decides what enters the model. Everything is audit-chained.");
```

(Icon: reuse `"dashboard"` unless an obviously better existing icon name is present beside the other `Push` calls — do not add image assets.)

- [ ] **Step 3: Build** — clean.

- [ ] **Step 4: Commit**

```bash
git add SentinelAddin/Commands.ReviewChangesets.cs SentinelAddin/App.cs
git commit -m "feat(addin): Review AI Proposals — ribbon, FIFO review, execute, confirmed report

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification — REQUIRES THE USER AT REVIT

**Files:** none. This task is a checklist run WITH the user; everything before it is autonomous.

- [ ] **Step 1 (autonomous):** full JS suite green; `dotnet build` clean for the user's installed Revit year(s) (`powershell -ExecutionPolicy Bypass -File .\SentinelAddin\build.ps1` — build only if Revit is running; the deploy target hard-errors while Revit runs, by design).
- [ ] **Step 2 (user):** close Revit → deploy (`dotnet build .\SentinelAddin\Sentinel.csproj -c Release -p:RevitVersion=<year> -p:DeployToRevit=true`) → open Revit on a SCRATCH model → set the model's WebProjectKey (Project Setup) to a scratch project.
- [ ] **Step 3:** propose via MCP (`sentinel_propose_changeset`: 2 walls + 1 level + 1 grid, mm geometry) — confirm staged + verdicts via `sentinel_changeset_status`.
- [ ] **Step 4:** Revit → **Review AI Proposals** → window shows the changeset, verdict badges correct (recorded if no IDS; arm `SENTINEL_IDS` for a real accepted/rejected mix if desired) → tick a SUBSET → Create.
- [ ] **Step 5:** elements exist in the model; `sentinel_changeset_status` shows `partially_applied` with REAL ElementIds/UniqueIds matching Revit's (spot-check one via Manage → IDs of Selection); unticked guids listed as rejected; audit trail shows the full thread.
- [ ] **Step 6 (failure path):** propose a changeset containing a level at an elevation that already exists → tick it → expect the transaction to fail, roll back, report `declined` with the exception note, and a TaskDialog saying so. Nothing partial in the model.
- [ ] **Step 7 (race path):** propose, open the review window, withdraw via MCP from another terminal, then tick+Create → expect "Changeset is now \"withdrawn\" — nothing was created."
- [ ] **Step 8:** external-user script gains Part H (this flow, tester-driven); update `docs/testing/2026-08-07-external-user-run.md`.

---

## Self-Review

**Spec coverage (A2):** ribbon button → T5. Fetch via blocking reads with surfaced errors → T2. Review window: verdict badges, pre-tick=accepted, tickable-rejected, recorded note, unattributed banner → T3. Execute: ExternalEvent, one named transaction, re-fetch-before-run, rollback→declined-with-note, ElementId collection (which GhostBuilder lacked) → T4+T5. Confirmed result reporting with retry dialog → T2+T5. CAS race guard (deferred from A1 "must land with A2") → T1, live-probed. mm→ft in exactly one place → T4. FIFO one-at-a-time with a count dialog → T5.
**Placeholders:** none — complete code every step; Task 6 is explicitly a user-present checklist, not deferred work in disguise.
**Type consistency:** DTO property names ≡ the A1 contract (snake_case via JsonPropertyName); `AppliedEntry` fields ≡ the result route's expectations; `DecideRequested(ticked, unticked, note)` ≡ the command's handler; `ExecutionResult.Error != null ⇒ Applied empty` ≡ the declined-report branch; `docReplaceIfStatus(store, pid, docId, data, expectedStatus)` ≡ wire key ≡ tests.
**Known simplifications (stated, not hidden):** wall/floor type resolution falls back to the first available type when the named one is absent (the row's TypeName stays on record; GhostTypeCreator-style auto-provisioning is a later nicety); `#if NET48` gates ElementId's `IntegerValue` vs `Value` and the Floor API per the module's existing pattern.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-08-governed-ai-modeling-a2.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Tasks 1-5 autonomous (bridge + C# with build gates); Task 6 waits for you at Revit.

**2. Inline Execution** — executing-plans in this session.

**Which approach?**
