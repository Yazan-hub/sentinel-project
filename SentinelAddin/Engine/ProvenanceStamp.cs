#nullable disable
// MA-0: the minimal provenance stamp (design §6.4) — an Extensible Storage entity on every element a changeset
// placed or changed: {v, changeset_id, source, proposal_guids, unique_id_at_placement, changeset_ids}. One entity per
// element per schema, so a write MERGES the element's own earlier stamp: changeset_id and source are the latest
// changeset's, proposal_guids and changeset_ids every one that touched the element (oldest first), and
// unique_id_at_placement stays the first placement's. Written inside the changeset's own transaction (Ctrl+Z removes
// it too). The JSON is pure (tools/promote-check); SENTINEL_CHECK hides the Revit half, the DocPin pattern. A stamp
// whose unique_id_at_placement is not its element's is a copy's: it is not this element's history and is not merged.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
#if !SENTINEL_CHECK
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.ExtensibleStorage;
#endif

namespace Sentinel.Engine
{
    public static class ProvenanceStamp
    {
        /// <summary>The stored value, merged onto <paramref name="prior"/> (the element's stamp now, or null). Pure.</summary>
        public static string Json(string changesetId, string source, IEnumerable<string> proposalGuids, string uniqueId, string prior = null)
        {
            var ids = new List<string>();
            var guids = new List<string>();
            try
            {
                using var d = JsonDocument.Parse(prior ?? "null");
                var r = d.RootElement;
                if (r.ValueKind == JsonValueKind.Object && Str(r, "unique_id_at_placement") == uniqueId)
                {
                    if (r.TryGetProperty("changeset_ids", out var a) && a.ValueKind == JsonValueKind.Array) ids.AddRange(a.EnumerateArray().Select(x => x.ToString()));
                    else if (Str(r, "changeset_id") is string one) ids.Add(one);
                    if (r.TryGetProperty("proposal_guids", out var g) && g.ValueKind == JsonValueKind.Array) guids.AddRange(g.EnumerateArray().Select(x => x.ToString()));
                }
            }
            catch (Exception) { /* not a stamp: start afresh */ }
            if (!ids.Contains(changesetId)) ids.Add(changesetId);
            guids.AddRange((proposalGuids ?? Enumerable.Empty<string>()).Where(x => !guids.Contains(x)));
            return JsonSerializer.Serialize(new
            {
                v = 1,
                changeset_id = changesetId,
                source,
                proposal_guids = guids,
                unique_id_at_placement = uniqueId,
                changeset_ids = ids,
            });
        }

        /// <summary>The source of the changeset that last stamped (e.g. "promote"), or null. Pure; never throws.</summary>
        public static string SourceOf(string json)
        {
            try { using var d = JsonDocument.Parse(json ?? "null"); return d.RootElement.ValueKind == JsonValueKind.Object ? Str(d.RootElement, "source") : null; }
            catch (Exception) { return null; }
        }

        private static string Str(JsonElement o, string name) =>
            o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

#if !SENTINEL_CHECK
        // Fixed forever: a new Guid is a new schema, and stamps written under the old one become unreadable.
        private static readonly Guid SchemaGuid = new Guid("C25BA5C0-8AFC-47E2-A3AB-52B79ED5B1C7");
        private const string Field = "json";

        // SettingsManager's pattern. A schema name cannot hold dots, so the design's Sentinel.Provenance.v1 is written so.
        private static Schema GetSchema()
        {
            var existing = Schema.Lookup(SchemaGuid);
            if (existing != null) return existing;
            var b = new SchemaBuilder(SchemaGuid);
            b.SetSchemaName("SentinelProvenanceV1");
            b.SetReadAccessLevel(AccessLevel.Public);
            b.SetWriteAccessLevel(AccessLevel.Public);
            b.AddSimpleField(Field, typeof(string));
            return b.Finish();
        }

        /// <summary>Stamp <paramref name="e"/>, merging its own earlier stamp. The CALLER holds the open transaction (the
        /// changeset's). API thread.</summary>
        public static void Write(Element e, string changesetId, string source, IEnumerable<string> proposalGuids)
        {
            var entity = new Entity(GetSchema());
            entity.Set(Field, Json(changesetId, source, proposalGuids, e.UniqueId, Read(e)));
            e.SetEntity(entity);
        }

        /// <summary>The stamp JSON on <paramref name="e"/>, or null (none, or the schema is not in this session). Read-only:
        /// never creates the schema. API thread; never throws.</summary>
        public static string Read(Element e)
        {
            try
            {
                var s = Schema.Lookup(SchemaGuid);
                if (s == null || e == null) return null;
                var entity = e.GetEntity(s);
                return entity.IsValid() ? entity.Get<string>(Field) : null;
            }
            catch (Exception) { return null; }
        }
#endif
    }
}
