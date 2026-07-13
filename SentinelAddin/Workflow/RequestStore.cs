using System.Text.Json;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.ExtensibleStorage;

namespace Sentinel.Workflow;

/// <summary>
/// Persists change requests + audit log in Extensible Storage on a dedicated
/// DataStorage element. One JSON blob field: simple, versionable, and immune
/// to ES schema-migration pain. All writes REQUIRE an open transaction
/// (the caller owns it — DMU Execute or an ExternalEvent).
/// </summary>
public static class RequestStore
{
    private static readonly Guid SchemaGuid = new("5E8D2C41-7B9F-4A3E-8D6C-1F0B3A5E9C22");
    private const string FieldName = "Payload";
    private const string StorageName = "Sentinel.Requests";

    private sealed class Payload
    {
        public int SchemaVersion { get; set; } = 1;   // wire-format version (portable core)
        public List<ChangeRequest> Requests { get; set; } = new List<ChangeRequest>();
        public List<AuditEntry> Audit { get; set; } = new List<AuditEntry>();
    }

    private static Schema GetSchema()
    {
        var existing = Schema.Lookup(SchemaGuid);
        if (existing is not null) return existing;

        var builder = new SchemaBuilder(SchemaGuid);
        builder.SetSchemaName("SentinelRequests");
        builder.SetReadAccessLevel(AccessLevel.Public);
        builder.SetWriteAccessLevel(AccessLevel.Public); // role gate is in RequestManager
        builder.AddSimpleField(FieldName, typeof(string));
        return builder.Finish();
    }

    private static DataStorage? FindStorage(Document doc) =>
        new FilteredElementCollector(doc)
            .OfClass(typeof(DataStorage))
            .Cast<DataStorage>()
            .FirstOrDefault(ds => ds.Name == StorageName);

    private static Payload Load(Document doc)
    {
        var ds = FindStorage(doc);
        if (ds is null) return new Payload();
        var entity = ds.GetEntity(GetSchema());
        if (!entity.IsValid()) return new Payload();
        var json = entity.Get<string>(FieldName);
        if (string.IsNullOrEmpty(json)) return new Payload();
        try { return JsonSerializer.Deserialize<Payload>(json) ?? new Payload(); }
        catch (JsonException) { return new Payload(); }
    }

    /// Caller must hold an open transaction.
    private static void Save(Document doc, Payload payload)
    {
        var ds = FindStorage(doc) ?? DataStorage.Create(doc);
        if (ds.Name != StorageName) ds.Name = StorageName;
        var entity = new Entity(GetSchema());
        entity.Set(FieldName, JsonSerializer.Serialize(payload));
        ds.SetEntity(entity);
    }

    public static IReadOnlyList<ChangeRequest> GetAll(Document doc) => Load(doc).Requests;

    public static IReadOnlyList<ChangeRequest> GetPending(Document doc) =>
        Load(doc).Requests.Where(r => r.Status == RequestStatus.Pending).ToList();

    public static IReadOnlyList<AuditEntry> GetAudit(Document doc) => Load(doc).Audit;

    /// Add or update a request + append audit. Transaction required.
    public static void Upsert(Document doc, ChangeRequest request, AuditEntry audit)
    {
        var p = Load(doc);
        var i = p.Requests.FindIndex(r => r.Id == request.Id);
        if (i >= 0) p.Requests[i] = request; else p.Requests.Add(request);
        p.Audit.Add(audit);   // append-only: existing entries are never touched
        Save(doc, p);
    }

    public static ChangeRequest? Find(Document doc, Guid id) =>
        Load(doc).Requests.FirstOrDefault(r => r.Id == id);

    /// Latest pending request per element (for panel flag lookups).
    public static bool HasPending(Document doc, long elementId) =>
        Load(doc).Requests.Any(r => r.ElementId == elementId && r.Status == RequestStatus.Pending);
}
