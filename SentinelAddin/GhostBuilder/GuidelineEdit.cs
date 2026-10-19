#nullable disable
// Batch 3 of the no-JSON work (spec docs/superpowers/specs/2026-10-19-standards-batch3-design.md): the Modelling Guideline window's model. It reads
// the guideline in force as a JSON tree and writes back only the fields the window shows: views, viewNaming, graphics, a rule's other keys and every
// other key stay as they were. A field left as it was read keeps its original node, so an unchanged save writes the same body (and sha). The common
// mistakes are said in a person's words; GuidelineMatcher's check (the bridge's twin) is the last word before the bridge. Revit-free: guideline-check links it.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;

namespace Sentinel.GhostBuilder
{
    public sealed class GuidelineEdit
    {
        /// <summary>What a rule or a default places: a family, and a type or a type pattern; a stair's run width.</summary>
        public sealed class Use
        {
            public string Family = "", Type = "", TypePattern = "", WidthMm = "";
            internal JsonObject Orig;
            internal Use Read;
            internal Use Snapshot() => (Use)MemberwiseClone();
            public bool IsBlank => new[] { Family, Type, TypePattern, WidthMm }.All(s => string.IsNullOrWhiteSpace(s));
        }

        /// <summary>One rule: when (layer, level, discipline, parameters as "Name = value; …") → use, and why.</summary>
        public sealed class Rule
        {
            public string Layer = "", Level = "", Discipline = "", Params = "", Why = "";
            public Use Use = new Use();
            internal JsonObject Orig;
            internal Rule Read;
            internal Rule Snapshot() => (Rule)MemberwiseClone();
        }

        /// <summary>One category's entry: its rules in order (the first that matches wins) and its default.</summary>
        public sealed class Element
        {
            public string Category = "";
            public List<Rule> Rules = new List<Rule>();
            public Use Default = new Use();
            internal JsonObject Orig;
            public bool IsStairs => Category.Trim().Equals("stairs", StringComparison.OrdinalIgnoreCase);
        }

        public string Standard = "";
        public List<Element> Elements = new List<Element>();
        public string TitleBlock = "", SheetNumber = "", SheetName = "";
        /// <summary>Category (GuidelineMatcher.PlacementCategories' spelling) → workset name; a category not here goes on the active workset.</summary>
        public Dictionary<string, string> Worksets = new Dictionary<string, string>(StringComparer.Ordinal);
        public bool PhaseView;
        private JsonObject _root = new JsonObject();
        private string _readStandard = "", _readTitleBlock = "", _readNumber = "", _readName = "", _readWorksets = "";
        private bool _readPhase;

        /// <summary>The categories the window offers to add: the ones Sentinel types and places.</summary>
        public static readonly string[] Categories = { "Walls", "Floors", "Roofs", "Ceilings", "Doors", "Windows", "Columns", "Furniture", "Stairs", "Structural Framing" };
        public static IReadOnlyList<string> PlacementCategories => GuidelineMatcher.PlacementCategories;

        /// <summary>The guideline in force (null or blank: a new one) → the window's model. A body that is not a JSON object throws.</summary>
        public static GuidelineEdit From(string json)
        {
            var g = new GuidelineEdit();
            if (string.IsNullOrWhiteSpace(json)) return g;
            g._root = JsonNode.Parse(json) as JsonObject ?? throw new FormatException("the guideline is not a JSON object");
            g.Standard = g._readStandard = Str(g._root, "standard");
            if (g._root["elements"] is JsonArray els)
                foreach (var eo in els.OfType<JsonObject>())
                {
                    var e = new Element { Category = Str(eo, "category"), Orig = eo, Default = ReadUse(eo["default"] as JsonObject) };
                    if (eo["rules"] is JsonArray rules)
                        foreach (var ro in rules.OfType<JsonObject>())
                        {
                            var w = ro["when"] as JsonObject;
                            var r = new Rule { Layer = Str(w, "layer"), Level = Str(w, "level"), Discipline = Str(w, "discipline"), Params = ParamsText(w?["params"] as JsonObject),
                                Why = Str(ro, "why"), Use = ReadUse(ro["use"] as JsonObject), Orig = ro };
                            r.Read = r.Snapshot();
                            e.Rules.Add(r);
                        }
                    g.Elements.Add(e);
                }
            if (g._root["sheets"] is JsonObject sh) { g.TitleBlock = g._readTitleBlock = Str(sh, "titleBlock"); g.SheetNumber = g._readNumber = Str(sh, "number"); g.SheetName = g._readName = Str(sh, "name"); }
            if (g._root["placement"] is JsonObject p)
            {
                if (p["worksets"] is JsonObject ws)
                    foreach (var kv in ws)
                    {
                        var canon = GuidelineMatcher.PlacementCategories.FirstOrDefault(c => c.Equals(kv.Key.Trim(), StringComparison.OrdinalIgnoreCase));
                        if (canon != null && kv.Value is JsonValue v && v.TryGetValue(out string name)) g.Worksets[canon] = name;
                    }
                g.PhaseView = g._readPhase = Str(p, "phase") == "view";
            }
            g._readWorksets = g.WorksetsKey();
            return g;
        }

        /// <summary>The body to install, or null with <paramref name="problem"/> in a person's words. Repeatable: the model and the body read are not changed.</summary>
        public string ToJson(out string problem)
        {
            problem = null;
            try
            {
                var root = (JsonObject)_root.DeepClone();
                Set(root, "standard", Standard, _readStandard);
                if (Str(root, "standard").Trim().Length == 0) throw new Say("Name the guideline (for example: Office Modelling Guideline v4).");
                if (Elements.Count == 0) throw new Say("Add at least one category and its rules.");
                var els = new JsonArray();
                foreach (var e in Elements)
                {
                    var cat = e.Category.Trim();
                    if (cat.Length == 0) throw new Say("A category has no name.");
                    var o = Clone(e.Orig);
                    if (Str(o, "category") != e.Category) o["category"] = cat;
                    var rules = new JsonArray();
                    for (int i = 0; i < e.Rules.Count; i++) rules.Add(WriteRule(e.Rules[i], e.IsStairs, $"{cat}, rule {i + 1}"));
                    o["rules"] = rules;
                    if (e.Default.IsBlank) o.Remove("default");
                    else o["default"] = WriteUse(e.Default, e.IsStairs, $"{cat}, default");
                    els.Add(o);
                }
                root["elements"] = els;
                WriteSheets(root);
                WritePlacement(root);
                var json = root.ToJsonString();
                GuidelineMatcher.FromBodies(json, null, out var error, out _);
                if (error != null) throw new Say("The guideline would not install: " + error);
                return json;
            }
            catch (Say s) { problem = s.Message; return null; }
        }

        // ── writing ────────────────────────────────────────────────────────────────────────────────────────

        private JsonObject WriteRule(Rule r, bool stairs, string where)
        {
            var read = r.Read ?? new Rule();
            var o = Clone(r.Orig);
            var when = Clone(o["when"] as JsonObject);
            Set(when, "layer", r.Layer, read.Layer);
            Set(when, "level", r.Level, read.Level);
            Set(when, "discipline", r.Discipline, read.Discipline);
            // A condition present but blank (or not text) in a body installed before MA-2a is refused by the bridge — taken out even when
            // the card left it as it was, so an old guideline can be saved from the window.
            foreach (var k in new[] { "layer", "level", "discipline" })
                if (when.ContainsKey(k) && Str(when, k).Trim().Length == 0) when.Remove(k);
            if (r.Params != read.Params)
            {
                var p = ParseParams(r.Params, where);
                if (p.Count == 0) when.Remove("params"); else when["params"] = p;
            }
            if (!new[] { "layer", "level", "discipline" }.Any(k => Str(when, k).Trim().Length > 0) && !(when["params"] is JsonObject jp && jp.Count > 0))
                throw new Say($"{where} names no condition (layer, level, discipline or parameters) — it would match every element; make it the category's default instead.");
            o["when"] = when;
            o["use"] = WriteUse(r.Use, stairs, where);
            Set(o, "why", r.Why, read.Why);
            return o;
        }

        private static JsonObject WriteUse(Use u, bool stairs, string where)
        {
            var read = u.Read ?? new Use();
            var o = Clone(u.Orig);
            Set(o, "family", u.Family, read.Family);
            Set(o, "type", u.Type, read.Type);
            Set(o, "typePattern", u.TypePattern, read.TypePattern);
            if (Str(o, "family").Trim().Length == 0) throw new Say($"{where} needs the family it places.");
            if (stairs && Str(o, "type").Trim().Length == 0) throw new Say($"{where} needs the office's stair type.");
            if (u.WidthMm != read.WidthMm || stairs && !(o["params"] is JsonObject wp && wp["width_mm"] != null))
            {
                var p = Clone(o["params"] as JsonObject);
                var t = (u.WidthMm ?? "").Trim().Replace(',', '.');
                if (t.Length == 0 && !stairs) p.Remove("width_mm");
                else if (!double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out var mm) || !(mm >= 300 && mm <= 5000)) // NaN fails too
                    throw new Say($"{where}: the stair's run width is a number of millimetres from 300 to 5000.");
                else p["width_mm"] = mm;
                if (p.Count == 0) o.Remove("params"); else o["params"] = p;
            }
            return o;
        }

        private void WriteSheets(JsonObject root)
        {
            if (TitleBlock == _readTitleBlock && SheetNumber == _readNumber && SheetName == _readName) return;
            var parts = new[] { TitleBlock, SheetNumber, SheetName }.Select(s => (s ?? "").Trim()).ToArray();
            if (parts.All(s => s.Length == 0)) { root.Remove("sheets"); return; }
            if (parts[0].Length == 0) throw new Say("Sheets: choose the title block, or clear all three sheet fields.");
            if (parts[1].Length == 0 || parts[2].Length == 0) throw new Say("Sheets: give both the sheet number and the sheet name, or clear all three sheet fields.");
            if (!parts[1].Contains("{level}")) throw new Say("Sheets: the sheet number must hold {level}, so each level's sheet gets its own number.");
            var sh = Clone(root["sheets"] as JsonObject);
            sh["titleBlock"] = parts[0]; sh["number"] = parts[1]; sh["name"] = parts[2];
            root["sheets"] = sh;
        }

        private void WritePlacement(JsonObject root)
        {
            if (WorksetsKey() == _readWorksets && PhaseView == _readPhase) return;
            var p = Clone(root["placement"] as JsonObject);
            var ws = new JsonObject();
            foreach (var c in GuidelineMatcher.PlacementCategories)
                if (Worksets.TryGetValue(c, out var name) && !string.IsNullOrWhiteSpace(name)) ws[c] = name.Trim();
            if (ws.Count == 0) p.Remove("worksets"); else p["worksets"] = ws;
            if (PhaseView) p["phase"] = "view"; else p.Remove("phase");
            if (p.Count == 0) root.Remove("placement"); else root["placement"] = p;
        }

        // ── helpers ────────────────────────────────────────────────────────────────────────────────────────

        private sealed class Say : Exception { public Say(string m) : base(m) { } }

        private string WorksetsKey() => string.Join("\n", GuidelineMatcher.PlacementCategories.Select(c => Worksets.TryGetValue(c, out var w) ? (w ?? "").Trim() : ""));

        private static Use ReadUse(JsonObject o)
        {
            var u = new Use { Orig = o };
            if (o == null) return u;
            u.Family = Str(o, "family"); u.Type = Str(o, "type"); u.TypePattern = Str(o, "typePattern");
            var w = (o["params"] as JsonObject)?["width_mm"];
            u.WidthMm = w == null ? "" : w is JsonValue v && v.TryGetValue(out string s) ? s : w.ToJsonString();
            u.Read = u.Snapshot();
            return u;
        }

        private static string Str(JsonObject o, string key) => o?[key] is JsonValue v && v.TryGetValue(out string s) ? s : "";

        private static JsonObject Clone(JsonObject o) => o == null ? new JsonObject() : (JsonObject)o.DeepClone();

        /// <summary>A field left as it was read keeps its node (absent stays absent); a changed one is trimmed, and blank removes the key —
        /// a blank condition is never written (the bridge refuses it).</summary>
        private static void Set(JsonObject o, string key, string text, string read)
        {
            if ((text ?? "") == (read ?? "")) return;
            var t = (text ?? "").Trim();
            if (t.Length == 0) o.Remove(key); else o[key] = t;
        }

        /// <summary>"Material = STONE; Fire = 60" (or one per line) ↔ {"Material": "STONE", "Fire": "60"}.</summary>
        public static string ParamsText(JsonObject p) =>
            p == null ? "" : string.Join("; ", p.Select(kv => kv.Key + " = " + (kv.Value is JsonValue v && v.TryGetValue(out string s) ? s : kv.Value?.ToJsonString() ?? "")));

        private static JsonObject ParseParams(string text, string where)
        {
            var o = new JsonObject();
            foreach (var part in (text ?? "").Split(new[] { ';', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (part.Trim().Length == 0) continue;
                var at = part.IndexOf('=');
                var k = at < 0 ? "" : part.Substring(0, at).Trim();
                var v = at < 0 ? "" : part.Substring(at + 1).Trim();
                if (k.Length == 0 || v.Length == 0) throw new Say($"{where}: write each parameter as Name = value, separated by ; (for example: Material = STONE).");
                if (o.ContainsKey(k)) throw new Say($"{where}: the parameter {k} is named twice.");
                o[k] = v;
            }
            return o;
        }
    }
}
