#nullable disable
// MA-2c — the DD properties Promote fills (design §3.3 op 4, [BP] P2-7's set_parameter built once), pure (no Revit API, no HTTP),
// so tools/promote-check drives it. A DD type the plan lands elements on — one they already stand on, or a retype's target — whose
// matrix property is EMPTY on the type gets one set_parameter type edit, when a cited source holds exactly one value for it: the
// catalogue row of exactly that type (type_catalog@n params, harvested by display name: CatalogParam) or an installed clause (an
// ids@n specification whose applicability is the whole class and whose required property pins one value: Clauses). Otherwise the
// property goes to a person with why — no source, sources that disagree, no parameter Sentinel can write — and is counted.
// NEVER A GUESS, NEVER A NEW TYPE: a value comes from an installed artefact, and the type is the one the plan names (Sentinel
// creates no types). A TYPE edit reaches every element on the type: the row says how many, and the bridge never pre-ticks it
// (founder decision F1). The bridge's changesets-typing (CATALOG_PARAM, clauseValues, makeCiter) reads the same two sources; the
// shared fixture WebApp/bridge/fixtures/changeset-ops/value-sources.json holds both sides to one table and one reading.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Sentinel.GhostBuilder
{
    /// <summary>One DD type's matrix property as Revit holds it on the TYPE (Commands.PromoteWalls.TypeValues, API thread).</summary>
    public sealed class TypeValue
    {
        /// <summary>Family: a door's or window's family; null for a system type (walls, floors, roofs, ceilings).</summary>
        public string Category, Family, Type, UniqueId, Key;
        /// <summary>The value as the IDS reads it on the type, "" when empty.</summary>
        public string Current;
        /// <summary>The Revit parameter that holds it on the type ("Fire Rating"), and why Sentinel cannot write it (null = it can).</summary>
        public string Param, NoWriter;
        /// <summary>The elements on the type in the model now.</summary>
        public int Instances;
        public string Label => Family == null ? Type : Family + " : " + Type;
    }

    /// <summary>The clauses of the installed ids@n a value may be cited from: a specification whose applicability is its entity
    /// alone (another facet narrows it to some elements) and whose required property carries one exact value (a pattern is not a
    /// value). The bridge's clauseValues reads them the same way.</summary>
    public sealed class Clauses
    {
        /// <summary>Review amendment C23 (values): the one shape a cited value has — an allow-list PER PROPERTY, each code with its own
        /// periods and suffixes. A FireRating is one rating as its standard writes it: BS 476 FD20-FD120 and S; an EN 13501-2 code (R,
        /// E, EI, EI1, EI2, EW, RE, REI, REW; -M before or after the period) with one of its periods, then at most one C/C0-C5 and one
        /// Sa/Sm/S200 in that order; DIN 4102 T30-RS, T 90-2, F90-A; 1-999 minutes or 1-6 hours with a unit; a fraction of an hour
        /// (3/4-hour, 1-1/2-hour); or an FRL with at least one period. An AcousticRating is Rw and whole dB or an STC (C23 gate); a
        /// ThermalTransmittance one positive number below 10 (1.4, or 0,18). Any other property has no shape. "Rw 45" as a fire rating, "T 200 mm", "EI 30-C0-C5", "REI 0",
        /// "-/-/-", "90" are not one. ASCII only (checked apart: NotAValue). The bridge's VALUE_SHAPE holds the same patterns.
        /// Review C23 (codes): each EN 13501-2 code takes only its own suffixes — R and RE none; REI, REW, EI -M; E, EI, EI1, EI2, EW
        /// C and S, periods to 240; DIN 4102 W 30-90 (-A, -AB, -B) and G 30-120; minutes a standard period, hours 1-4, 6, 1.5 or a
        /// fraction; FRL periods 30-240; BS 476-22 integrity/insulation (60/30). "R 30-C5", "E 15-M", "11/22/33", "1 min" are not one.</summary>
        public static readonly IReadOnlyDictionary<string, Regex> ValueShape = new Dictionary<string, Regex>(StringComparer.Ordinal)
        {
            ["FireRating"] = new Regex(@"^(?:FD ?(?:20|30|60|90|120)(?:[ -]?S)?|(?:RE|R)[ -]?(?:15|20|30|45|60|90|120|180|240|360)|(?:REI|REW)(?:-M[ -]?(?:15|20|30|45|60|90|120|180|240|360)|[ -]?(?:15|20|30|45|60|90|120|180|240|360)(?:-M)?)|EI(?:-M[ -]?(?:15|20|30|45|60|90|120|180|240)|[ -]?(?:15|20|30|45|60|90|120|180|240)-M)|(?:EI[12][ -]|(?:EI|EW|E)[ -]?)(?:15|20|30|45|60|90|120|180|240)(?:[ -]?C[0-5]?)?(?:[ -]?S(?:a|m|200))?|T ?(?:30|60|90|120|180)(?:-[12])?(?:-RS)?|F ?(?:30|60|90|120|180)(?:-(?:A|AB|B))?|W ?(?:30|60|90)(?:-(?:A|AB|B))?|G ?(?:30|60|90|120)|(?:15|20|30|45|60|90|120|180|240|360)[ -]?(?:mins?|minutes?)|(?:[1-4]|6|1\.5|(?:1[ -])?1/2|1/3|3/4)[ -]?(?:h|hrs?|hours?)|(?!-/-/-)(?:30|60|90|120|180|240|-)/(?:30|60|90|120|180|240|-)/(?:30|60|90|120|180|240|-)|30/(?:0|30)|60/(?:0|30|60)|90/(?:0|30|60|90)|120/(?:0|30|60|90|120)|180/(?:0|30|60|90|120|180)|240/(?:0|30|60|90|120|180|240))(?![\s\S])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant),
            ["AcousticRating"] = new Regex(@"^(?:Rw ?[1-9][0-9](?: ?dB)?|STC[ -]?[1-9][0-9])(?![\s\S])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant),
            // a decimal comma takes 1-2 digits: "1,400" is a thousands separator in English and 1.4 under EN ISO 6946 (the bridge's)
            ["ThermalTransmittance"] = new Regex(@"^(?=[0-9.,]*[1-9])[0-9](?:\.[0-9]{1,3}|,[0-9]{1,2})?(?![\s\S])", RegexOptions.CultureInvariant),
        };
        /// <summary>Review C23 (context): a clause with a sentence is cited only when compileIds marked it source_alone — its document
        /// said nothing but whole-class one-value sentences; a heading, a place, a condition or an exception around a stored sentence
        /// narrows it without being in it. The bridge's NOT_ALONE.</summary>
        public const string NotAlone = "its document says more than whole-class values (a heading, a place, a condition or an exception may narrow it) — a person decides";
        /// <summary>Review C23: the noun a whole-class sentence names each entity by ("All doors shall be FD30." is every IFCDOOR's,
        /// "All windows shall be FD30." none of it). The bridge's CLASS_NOUN.</summary>
        public static readonly Dictionary<string, string[]> ClassNoun = new Dictionary<string, string[]>
        {
            ["IFCWALL"] = new[] { "walls" }, ["IFCDOOR"] = new[] { "doors" }, ["IFCWINDOW"] = new[] { "windows" },
            ["IFCSLAB"] = new[] { "slabs", "floors" }, ["IFCROOF"] = new[] { "roofs" }, ["IFCCOVERING"] = new[] { "ceilings", "coverings" },
        };
        /// <summary>Review C23: an applicability entity pattern both dialects read alike — names, groups, alternation, anchors. "(?i)",
        /// "\A", "\p{L}", "[^]" mean different things in .NET and JS — yet the gate reads any entity as its own regex ("IFCDOOR.*",
        /// ".*", "IFCDOORS?"), so such a clause MAY apply to every element of the class: weighed, never cited (C23 gate). The bridge's
        /// ENTITY_PATTERN.</summary>
        public static readonly Regex EntityPattern = new Regex(@"^[A-Za-z0-9_|()^$]+(?![\s\S])");
        /// <summary>Review C23 (whole class): the IFC classes an element of each entity is exported as (IfcDeliveryGate.Subtypes —
        /// Revit's IFC2x3 writes a basic wall as IFCWALLSTANDARDCASE). A clause is the whole class's only when its pattern matches the
        /// entity and each of these. The bridge's ENTITY_SUBTYPES.</summary>
        public static readonly Dictionary<string, string[]> Subtypes = new Dictionary<string, string[]>
        {
            ["IFCWALL"] = new[] { "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE" }, ["IFCSLAB"] = new[] { "IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE" },
            ["IFCDOOR"] = new[] { "IFCDOORSTANDARDCASE" }, ["IFCWINDOW"] = new[] { "IFCWINDOWSTANDARDCASE" }, ["IFCROOF"] = new string[0], ["IFCCOVERING"] = new string[0],
        };
        /// <summary>Review C23 (one source): a clause on the key that may apply to some elements of the class and is not a whole-class
        /// required value — the gate holds the written value to it too. The bridge's NOT_WHOLE.</summary>
        public const string NotWhole = "it says more of this property than one value on every element of the class (a narrower applicability, an optional or prohibited property, a pattern, or the property under no set or another spelling) — a person decides";
        /// <summary>Review C23: a source_sentence that is there but not text — never read as "no sentence". The bridge's NOT_TEXT.</summary>
        public const string NotText = "its source_sentence is not text — a person decides";

        /// <summary>Review C23 (codes): EN 13501-2's subscript EI₁/EI₂ read as EI1/EI2 — the bridge's flat.</summary>
        private static string Flat(string s) => Regex.Replace(s, "(EI)([₁₂])", m => m.Groups[1].Value + (char)(m.Groups[2].Value[0] - 0x2050), RegexOptions.CultureInvariant);

        private static string PropWords(string key)
        {
            int dot = (key ?? "").IndexOf('.');
            var prop = dot < 0 ? "" : Regex.Replace(key.Substring(dot + 1), "[^A-Za-z0-9]", "");
            return Regex.Replace(prop, "([a-z0-9])([A-Z])", "$1 $2").ToLowerInvariant();
        }

        /// <summary>Review C23 (final): the one wording a clause with a sentence is cited in — "[The &lt;property&gt; of]
        /// [all|every|each|the] &lt;the entity's noun&gt; shall|must be &lt;value&gt;[.|!]", the value optionally quoted. Nothing before
        /// the class, between "be" and the value, or after it. Group 2 = the value as stated; null = an entity with no noun. The
        /// bridge's wordedAs builds the same pattern.</summary>
        public static Regex Worded(string entity, string key)
        {
            if (entity == null || !ClassNoun.TryGetValue(entity, out var nouns)) return null;
            var prop = PropWords(key);
            // Review C23 (wording): "all doors" / "doors" or "every door" / "each door" — never "the door(s)": one door, or doors named before.
            return new Regex("^(?:the +" + (prop.Length > 0 ? prop.Replace(" ", " +") : "(?!)") + " +of +)?(?:(?:all +)?(?:" + string.Join("|", nouns) + ")|(?:every|each) +(?:"
                             + string.Join("|", nouns.Select(w => w.Substring(0, w.Length - 1))) + ")) +(?:shall|must) +be +([\"']?)(.+?)\\1[.!]?(?![\\s\\S])",
                             RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        }

        private static bool Ascii(string s) => s.All(ch => ch >= ' ' && ch <= '~');

        /// <summary>Why a clause is not a cited value, in the planner's words (null = it is one) — the bridge's notAValue, held to it
        /// by the shared value_cases: the value is not ONE value (C23), or the sentence is not worded as every <paramref name="entity"/>
        /// carrying exactly this value of <paramref name="key"/> (Worded). A hand-written IDS has no sentence: the value's shape alone.</summary>
        public static string NotAValue(string sentence, string value, string entity, string key)
        {
            var v = Flat(value ?? ""); // C23 (gate): untrimmed — the gate holds an element to "FD30 " as written, so it is not one value
            var parts = (key ?? "").Split('.'); // the bridge's key.split("."): one dot (review C23)
            if (!Ascii(v) || parts.Length != 2 || !ValueShape.TryGetValue(parts[1], out var shape) || !shape.IsMatch(v)) return $"\"{v}\" is not one value (a bound, a choice or a qualifier) — a person decides";
            if (sentence == null) return null;
            sentence = Flat(sentence);
            var m = Ascii(sentence) ? Worded(entity, key)?.Match(sentence) : null;
            if (m != null && m.Success) return m.Groups[2].Value == v ? null : $"it states \"{m.Groups[2].Value}\", not \"{v}\" — a person decides";
            var prop = PropWords(key);
            var noun = entity != null && ClassNoun.TryGetValue(entity, out var nouns) ? nouns[0] : entity;
            return $"it is not worded \"{(prop.Length > 0 ? $"the {prop} of " : "")}all {noun} shall be {v}.\" — a person decides";
        }

        /// <summary>One property row of a specification on any applicability. Entity null = none, or one outside EntityPattern (the gate
        /// may apply it to every element); Pset/Prop null = none or not text (the gate may read any group or name under it); Raw = the
        /// value when it is text; HasValue/HasPattern = the gate holds a present value to one.</summary>
        private sealed class Row { public string Entity, Pset, Prop, Raw, Card, Spec, Sentence; public bool Unreadable, Alone, OnlyEntity, HasValue, HasPattern, BadSentence; }
        private readonly List<Row> _rows = new List<Row>();
        /// <summary>The ids@n's label ("ids@1 · project · 0a1b2c3d4e5f…"), or why there is none.</summary>
        public string Label;
        /// <summary>An ids@n was read (it may still pin nothing).</summary>
        public bool Installed;

        public static Clauses None(string label) => new Clauses { Label = label };

        /// <summary>The ids@n body → its clauses; one that does not parse cites nothing, with <paramref name="error"/>. Never throws.</summary>
        public static Clauses FromIds(string json, string label, out string error)
        {
            error = null;
            var c = new Clauses { Label = label, Installed = true };
            try
            {
                using (var d = JsonDocument.Parse(json ?? "", new JsonDocumentOptions { MaxDepth = int.MaxValue })) // review C23: jsonb keeps any depth, and so does the bridge
                {
                    if (d.RootElement.ValueKind != JsonValueKind.Object || !d.RootElement.TryGetProperty("specifications", out var specs) || specs.ValueKind != JsonValueKind.Array) return c;
                    foreach (var s in specs.EnumerateArray())
                    {
                        if (s.ValueKind != JsonValueKind.Object) continue;
                        // C23 (gate): ids.ts applies reads applicability.entity (and predefinedType) — a missing, string or array
                        // applicability, no entity, or one outside EntityPattern (the gate's own regex) may apply to every element:
                        // weighed, never cited. A pattern that does not compile is a literal name to the gate: no class's.
                        string entity = null;
                        bool onlyEntity = false, unreadable = false;
                        if (s.TryGetProperty("applicability", out var a) && a.ValueKind == JsonValueKind.Object)
                        {
                            onlyEntity = a.EnumerateObject().All(x => x.Name == "entity");
                            if (a.TryGetProperty("entity", out var en) && en.ValueKind == JsonValueKind.String && EntityPattern.IsMatch(en.GetString()))
                            {
                                entity = en.GetString();
                                if (!Readable(entity)) { unreadable = true; entity = Regex.Escape(entity); } // as the gate's escapeRe: no class's
                            }
                            else unreadable = en.ValueKind != JsonValueKind.Undefined && en.ValueKind != JsonValueKind.Null && en.ValueKind != JsonValueKind.False
                                              && !(en.ValueKind == JsonValueKind.String && en.GetString().Length == 0);
                        }
                        if (!s.TryGetProperty("requirements", out var r) || r.ValueKind != JsonValueKind.Object
                            || !r.TryGetProperty("properties", out var props) || props.ValueKind != JsonValueKind.Array) continue;
                        foreach (var p in props.EnumerateArray())
                        {
                            if (p.ValueKind != JsonValueKind.Object) continue;
                            c._rows.Add(new Row
                            {
                                Entity = entity, OnlyEntity = onlyEntity, Pset = Str(p, "pset") is string ps && ps.Length > 0 ? ps : null, Prop = Str(p, "name"),
                                Raw = Str(p, "value"), Card = Str(p, "cardinality"), Spec = Str(s, "name") ?? "",
                                HasValue = p.TryGetProperty("value", out var pv) && pv.ValueKind != JsonValueKind.Null,
                                HasPattern = p.TryGetProperty("pattern", out var pt) && pt.ValueKind != JsonValueKind.Null,
                                Sentence = Str(s, "source_sentence"), Unreadable = unreadable,
                                BadSentence = s.TryGetProperty("source_sentence", out var ss) && ss.ValueKind != JsonValueKind.Null && ss.ValueKind != JsonValueKind.String,
                                Alone = s.TryGetProperty("source_alone", out var al) && al.ValueKind == JsonValueKind.True,
                            });
                        }
                    }
                }
            }
            catch (Exception ex) { error = ex.Message; return None(label + " did not parse: " + ex.Message); }
            return c;
        }

        /// <summary>The values the clauses pin for <paramref name="key"/> ("Pset_X.Prop") on every <paramref name="entity"/>
        /// ("IFCDOOR"), in the IDS's order; two values are both returned — the caller says they disagree. A bound is not one, nor a
        /// clause whose sentence narrows the class (C7, C18).</summary>
        public List<(string Value, string Spec, string Sentence, string Why)> For(string entity, string key) => Hits(entity, key, false);

        /// <summary>Review amendments C7 and C18: the clauses on the key for the entity that are not a value — a bound, or a sentence
        /// that does not name the whole class (Why says which); the planner names them to the person.</summary>
        public List<(string Value, string Spec, string Sentence, string Why)> NotValues(string entity, string key) => Hits(entity, key, true);

        private List<(string Value, string Spec, string Sentence, string Why)> Hits(string entity, string key, bool skipped)
        {
            var hits = new List<(string Value, string Spec, string Sentence, string Why)>();
            var parts = (key ?? "").Split('.');
            if (parts.Length != 2) return hits; // C23: "Pset_X.Prop" — one dot, as the bridge reads it
            var classes = new List<string> { entity ?? "" };
            if (entity != null && Subtypes.TryGetValue(entity, out var subs)) classes.AddRange(subs);
            foreach (var r in _rows)
            {
                var inSet = r.Pset == null ? "may" : Reads(r.Pset, parts[0]);
                var named = r.Prop == null ? "may" : Reads(r.Prop, parts[1]);
                if (inSet == null || named == null) continue;
                bool whole = false; // no entity, or one the gate reads as its own regex: every element — some of this class, never cited from
                if (r.Entity != null)
                {
                    int hit = classes.Count(cl => Regex.IsMatch(cl, r.Entity, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant));
                    if (hit == 0) continue;
                    whole = hit == classes.Count && r.OnlyEntity; // C23: "^IFCWALL$" is no IFCWALLSTANDARDCASE's
                }
                // C23 (gate): the value untrimmed — the gate holds an element to "FD30 " as written, so it is no cited "FD30"
                var value = r.Raw;
                string why;
                if (whole && inSet == "exact" && named == "exact" && r.Card == "required" && !r.HasPattern && !string.IsNullOrEmpty(value))
                    why = r.BadSentence ? NotText : NotAValue(r.Sentence, r.Raw, entity, key) ?? (r.Sentence != null && !r.Alone ? NotAlone : null); // C23 (context)
                else if (r.Card == "prohibited" || r.HasPattern || r.HasValue)
                {
                    why = NotWhole; // C23 (one source): the value it demands, null for a pattern or an absence
                    if (r.Card == "prohibited" || r.HasPattern) value = null;
                }
                else continue; // presence only: says nothing of the value
                if ((why != null) == skipped) hits.Add((value, r.Spec, r.Sentence, why));
            }
            return hits;
        }

        /// <summary>Review C23 (one source): the first clause on <paramref name="key"/> for <paramref name="entity"/> that is not
        /// cited and does not demand exactly <paramref name="value"/> — a value is never written past a clause of the same ids@n the
        /// gate would hold it to (null = none). The bridge's saysMore.</summary>
        public (string Value, string Spec, string Sentence, string Why)? SaysMore(string entity, string key, string value) =>
            NotValues(entity, key).Where(h => !string.Equals(h.Value, value, StringComparison.Ordinal))
                .Select(h => ((string Value, string Spec, string Sentence, string Why)?)h).FirstOrDefault();

        /// <summary>Review C20: the clauses on <paramref name="key"/> whose entity pattern Sentinel cannot read — never cited, weighed as
        /// applying to every element (C23 gate), and the planner says so rather than "no clause pins one".</summary>
        public int Unreadable(string key) => _rows.Count(r => r.Unreadable && r.Pset + "." + r.Prop == key);

        /// <summary>Review C23 (gate): how ids.ts propValue finds the row — set and name compare ignoring case. "exact" = the key as
        /// written (the only one cited); "may" = the gate may read the key under it (another case, not ASCII), or the document names
        /// it in another spelling ("Fire Rating", "Pset DoorCommon") — weighed, never cited; null = another property. The bridge's reads.</summary>
        private static string Reads(string x, string want) =>
            !Ascii(x) ? "may" : x == want ? "exact" : Norm(x) == Norm(want) ? "may" : null;

        private static string Norm(string s) => new string(s.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

        private static bool Readable(string pattern)
        {
            if (!EntityPattern.IsMatch(pattern)) return false; // C23: read alike by .NET and JS, or by neither
            try { _ = new Regex(pattern); return true; }
            catch (ArgumentException) { return false; }
        }

        private static string Str(JsonElement o, string name) => o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    /// <summary>One DD type × property PropertyPlanner judged: "write" (a set_parameter ghost, Value from Ref), or sent to a person —
    /// "no source", "disagree", "no writer", "differs" (filled, and a source says otherwise: C11) — with Why. Elements = on the type
    /// in the model now plus those the plans retype onto it.</summary>
    public sealed class PropertyRow
    {
        public string Category, Label, Key, UniqueId, Outcome, Value, Ref, Why;
        public int Elements;
    }

    public sealed class PropertyReport
    {
        public List<PropertyRow> Rows = new List<PropertyRow>();
        public int Written => Rows.Count(r => r.Outcome == "write");
        public int NoSource => Rows.Count(r => r.Outcome == "no source");
        /// <summary>The elements on the types whose property has no source (drill MA2 records it).</summary>
        public int NoSourceElements => Rows.Where(r => r.Outcome == "no source").GroupBy(r => r.UniqueId).Sum(g => g.First().Elements); // C20: each type once
        public int Other => Rows.Count(r => r.Outcome != "write" && r.Outcome != "no source");
        /// <summary>Review amendment C11: the DD type × property pairs not held on the type (an instance parameter, a wall's IsExternal
        /// read from its Function, a type not read) — not planned, and counted so nothing is skipped without a word.</summary>
        public int NotOnType;

        /// <summary>Promote's header line: "DD properties: 2 type edit(s) from a cited source (never pre-ticked) · 1 with no source —
        /// sent to a person (1 element(s) on those types) · 1 sent to a person for another reason · 2 held off the type (…) — not planned".</summary>
        public string Line => Rows.Count == 0
            ? "DD properties: every one the DD types hold is filled, or the matrix asks none Sentinel reads on a type" + NotOnTypeWords // C20
            : $"DD properties: {Written} type edit(s) from a cited source (never pre-ticked) · {NoSource} with no source — sent to a person ({NoSourceElements} element(s) on those types)" +
            (Other > 0 ? $" · {Other} sent to a person for another reason" : "") +
            NotOnTypeWords;

        private string NotOnTypeWords => NotOnType > 0 ? $" · {NotOnType} held off the type (instance, IsExternal from Function, or not read) — not planned" : "";

        /// <summary>One line per row: "✎ Walls · BDS_EXT_ARC_CMU_200 mm · Pset_WallCommon.FireRating → "60 min" (type_catalog@1 · …) — 1
        /// element(s) read the type" (review amendment C3: the reach, the planner's own count), or "→ a person: …".</summary>
        public List<string> Lines() => Rows.Select(r => r.Outcome == "write"
            ? $"✎ {r.Category} · {r.Label} · {r.Key} → \"{r.Value}\" ({r.Ref}) — {r.Elements} element(s) read the type"
            : "→ a person: " + r.Why).ToList();
    }

    public static class PropertyPlanner
    {
        /// <summary>The catalogue parameter a DD property is harvested under (Build Office System reads "Fire Rating" by display
        /// name, GoldenModelExtractor.InterestingParams) — the bridge's CATALOG_PARAM. A property not here has no catalogue source.</summary>
        public static readonly IReadOnlyDictionary<string, string> CatalogParam = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["Pset_WallCommon.FireRating"] = "Fire Rating", ["Pset_DoorCommon.FireRating"] = "Fire Rating",
        };

        /// <summary>Review C19: the property set a set_parameter of each kind may write — the class's own common set, the bridge's
        /// KIND_PSET (it refuses any other key, and C4 would then drop the body's valid type edits with it). A matrix key outside it
        /// goes to a person.</summary>
        public static readonly IReadOnlyDictionary<string, string> KindPset = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["wall"] = "Pset_WallCommon", ["floor"] = "Pset_SlabCommon", ["roof"] = "Pset_RoofCommon",
            ["ceiling"] = "Pset_CoveringCommon", ["door"] = "Pset_DoorCommon", ["window"] = "Pset_WindowCommon",
        };

        /// <summary>The IFC entity a class is adjudicated as, as an IDS writes it ("IFCWALL") — the bridge's KIND_ENTITY.</summary>
        public static string Entity(string category) => PromoteWallsPlanner.Classes.Values.First(c => c.Category == category).Ifc.ToUpperInvariant();

        /// <summary>The DD types the plans land elements on, for the classes whose DD row asks properties: each storey's settled types,
        /// then its retype targets — once each, in that order.</summary>
        public static List<(string Category, string Family, string Type)> DdTypes(IReadOnlyList<StoreyPlan> plans, LodMatrix mx)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            return plans.SelectMany(Landed)
                .Where(t => mx.Properties.TryGetValue(t.Category, out var ps) && ps.Count > 0 && seen.Add(t.Category + "|" + t.Family + "|" + t.Type))
                .ToList();
        }

        private static IEnumerable<(string Category, string Family, string Type)> Landed(StoreyPlan p) =>
            p.Settled.Concat(p.Ghosts.Where(g => g.Op == "retype").Select(g => (PromoteWallsPlanner.Classes[g.Kind ?? "wall"].Category, g.FamilyName, g.TypeName)));

        private static bool Same(string a, string b) => string.Equals(a ?? "", b ?? "", StringComparison.OrdinalIgnoreCase);
        private static bool Onto(PromoteGhost g, string category, string family, string type) =>
            g.Op == "retype" && PromoteWallsPlanner.Classes[g.Kind ?? "wall"].Category == category && Same(g.FamilyName, family) && Same(g.TypeName, type);

        /// <summary>Each DD type × matrix property that is empty on the type: a set_parameter ghost, or a row sent to a person
        /// (StoreyPlan.ToPerson). Review amendment C8: both ride on the first storey whose retypes land on the type (so the DD IDS
        /// checked before commit sees the value with them), else on the first storey with elements already on it; the ghost goes
        /// first in that storey's ghosts, so a storey of several chunks files it in the first. Review amendment C11: a property the
        /// type does not hold (<see cref="TypeValue.Current"/> null: the IDS reads it elsewhere, or it was not read) is counted in
        /// <see cref="PropertyReport.NotOnType"/>; a filled one is left as it is, and goes to a person ("differs") when a source says
        /// otherwise. <paramref name="values"/> are Revit's reads of the types.</summary>
        public static PropertyReport Plan(IReadOnlyList<StoreyPlan> plans, LodMatrix mx, IReadOnlyList<TypeValue> values, GuidelineMatcher m, Clauses clauses)
        {
            var report = new PropertyReport();
            var inserted = new Dictionary<StoreyPlan, int>(); // the set_parameters already placed at the start of each storey's ghosts
            foreach (var (cat, family, type) in DdTypes(plans, mx))
            {
                var p = plans.FirstOrDefault(x => x.Ghosts.Any(g => Onto(g, cat, family, type)))
                        ?? plans.First(x => x.Settled.Any(s => s.Category == cat && Same(s.Family, family) && Same(s.Type, type)));
                foreach (var key in mx.Properties[cat])
                {
                    var v = values.FirstOrDefault(x => x.Category == cat && x.Key == key && Same(x.Family, family) && Same(x.Type, type));
                    if (v?.Current == null) { report.NotOnType++; continue; } // C11: not held on the type — counted, never silent
                    var row = new PropertyRow
                    {
                        Category = cat, Label = v.Label, Key = key, UniqueId = v.UniqueId,
                        Elements = v.Instances + plans.Sum(x => x.Ghosts.Count(g => Onto(g, cat, family, type))),
                    };
                    var found = new List<(string Value, string Kind, string Ref)>();
                    string param = CatalogParam.TryGetValue(key, out var cp) ? cp : null;
                    var (cv, catWhy) = Catalogued(m, cat, family, type, key);
                    if (cv != null) found.Add((cv, "catalogue", $"{m.CatalogLabel} · {v.Label} · {param}"));
                    foreach (var c in clauses.For(Entity(cat), key))
                        found.Add((c.Value, "clause", $"{clauses.Label} · {c.Spec}" + (c.Sentence != null ? $" · \"{c.Sentence}\"" : "")));
                    var distinct = found.Select(f => f.Value).Distinct(StringComparer.Ordinal).ToList();
                    if (v.Current.Length > 0)
                    {
                        // C11: a filled value is never overwritten; one a source contradicts goes to a person, said.
                        var o = found.FirstOrDefault(f => !string.Equals(f.Value, v.Current, StringComparison.Ordinal));
                        if (o.Value == null) continue; // filled as its source holds it, or no source to compare: left as it is
                        row.Outcome = "differs";
                        row.Why = $"{key} on {v.Label} reads \"{v.Current}\", {o.Ref} gives \"{o.Value}\" — not overwritten; a person decides";
                    }
                    else if (distinct.Count == 0 || (distinct.Count == 1 && catWhy != null)) // C23: a catalogue value that is not one value is no source
                    {
                        var floor = clauses.NotValues(Entity(cat), key).Where(h => h.Why != Clauses.NotWhole).ToList(); // C7, C18: a bound or a narrowed class is named, never written (as the bridge: a whole-class clause)
                        row.Outcome = "no source";
                        row.Why = $"no source for {key} on {v.Label} — " +
                                  (catWhy != null ? $"{m.CatalogLabel} gives {param} {catWhy}" : param != null ? $"{m.CatalogLabel} gives no {param} for it" : "the catalogue harvests no value for it") + ", and " +
                                  (floor.Count > 0 ? $"{clauses.Label} · {floor[0].Spec} (\"{floor[0].Sentence ?? floor[0].Value ?? "no value"}\"): {floor[0].Why}" // C23: the bridge's words
                                   : clauses.Unreadable(key) is int u && u > 0 ? $"{u} clause(s) of {clauses.Label} on {key} have an entity pattern Sentinel cannot read" // C20
                                   : clauses.Installed ? $"no clause of {clauses.Label} pins one" : $"no ids@n is installed to cite ({clauses.Label})") +
                                  $"; a person fills it in Revit (Type Properties) — {row.Elements} element(s) on it";
                    }
                    else if (distinct.Count > 1)
                    {
                        row.Outcome = "disagree";
                        row.Why = $"the sources disagree on {key} for {v.Label}: " + string.Join("; ", found.Select(f => $"\"{f.Value}\" ({f.Ref})")) + " — a person decides";
                    }
                    else if (clauses.SaysMore(Entity(cat), key, distinct[0]) is { } sm)
                    {
                        // C23 (one source): another clause of the ids@n the gate holds these elements to does not pin this value
                        row.Outcome = "disagree";
                        row.Why = $"{key} on {v.Label}: \"{distinct[0]}\" ({found[0].Ref}), but {clauses.Label} · {sm.Spec} (\"{sm.Sentence ?? sm.Value ?? "no value"}\") also speaks of it, and not as \"{distinct[0]}\": {sm.Why}";
                    }
                    else if ((v.NoWriter ?? OtherSet(cat, key)) is string noWriter)
                    {
                        row.Outcome = "no writer";
                        row.Value = distinct[0];
                        row.Ref = found[0].Ref;
                        row.Why = $"{key} on {v.Label}: \"{distinct[0]}\" ({found[0].Ref}), but {noWriter} — a person sets it in Revit";
                    }
                    else
                    {
                        row.Outcome = "write";
                        row.Value = distinct[0];
                        row.Ref = found[0].Ref;
                        int here = p.Ghosts.Count(g => Onto(g, cat, family, type));
                        int at = inserted.TryGetValue(p, out var k) ? k : 0; // C8: first in the storey's ghosts, in the order the types are met
                        p.Ghosts.Insert(at, new PromoteGhost
                        {
                            Op = "set_parameter", Kind = PromoteWallsPlanner.Classes.First(kv => kv.Value.Category == cat).Key, UniqueId = v.UniqueId,
                            Label = "type " + v.Label, TypeName = type, FamilyName = family, Parameter = key, RevitParameter = v.Param,
                            From = v.Current, To = distinct[0], SourceKind = found[0].Kind,
                            Reason = $"DD {cat.ToLowerInvariant()}: {key} \"{distinct[0]}\" from {found[0].Ref} — a type edit: every element on {v.Label} " +
                                     // drill MA2d F-MA2d-1: `here` counts the storey's ghosts, before Bodies splits a storey into changesets
                                     $"reads it ({v.Instances} in the model now, {here} more that this storey retypes onto it)",
                        });
                        inserted[p] = at + 1;
                    }
                    if (row.Outcome != "write") p.ToPerson.Add(new PromoteHeld { UniqueId = v.UniqueId, Label = $"type {v.Label} · {key}", Reason = row.Why });
                    report.Rows.Add(row);
                }
            }
            return report;
        }

        /// <summary>Review C23: the catalogue's value for exactly this type and key (null: no row, no harvested parameter, empty) and
        /// why it is not one value (null: it is) — the same one-value shape a clause is held to (Clauses.NotAValue), as the bridge's
        /// makeCiter holds it: "TBC", "FD30 or FD60", "min. 60 min" fill nothing.</summary>
        public static (string Value, string Why) Catalogued(GuidelineMatcher m, string category, string family, string type, string key)
        {
            var cv = CatalogParam.TryGetValue(key, out var param) ? m.CatalogValue(category, family, type, param) : null;
            return (cv, cv == null ? null : Clauses.NotAValue(null, cv, Entity(category), key));
        }

        // Review C19: why Sentinel does not write a key outside the class's own common set (null = it is in it).
        private static string OtherSet(string category, string key)
        {
            var kind = PromoteWallsPlanner.Classes.First(kv => kv.Value.Category == category).Key;
            return (key ?? "").StartsWith(KindPset[kind] + ".", StringComparison.Ordinal) ? null : $"Sentinel writes only {KindPset[kind]} on a {kind} type";
        }

        /// <summary>Review amendment C4: a Promote body the bridge refused for a set_parameter (its source not confirmed at post time,
        /// or a bridge older than the op), filed again WITHOUT its set_parameter rows — the storey's retypes and attaches are not lost
        /// with them — each type edit becoming an exception that says why (one line; the bridge keeps a name ≤ 256 and a reason
        /// ≤ 300). Null when the body holds no set_parameter, or nothing else and no held row. Review C24: a body of type edits only
        /// that carries held rows (C16) comes back with NO element — nothing to post; FileAll hands its rows on to the next body.</summary>
        public static object WithoutWrites(object body, string why, out int removed)
        {
            var o = Node(body);
            var all = o["elements"].AsArray();
            var writes = all.Where(e => (string)e?["op"] == "set_parameter").ToList();
            removed = writes.Count;
            if (!(o["exceptions"] is JsonArray ex)) o["exceptions"] = ex = new JsonArray();
            int held = ex.Count;
            if (removed == 0 || (removed == all.Count && held == 0)) return null;
            // Review C17: the bridge stops at the first element it refuses ("elements[k]: …"); only that one's source was refused.
            var named = Regex.Match(why ?? "", @"elements\[(\d+)\]");
            var at = writes.ToDictionary(w => w, w => all.IndexOf(w).ToString()); // the posted indices, before any is removed
            foreach (var w in writes)
            {
                bool refused = !named.Success || named.Groups[1].Value == at[w];
                all.Remove(w);
                string fam = (string)w["place"]?["FamilyName"], type = (string)w["place"]?["TypeName"];
                ex.Add(new JsonObject
                {
                    ["unique_id"] = (string)w["target"]?["unique_id"],
                    ["name"] = OneLine($"type {(fam != null ? fam + " : " : "")}{type} · {(string)w["parameter"]}", 256),
                    ["reason"] = OneLine(refused ? $"not filed: the bridge refused its source — {why}; a person fills it in Revit (Type Properties)"
                        : $"not filed with it: the bridge refused another type edit of this changeset ({why}); run Promote again to file it, or fill it in Revit (Type Properties)", 300),
                });
            }
            Fold(ex, removed);
            return o;
        }

        /// <summary>Review C24: what filing Promote's bodies did — the errors of the bodies not filed, the type edits filed as rows
        /// instead (C4), and the held rows no body took (the last bodies were not filed).</summary>
        public sealed class FileRun
        {
            public List<string> Failed = new List<string>();
            public int TypeEditsNotFiled, RowsNotFiled;
        }

        /// <summary>Review amendments C4 and C24: files Promote's bodies in order through <paramref name="post"/> (body, retry) → null
        /// when filed, else the error. A body refused for a set_parameter is filed again without its type edits (WithoutWrites); one left
        /// with no element (type edits only, carrying held rows: C16) is not posted — its rows, its type edits among them, ride on the
        /// next body filed, as do the rows of any body not filed. Rows no later body takes are counted, never silently lost.</summary>
        public static FileRun FileAll(IReadOnlyList<object> bodies, Func<object, bool, string> post)
        {
            var run = new FileRun();
            JsonArray carry = null;
            foreach (var b in bodies)
            {
                var body = Carry(b, carry);
                carry = null;
                var err = post(body, false);
                if (err != null && err.StartsWith("Bridge 400:") && err.Contains("set_parameter") && WithoutWrites(body, err, out var dropped) is JsonObject again)
                {
                    if (again["elements"].AsArray().Count == 0) { run.TypeEditsNotFiled += dropped; run.Failed.Add(err); carry = (JsonArray)again["exceptions"]; continue; }
                    var retried = post(again, true);
                    if (retried == null) { run.TypeEditsNotFiled += dropped; continue; }
                    err = retried;
                }
                if (err != null) { run.Failed.Add(err); carry = Node(body)["exceptions"] as JsonArray; }
            }
            run.RowsNotFiled = carry?.Count ?? 0;
            return run;
        }

        // ── MA-3b5: Promote reads and files off Revit's thread — the words of its wait, and its stall rule ──────────────────────────────

        /// <summary>MA-3b5: the pane's Doctor line when Promote starts reading (its dialog opens by itself once the reads are done).</summary>
        public const string PromoteReading = "Promote (DD): reading the bridge (the changesets waiting for review, the standards, the LOD matrix) off Revit's thread — Revit stays usable, and Promote's dialog opens by itself. Until its dialog closes — or, after Yes, its filing is done — Review AI Proposals and a second Promote say they wait.";

        /// <summary>MA-3b5: …when Promote starts filing, after Yes.</summary>
        public static string PromoteFiling(int n) =>
            $"Promote (DD): filing {n} changeset(s) off Revit's thread — Revit stays usable, and the review opens by itself in this model once the bridge has answered. Until then, Review AI Proposals and a second Promote say they wait.";

        /// <summary>MA-3b5: …when the filing is done and the guard is released.</summary>
        public static string PromoteFiled(int filed, int n) => $"Promote (DD): {filed} of {n} changeset(s) filed (confirmed by the bridge) — the filing is done.";

        /// <summary>MA-3b5 (DocPin): the review of what Promote filed was not opened — the model was switched or closed meanwhile.</summary>
        public static string PromoteNotOpened(string refusal, int filed, string title) =>
            refusal + $"\n\n{filed} changeset(s) Promote filed wait for review — in \"{title}\", run Review AI Proposals (or Promote (DD): it opens a Promote storey waiting for review before it plans again).";

        /// <summary>MA-3b5: the filing threw — what the bridge took before it waits for review: opened by the open hop when something was
        /// filed (<paramref name="opened"/>, review C6 — true even when DocPin then refuses it, whose words say where), else by the next Promote.</summary>
        public static string PromoteStopped(string why, bool opened) =>
            $"Promote's filing stopped — {why}\nWhat the bridge took before it stopped waits for review" +
            (opened ? " — it opens by itself while this model is in front." : ": run Promote (DD) again — it opens a Promote storey waiting for review before it plans again.");

        /// <summary>MA-3b5 (F4): Promote's filing under MA-3b C6's rule (as UnreportedResults.WithdrawEach) — after the first filing the
        /// bridge did not answer (anything but a "Bridge 4xx" refusal: unreachable, a timeout, a 5xx), the rest are not sent, so Promote's
        /// guard waits one write timeout, never one per storey. A refusal — FileAll's set_parameter retry among them — stalls nothing.</summary>
        public static Func<object, bool, string> Stalling(Func<object, bool, string> post)
        {
            string stalled = null;
            return (body, retry) =>
            {
                if (stalled != null) return stalled;
                var err = post(body, retry);
                if (err != null && !err.StartsWith("Bridge 4", StringComparison.Ordinal))
                    stalled = $"not sent: an earlier filing of this run failed without a refusal from the bridge ({err}) — run Promote (DD) again once it answers"; // C5: a lost sign-in stalls too
                return err;
            };
        }

        // -- MA-3b6: the declines made before, read before Promote's dialog - its words (pure) ----------------------------------------

        /// <summary>MA-3b6: the pane's Doctor line when Promote asks the bridge which ghosts were declined before.</summary>
        public const string PromotePreviewing = "Promote (DD): asking the bridge which ghosts were declined before (off Revit's thread) — the dialog opens by itself.";

        /// <summary>MA-3b6: the dialog's question - the storeys to file, and those not filed because every ghost in them was declined before.</summary>
        public static string FileQuestion(int file, int skipped) =>
            skipped == 0 ? $"File {file} changeset(s)?"
            : file == 0 ? "Nothing to file: every ghost Promote would propose was declined before."
            : $"File {file} of {file + skipped} changeset(s)? ({skipped} not filed — every ghost in them was declined before)";

        /// <summary>MA-3b6: the dialog's line on the declines made before - null when none and nothing is skipped.</summary>
        public static string CarriedLine(IReadOnlyList<Sentinel.Coordination.ChangesetPreviewDto> pv)
        {
            if (pv == null || pv.Count == 0) return null;
            int carried = pv.Sum(p => p.Carried), noReason = pv.Sum(p => p.NoReason), unverified = pv.Sum(p => p.Unverified), creates = pv.Sum(p => p.Creates);
            var skipped = pv.Where(p => p.AllCarried).Select(p => p.Name).ToList();
            if (carried + noReason + unverified + creates == 0) return null;
            var s = $"Declined before (the bridge carries each decline onto its ghost, already declined, for the reviewer): {carried} ghost(s) in {pv.Count(p => p.Carried > 0)} storey(s)";
            if (noReason + unverified + creates > 0)
                s += $"; not carried: {noReason} declined in Revit with no reason, {unverified} with a reason no signed-in member reported, {creates} create(s) like one declined before";
            if (skipped.Count > 0)
                s += $"\n{skipped.Count} storey(s) not filed — every ghost in them was declined before: {string.Join("; ", skipped)}. Their rows sent to a person are listed only in this dialog; a lead re-opens a decline on the web desk to file them again.";
            return s;
        }

        /// <summary>MA-3b6: the preview the bridge did not answer - said, and every storey is filed as before (a ghost declined before is still filed already declined by the bridge).</summary>
        public static string PreviewNotRead(string why) =>
            $"Declined before: not read — {why}. Every storey is filed; a ghost declined before is still filed already declined by the bridge.";

        /// <summary>MA-3b6 (F8 B): the bodies to file - those whose preview does not say every ghost was declined before. A preview that does not
        /// match the bodies one to one (none, or another count) files every body.</summary>
        public static List<object> WithoutCarried(IReadOnlyList<object> bodies, IReadOnlyList<Sentinel.Coordination.ChangesetPreviewDto> pv)
        {
            if (pv == null || pv.Count != bodies.Count) return bodies.ToList();
            return bodies.Where((b, i) => !pv[i].AllCarried).ToList();
        }

        // Review C24: a body with the rows of a body not filed before its own, folded to the bridge's cap.
        private static object Carry(object body, JsonArray rows)
        {
            if (rows == null || rows.Count == 0) return body;
            var o = Node(body);
            var ex = new JsonArray(rows.Select(r => r.DeepClone()).ToArray());
            if (o["exceptions"] is JsonArray own) foreach (var r in own) ex.Add(r.DeepClone());
            o["exceptions"] = ex;
            Fold(ex, 0);
            return o;
        }

        private static JsonObject Node(object body) =>
            JsonSerializer.SerializeToNode(body, global::Sentinel.Coordination.ChangesetClient.WriteJson).AsObject(); // nulls left out, as Propose posts it

        // Review C17: the bridge refuses more than MaxExceptions; the rows before the last `tail` (the type edits) fold into one "(more)" row.
        // ponytail: assumes fewer than MaxExceptions type edits in one body (one per DD type × property).
        private static void Fold(JsonArray ex, int tail)
        {
            int max = PromoteWallsPlanner.MaxExceptions;
            if (ex.Count <= max) return;
            int keep = Math.Max(0, max - 1 - tail);
            var folded = ex.Skip(keep).Take(ex.Count - tail - keep).ToList();
            int k = folded.Sum(f => (string)f["unique_id"] == "(more)" && Regex.Match((string)f["name"] ?? "", @"\d+") is Match mm && mm.Success ? int.Parse(mm.Value) : 1);
            foreach (var f in folded) ex.Remove(f);
            ex.Insert(keep, new JsonObject
            {
                ["unique_id"] = "(more)", ["name"] = $"… and {k} more",
                ["reason"] = "sent to a person — more than one changeset holds; the Promote summary counts them",
            });
        }

        private static string OneLine(string s, int max)
        {
            var t = new string((s ?? "").Select(ch => char.IsControl(ch) ? ' ' : ch).ToArray());
            return t.Length <= max ? t : t.Substring(0, max - 1) + "…";
        }
    }
}
