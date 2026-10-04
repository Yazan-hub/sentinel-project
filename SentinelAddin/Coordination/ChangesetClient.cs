#nullable disable
// Governed AI modeling (A2): HTTP client for staged changesets. Blocking calls in the add-in's
// established idioms — the short-timeout read (GovernedQuery) and the long-timeout confirmed
// write (GovernedNotify's GovHttp). The bridge's status is the truth; this client never caches.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Sentinel.Commands; // BcfConfig (bridge URL + platform project id)

namespace Sentinel.Coordination;

public sealed class CurveDto
{
    [JsonPropertyName("start")] public double[] Start { get; set; }
    [JsonPropertyName("end")] public double[] End { get; set; }
    /// <summary>MA-1a step 2: a point on an arc wall between its ends (a curved DWG wall); null = a straight line.</summary>
    [JsonPropertyName("mid")] public double[] Mid { get; set; }
}

public sealed class PlaceDto
{
    [JsonPropertyName("TypeName")] public string TypeName { get; set; }
    [JsonPropertyName("LevelName")] public string LevelName { get; set; }
    [JsonPropertyName("LocationCurve")] public CurveDto LocationCurve { get; set; }
    [JsonPropertyName("LocationLoop")] public double[][] LocationLoop { get; set; }
    [JsonPropertyName("BaseElevation")] public double? BaseElevation { get; set; }
    [JsonPropertyName("TopElevation")] public double? TopElevation { get; set; }
    [JsonPropertyName("Name")] public string Name { get; set; }
    // attach (MA-0): the story levels a wall's base and top are constrained to.
    [JsonPropertyName("BaseLevel")] public string BaseLevel { get; set; }
    [JsonPropertyName("TopLevel")] public string TopLevel { get; set; }
    // retype (Promote v1): a door or window's target family — a type name alone is not one type.
    [JsonPropertyName("FamilyName")] public string FamilyName { get; set; }
    // create (MA-1): a door's or window's point on its host wall's location line (mm, z = its level), a window's sill, flips;
    // a roof's or ceiling's outline in plan [[x,y],…] (mm), a roof's base offset, a ceiling's height above its level.
    [JsonPropertyName("Location")] public double[] Location { get; set; }
    [JsonPropertyName("SillHeight")] public double? SillHeight { get; set; }
    [JsonPropertyName("FlipFacing")] public bool? FlipFacing { get; set; }
    [JsonPropertyName("FlipHand")] public bool? FlipHand { get; set; }
    // create (MA-1b, GHB-1): a door or window read from a drawn block — the plan angle of the block's X axis (degrees, 0 up to
    // 360) and whether it is mirrored. The executor flips the instance to that hinge side and swing side; never sent with a flip.
    [JsonPropertyName("Rotation")] public double? Rotation { get; set; }
    [JsonPropertyName("Mirrored")] public bool? Mirrored { get; set; }
    [JsonPropertyName("Boundary")] public double[][] Boundary { get; set; }
    [JsonPropertyName("BaseOffset")] public double? BaseOffset { get; set; }
    [JsonPropertyName("Offset")] public double? Offset { get; set; }
    // any create but a level or grid (MA-1): its Mark (ALL_MODEL_MARK); a floor's Structural (FLOOR_PARAM_IS_STRUCTURAL).
    [JsonPropertyName("Mark")] public string Mark { get; set; }
    [JsonPropertyName("Structural")] public bool? Structural { get; set; }
}

/// <summary>The existing element a retype/attach ghost changes (MA-0, Promote v1): its Revit UniqueId, and for a retype the
/// type the plan saw ("Family : Type" for a door or window) — the executor refuses when the model has changed since.</summary>
public sealed class TargetDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("type_before")] public string TypeBefore { get; set; }
}

/// <summary>A wall a planner sent to a person instead of proposing a change (the changeset's exceptions).</summary>
public sealed class ExceptionRowDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
}

public sealed class ElementVerdictDto
{
    [JsonPropertyName("status")] public string Status { get; set; } = "recorded";
    [JsonPropertyName("failures")] public List<JsonElement> Failures { get; set; } = new();
}

public sealed class IdentityDto
{
    [JsonPropertyName("Class")] public string Class { get; set; }
    [JsonPropertyName("Name")] public string Name { get; set; }
    [JsonPropertyName("GlobalId")] public string GlobalId { get; set; }
}

public sealed class ValidateDto
{
    [JsonPropertyName("identity")] public IdentityDto Identity { get; set; }
}

/// <summary>MA-1a item 4: where an element came from, as its placer knows it — the CAD layer, the rule that typed it, the
/// source file's sha256. The bridge keeps it as filed, as a record. Review amendment C1: the executor never reads it back
/// from a changeset the bridge returned — an element's stamp takes these facts from its in-process placer only.</summary>
public sealed class ProvenanceDto
{
    [JsonPropertyName("layer")] public string Layer { get; set; }
    [JsonPropertyName("rule")] public string Rule { get; set; }
    [JsonPropertyName("source_sha256")] public string SourceSha256 { get; set; }
}

public sealed class ChangesetElementDto
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("kind")] public string Kind { get; set; }
    /// <summary>"create" (null on an older bridge), "retype" or "attach".</summary>
    [JsonPropertyName("op")] public string Op { get; set; }
    [JsonPropertyName("target")] public TargetDto Target { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
    [JsonPropertyName("validate")] public ValidateDto Validate { get; set; }
    [JsonPropertyName("place")] public PlaceDto Place { get; set; }
    [JsonPropertyName("verdict")] public ElementVerdictDto Verdict { get; set; }
    /// <summary>MA-1a item 4: the filed record; null for an agent's or Promote's element (they name no drawing). Never what
    /// the stamp is written from (C1).</summary>
    [JsonPropertyName("provenance")] public ProvenanceDto Provenance { get; set; }
    /// <summary>MA-1a item 8: the bridge's pre-tick decision; null from a bridge before item 8, and on an element the
    /// add-in files (nulls are left out of a request body). Never trusted for a create (ChangesetTrust.PreTick).</summary>
    [JsonPropertyName("pretick")] public bool? Pretick { get; set; }
    /// <summary>MA-1a item 8: the bridge's accuracy status — "not_measured" until a survey job backs a measurement (MA-4).</summary>
    [JsonPropertyName("accuracy")] public AccuracyDto Accuracy { get; set; }
    /// <summary>MA-1a item 8 (review amendment C4): contract 2's reader id and evidence ids — the caller's claim, kept by
    /// the bridge as sent. Read only: nothing in MA-1a acts on them. Null on an element the add-in files.</summary>
    [JsonPropertyName("cid")] public string Cid { get; set; }
    [JsonPropertyName("evidence")] public List<string> Evidence { get; set; }
    /// <summary>MA-2a (full contract 2): the bridge's record of who typed the element — "bridge" (from the facts the poster sent, by
    /// the project's guideline and catalogue) or "caller"; null from a bridge before MA-2a and on an element the add-in files.
    /// Read only: the executor types by place.TypeName as for any changeset.</summary>
    [JsonPropertyName("typing")] public TypingDto Typing { get; set; }
    /// <summary>MA-2c, a "set_parameter" (Target.UniqueId names a TYPE): the DD property, the Revit parameter's name, the value the
    /// plan read on the type ("" when empty — the executor's stale guard compares it), the value to write, and the bridge's record
    /// of where the value comes from. Null on every other op.</summary>
    [JsonPropertyName("parameter")] public string Parameter { get; set; }
    [JsonPropertyName("revit_parameter")] public string RevitParameter { get; set; }
    [JsonPropertyName("from")] public string From { get; set; }
    [JsonPropertyName("to")] public string To { get; set; }
    [JsonPropertyName("value_source")] public ValueSourceDto ValueSource { get; set; }
    /// <summary>MA-3a (design §6.6, D17): the web desk's decision on this ghost, as the bridge stores it; null while nobody decided
    /// (proposed) and from a bridge before MA-3a. A decline binds (ChangesetTrust.PreTick, the window, Apply's re-check); an accept is
    /// advice.</summary>
    [JsonPropertyName("review")] public ReviewDto Review { get; set; }
}

/// <summary>MA-3a: one web desk decision on a ghost (changesets-logic.mjs applyDecisions / reopenDecline).</summary>
public sealed class ReviewDto
{
    /// <summary>"accepted", "declined", or "proposed" after a lead's re-open.</summary>
    [JsonPropertyName("state")] public string State { get; set; }
    /// <summary>"accept", "decline" or "reopen".</summary>
    [JsonPropertyName("action")] public string Action { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
    [JsonPropertyName("by")] public string By { get; set; }
    [JsonPropertyName("role")] public string Role { get; set; }
    [JsonPropertyName("at")] public string At { get; set; }
    /// <summary>The changeset's review_rev this decision was written at.</summary>
    [JsonPropertyName("rev")] public int? Rev { get; set; }
}

/// <summary>MA-2c: where a set_parameter's value comes from, as the bridge checked it — "catalogue" or "clause", and the artefact,
/// row or clause it cites ("type_catalog@2 · office · … · BDS_EXT_ARC_CMU_200 mm · Fire Rating").</summary>
public sealed class ValueSourceDto
{
    [JsonPropertyName("kind")] public string Kind { get; set; }
    [JsonPropertyName("ref")] public string Ref { get; set; }
    [JsonPropertyName("sha256")] public string Sha256 { get; set; }
}

public sealed class TypingDto
{
    [JsonPropertyName("typed_by")] public string TypedBy { get; set; }
    [JsonPropertyName("type")] public string Type { get; set; }
    [JsonPropertyName("family")] public string Family { get; set; }
    [JsonPropertyName("rule")] public string Rule { get; set; }
    /// <summary>The bridge's refLabel of the guideline and catalogue that decided ("guideline@1 · office · 0123456789ab…").</summary>
    [JsonPropertyName("guideline")] public string Guideline { get; set; }
    [JsonPropertyName("catalog")] public string Catalog { get; set; }
}

public sealed class AccuracyDto
{
    [JsonPropertyName("status")] public string Status { get; set; }
}

/// <summary>MA-1a item 8: how the review reads the bridge's trust fields. Pure (tools/promote-check).</summary>
public static class ChangesetTrust
{
    /// <summary>What is ticked when the review opens (and by "Tick suggested"). A create is never pre-ticked: an agent
    /// ghost and a drawing-only ghost never are, and nothing is measured before MA-4 — held here too, whatever a bridge
    /// answers. A retype or attach takes the bridge's decision; from a bridge before item 8 (no pretick) the window's own
    /// rule holds: a Promote attach, and a Promote retype with the type the plan saw (DR-1). A person still clicks Apply.</summary>
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el)
    {
        // MA-3a (design §6.6, D17): a web decline binds — never ticked, whatever else holds. A web accept changes nothing here (advice).
        if (DeclinedOnWeb(el)) return false;
        // MA-2c: a set_parameter is a TYPE edit — it reaches every element on the type — so it is never pre-ticked (founder decision F1).
        if (el.Op is null or "create" or "set_parameter") return false;
        return el.Pretick ?? (cs.Source == "promote" && (el.Op == "attach" || (el.Op == "retype" && el.Target?.TypeBefore != null)));
    }

    /// <summary>The element's accuracy in words ("not measured"); null when the bridge sent none.</summary>
    public static string Accuracy(ChangesetElementDto el) => el.Accuracy?.Status?.Replace('_', ' ');

    /// <summary>MA-2a: the review's words for an element the bridge typed — "typed by the bridge from the facts posted (guideline@1 ·
    /// office · …)"; null for one the caller typed, or from a bridge before MA-2a.</summary>
    public static string Typing(ChangesetElementDto el) =>
        el.Typing?.TypedBy == "bridge" ? "typed by the bridge from the facts posted (" + (el.Typing.Guideline ?? "guideline") + ")" : null;

    /// <summary>Review C21 (MA-2c, founder decision F1's "14 more that this changeset retypes onto it"): the elements this changeset
    /// retypes onto a set_parameter's type — same kind and type name; the family where both name one (the bridge's typer names a
    /// wall's). The review row shows it beside the model's own count.</summary>
    public static int RetypedOnto(ChangesetDto cs, ChangesetElementDto sp)
    {
        bool same(string a, string b) => string.Equals(a?.Trim() ?? "", b?.Trim() ?? "", StringComparison.OrdinalIgnoreCase);
        return (cs.Elements ?? new List<ChangesetElementDto>()).Count(e => e.Op == "retype" && same(e.Kind ?? "wall", sp.Kind ?? "wall")
            && same(e.Place?.TypeName, sp.Place?.TypeName)
            && (string.IsNullOrWhiteSpace(e.Place?.FamilyName) || string.IsNullOrWhiteSpace(sp.Place?.FamilyName) || same(e.Place.FamilyName, sp.Place.FamilyName)));
    }

    /// <summary>MA-3b: the review window's group for a ghost — what it does, in the web desk's words (review-desk.ts whatOf): "retype wall".</summary>
    public static string GroupOf(ChangesetElementDto el) => $"{el.Op ?? "create"} {el.Kind}";

    /// <summary>MA-3b (AI-5): the ledger row the bridge named for a result — "ledger #1731" — or the web desk's words when it named none
    /// (a bridge before MA-3b, a row with no id, or a reply that is not JSON).</summary>
    public static string LedgerOf(string reply)
    {
        try
        {
            using var doc = JsonDocument.Parse(reply ?? "");
            var r = doc.RootElement;
            return r.ValueKind == JsonValueKind.Object && r.TryGetProperty("ledger", out var l) && l.ValueKind == JsonValueKind.Object && l.TryGetProperty("id", out var id)
                   && (id.ValueKind == JsonValueKind.Number || id.ValueKind == JsonValueKind.String) ? "ledger #" + id : "the bridge named no ledger row";
        }
        catch (JsonException) { return "the bridge named no ledger row"; }
    }

    /// <summary>MA-3b (AI-5, review M2): Decline all without a reason — said by the window at once and by the command as the backstop.</summary>
    public const string DeclineNeedsReason = "Nothing is ticked, so this declines every ghost — a decline needs a reason: type it in the note (it is recorded with the result), then press Decline all.";

    /// <summary>The changeset's source as the review shows it: a claim is said to be one.</summary>
    public static string SourceLabel(ChangesetDto cs) =>
        cs.Source + (cs.Claimed == true ? " (claimed — the bridge records who a changeset says it is from, and cannot verify it)" : "");

    /// <summary>MA-3a: whether the web desk declined this ghost — it binds: never ticked, and Apply refuses it.</summary>
    public static bool DeclinedOnWeb(ChangesetElementDto el) => el?.Review?.State == "declined";

    private static string Who(ReviewDto r) => (r.By ?? "someone") + (string.IsNullOrWhiteSpace(r.Role) ? "" : $" ({r.Role})");

    /// <summary>A ghost as the bridge's refusals name it (changesets-logic ghostName): retype wall "W 1".</summary>
    public static string GhostName(ChangesetElementDto e) => $"{e.Op ?? "create"} {e.Kind} \"{e.Validate?.Identity?.Name ?? e.ProposalGuid}\"";

    /// <summary>MA-3b2: the bridge's rule for a reason (changesets-logic MAX_REVIEW_REASON and reasonOf's refusal).</summary>
    public const int MaxReason = 500;
    public const string ReasonRule = "a reason is one line of at most 500 characters";

    /// <summary>MA-3b2: a decline reason as the bridge will keep it — trimmed; null when blank (none is sent). <paramref name="problem"/>
    /// is <see cref="ReasonRule"/> when the bridge would refuse it (more than one line, a control character, over 500 characters):
    /// refused in the window before Apply, because a result the bridge refuses after Revit placed its elements is not reported.</summary>
    public static string DeclineReason(string text, out string problem)
    {
        problem = null;
        if (text == null || text.All(c => char.IsWhiteSpace(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format)) return null;
        if (text.Length > MaxReason || text.Any(c => char.IsControl(c) || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.LineSeparator
                                                     || char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.ParagraphSeparator))
        {
            problem = ReasonRule;
            return null;
        }
        return text.Trim();
    }

    /// <summary>MA-3b2 review C18: blank to the eye (DeclineReason's own test: only spaces and format characters such as a zero-width
    /// space) — Decline all's note is tested with it; a note of several lines or a long one is not blank.</summary>
    public static bool Blank(string text) => DeclineReason(text, out var problem) == null && problem == null;

    /// <summary>MA-3b2 (claimed vs verified): what a reported result says of its decline reasons — counted from the bridge's reply (the
    /// stored result.reasons), never from what was sent; "" when none was sent.</summary>
    public static string ReasonsLine(string reply, int sent)
    {
        if (sent <= 0) return "";
        int kept = 0;
        try
        {
            using var doc = JsonDocument.Parse(reply ?? "");
            if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.Object
                && r.TryGetProperty("reasons", out var m) && m.ValueKind == JsonValueKind.Object) kept = m.EnumerateObject().Count();
        }
        catch (JsonException) { /* not JSON: none can be counted */ }
        return kept >= sent ? $"\n{kept} decline reason(s) recorded with it."
            : $"\n⚠ {sent} decline reason(s) were sent and the bridge kept {kept} — a bridge before MA-3b2 keeps none, and a blank one is never kept; what it did not keep is not on the ledger.";
    }

    /// <summary>MA-3b2 (drill MA3b's finding): a request's failure in plain words. A timeout — net48's "A task was canceled.", net8's
    /// "…canceled due to the configured HttpClient.Timeout…" — reads "the bridge did not answer within N s"; the bridge's own words
    /// ("Bridge 409: …") are never rewritten. Review C1 (never a guess): only a message that IS the timeout is rewritten — one that
    /// merely holds "canceled" (a sign-in refresh that timed out before the bridge was asked: "… (Supabase not reached: A task was
    /// canceled.)") keeps its own words.</summary>
    public static string BridgeWords(string err, int seconds) =>
        string.IsNullOrWhiteSpace(err) ? "the bridge did not answer"
        : err == "A task was canceled." || err == "The operation was canceled." || err.StartsWith("The request was canceled due to the configured HttpClient.Timeout", StringComparison.Ordinal)
            ? $"the bridge did not answer within {seconds} s"
        : err;

    /// <summary>…and of the exception itself: a cancelled request is the timeout; a request that never connected names its cause (the
    /// innermost message: "No connection could be made because the target machine actively refused it …"), not "An error occurred
    /// while sending the request." Review C1: any other exception (the session's, a reply that is not JSON) keeps its own message —
    /// never through the string overload.</summary>
    public static string BridgeWords(Exception ex, int seconds) =>
        ex is OperationCanceledException ? $"the bridge did not answer within {seconds} s"
        : ex is HttpRequestException ? "the connection failed — " + ex.GetBaseException().Message
        : string.IsNullOrWhiteSpace(ex?.Message) ? "the bridge did not answer" : ex.Message;

    /// <summary>MA-3b2: a type edit's row has no Show.</summary>
    public const string NoPlace = "A type edit has no place in the model — it reaches every element on its type (the row says how many).";

    /// <summary>MA-3b2 (zoom to row): the rectangle a create's row shows — the least and greatest corner {x, y, z} in mm around every point
    /// of its place (a wall's line and an arc's middle point, a floor's loop, a roof's or ceiling's outline, a door's point),
    /// <paramref name="marginMm"/> wider on each side in plan; z from the points, else the place's base elevation, else 0. Null when
    /// the place has no point (a level, a grid).</summary>
    public static double[][] PlaceBox(PlaceDto p, double marginMm = 1000)
    {
        if (p == null) return null;
        var pts = new List<double[]>();
        void Add(double[] q) { if (q != null && q.Length >= 2) pts.Add(q); }
        Add(p.LocationCurve?.Start); Add(p.LocationCurve?.End); Add(p.LocationCurve?.Mid);
        foreach (var q in p.LocationLoop ?? new double[0][]) Add(q);
        foreach (var q in p.Boundary ?? new double[0][]) Add(q);
        Add(p.Location);
        if (pts.Count == 0) return null;
        double Z(double[] q) => q.Length >= 3 ? q[2] : p.BaseElevation ?? 0;
        return new[]
        {
            new[] { pts.Min(q => q[0]) - marginMm, pts.Min(q => q[1]) - marginMm, pts.Min(Z) },
            new[] { pts.Max(q => q[0]) + marginMm, pts.Max(q => q[1]) + marginMm, pts.Max(Z) },
        };
    }

    /// <summary>MA-3a: the row's words for the web desk's decision; null when nobody decided.</summary>
    public static string ReviewLine(ChangesetElementDto el)
    {
        var r = el?.Review;
        if (r == null) return null;
        if (r.State == "declined") return $"declined on the web by {Who(r)}: {r.Reason} · a lead may re-open it on the web desk";
        if (r.State == "accepted") return $"accepted on the web by {Who(r)}" + (string.IsNullOrWhiteSpace(r.Reason) ? "" : $": {r.Reason}") + " — advice: it still needs your tick";
        return r.Action == "reopen" ? $"re-opened on the web by {Who(r)}: {r.Reason}" : null;
    }

    /// <summary>MA-3a: the window's header when the web declined ghosts of <paramref name="cs"/>; null when none did.</summary>
    public static string DeclinedHeader(ChangesetDto cs)
    {
        int n = (cs.Elements ?? new List<ChangesetElementDto>()).Count(DeclinedOnWeb);
        // C4: a decline binds its changeset only — a Promote re-run proposes the same ghost again, undecided (carrying it is MA-3b).
        return n == 0 ? null : $"{n} ghost(s) declined on the web — shown unticked with the reason; they cannot be ticked here (a lead may re-open one on the web desk). " +
                               "Apply reports them as rejected; the changeset stays proposed until Revit reports it — a new Promote run proposes a declined ghost again, undecided.";
    }

    /// <summary>MA-3a: Apply's re-check on the fresh copies — the ticked ghosts the web declined (one may land after the window opened).
    /// The refusal's words (nothing is created), or null when none is.</summary>
    public static string DeclinedTicked(IEnumerable<ChangesetDto> fresh, ICollection<string> ticked)
    {
        var hit = (fresh ?? Enumerable.Empty<ChangesetDto>()).SelectMany(c => c.Elements ?? new List<ChangesetElementDto>())
            .Where(e => ticked.Contains(e.ProposalGuid) && DeclinedOnWeb(e)).ToList();
        return hit.Count == 0 ? null : $"{hit.Count} ticked ghost(s) were declined on the web after this window opened:\n" +
            string.Join("\n", hit.Select(e => $"· {GhostName(e)} — {ReviewLine(e)}")) +
            "\n\nNothing was created. They are unticked here and cannot be ticked — press Apply again for the rest, or close this window.";
    }

    /// <summary>MA-3a (Q2): the bridge's reply to a result — the ghosts it recorded as applied over a decline that landed after Apply's
    /// re-check, and (C2) over a decline it could not judge because the result carried no review_rev, in words; null when there is none
    /// (or the reply is not JSON: the result was recorded either way).</summary>
    public static string LateDeclines(string reply)
    {
        try
        {
            using var doc = JsonDocument.Parse(reply ?? "");
            if (doc.RootElement.ValueKind != JsonValueKind.Object || !doc.RootElement.TryGetProperty("result", out var r) || r.ValueKind != JsonValueKind.Object) return null;
            string S(JsonElement x, string p) => x.TryGetProperty(p, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : "?";
            List<JsonElement> Arr(string p) => r.TryGetProperty(p, out var a) && a.ValueKind == JsonValueKind.Array ? a.EnumerateArray().ToList() : new List<JsonElement>();
            string Lines(List<JsonElement> xs) => string.Join("\n", xs.Select(x => $"· {S(x, "name")} — declined on the web by {S(x, "by")} ({S(x, "role")}): {S(x, "reason")}"));
            var late = Arr("applied_over_late_decline");
            var unchecked_ = Arr("applied_over_decline_unchecked");
            var said = new List<string>();
            if (late.Count > 0)
                said.Add($"{late.Count} ghost(s) were declined on the web after Apply re-checked them, and were applied:\n" + Lines(late) +
                         "\n\nThe bridge recorded the apply over the decline (changeset_applied). Undo in Revit if the decline should stand.");
            if (unchecked_.Count > 0)
                said.Add($"{unchecked_.Count} ghost(s) declined on the web were applied, and this result carried no review_rev — the bridge cannot tell whether the decline was seen:\n" + Lines(unchecked_) +
                         "\n\nThe bridge recorded it as unchecked (changeset_applied). Undo in Revit if the decline should stand.");
            return said.Count == 0 ? null : string.Join("\n\n", said);
        }
        catch (JsonException) { return null; }
    }
}

public sealed class AdjudicationDto
{
    [JsonPropertyName("verdict")] public string Verdict { get; set; }
    [JsonPropertyName("ids_source")] public string IdsSource { get; set; }
    [JsonPropertyName("unattributed")] public List<JsonElement> Unattributed { get; set; } = new();
    /// <summary>MA-1a item 4: the changeset's proposal row on the ledger ("Proposal &lt;verdict&gt;"; the bridge stores it as
    /// adjudication.audit_id). Read as it comes — a number from the ledger, null on a local changeset or an older bridge — so
    /// an odd value never breaks reading the changeset.</summary>
    [JsonPropertyName("audit_id")] public JsonElement? AuditId { get; set; }
    /// <summary>The ledger_row of every element this changeset places: the audit id as text, or null.</summary>
    [JsonIgnore] public string LedgerRow => AuditId is { ValueKind: JsonValueKind.Number or JsonValueKind.String } a ? a.ToString() : null;
}

public sealed class ChangesetDto
{
    [JsonPropertyName("id")] public string Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("source")] public string Source { get; set; }
    /// <summary>MA-1a item 8: the bridge marks the source a claim (true on every changeset until a bridge-run job backs
    /// one, MA-4); null from a bridge before item 8.</summary>
    [JsonPropertyName("claimed")] public bool? Claimed { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; }
    [JsonPropertyName("created_at")] public string CreatedAt { get; set; }
    /// <summary>MA-3a: the doc's review revision (every bridge write bumps it); the result sends back the one Apply re-checked. Null from a
    /// bridge before MA-3a.</summary>
    [JsonPropertyName("review_rev")] public int? ReviewRev { get; set; }
    [JsonPropertyName("adjudication")] public AdjudicationDto Adjudication { get; set; }
    [JsonPropertyName("elements")] public List<ChangesetElementDto> Elements { get; set; } = new();
    [JsonPropertyName("exceptions")] public List<ExceptionRowDto> Exceptions { get; set; } = new();
    /// <summary>MA-3b review C1: the stored result as the bridge holds it (null while proposed) — read as it comes, so an odd value never
    /// breaks reading the changeset; UnreportedResults.AlreadyTaken reads its applied ghosts.</summary>
    [JsonPropertyName("result")] public JsonElement? Result { get; set; }
}

public sealed class AppliedEntry
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("revit_element_id")] public long RevitElementId { get; set; }
    [JsonPropertyName("revit_unique_id")] public string RevitUniqueId { get; set; }
}

internal static class ChangesetClient
{
    // Reads: short timeout, errors surfaced (the review flow must tell the human, unlike the
    // fire-and-forget notify paths). Writes: 120s — result reporting must confirm.
    private static readonly HttpClient ReadHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly HttpClient WriteHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };
    /// <summary>How a request body is written: nulls left out (a retype's target has no type_before on an attach).</summary>
    internal static readonly JsonSerializerOptions WriteJson = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static HttpRequestMessage Req(HttpMethod m, string url, string token, string json = null)
    {
        var msg = new HttpRequestMessage(m, url);
        if (json != null) msg.Content = new StringContent(json, Encoding.UTF8, "application/json"); // MA-2d C1: a write's body, built with it
        if (!string.IsNullOrWhiteSpace(token))
            msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return msg;
    }

    // MA-2d (house rule: no network call on Revit's API thread): every request this client sends — Promote's and Ghost Builder's
    // Propose and Withdraw, the review's FetchProposed, FetchOne, MyRole and ReportResult, the undo watcher's revert — is built, sent
    // and read on a pool thread. Review C1: built there too, because reading the token (BcfConfig.ServiceToken → UserSession.AccessToken)
    // refreshes a token with a minute or less left over the network (a mutex wait up to 10 s, a Supabase call up to 8 s); make() runs
    // before the first await, so that mutex is taken and released on one thread. The body — UserSession.Actor in it, a file read — is
    // serialized on the caller's. ponytail: the caller still waits for the answer (8 s reads, 120 s writes), so Revit is held as long
    // as before; a review flow that does not wait is the upgrade (MA-2d Risks).
    private static (HttpResponseMessage Resp, string Body) Send(HttpClient http, Func<HttpRequestMessage> make) =>
        Task.Run(async () =>
        {
            var msg = make();
            var resp = await http.SendAsync(msg).ConfigureAwait(false);
            return (resp, await resp.Content.ReadAsStringAsync().ConfigureAwait(false));
        }).GetAwaiter().GetResult();

    public static List<ChangesetDto> FetchProposed(BcfConfig cfg, string projectKey, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}?status=proposed";
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            var list = JsonSerializer.Deserialize<List<ChangesetDto>>(body) ?? new List<ChangesetDto>();
            return list.OrderBy(c => c.CreatedAt, StringComparer.Ordinal).ToList(); // FIFO — oldest first
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
    }

    public static ChangesetDto FetchOne(BcfConfig cfg, string projectKey, string id, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}";
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            return JsonSerializer.Deserialize<ChangesetDto>(body);
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>MA-3a: <paramref name="reviewRev"/> is the review_rev Apply re-checked (null: no revision was re-checked — the bridge records any decline it applied as applied_over_decline_unchecked, C2);
    /// <paramref name="reply"/> is the bridge's answer, the stored changeset (ChangesetTrust.LateDeclines reads it). MA-3b2:
    /// <paramref name="reasons"/> is the reviewer's reason per rejected ghost ({proposal_guid: one line}); null sends none.</summary>
    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, out string reply, out string error, Dictionary<string, string> reasons = null) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             ResultBody(applied, rejected, note, reviewRev, reasons), 200, out reply, out error);

    /// <summary>The result's body (tools/promote-check reads it). `reasons` is written as null when there is none: the bridge reads
    /// null as none, and a bridge before MA-3b2 ignores the field.</summary>
    internal static string ResultBody(List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, Dictionary<string, string> reasons) =>
        JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev, reasons });

    private static bool Post(BcfConfig cfg, string path, string payload, int expect, out string body, out string error)
    {
        body = null; error = null;
        try
        {
            // Review C1: the request — its token and its body — is built inside Send's pool thread; payload was serialized here.
            HttpResponseMessage resp;
            (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Post, $"{cfg.ServiceUrl.TrimEnd('/')}{path}", cfg.ServiceToken, payload));
            if ((int)resp.StatusCode != expect) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return false; }
            return true;
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return false; }
    }

    /// <summary>The caller's role on the project (GET /cde/:key/members/me): "service" for the machine credential, a
    /// member's role, "" for a signed-in non-member; null with the error when it could not be read.</summary>
    public static string MyRole(BcfConfig cfg, string projectKey, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/cde/{Uri.EscapeDataString(projectKey)}/members/me";
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = $"Bridge {(int)resp.StatusCode}: {body}"; return null; }
            using var doc = JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("role", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : "";
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>XC-4: whether this person may approve or reject change requests on <paramref name="key"/> — a signed-in
    /// lead or owner of the web project (<paramref name="role"/>/<paramref name="error"/> are <see cref="MyRole"/>'s
    /// answer). Every other answer, and every failure to read one, is read-only with the reason — worded for any lead-only
    /// action, the caller names the action; nothing grants on a failure.</summary>
    public static (bool Coordinator, string Why) CoordinatorFrom(string key, string role, string error)
    {
        if (string.IsNullOrWhiteSpace(key)) return (false, "this model is not bound to a web project (Sentinel ▸ Project Setup)");
        if (role == null) return (false, $"your role on {key} could not be read ({error})");
        if (role is "lead" or "owner") return (true, $"{role} on {key}");
        if (role == "service") return (false, $"signed out — sign in (Standards ▸ Sign in) as a lead or owner of {key}");
        if (role.Length == 0) return (false, $"you are not a member of {key}");
        return (false, $"you are {role} on {key}");
    }

    /// <summary>File a changeset (POST /changesets/:key → 201 and the stored changeset). Null with the error otherwise.</summary>
    public static ChangesetDto Propose(BcfConfig cfg, string projectKey, object body, out string error)
    {
        if (!Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}", JsonSerializer.Serialize(body, WriteJson), 201, out var resp, out error)) return null;
        try { return JsonSerializer.Deserialize<ChangesetDto>(resp); }
        catch (Exception ex) { error = ex.Message; return null; }
    }

    /// <summary>Withdraw a proposed changeset (POST /changesets/:key/:id/withdraw → 200): a Ghost build that filed some of its
    /// changesets and then could not file the rest takes them back, so none is left for a later review to apply.</summary>
    public static bool Withdraw(BcfConfig cfg, string projectKey, string id, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/withdraw",
             JsonSerializer.Serialize(new { actor = UserSession.Actor }, WriteJson), 200, out _, out error);

    /// <summary>A person undid or redid an applied changeset in Revit: one changeset_reverted ledger row
    /// (POST /changesets/:key/:id/reverted → 201). Off Revit's thread (the undo watcher's Task.Run).</summary>
    public static bool ReportReverted(BcfConfig cfg, string projectKey, string id, List<string> guids, string op, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/reverted",
             JsonSerializer.Serialize(new { op, guids, actor = UserSession.Actor }, WriteJson), 201, out _, out error);
}
