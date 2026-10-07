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

        private List<GhostOverlayGeometry.Tri> _tris = new List<GhostOverlayGeometry.Tri>();
        private VertexBuffer _tvb; private IndexBuffer _tib; private int _triCount, _triVertices; private EffectInstance _teffect;
        private readonly HashSet<ViewType> _askedIn = new HashSet<ViewType>(), _drawnIn = new HashSet<ViewType>();
        public GhostOverlayServer(Document doc, string title, List<GhostOverlayGeometry.Segment> segments, List<GhostOverlayGeometry.Tri> tris = null)
        { _doc = doc; _title = title ?? ""; _segments = segments ?? new List<GhostOverlayGeometry.Segment>(); }

        /// <summary>New segments (a tick, a lock): the buffers are rebuilt on the next frame.</summary>
        public void Update(List<GhostOverlayGeometry.Segment> segments, List<GhostOverlayGeometry.Tri> tris = null) { _segments = segments ?? new List<GhostOverlayGeometry.Segment>(); _tris = tris ?? new List<GhostOverlayGeometry.Tri>(); Drop(); }
        public int Count => _segments.Count;
        private void Drop() { _vb?.Dispose(); _ib?.Dispose(); _tvb?.Dispose(); _tib?.Dispose(); _teffect?.Dispose(); _format?.Dispose(); _effect?.Dispose(); _teffect = null; _vb = null; _ib = null; _tvb = null; _tib = null; _triCount = 0; _format = null; _effect = null; }

        public Guid GetServerId() => _id;
        public ExternalServiceId GetServiceId() => ExternalServices.BuiltInExternalServices.DirectContext3DService;
        public string GetName() => "Sentinel ghost overlay";
        public string GetDescription() => "The proposed creates of an open Review AI Proposals window, as outlines: " + _title;
        public string GetVendorId() => "SNTL";
        public string GetApplicationId() => "";
        public string GetSourceId() => "";
        public bool UsesHandles() => false;
        // MA-3c: the overlay says once that Revit asked it and once that it drew — a person (and a drill) can tell a registered server that is
        // never asked from one whose lines sit out of sight. The pane's LogDoctor marshals itself (MA-3b8), so the render thread may call it.
        public bool CanExecute(View view)
        {
            // MA-3c Next: a plan or section is asked too — whether Revit draws DirectContext3D there is Revit's to say; the Doctor line names the view's type.
            bool fits = view is View3D || view is ViewPlan || view is ViewSection, same = _doc.IsValidObject && view.Document != null && view.Document.Equals(_doc);
            if (fits && _askedIn.Add(view.ViewType)) { try { Sentinel.App.PanelVm?.LogDoctor($"Ghost overlay: asked for the {view.ViewType} view \"{view.Name}\" — this model: {same}; {_segments.Count} line(s), {_tris.Count} face(s)"); } catch { /* no pane */ } }
            return fits && same && _segments.Count > 0;
        }
        public bool UseInTransparentPass(View view) => _tris.Count > 0;
        public Outline GetBoundingBox(View view)
        {
            var b = GhostOverlayGeometry.Bounds(_segments);
            return b == null ? null : new Outline(Ft(b[0]), Ft(b[1]));
        }
        public void RenderScene(View view, DisplayStyle displayStyle)
        {
            if (_segments.Count == 0) return;
            if (_vb == null || !_vb.IsValid() || _ib == null || !_ib.IsValid()) Build();
            if (DrawContext.IsTransparentPass())
            {
                if (_triCount > 0) DrawContext.FlushBuffer(_tvb, _triVertices, _tib, 3 * _triCount, _format, _teffect, PrimitiveType.TriangleList, 0, _triCount);
                return;
            }
            DrawContext.FlushBuffer(_vb, _vertices, _ib, 2 * _lines, _format, _effect, PrimitiveType.LineList, 0, _lines);
            if (_drawnIn.Add(view.ViewType)) { try { Sentinel.App.PanelVm?.LogDoctor($"Ghost overlay: drawn in the {view.ViewType} view \"{view.Name}\" — {_lines} line(s), {_triCount} face(s)"); } catch { /* no pane */ } }
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
            _triCount = _tris.Count; _triVertices = 3 * _triCount;
            if (_triCount == 0) return;
            // Review (drill MA3cN): the vertex alpha alone drew the sheet solid — Revit blends by the effect's transparency.
            _teffect = new EffectInstance(VertexFormatBits.PositionColored); _teffect.SetTransparency(GhostOverlayGeometry.FaceTransparency / 255.0);
            _tvb = new VertexBuffer(VertexPositionColored.GetSizeInFloats() * _triVertices);
            _tvb.Map(VertexPositionColored.GetSizeInFloats() * _triVertices);
            var ts = _tvb.GetVertexStreamPositionColored();
            foreach (var t in _tris)
            {
                var c = new ColorWithTransparency(t.R, t.G, t.Bl, GhostOverlayGeometry.FaceTransparency);
                ts.AddVertex(new VertexPositionColored(Ft(t.A), c)); ts.AddVertex(new VertexPositionColored(Ft(t.B), c)); ts.AddVertex(new VertexPositionColored(Ft(t.C), c));
            }
            _tvb.Unmap();
            _tib = new IndexBuffer(IndexTriangle.GetSizeInShortInts() * _triCount);
            _tib.Map(IndexTriangle.GetSizeInShortInts() * _triCount);
            var tst = _tib.GetIndexStreamTriangle();
            for (int i = 0; i < _triCount; i++) tst.AddTriangle(new IndexTriangle(3 * i, 3 * i + 1, 3 * i + 2));
            _tib.Unmap();
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
