#nullable disable
// F-S2-3 (founder) and audit BG-3: what the global Doctor (FailureInterceptor) does with one Revit failure, decided over plain
// values — no Revit API, so ghost-p2-check proves it offline. The Doctor never erases a warning ([BP] P1-3): it logs the
// warnings it used to erase ("Seen: …"), once their transaction commits. Its one touch is Revit's own resolution of a
// slightly-off-axis line, and only in a bound project that opted in (Project Setup). Never in a family document, never in a
// transaction Sentinel counts itself (GhostFailurePolicy.DoctorSkips), never on duplicate instances or a duplicate Mark.
using System.Collections.Generic;
using System.Linq;
using Sentinel.GhostBuilder;

namespace Sentinel.Updaters
{
    public static class DoctorPolicy
    {
        /// <summary>The failures the Doctor watches (it used to erase or resolve them); every other failure is Other.</summary>
        public enum Kind { Other, InaccurateLine, DuplicateInstances, DuplicateValue }
        public enum Act { Leave, Log, Resolve }

        /// <param name="optedIn">The document is bound to a web project and its Project Setup lets Revit straighten
        /// slightly-off-axis lines (default off).</param>
        public static Act Decide(string transactionName, bool familyDocument, bool isWarning, Kind kind, bool hasResolutions, bool optedIn)
        {
            if (familyDocument || !isWarning || kind == Kind.Other || GhostFailurePolicy.DoctorSkips(transactionName)) return Act.Leave;
            return kind == Kind.InaccurateLine && hasResolutions && optedIn ? Act.Resolve : Act.Log;
        }

        /// <summary>One failure the Doctor saw: its transaction, its key (definition and the ids it names), its text, those
        /// ids, and whether Revit's resolution was applied to it.</summary>
        public sealed class Seen
        {
            public string Tx, Key, Text;
            /// <summary>MA-1a item 7: the project key of the model the failure was seen in ("" when not bound).</summary>
            public string Project;
            public IReadOnlyCollection<long> Ids;
            public bool Resolved;
        }

        /// <summary>BG-3: the Doctor's lines once a transaction commits (<paramref name="committed"/>: DocumentChanged's
        /// transaction names), each failure once — Revit re-runs failure processing after a fix — and nothing for a transaction
        /// that is not among them (rolled back). One "Sentinel resolved N in …" line with its N, one "Seen: …" line per warning
        /// left in the model.</summary>
        public static List<(string Line, int Resolved)> Lines(IEnumerable<Seen> pending, ICollection<string> committed)
        {
            var lines = new List<(string Line, int Resolved)>();
            if (committed == null) return lines;
            foreach (var tx in (pending ?? Enumerable.Empty<Seen>()).Where(p => p != null && committed.Contains(p.Tx)).GroupBy(p => p.Tx))
            {
                var once = tx.GroupBy(p => p.Key).Select(g => g.FirstOrDefault(p => p.Resolved) ?? g.First()).ToList();
                var resolved = once.Where(p => p.Resolved).ToList();
                if (resolved.Count > 0)
                    lines.Add(($"Sentinel resolved {resolved.Count} in \"{tx.Key}\" with Revit's own fix (opted in under Project Setup): " +
                               string.Join("; ", resolved.GroupBy(p => Text(p.Text)).Select(g => g.Count() > 1 ? $"{g.Key} ×{g.Count()}" : g.Key)) +
                               Ids(resolved.SelectMany(p => p.Ids ?? new long[0])), resolved.Count));
                foreach (var p in once.Where(p => !p.Resolved))
                    lines.Add(($"Seen: {Text(p.Text)} in \"{tx.Key}\"{Ids(p.Ids)} — left in the model", 0));
            }
            return lines;
        }

        private static string Text(string s)
        {
            s = string.IsNullOrWhiteSpace(s) ? "Revit warning" : s.Trim();
            return s.Length > 120 ? s.Substring(0, 117) + "..." : s;
        }

        private static string Ids(IEnumerable<long> ids)
        {
            var list = (ids ?? new long[0]).Distinct().ToList();
            if (list.Count == 0) return "";
            return $" (element{(list.Count > 1 ? "s" : "")} {string.Join(", ", list.Take(10))}{(list.Count > 10 ? $" and {list.Count - 10} more" : "")})";
        }
    }
}
