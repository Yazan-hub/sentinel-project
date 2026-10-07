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
        private void Drop() { _vb?.Dispose(); _ib?.Dispose(); _format?.Dispose(); _effect?.Dispose(); _vb = null; _ib = null; _format = null; _effect = null; }

        public Guid GetServerId() => _id;
        public ExternalServiceId GetServiceId() => ExternalServices.BuiltInExternalServices.DirectContext3DService;
        public string GetName() => "Sentinel ghost overlay";
        public string GetDescription() => "The proposed creates of an open Review AI Proposals window, as outlines: " + _title;
        public string GetVendorId() => "SNTL";
        public string GetApplicationId() => "";
        public string GetSourceId() => "";
        public bool UsesHandles() => false;
        public bool CanExecute(View view) => view is View3D && _doc.IsValidObject && view.Document != null && view.Document.Equals(_doc) && _segments.Count > 0;
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
