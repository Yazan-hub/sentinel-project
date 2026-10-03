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
        /// <summary>Review amendment C23: the one shape a cited value has — ONE rating token (FD30, FD30S, REI 60, EI-30) or ONE number
        /// with an optional time unit (60, 60 min, 120 minutes, 2 hr). An allow-list: a bound, a choice or a qualifier in any words is
        /// not this shape. ASCII only (checked apart: NotAValue). The bridge's ONE_VALUE is the same pattern.</summary>
        public static readonly Regex OneValue = new Regex(@"^(?:(?!(?:over|not|mins?|max|up|upto|to|or|and|than|less|more|from|at|no|ca|lt|gt|le|ge|lte|gte)[ -]?[0-9])[a-z]{1,4}[ -]?[0-9]{1,4}[a-z]{0,2}|[0-9]{1,4}(?:\.[0-9]{1,2})?(?: ?(?:mins?|minutes?|h|hrs?|hours?))?)(?![\s\S])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        /// <summary>Review C23: what may follow the value in its sentence — a closing quote and a full stop. The bridge's SENTENCE_END.</summary>
        public static readonly Regex SentenceEnd = new Regex("^[\"”'’]?[.!]?(?![\\s\\S])");
        /// <summary>Review amendments C7 (S8) and C18: a clause whose sentence says one of these sets a bound, not a value ("shall be at
        /// least 60 minutes"): never written. The bridge's BOUND_WORDS is the same pattern.</summary>
        public static readonly Regex BoundWords = new Regex(@"\b(at least|at most|minimum|maximum|(less|more|lower|higher|greater|fewer) than|or (more|better|higher|greater|above|over|less|lower|below|under|worse)|and (above|over|below|under)|up to|exceed\w*)\b|>=|<=|≥|≤", RegexOptions.IgnoreCase);
        /// <summary>Review C18: a clause with a sentence is cited only when the sentence names the class with no word that narrows it
        /// ("All doors shall …", "The fire rating of doors shall …") — compileIds maps "external walls" to the entity alone. The
        /// bridge's WHOLE_CLASS is the same pattern.</summary>
        public static readonly Regex WholeClass = new Regex(@"(^\s*|\b(all|every|each|the|of|for)\s+)(walls?|doors?|windows?|floors?|slabs?|roofs?|ceilings?|coverings?)\s+(shall|must|should|will|are|is|have|has|carry|carries|need|needs|require|requires)\b", RegexOptions.IgnoreCase);

        /// <summary>Why a clause is not a cited value, in the planner's words (null = it is one) — the bridge's notAValue, held to it by
        /// the shared value_cases: the value is not ONE value (C23); its sentence sets a bound (C7), does not state the value, goes on
        /// after it (C23), or does not name the whole class (C18). A hand-written IDS has no sentence: the value's shape alone.</summary>
        public static string NotAValue(string sentence, string value)
        {
            var v = (value ?? "").Trim(' ', '\t', '\r', '\n');
            if (v.Any(ch => ch < ' ' || ch > '~') || !OneValue.IsMatch(v)) return $"\"{v}\" is not one value (a bound, a choice or a qualifier) — a person decides";
            if (sentence == null) return null;
            if (BoundWords.IsMatch(sentence)) return "it sets a bound — a person decides";
            int at = sentence.IndexOf(v, StringComparison.Ordinal);
            if (at < 0) return $"it does not state \"{v}\" — a person decides";
            var tail = sentence.Substring(at + v.Length);
            var said = Regex.Replace(tail, @"^ +|[ .!]+(?![\s\S])", "");
            if (!SentenceEnd.IsMatch(tail)) return $"it narrows the class after the value (\"{said}\") — a person decides";
            return WholeClass.IsMatch(sentence) ? null : "it does not name the whole class — a person decides";
        }

        private sealed class Row { public string Entity, Pset, Prop, Value, Spec, Sentence, Skip; public bool Unreadable; }
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
                using (var d = JsonDocument.Parse(json ?? ""))
                {
                    if (d.RootElement.ValueKind != JsonValueKind.Object || !d.RootElement.TryGetProperty("specifications", out var specs) || specs.ValueKind != JsonValueKind.Array) return c;
                    foreach (var s in specs.EnumerateArray())
                    {
                        if (s.ValueKind != JsonValueKind.Object || !s.TryGetProperty("applicability", out var a) || a.ValueKind != JsonValueKind.Object) continue;
                        if (a.EnumerateObject().Any(p => p.Name != "entity") || Str(a, "entity") is not string entity) continue;
                        if (!s.TryGetProperty("requirements", out var r) || r.ValueKind != JsonValueKind.Object
                            || !r.TryGetProperty("properties", out var props) || props.ValueKind != JsonValueKind.Array) continue;
                        foreach (var p in props.EnumerateArray())
                        {
                            if (p.ValueKind != JsonValueKind.Object || Str(p, "cardinality") != "required") continue;
                            if (p.TryGetProperty("pattern", out var pt) && pt.ValueKind != JsonValueKind.Null) continue;
                            var value = Str(p, "value")?.Trim();
                            if (string.IsNullOrEmpty(value) || Str(p, "pset") == null || Str(p, "name") == null) continue;
                            var sentence = Str(s, "source_sentence");
                            c._rows.Add(new Row { Entity = entity, Pset = Str(p, "pset"), Prop = Str(p, "name"), Value = value, Spec = Str(s, "name") ?? "", Sentence = sentence,
                                                  Skip = NotAValue(sentence, value), Unreadable = !Readable(entity) });
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
            int dot = (key ?? "").IndexOf('.');
            string pset = dot < 0 ? key : key.Substring(0, dot), prop = dot < 0 ? "" : key.Substring(dot + 1);
            var hits = new List<(string Value, string Spec, string Sentence, string Why)>();
            foreach (var r in _rows.Where(x => x.Pset == pset && x.Prop == prop && (x.Skip != null) == skipped))
            {
                bool match;
                try { match = Regex.IsMatch(entity ?? "", r.Entity, RegexOptions.IgnoreCase); }
                catch (ArgumentException) { match = false; } // a pattern .NET cannot read applies to nothing (the bridge skips it too)
                if (match) hits.Add((r.Value, r.Spec, r.Sentence, r.Skip));
            }
            return hits;
        }

        /// <summary>Review C20: the clauses on <paramref name="key"/> whose entity pattern .NET cannot read — they apply to nothing (the
        /// bridge skips them too), and the planner says so rather than "no clause pins one".</summary>
        public int Unreadable(string key) => _rows.Count(r => r.Unreadable && r.Pset + "." + r.Prop == key);

        private static bool Readable(string pattern)
        {
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
                    if (param != null && m.CatalogValue(cat, family, type, param) is string cv)
                        found.Add((cv, "catalogue", $"{m.CatalogLabel} · {v.Label} · {param}"));
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
                    else if (distinct.Count == 0)
                    {
                        var floor = clauses.NotValues(Entity(cat), key); // C7, C18: a bound or a narrowed class is named, never written
                        row.Outcome = "no source";
                        row.Why = $"no source for {key} on {v.Label} — " +
                                  (param != null ? $"{m.CatalogLabel} gives no {param} for it" : "the catalogue harvests no value for it") + ", and " +
                                  (floor.Count > 0 ? $"{clauses.Label} · {floor[0].Spec} (\"{floor[0].Sentence ?? floor[0].Value}\"): {floor[0].Why}" // C23: the bridge's words
                                   : clauses.Unreadable(key) is int u && u > 0 ? $"{u} clause(s) of {clauses.Label} on {key} have an entity pattern Sentinel cannot read" // C20
                                   : clauses.Installed ? $"no clause of {clauses.Label} pins one" : $"no ids@n is installed to cite ({clauses.Label})") +
                                  $"; a person fills it in Revit (Type Properties) — {row.Elements} element(s) on it";
                    }
                    else if (distinct.Count > 1)
                    {
                        row.Outcome = "disagree";
                        row.Why = $"the sources disagree on {key} for {v.Label}: " + string.Join("; ", found.Select(f => $"\"{f.Value}\" ({f.Ref})")) + " — a person decides";
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
                                     $"reads it ({v.Instances} in the model now, {here} more that this changeset retypes onto it)",
                        });
                        inserted[p] = at + 1;
                    }
                    if (row.Outcome != "write") p.ToPerson.Add(new PromoteHeld { UniqueId = v.UniqueId, Label = $"type {v.Label} · {key}", Reason = row.Why });
                    report.Rows.Add(row);
                }
            }
            return report;
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
        /// ≤ 300). Null when the body holds no set_parameter, or nothing else (then nothing is filed again).</summary>
        public static object WithoutWrites(object body, string why, out int removed)
        {
            var o = JsonSerializer.SerializeToNode(body, global::Sentinel.Coordination.ChangesetClient.WriteJson).AsObject(); // nulls left out, as Propose posts it
            var all = o["elements"].AsArray();
            var writes = all.Where(e => (string)e?["op"] == "set_parameter").ToList();
            removed = writes.Count;
            if (removed == 0 || removed == all.Count) return null;
            if (!(o["exceptions"] is JsonArray ex)) o["exceptions"] = ex = new JsonArray();
            int held = ex.Count;
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
            // Review C17: the bridge refuses more than MaxExceptions; the held rows just before the type edits fold into one "(more)" row.
            // ponytail: assumes fewer than MaxExceptions type edits in one body (one per DD type × property).
            int max = PromoteWallsPlanner.MaxExceptions;
            if (ex.Count > max)
            {
                int keep = Math.Max(0, max - 1 - removed);
                var folded = ex.Skip(keep).Take(held - keep).ToList();
                int k = folded.Sum(f => (string)f["unique_id"] == "(more)" && Regex.Match((string)f["name"] ?? "", @"\d+") is Match mm && mm.Success ? int.Parse(mm.Value) : 1);
                foreach (var f in folded) ex.Remove(f);
                ex.Insert(keep, new JsonObject
                {
                    ["unique_id"] = "(more)", ["name"] = $"… and {k} more",
                    ["reason"] = "sent to a person — more than one changeset holds; the Promote summary counts them",
                });
            }
            return o;
        }

        private static string OneLine(string s, int max)
        {
            var t = new string((s ?? "").Select(ch => char.IsControl(ch) ? ' ' : ch).ToArray());
            return t.Length <= max ? t : t.Substring(0, max - 1) + "…";
        }
    }
}
