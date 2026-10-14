#nullable disable
// MA-7-14: the photos Photo Massing may read - the project's evidence pack (GET /cde/:key/evidence/evp-0001), never a folder. Closes Photo Massing only:
// Ghost Builder's LocalVisionReader still reads GhostSourceFolder for layer hints (no geometry) - owed as 7-28. A photo is read only
// as the pack's blurred copy (GET .../items/:id/view), and a changeset names each one as "ev-NNNN sha256:<copy sha256>" on its mass. Pure
// (System.Text.Json only): tools/massing-check compiles it alone. The rule mirrors the bridge's usable(item, "read") (evidence-logic.mjs);
// the bridge applies it again at filing (changesets-store photoPackRefusal), so this side only decides what to offer and say.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace Sentinel.GhostBuilder
{
    public sealed class PackPhoto
    {
        public string Id;
        public string CopySha256;
    }

    public static class PackPhotos
    {
        public const string PackId = "evp-0001";

        /// <summary>The pack's own photos with a blurred copy, by id, and one sentence for each that is not read. Admitted only: expired, changed, web
        /// (context) and copy-less photos are named, not offered. Null Read with a reason when the answer is not a pack.</summary>
        public static (List<PackPhoto> Read, List<string> Skipped, string Error) Usable(string packJson)
        {
            var read = new List<PackPhoto>();
            var skipped = new List<string>();
            try
            {
                using var d = JsonDocument.Parse(packJson ?? "");
                if (d.RootElement.ValueKind != JsonValueKind.Object || !d.RootElement.TryGetProperty("pack", out var pack)
                    || pack.ValueKind != JsonValueKind.Object || !pack.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
                    return (null, null, "the answer was not an evidence pack");
                foreach (var it in items.EnumerateArray())
                {
                    string Str(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
                    string id = Str(it, "id");
                    if (id == null || Str(it, "kind") != "photo") continue;
                    string state = Str(it, "state");
                    if (state == "expired" || state == "changed") { skipped.Add($"{id} {(state == "expired" ? "is expired (delete-by)" : "changed since it was admitted")} — not read"); continue; }
                    if (Str(it, "role") == "context") { skipped.Add($"{id} is a web photo — context only; not read"); continue; }
                    string sha = it.TryGetProperty("view_copy", out var vc) ? Str(vc, "sha256") : null;
                    if (sha == null) { skipped.Add($"{id} has no blurred copy — blur it in Files ▸ Evidence; not read"); continue; }
                    read.Add(new PackPhoto { Id = id, CopySha256 = sha });
                }
            }
            catch (JsonException) { return (null, null, "the answer was not JSON"); }
            read.Sort((a, b) => string.CompareOrdinal(a.Id, b.Id));
            return (read, skipped, null);
        }

        /// <summary>What the mass carries for a photo it read - the id and the blurred copy's sha256, the pair the bridge checks (fixtures/changeset-ops/photo-massing-evidence.json).</summary>
        public static string Evidence(PackPhoto p) => $"{p.Id} sha256:{p.CopySha256}";

        /// <summary>True when the bytes the bridge sent are the copy the pack names - a changeset claims that copy's sha256, so it is checked before the model sees them.</summary>
        public static bool IsCopy(byte[] bytes, PackPhoto p)
        {
            if (bytes == null || p?.CopySha256 == null) return false;
            using var sha = System.Security.Cryptography.SHA256.Create();
            return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant() == p.CopySha256;
        }

        /// <summary>Said when there is nothing to read.</summary>
        public static string NoneWords(IReadOnlyList<string> skipped) =>
            skipped.Count > 0
                ? string.Join("\n", skipped) + "\n\nPhoto Massing reads the evidence pack's admitted, blurred photos only. Nothing was read."
                : "The project's evidence pack holds no admitted, blurred photo — admit photos in Files ▸ Evidence and blur them, then run again. Nothing was read.";
    }
}
