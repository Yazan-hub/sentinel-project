using System;
using System.IO;

namespace Sentinel.Engine
{
    /// <summary>
    /// SEC-2: where the add-in's local tools (Ghost Builder, Photo Massing, Datum) may reach. The model endpoint is this
    /// PC's own (loopback) unless this PC's config.json opts in to a host elsewhere; a folder a model names is a full local
    /// path; the mapping schema is read only from the add-in's folder or %AppData%\Sentinel\schemas. Each check answers
    /// null, or the words the refusal shows. Pure (no Revit): tools/project-context-check proves it.
    /// </summary>
    public static class LocalOnly
    {
        public const string DefaultModelUrl = "http://localhost:11434/api/generate";
        private const string Nothing = " Nothing was read or sent.";

        public static string SchemasDir =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Sentinel", "schemas");

        /// <summary>Null when the tools may call this model endpoint (blank: the default, this PC's Ollama).</summary>
        public static string? ModelUrlRefusal(string? url, bool cloudOptIn)
        {
            string u = string.IsNullOrWhiteSpace(url) ? DefaultModelUrl : url!.Trim();
            if (!Uri.TryCreate(u, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
                return $"The model address \"{u}\" is not an http or https address — set ollama_url in this PC's Sentinel config.json." + Nothing;
            if (uri.UserInfo.Length > 0)
                return "The model address carries a user name or password — set ollama_url in this PC's Sentinel config.json without one." + Nothing;
            if (!OnThisPc(uri) && !cloudOptIn)
                return $"The model at {uri.Host} is not on this PC, and this PC has not opted in to a model elsewhere "
                     + "(ghost_cloud_opt_in in this PC's Sentinel config.json)." + Nothing;
            if (!OnThisPc(uri) && uri.Scheme != Uri.UriSchemeHttps)
                return $"The model at {uri.Host} is not on this PC, and Sentinel calls a model elsewhere over https only "
                     + "— set an https ollama_url in this PC's Sentinel config.json." + Nothing;
            return null;
        }

        /// <summary>The endpoint a model client calls, or an ArgumentException in words: the belt inside each client.</summary>
        public static string ModelUrl(string? url, bool cloudOptIn) =>
            ModelUrlRefusal(url, cloudOptIn) is { } why
                ? throw new ArgumentException(why)
                : (string.IsNullOrWhiteSpace(url) ? DefaultModelUrl : url!.Trim());

        /// <summary>Where the model is, for the progress text: "on this PC", or "at host" for a host this PC opted in to.</summary>
        public static string Where(string? url) =>
            Uri.TryCreate(string.IsNullOrWhiteSpace(url) ? DefaultModelUrl : url!.Trim(), UriKind.Absolute, out var u) && !OnThisPc(u)
                ? "at " + u.Host
                : "on this PC";

        /// <summary>Null when a tool may read this folder (blank: none set). A share or device path (\\…, //…) is read only
        /// when this PC's own config.json names it, never when a model does; any other folder is a full drive path.</summary>
        public static string? FolderRefusal(string? path, bool fromModel)
        {
            if (string.IsNullOrWhiteSpace(path)) return null;
            string p = path!.Trim();
            bool share = p.StartsWith(@"\\", StringComparison.Ordinal) || p.StartsWith("//", StringComparison.Ordinal)
                         || (Uri.TryCreate(p, UriKind.Absolute, out var u) && u.IsUnc);
            if (share)
                return fromModel
                    ? $"This model's Project Setup names the folder \"{p}\", a network share. Sentinel reads a share only when this PC's "
                      + "own Sentinel config.json names it, or through a drive letter mapped on this PC." + Nothing
                    : null;
            bool drive = p.Length >= 3 && char.IsLetter(p[0]) && p[1] == ':' && (p[2] == '\\' || p[2] == '/');
            return drive ? null : $"The folder \"{p}\" is not a full path on this PC (like C:\\Projects\\…)." + Nothing;
        }

        /// <summary>Null when Ghost Builder may read this mapping schema (blank: none): a .json file in the add-in's folder
        /// or in <paramref name="schemasDir"/>, never a Sentinel config file.</summary>
        public static string? SchemaRefusal(string? path, string addinDir, string schemasDir)
        {
            if (string.IsNullOrWhiteSpace(path)) return null;
            string full;
            try { full = Path.GetFullPath(path!.Trim()); }
            catch (Exception) { full = ""; }
            string name = Path.GetFileName(full);
            bool ok = full.Length > 0 && (Under(full, addinDir) || Under(full, schemasDir))
                      && name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
                      && !name.Equals("bcf-config.json", StringComparison.OrdinalIgnoreCase)
                      && !name.Equals("config.json", StringComparison.OrdinalIgnoreCase);
            return ok ? null : $"The mapping schema \"{path!.Trim()}\" is not a .json file in the add-in's folder or in {schemasDir}." + Nothing;
        }

        /// <summary>A loopback address, or the name localhost in any case (.NET marks only some spellings loopback).</summary>
        private static bool OnThisPc(Uri u) =>
            u.IsLoopback || string.Equals(u.Host, "localhost", StringComparison.OrdinalIgnoreCase);

        private static bool Under(string full, string root) =>
            !string.IsNullOrWhiteSpace(root)
            && full.StartsWith(Path.GetFullPath(root).TrimEnd('\\', '/') + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }
}
