#nullable disable
// MA-0: the minimal provenance stamp (design §6.4) — an Extensible Storage entity on every element a changeset
// placed or changed: {v, changeset_id, proposal_guids, unique_id_at_placement}. One entity per element per schema (a
// second write overwrites), so the executor stamps once per element with every guid that touched it, inside the
// changeset's own transaction (Ctrl+Z removes the stamp too). The JSON is pure (tools/promote-check); SENTINEL_CHECK
// hides the Revit half, the DocPin pattern. A stamp whose unique_id_at_placement is not its element's is a copy.
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
        /// <summary>The stored value. Pure.</summary>
        public static string Json(string changesetId, IEnumerable<string> proposalGuids, string uniqueIdAtPlacement) =>
            JsonSerializer.Serialize(new
            {
                v = 1,
                changeset_id = changesetId,
                proposal_guids = (proposalGuids ?? Enumerable.Empty<string>()).ToList(),
                unique_id_at_placement = uniqueIdAtPlacement,
            });

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

        /// <summary>Stamp <paramref name="e"/>. The CALLER holds the open transaction (the changeset's). API thread.</summary>
        public static void Write(Element e, string changesetId, IEnumerable<string> proposalGuids)
        {
            var entity = new Entity(GetSchema());
            entity.Set(Field, Json(changesetId, proposalGuids, e.UniqueId));
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
