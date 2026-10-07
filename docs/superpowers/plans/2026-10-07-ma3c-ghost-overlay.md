# MA-3c — the ghost overlay: a review's proposed creates drawn in the model's 3D views as transient outlines, ticked rows highlighted, nothing written Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The MA-3a plan's "Next ▸ MA-3c — the ghost overlay" (`docs/superpowers/plans/2026-10-04-ma3a-binding-web-decline.md:2433`; the audit's AI-4, `docs/strategy/2026-09-30-revit-addin-audit.md:354`): while a Review AI Proposals window is open, every **create** it lists (a wall, a floor, a ceiling, a roof, a grid, a door or window point) is drawn in the model's **3D views** as transient outlines through Revit's DirectContext3D — no transaction, the Undo stack unchanged; a **ticked** row is green, an unticked one grey, a declined (locked) one red; a tick recolours at once; **closing the window removes the graphics**, and so does Apply (the elements then exist). A retype, an attach or a type edit draws nothing (its element exists — MA-3b2's Show selects it). Revit 2021–2027.

**Architecture:**
- `SentinelAddin/GhostBuilder/GhostOverlayGeometry.cs` — **pure** (no Revit types): `Segments(ChangesetElementDto el, bool ticked, bool locked) → List<Segment>` in **millimetres** in the model's internal frame, exactly the points the executor places from (`ChangesetExecutor.cs:418-540`; `ChangesetTrust.PlaceBox`, `Coordination/ChangesetClient.cs:342`): a wall's location curve at its base and at its top plus the two end verticals (an arc sampled in 16 chords through `Mid`); a floor's, ceiling's or roof's closed loop at its base; a grid's line; a door's or window's point as a 600 mm cross; a level or a non-create op → none. Colour by state. Pinned in `tools/promote-check`.
- `SentinelAddin/GhostBuilder/GhostOverlayServer.cs` — `IDirectContext3DServer` (`Autodesk.Revit.DB.DirectContext3D`, `Autodesk.Revit.DB.ExternalService`): holds the segments and the `Document` it draws for; `CanExecute(View v)` → `v is View3D && v.Document.Equals(_doc)`; builds a `VertexBuffer`/`IndexBuffer` of `VertexPositionColored` lines (feet) when they are missing or invalid; `RenderScene` flushes them as `PrimitiveType.LineList`; `Update(segments)` drops the buffers. Registered and removed on Revit's thread through the event hub.
- `SentinelAddin/UI/ChangesetReviewWindow.cs` — raises `TicksChanged` with every row's state after any tick, group tick, Lock or Applying; exposes `RowStates()` and `Applied`.
- `SentinelAddin/Commands.ReviewChangesets.cs` — at Open: builds the server from the rows and registers it (hub, DocPin); on `TicksChanged`: updates and repaints; on `Closed` and on `Applying`: removes it (the plain `Enqueue(Action<UIApplication>)`, no DocPin — the model may be gone); every outcome said on the window's Show line (`Shown`).

**Tech Stack:** C# add-in (net48 2021–2024 / net8 2025–2026 / net10 2027; `RevitAPI.dll` holds `DirectContext3D` on every version), `tools/promote-check` (`Ok(cond, words)` pins; `Src`, `At`, `Count` scans).

**Base:** `feature/ma3c-ghost-overlay` at master `cac837e`. Repo root `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`. Every file:line below was read at `cac837e`.

## Global Constraints

- House style: words are sentences; comments name the slice ("MA-3c") and the reason; words pinned in `tools/promote-check`. No new dependency. No bridge, web or migration change. **No `Transaction` or `TransactionGroup` in the two new files** (pinned).
- Commit messages `feat(revit): MA-3c - …` with a blank line and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Commit only on `feature/ma3c-ghost-overlay`.
- Every add-in build carries `-p:DeployToRevit=false`: `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=<v> -p:DeployToRevit=false 2>&1 | grep -E "error CS|Error\(s\)"` — 0 errors for 2022, 2024, 2026 and 2027 (the API is the same; `ImplicitUsings` is on for net8/net10 only — write every `using` explicitly).
- `dotnet run --project tools/promote-check 2>&1 | tail -2` ends `N/N checks pass` (master: 839). Never run Revit.
- The DirectContext3D facts to code against (the Revit API, all versions since 2018): `ExternalServiceRegistry.GetService(ExternalServices.BuiltInExternalServices.DirectContext3DService) as MultiServerService`; `AddServer(server)`; the active list is `GetActiveServerIds()` → add the id → `SetActiveServers(ids)`; removal is the reverse (`SetActiveServers` without it, then `RemoveServer(id)`); each call on Revit's API thread. `IDirectContext3DServer` members: `GetServerId()`, `GetServiceId()` (= `ExternalServices.BuiltInExternalServices.DirectContext3DService`), `GetName()`, `GetDescription()`, `GetVendorId()` ("SNTL"), `GetApplicationId()` (""), `GetSourceId()` (""), `UsesHandles()` false, `CanExecute(View)`, `GetBoundingBox(View)` → an `Outline` of the points in feet (null when none), `UseInTransparentPass(View)` false, `RenderScene(View, DisplayStyle)`. Buffers: `new VertexBuffer(VertexPositionColored.GetSizeInFloats() * n)`, `Map(size)`, `GetVertexStreamPositionColored().AddVertex(new VertexPositionColored(xyz, new ColorWithTransparency(r, g, b, 0)))`, `Unmap()`; `new IndexBuffer(IndexLine.GetSizeInShortInts() * m)`, `Map(size)`, `GetIndexStreamLine().AddLine(new IndexLine(a, b))`, `Unmap()`; `new VertexFormat(VertexFormatBits.PositionColored)`, `new EffectInstance(VertexFormatBits.PositionColored)`; `DrawContext.FlushBuffer(vb, n, ib, 2 * m, format, effect, PrimitiveType.LineList, 0, m)`; skip when `DrawContext.IsTransparentPass()`; rebuild when `vb == null || !vb.IsValid()`. A repaint after a change: `uiapp.ActiveUIDocument?.RefreshActiveView()`. Feet = mm / 304.8. If a member name differs on a version, the compiler says so: fix to the API, keep the behaviour.

---

### Task 1 — `GhostOverlayGeometry` (pure) and its pins

**Files:** create `SentinelAddin/GhostBuilder/GhostOverlayGeometry.cs`; create `tools/promote-check/Ma3c.cs`; modify `tools/promote-check/Check.cs` (call `Ma3cChecks();` after `Ma3b7Checks();`).

- [ ] **Step 1:** the file:
```csharp
#nullable disable
// MA-3c — the ghost overlay's geometry: what a review's proposed CREATE would be, as line segments in millimetres in the model's
// internal frame — the same points the executor places from (ChangesetExecutor: a wall's LocationCurve and its base/top, a floor's
// Boundary, a grid's line, a door's Location), so what is drawn is what Apply would make. Pure: no Revit types, pinned by
// tools/promote-check. A retype, an attach, a type edit or a level draws nothing — its element exists (Show selects it) or has no shape.
using System;
using System.Collections.Generic;
using System.Linq;
using Sentinel.Coordination;

namespace Sentinel.GhostBuilder
{
    public static class GhostOverlayGeometry
    {
        /// <summary>One line of the overlay, millimetres, with its colour.</summary>
        public sealed class Segment
        {
            public double[] A; public double[] B; public byte R, G, Bl;
        }
        /// <summary>The colour of a row's state: ticked green, unticked grey, declined (locked) red.</summary>
        public static (byte R, byte G, byte B) Colour(bool ticked, bool locked) => locked ? ((byte)200, (byte)60, (byte)60) : ticked ? ((byte)0, (byte)170, (byte)90) : ((byte)140, (byte)140, (byte)140);
        /// <summary>A wall whose top the proposal did not send is sketched this high (mm) — the executor decides the real top at Apply.</summary>
        public const double SketchHeightMm = 3000;
        public const int ArcChords = 16;
        public const double PointCrossMm = 600;

        public static bool IsCreate(ChangesetElementDto el) => el != null && el.Op == "create" && el.Place != null;

        public static List<Segment> Segments(ChangesetElementDto el, bool ticked, bool locked)
        {
            var segs = new List<Segment>();
            if (!IsCreate(el)) return segs;
            var (r, g, b) = Colour(ticked, locked);
            var p = el.Place;
            Segment Seg(double[] a, double za, double[] c, double zc) => new Segment { A = At(a, za), B = At(c, zc), R = r, G = g, Bl = b };
            bool Ok(double[] q) => q != null && q.Length >= 2;
            switch (el.Kind)
            {
                case "wall":
                {
                    var c = p.LocationCurve; if (c == null || !Ok(c.Start) || !Ok(c.End)) return segs;
                    double z0 = p.BaseElevation ?? Z(c.Start, p), z1 = p.TopElevation ?? z0 + SketchHeightMm;
                    var pts = Ok(c.Mid) ? Arc(c.Start, c.Mid, c.End) : new List<double[]> { c.Start, c.End };
                    for (int i = 0; i + 1 < pts.Count; i++) { segs.Add(Seg(pts[i], z0, pts[i + 1], z0)); segs.Add(Seg(pts[i], z1, pts[i + 1], z1)); }
                    segs.Add(Seg(c.Start, z0, c.Start, z1));
                    segs.Add(Seg(c.End, z0, c.End, z1));
                    return segs;
                }
                case "floor": case "ceiling": case "roof":
                {
                    var loop = (p.Boundary ?? p.LocationLoop)?.Where(Ok).ToList();
                    if (loop == null || loop.Count < 2) return segs;
                    double z = p.BaseElevation ?? Z(loop[0], p);
                    for (int i = 0; i < loop.Count; i++) segs.Add(Seg(loop[i], z, loop[(i + 1) % loop.Count], z));
                    return segs;
                }
                case "grid":
                {
                    var c = p.LocationCurve; if (c == null || !Ok(c.Start) || !Ok(c.End)) return segs;
                    segs.Add(Seg(c.Start, Z(c.Start, p), c.End, Z(c.End, p)));
                    return segs;
                }
                case "door": case "window":
                {
                    var q = p.Location; if (!Ok(q)) return segs;
                    double z = Z(q, p), h = PointCrossMm / 2;
                    segs.Add(Seg(new[] { q[0] - h, q[1] }, z, new[] { q[0] + h, q[1] }, z));
                    segs.Add(Seg(new[] { q[0], q[1] - h }, z, new[] { q[0], q[1] + h }, z));
                    segs.Add(Seg(q, z, q, z + PointCrossMm));
                    return segs;
                }
                default: return segs; // a level has no shape; an unknown kind draws nothing
            }
        }

        /// <summary>Every segment of a review, from its rows' states.</summary>
        public static List<Segment> All(IEnumerable<(ChangesetElementDto El, bool Ticked, bool Locked)> rows) =>
            (rows ?? Array.Empty<(ChangesetElementDto, bool, bool)>()).SelectMany(x => Segments(x.El, x.Ticked, x.Locked)).ToList();

        /// <summary>The least and greatest corner (mm) of the segments, or null when there are none.</summary>
        public static double[][] Bounds(IReadOnlyList<Segment> segs)
        {
            if (segs == null || segs.Count == 0) return null;
            var pts = segs.SelectMany(s => new[] { s.A, s.B }).ToList();
            return new[] { new[] { pts.Min(q => q[0]), pts.Min(q => q[1]), pts.Min(q => q[2]) }, new[] { pts.Max(q => q[0]), pts.Max(q => q[1]), pts.Max(q => q[2]) } };
        }

        /// <summary>The overlay's line for the window: how many outlines, in which colours.</summary>
        public static string Line(int creates, int drawn) => creates == 0
            ? "No ghost to draw: this review proposes no create (a retype or attach changes an element that exists — Show selects it)."
            : $"{drawn} outline(s) of {creates} proposed create(s) drawn in this model's 3D views — ticked green, unticked grey, declined red; nothing is written. Open a 3D view to see them; they go when this window closes or Apply places them.";

        static double Z(double[] q, PlaceDto p) => q.Length >= 3 ? q[2] : p.BaseElevation ?? 0;
        static double[] At(double[] q, double z) => new[] { q[0], q[1], z };

        /// <summary>An arc through three points (mm, plan), as ArcChords chords from a through m to b; a collinear triple is the line a→b.</summary>
        public static List<double[]> Arc(double[] a, double[] m, double[] b)
        {
            double ax = a[0], ay = a[1], bx = b[0], by = b[1], mx = m[0], my = m[1];
            double d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my));
            if (Math.Abs(d) < 1e-9) return new List<double[]> { a, b };
            double ux = ((ax * ax + ay * ay) * (my - by) + (mx * mx + my * my) * (by - ay) + (bx * bx + by * by) * (ay - my)) / d;
            double uy = ((ax * ax + ay * ay) * (bx - mx) + (mx * mx + my * my) * (ax - bx) + (bx * bx + by * by) * (mx - ax)) / d;
            double rad = Math.Sqrt((ax - ux) * (ax - ux) + (ay - uy) * (ay - uy));
            double t0 = Math.Atan2(ay - uy, ax - ux), tm = Math.Atan2(my - uy, mx - ux), t1 = Math.Atan2(by - uy, bx - ux);
            double Sweep(double from, double to, bool ccw) { double s = ccw ? to - from : from - to; while (s < 0) s += 2 * Math.PI; return s; }
            bool anticlockwise = Sweep(t0, tm, true) < Sweep(t0, t1, true); // the direction in which m lies between a and b
            double total = Sweep(t0, t1, anticlockwise);
            var pts = new List<double[]>();
            for (int i = 0; i <= ArcChords; i++) { double t = t0 + (anticlockwise ? 1 : -1) * total * i / ArcChords; pts.Add(new[] { ux + rad * Math.Cos(t), uy + rad * Math.Sin(t) }); }
            pts[0] = new[] { ax, ay }; pts[ArcChords] = new[] { bx, by };
            return pts;
        }
    }
}
```

- [ ] **Step 2: pins** — `tools/promote-check/Ma3c.cs`, `static void Ma3cChecks()`, heading `"\nMA-3c — the ghost overlay: its geometry (pure) and its wiring"`:
  - a straight wall create (`Op "create"`, `Kind "wall"`, `Place.LocationCurve.Start {0,0}`, `End {4000,0}`, `BaseElevation 0`, `TopElevation 3000`) → 4 segments (base, top, two verticals), every z in {0, 3000}; ticked → `(0,170,90)`; unticked → `(140,140,140)`; locked → `(200,60,60)` whatever the tick.
  - a wall with no `TopElevation` → the top at `SketchHeightMm` above the base.
  - an arc wall (`Start {0,0}`, `Mid {2000,2000}`, `End {4000,0}`) → `2 * ArcChords + 2` segments; `Arc(...)` returns `ArcChords + 1` points whose first and last are the ends and whose middle one is within 1 mm of the Mid.
  - a floor with a 4-point `Boundary` at `BaseElevation 3000` → 4 segments, every z 3000; `LocationLoop` is used when `Boundary` is null.
  - a grid → 1 segment; a door `Location {1000, 2000}` → 3 segments (two crosses, one vertical of `PointCrossMm`).
  - a retype (`Op "retype"`), a type edit (`Op "set_parameter"`), a level create, and a create with no place → 0 segments; `IsCreate` false for each.
  - `Bounds` of the straight wall → `{0,0,0}`–`{4000,0,3000}`; `Bounds(empty)` null.
  - `Line(0, 0)` and `Line(3, 7)` — the exact words.
  - wiring: `Src("GhostBuilder", "GhostOverlayGeometry.cs")` contains no `Autodesk.Revit` and no `Transaction`.
  Run `dotnet run --project tools/promote-check 2>&1 | tail -2` → `N/N checks pass`.

- [ ] **Step 3: build** `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2024 -p:DeployToRevit=false 2>&1 | grep -E "error CS|Error\(s\)"` → 0 errors.
- [ ] **Step 4: commit** — `feat(revit): MA-3c - the ghost overlay's geometry (pure): a review's proposed creates as line segments in mm from the points the executor places from; ticked green, unticked grey, declined red; promote-check 55`

### Task 2 — the server, the window's ticks and the command's wiring

**Files:** create `SentinelAddin/GhostBuilder/GhostOverlayServer.cs`; modify `SentinelAddin/UI/ChangesetReviewWindow.cs` (`:32-36` events; `Counted()` near `:247`; `Lock` `:359-362`; `Applying` `:352`); modify `SentinelAddin/Commands.ReviewChangesets.cs` (`:359-366` Open; the window's `Closed`); modify `tools/promote-check/Ma3c.cs` (wiring pins); read first `SentinelAddin/RevitEventHub.cs:39-110` (both `Enqueue` overloads, `SelectAndShow`).

- [ ] **Step 1: the server** — `GhostOverlayServer.cs`:
```csharp
#nullable disable
// MA-3c — the ghost overlay's DirectContext3D server: draws GhostOverlayGeometry's segments (feet, PositionColored lines) in the 3D views of
// ONE document while a review window is open. No transaction: nothing in the model changes and Undo is untouched. Registered, updated
// and removed on Revit's thread through the event hub (Commands.ReviewChangesets); CanExecute refuses every other document's views.
using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.DirectContext3D;
using Autodesk.Revit.DB.ExternalService;

namespace Sentinel.GhostBuilder
{
    public sealed class GhostOverlayServer : IDirectContext3DServer
    {
        private const double MmToFeet = 1.0 / 304.8;
        private readonly Guid _id = Guid.NewGuid();
        private readonly Document _doc;
        private readonly string _title;
        private List<GhostOverlayGeometry.Segment> _segments;
        private VertexBuffer _vb; private IndexBuffer _ib; private int _vertices, _lines;
        private VertexFormat _format; private EffectInstance _effect;

        public GhostOverlayServer(Document doc, string title, List<GhostOverlayGeometry.Segment> segments)
        { _doc = doc; _title = title ?? ""; _segments = segments ?? new List<GhostOverlayGeometry.Segment>(); }

        /// <summary>New segments (a tick, a lock): the buffers are rebuilt on the next frame.</summary>
        public void Update(List<GhostOverlayGeometry.Segment> segments) { _segments = segments ?? new List<GhostOverlayGeometry.Segment>(); Drop(); }
        public int Count => _segments.Count;
        private void Drop() { _vb?.Dispose(); _ib?.Dispose(); _vb = null; _ib = null; }

        public Guid GetServerId() => _id;
        public ExternalServiceId GetServiceId() => ExternalServices.BuiltInExternalServices.DirectContext3DService;
        public string GetName() => "Sentinel ghost overlay";
        public string GetDescription() => "The proposed creates of an open Review AI Proposals window, as outlines: " + _title;
        public string GetVendorId() => "SNTL";
        public string GetApplicationId() => "";
        public string GetSourceId() => "";
        public bool UsesHandles() => false;
        public bool CanExecute(View view) => view is View3D && view.Document != null && view.Document.Equals(_doc) && _segments.Count > 0;
        public bool UseInTransparentPass(View view) => false;
        public Outline GetBoundingBox(View view)
        {
            var b = GhostOverlayGeometry.Bounds(_segments);
            return b == null ? null : new Outline(Ft(b[0]), Ft(b[1]));
        }
        public void RenderScene(View view, DisplayStyle displayStyle)
        {
            if (DrawContext.IsTransparentPass() || _segments.Count == 0) return;
            if (_vb == null || !_vb.IsValid() || _ib == null || !_ib.IsValid()) Build();
            DrawContext.FlushBuffer(_vb, _vertices, _ib, 2 * _lines, _format, _effect, PrimitiveType.LineList, 0, _lines);
        }
        private void Build()
        {
            Drop();
            _lines = _segments.Count; _vertices = 2 * _lines;
            _format = new VertexFormat(VertexFormatBits.PositionColored);
            _effect = new EffectInstance(VertexFormatBits.PositionColored);
            _vb = new VertexBuffer(VertexPositionColored.GetSizeInFloats() * _vertices);
            _vb.Map(VertexPositionColored.GetSizeInFloats() * _vertices);
            var vs = _vb.GetVertexStreamPositionColored();
            foreach (var s in _segments)
            {
                var c = new ColorWithTransparency(s.R, s.G, s.Bl, 0);
                vs.AddVertex(new VertexPositionColored(Ft(s.A), c));
                vs.AddVertex(new VertexPositionColored(Ft(s.B), c));
            }
            _vb.Unmap();
            _ib = new IndexBuffer(IndexLine.GetSizeInShortInts() * _lines);
            _ib.Map(IndexLine.GetSizeInShortInts() * _lines);
            var ls = _ib.GetIndexStreamLine();
            for (int i = 0; i < _lines; i++) ls.AddLine(new IndexLine(2 * i, 2 * i + 1));
            _ib.Unmap();
        }
        private static XYZ Ft(double[] mm) => new XYZ(mm[0] * MmToFeet, mm[1] * MmToFeet, mm[2] * MmToFeet);

        // ── registration, on Revit's API thread (the caller is the event hub's job) ──
        /// <summary>Adds the server to Revit's DirectContext3D service and makes it active; repaints the active view.</summary>
        public static void Register(Autodesk.Revit.UI.UIApplication uiapp, GhostOverlayServer server)
        {
            var service = ExternalServiceRegistry.GetService(ExternalServices.BuiltInExternalServices.DirectContext3DService) as MultiServerService;
            if (service == null) throw new InvalidOperationException("Revit's DirectContext3D service is not available");
            service.AddServer(server);
            var ids = new List<Guid>(service.GetActiveServerIds()); ids.Add(server.GetServerId()); service.SetActiveServers(ids);
            uiapp.ActiveUIDocument?.RefreshActiveView();
        }
        /// <summary>Removes the server; a missing one is nothing to remove. Repaints the active view.</summary>
        public static void Remove(Autodesk.Revit.UI.UIApplication uiapp, GhostOverlayServer server)
        {
            var service = ExternalServiceRegistry.GetService(ExternalServices.BuiltInExternalServices.DirectContext3DService) as MultiServerService;
            if (service == null) return;
            var ids = new List<Guid>(service.GetActiveServerIds()); ids.Remove(server.GetServerId()); service.SetActiveServers(ids);
            try { service.RemoveServer(server.GetServerId()); } catch (Exception) { /* already gone */ }
            server.Drop();
            uiapp.ActiveUIDocument?.RefreshActiveView();
        }
    }
}
```
(Check each member against the API by compiling; the behaviour, not the spelling, is the contract.)

- [ ] **Step 2: the window** — add beside the other events:
```csharp
    /// <summary>MA-3c: every row's state after a tick, a group tick, a Lock or Apply — the ghost overlay recolours from it.</summary>
    public event Action<List<(ChangesetElementDto El, bool Ticked, bool Locked)>> TicksChanged;
    /// <summary>MA-3c: every row's state, for the ghost overlay — locked = a declined row (its box disabled).</summary>
    public List<(ChangesetElementDto El, bool Ticked, bool Locked)> RowStates() => _rows.Select(r => (r.El, r.Box.IsChecked == true, !r.Box.IsEnabled)).ToList();
    /// <summary>MA-3c: Apply was pressed — the overlay goes (the elements exist from here).</summary>
    public bool Applied => _applied;
    private void Ticks() => TicksChanged?.Invoke(RowStates());
```
Call `Ticks()` at the end of `Counted()` (every box change, group tick and all/none pass through it), at the end of `Lock(...)`'s `Ui(...)` body, and in `Applying(...)` right after `_applied = true;`.

- [ ] **Step 3: the command** — in `Commands.ReviewChangesets.cs` right after `window.Closed += (_, _) => Release();` (`:362`):
```csharp
        // MA-3c: the ghost overlay — the review's proposed creates drawn in this model's 3D views while the window is open; a tick
        // recolours; closing the window or Apply removes it. Registered, updated and removed on Revit's thread through the hub (DocPin for
        // the registration and the recolour: the model in front; the removal plain — the model may be gone). Nothing is written; every
        // outcome is said on the window's Show line. A late recolour after the removal draws nothing: a removed server is not asked.
        var creates = (cs.Elements ?? new List<ChangesetElementDto>()).Count(GhostOverlayGeometry.IsCreate);
        var overlay = new GhostOverlayServer(doc, cs.Name, GhostOverlayGeometry.All(window.RowStates()));
        var overlayOn = new[] { false };
        void OverlayOff(string why)
        {
            if (!overlayOn[0]) return;
            overlayOn[0] = false;
            App.Events.Enqueue(ua => { try { GhostOverlayServer.Remove(ua, overlay); } catch (Exception ex) { App.PanelVm?.LogDoctor($"Review AI Proposals: the ghost overlay was not removed ({why}) — {ex.GetType().Name}: {ex.Message}"); } }, "remove the ghost overlay");
        }
        if (creates > 0)
            App.Events.Enqueue(doc, "draw the ghost overlay", (ua, _) =>
            {
                try { GhostOverlayServer.Register(ua, overlay); overlayOn[0] = true; window.Shown(GhostOverlayGeometry.Line(creates, overlay.Count)); }
                catch (Exception ex) { window.Shown($"The ghost overlay could not be drawn — {ex.GetType().Name}: {ex.Message}. The review works as before; Show still zooms to a row."); }
            }, refusal => window.Shown($"The ghost overlay was not drawn — {refusal}"));
        else window.Shown(GhostOverlayGeometry.Line(0, 0));
        window.TicksChanged += states =>
        {
            if (!overlayOn[0]) return;
            if (window.Applied) { OverlayOff("Apply"); return; }
            var segs = GhostOverlayGeometry.All(states);
            App.Events.Enqueue(doc, "recolour the ghost overlay", (ua, _) => { overlay.Update(segs); ua.ActiveUIDocument?.RefreshActiveView(); }, _ => { /* the model is not in front: its next frame repaints */ });
        };
        window.Closed += (_, _) => OverlayOff("the window closed");
```
Add `using Sentinel.GhostBuilder;` if the file lacks it.

- [ ] **Step 4: pins (append to `Ma3c.cs`)** — `srv = Src("GhostBuilder", "GhostOverlayServer.cs")`, `rev = Src("Commands.ReviewChangesets.cs")`, `win = Src("UI", "ChangesetReviewWindow.cs")`: `srv` contains `public bool CanExecute(View view) => view is View3D && view.Document != null && view.Document.Equals(_doc) && _segments.Count > 0;`, `PrimitiveType.LineList`, `if (DrawContext.IsTransparentPass()`, and **no** `Transaction`; `rev` contains `App.Events.Enqueue(doc, "draw the ghost overlay"`, `App.Events.Enqueue(doc, "recolour the ghost overlay"`, `"remove the ghost overlay"`, `window.Closed += (_, _) => OverlayOff("the window closed");` and `if (window.Applied) { OverlayOff("Apply"); return; }`; `win` contains `public event Action<List<(ChangesetElementDto El, bool Ticked, bool Locked)>> TicksChanged;` and `public bool Applied => _applied;`; `Count(rev, "GhostOverlayServer.Register(") == 1 && Count(rev, "GhostOverlayServer.Remove(") == 1`.

- [ ] **Step 5: builds** for 2022, 2024, 2026, 2027 (`-p:DeployToRevit=false`, 0 errors each); `dotnet run --project tools/promote-check 2>&1 | tail -2` → `N/N checks pass`.
- [ ] **Step 6: commit** — `feat(revit): MA-3c - the ghost overlay drawn: a DirectContext3D server shows a review's proposed creates in this model's 3D views while the window is open, a tick recolours it, closing the window or Apply removes it; registered, updated and removed on Revit's thread through the hub; nothing written; promote-check 55 wiring`

### Task 3 — Final checks (nothing to commit)
`dotnet run --project tools/promote-check 2>&1 | tail -2`; builds 2022/2024/2026/2027 with `-p:DeployToRevit=false`, 0 errors; `git status --short` shows only `.claude/` and `ab.html`; report the totals and `git log --oneline master..HEAD`.

## Live drill MA3c (the controller, after the build)
- Revit 2024, the branch's add-in, a scratch copy bound to `ma2a-ghost`; a changeset of two wall creates (`LocationCurve` in mm near the model's walls, `LevelName GR-FFL`, `TypeName BDS_EXT_ARC_CMU_200 mm`, `BaseElevation 0`, `TopElevation 3000`) filed through the test bridge; Review AI Proposals → the picker → the window; a 3D view open: **O-1** two outlines appear (grey: unticked creates); **O-2** tick one → green at once; **O-3** close the window → the outlines are gone, the Undo list unchanged; **O-4** the window's Show line says the overlay's words. Then merge, deploy 2021–2027.

## Next (out of scope here)
- Plan and section views (DirectContext3D draws in 3D views; TemporaryGraphicsManager markers on 2022+ for plans — GHB-4's territory). Retype highlighting as an outline of the existing element's box. GHB-4: Ghost Builder's own preview reusing the server.
