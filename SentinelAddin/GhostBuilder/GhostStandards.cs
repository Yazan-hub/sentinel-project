using System;
using System.Threading.Tasks;
using Sentinel.Coordination; // ArtefactClient, ResolvedArtefact

namespace Sentinel.GhostBuilder
{
    /// <summary>
    /// The three office standards a Ghost build works with — layers@n, guideline@n and type_catalog@n — on the
    /// document's web project, else on its office (cohesion phase 4b-2), each with where it came from. Nothing comes
    /// from the machine or from beside the DLL: a kind not installed is none, and <see cref="Header"/> names all three
    /// either way. Pure but for <see cref="Load(string,bool,bool,bool)"/> (the bridge GETs), so
    /// tools/ghost-standards-check compiles it.
    /// </summary>
    public sealed class GhostStandards
    {
        /// <summary>A type catalogue is ~350 KB and its first fetch goes through the service URL (spec decision 5).</summary>
        public static readonly TimeSpan CatalogTimeout = TimeSpan.FromSeconds(20);

        public ResolvedArtefact LayersSource, GuidelineSource, CatalogSource;

        /// <summary>What the review window and every build summary are headed with: the three labels, none included.</summary>
        public string Header => "Layers: " + LayersSource.Label + " · Guideline: " + GuidelineSource.Label + " · Type catalogue: " + CatalogSource.Label;

        private GhostStandards(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog)
        {
            LayersSource = layers;
            GuidelineSource = guideline;
            CatalogSource = catalog;
        }

        /// <summary>The document's standards (<paramref name="key"/> read from ProjectContext on the API thread; "" is
        /// "not bound"). BLOCKING: the kinds asked for are fetched in parallel, ≤ 4 s each and ≤ 20 s for the
        /// catalogue — run it off the Revit UI thread. A kind the command does not ask for is none "not needed by this
        /// command". No Revit API; never throws.</summary>
        public static GhostStandards Load(string key, bool layers = true, bool guideline = true, bool catalog = true) =>
            Load((kind, timeout) => ArtefactClient.Resolve(key, kind, timeout), layers, guideline, catalog);

        /// <summary>As <see cref="Load(string,bool,bool,bool)"/> through <paramref name="resolve"/>(kind, timeout) — the
        /// harness's fake bridge.</summary>
        internal static GhostStandards Load(Func<string, TimeSpan?, ResolvedArtefact> resolve, bool layers, bool guideline, bool catalog)
        {
            Task<ResolvedArtefact> Get(bool wanted, string kind, TimeSpan? timeout) => wanted
                ? Task.Run(() =>
                {
                    try { return resolve(kind, timeout); }
                    catch (Exception ex) { return ArtefactClient.None(kind, $"the {kind} could not be loaded ({ex.Message})"); }
                })
                : Task.FromResult(ArtefactClient.None(kind, "not needed by this command"));
            var l = Get(layers, "layers", null);
            var g = Get(guideline, "guideline", null);
            var c = Get(catalog, "type_catalog", CatalogTimeout);
            Task.WhenAll(l, g, c).GetAwaiter().GetResult();
            return FromResolved(l.Result, g.Result, c.Result);
        }

        /// <summary>The three resolved kinds → what a build works with. The pure half of Load.</summary>
        internal static GhostStandards FromResolved(ResolvedArtefact layers, ResolvedArtefact guideline, ResolvedArtefact catalog) =>
            new GhostStandards(layers, guideline, catalog);
    }
}
