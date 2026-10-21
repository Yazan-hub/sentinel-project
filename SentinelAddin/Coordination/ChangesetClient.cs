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
using Sentinel.Engine;   // GovElement (MA-6-2: the as-built re-read)

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
    // create (MA-5b-1): a room's number as drawn (its name is Name); none = Revit numbers it.
    [JsonPropertyName("Number")] public string Number { get; set; }
    // create (MA-6-3): a wall opening's width and height (mm; its sill is SillHeight); a roof's slope per Boundary edge, in degrees —
    // Slopes[i] for the edge Boundary[i]→[i+1], null where the edge defines no slope. A column's top is TopLevel.
    [JsonPropertyName("Width")] public double? Width { get; set; }
    [JsonPropertyName("Height")] public double? Height { get; set; }
    [JsonPropertyName("Slopes")] public List<double?> Slopes { get; set; }
    // create (MA-8-10): a stair's riser count and going (mm) - one straight run, LocationCurve its centre line first riser to last, Width its run width, TopLevel the level it reaches.
    [JsonPropertyName("Risers")] public int? Risers { get; set; }
    [JsonPropertyName("Going")] public double? Going { get; set; }
    // create (MA-8-14): a terrain's ground points [x, y, z] mm (z = the absolute model elevation); its Boundary is the storey's footprint, the hole in the Toposolid.
    [JsonPropertyName("Points")] public double[][] Points { get; set; }
}

/// <summary>The existing element a retype/attach ghost changes (MA-0, Promote v1): its Revit UniqueId, and for a retype the
/// type the plan saw ("Family : Type" for a door or window) — the executor refuses when the model has changed since.</summary>
public sealed class TargetDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("type_before")] public string TypeBefore { get; set; }
    /// <summary>MA-5b-4 (C13b): a reshape's stale guard — the location line (mm) the wall was placed with; a wall that no longer stands
    /// there was edited by hand since, and is kept as it stands.</summary>
    [JsonPropertyName("placed")] public CurveDto Placed { get; set; }
    /// <summary>MA-5b-5: a rehost's stale guard — where the instance stood (its LocationPoint, mm) when Promote read it; one moved since
    /// is kept as it stands.</summary>
    [JsonPropertyName("at")] public double[] At { get; set; }
    /// <summary>Human-error guards §3: a delete names its copy and the element that stays by IFC GlobalId — clash triage on the web knows those,
    /// not UniqueIds; the executor finds both in the open model (BcfApplyEvent.MapByIfcGuid). Null on every other op.</summary>
    [JsonPropertyName("ifc_guid")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string IfcGuid { get; set; }
    [JsonPropertyName("keeper_ifc_guid")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string KeeperIfcGuid { get; set; }
}

/// <summary>A wall a planner sent to a person instead of proposing a change (the changeset's exceptions).</summary>
public sealed class ExceptionRowDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
    // MA-8-9: a stair flag (kind "stair") also carries its storey, its box in the model's frame (mm) and where it came from; all null on any other row.
    [JsonPropertyName("kind")] public string Kind { get; set; }
    [JsonPropertyName("storey")] public string Storey { get; set; }
    [JsonPropertyName("box")] public BoxDto Box { get; set; }
    [JsonPropertyName("source")] public string Source { get; set; }
    [JsonPropertyName("global_id")] public string GlobalId { get; set; }
}

/// <summary>MA-8-9: an axis-aligned box in mm, [x, y, z] each.</summary>
public sealed class BoxDto
{
    [JsonPropertyName("min")] public double[] Min { get; set; }
    [JsonPropertyName("max")] public double[] Max { get; set; }
}

/// <summary>MA-8-9: the bridge's answer to a stair pick - the flag row it appended.</summary>
public sealed class FlagReplyDto
{
    [JsonPropertyName("flag")] public ExceptionRowDto Flag { get; set; }
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
    /// add-in files (nulls are left out of a request body). Trusted for a create only on a survey changeset (Claimed false)
    /// within tolerance and not rejected by the IDS (MA-4f: ChangesetTrust.PreTick).</summary>
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
    /// <summary>MA-8-7 (D16): a wall or floor create that re-creates a DirectShape or Generic Model as an office type - the original's UniqueId and the box
    /// it stood in when Promote read it (the executor's stale guard). The executor deletes it in the same Undo step. Null on every other element.</summary>
    [JsonPropertyName("replaces")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public ReplacesDto Replaces { get; set; }
    /// <summary>MA-8-7 (amendment 16): the bridge's judgement of a retype - its type is not one of the office's catalogue (true), is (false), or could
    /// not be judged (null: no catalogue, or an older bridge). A foreign retype is never pre-ticked.</summary>
    [JsonPropertyName("foreign")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public bool? Foreign { get; set; }
    /// <summary>MA-8-10: the stair flag a stair create starts from - {changeset, unique_id} of the exception row it was proposed from. Null on every other element.</summary>
    [JsonPropertyName("from_flag")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public FromFlagDto FromFlag { get; set; }
    /// <summary>MA-8-14: the survey changeset whose scan a terrain's ground points came from - {changeset}. Null on every other element.</summary>
    [JsonPropertyName("from_scan")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public FromScanDto FromScan { get; set; }
}

/// <summary>MA-8-14: the survey changeset a terrain starts from.</summary>
public sealed class FromScanDto
{
    [JsonPropertyName("changeset")] public string Changeset { get; set; }
}

/// <summary>MA-8-10: a stair's flag - the changeset that holds it and its exception row's unique_id.</summary>
public sealed class FromFlagDto
{
    [JsonPropertyName("changeset")] public string Changeset { get; set; }
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
}

/// <summary>MA-8-7: a create's `replaces` - the element it removes (UniqueId) and where it stood (box, model mm).</summary>
public sealed class ReplacesDto
{
    [JsonPropertyName("unique_id")] public string UniqueId { get; set; }
    [JsonPropertyName("box")] public BoxDto Box { get; set; }
    /// <summary>"directshape" | "generic", and the original's Revit category - both optional (an older body sends neither).</summary>
    [JsonPropertyName("kind")] public string Kind { get; set; }
    [JsonPropertyName("category")] public string Category { get; set; }
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
    /// <summary>The changeset's review_rev this decision was written at (0 on a carried decline: the revision the changeset was filed at).</summary>
    [JsonPropertyName("rev")] public int? Rev { get; set; }
    /// <summary>MA-3b3: set when the bridge filed this ghost already declined — the decline was made before, on another changeset of
    /// the project (changesets-logic.mjs carryDeclines). Null on a decline made on this changeset, and from a bridge before MA-3b3.</summary>
    [JsonPropertyName("carried_from")] public CarriedFromDto CarriedFrom { get; set; }
}

/// <summary>MA-3b3: where a carried decline was made — the changeset (its id and name), the ghost there, and "web" (the review desk)
/// or "revit" (a row rejected in Revit with a reason).</summary>
public sealed class CarriedFromDto
{
    [JsonPropertyName("changeset")] public string Changeset { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("origin")] public string Origin { get; set; }
}

/// <summary>MA-3b3: what the bridge carried at filing, counted — ghosts filed already declined; ghosts rejected in Revit before with
/// no reason of their own (not carried); creates of the same kind, type and level as a create declined before (never matched);
/// ghosts rejected in Revit before with a reason that no signed-in member reported (not carried — review C1).</summary>
public sealed class CarryDto
{
    [JsonPropertyName("carried")] public int Carried { get; set; }
    [JsonPropertyName("no_reason")] public int NoReason { get; set; }
    [JsonPropertyName("creates")] public int Creates { get; set; }
    [JsonPropertyName("unverified")] public int Unverified { get; set; }
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
    /// <summary>MA-5a ("bridge-size"): a scan door or window typed by its measured size — the nominal size ("1000 x 2100 mm") and the
    /// band the catalogue was searched within (100 mm).</summary>
    [JsonPropertyName("size")] public string Size { get; set; }
    [JsonPropertyName("band_mm")] public double? BandMm { get; set; }
}

public sealed class AccuracyDto
{
    [JsonPropertyName("status")] public string Status { get; set; }
}

/// <summary>MA-1a item 8: how the review reads the bridge's trust fields. Pure (tools/promote-check).</summary>
public static class ChangesetTrust
{
    /// <summary>MA-5b-4: how far a reshape moves its wall's ends (mm), from the line it was placed with to the revised drawing's. Pure.</summary>
    /// <summary>MA-5b-5: a rehost's row — what it replaces, with what, where; that the old instance (and its tags) is removed in the same
    /// Undo step; that the hinge and swing are the office family's default (a placeholder has none to copy).</summary>
    public static string RehostWords(ChangesetElementDto el)
    {
        var p = el.Place; var at = el.Target?.At;
        string F(double v) => v.ToString("0", System.Globalization.CultureInfo.InvariantCulture);
        string Xy(double[] q) => q == null || q.Length < 2 ? "?" : $"({F(q[0])}, {F(q[1])})";
        var sill = p?.SillHeight is double s ? $", sill {F(s)} mm" : "";
        return $"{el.Target?.TypeBefore ?? "?"} at {Xy(at)} → {p?.FamilyName} : {p?.TypeName} in the wall at {Xy(p?.Location)} on {p?.LevelName}{sill}; " +
               "the unhosted instance and any tags on it are removed (one Undo brings them back); its Mark, Comments, workset and phase carry over, its other values do not; hinge and swing: the office family's default — compare with the placeholder";
    }

    /// <summary>MA-8-7 (D16): a replacing create's words - which element it re-creates, that the original (and its tags) is removed in the same Undo step
    /// and that one Undo brings it back and removes the new element. The reviewer is told what Apply deletes. Null for any other element.</summary>
    public static string ReplacesWords(ChangesetElementDto el)
    {
        var r = el.Replaces;
        if (r == null) return null;
        string F(double v) => v.ToString("0", System.Globalization.CultureInfo.InvariantCulture);
        var b = r.Box;
        var size = b?.Min != null && b.Max != null && b.Min.Length == 3 && b.Max.Length == 3
            ? $", {F(b.Max[0] - b.Min[0])} x {F(b.Max[1] - b.Min[1])} x {F(b.Max[2] - b.Min[2])} mm" : "";
        var cls = r.Kind == "generic" ? "Generic Model" : r.Kind == "directshape" ? "DirectShape" : "DirectShape or Generic Model";
        return $"re-creates {r.UniqueId} ({(string.IsNullOrWhiteSpace(r.Category) ? "" : r.Category + " ")}{cls}{size}) — the original and any tags on it are removed in the same Undo (one Undo brings it back and removes the new {el.Kind})";
    }

    public static string ReshapeWords(ChangesetElementDto el)
    {
        var was = el.Target?.Placed; var c = el.Place?.LocationCurve;
        if (was?.Start == null || was.End == null || c?.Start == null || c.End == null) return "its line not sent";
        double D(double[] p, double[] q) => Math.Sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]));
        double same = D(was.Start, c.Start) + D(was.End, c.End), swapped = D(was.Start, c.End) + D(was.End, c.Start);
        var (s0, s1) = same <= swapped ? (D(was.Start, c.Start), D(was.End, c.End)) : (D(was.Start, c.End), D(was.End, c.Start));
        string F(double v) => v.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
        // drill MA5b (F-MA5b-4): two reshapes read alike — each names the wall it moves by the line it was placed on (the kept reason's words)
        return $"the wall placed on ({F(was.Start[0])}, {F(was.Start[1])}) → ({F(was.End[0])}, {F(was.End[1])}): ends move {F(s0)} and {F(s1)} mm to the revised drawing's line (kept if edited by hand since it was placed)";
    }

    /// <summary>What is ticked when the review opens (and by "Tick suggested"). MA-4f: a create is pre-ticked only when a bridge-run survey job
    /// measured it — the changeset is no claim (Claimed false) — the bridge pre-ticked it within tolerance (its pretick also needs the storey's
    /// level checked and every size measured: survey-plan's trust), and the office IDS did not reject it — so Revit ticks what the web desk calls
    /// pre-ticked, less what its IDS badge marks rejected. An agent's, Promote's or a drawing's create — any claimed source, or a bridge before
    /// item 8 — still opens unticked, whatever a bridge answers. A retype or attach takes the bridge's decision; from a bridge before item 8 (no
    /// pretick) the window's own rule holds: a Promote attach, and a Promote retype with the type the plan saw (DR-1). A person still clicks Apply.</summary>
    public static bool PreTick(ChangesetDto cs, ChangesetElementDto el, ISet<string> notLoaded = null)
    {
        // MA-3a (design §6.6, D17): a web decline binds — never ticked, whatever else holds. A web accept changes nothing here (advice).
        if (DeclinedOnWeb(el)) return false;
        // MA-6 fix-b1 (F-3): a row naming a type this model does not hold (ChangesetExecutor.NotLoaded, read when the window opened) — Apply
        // would refuse it, so it is never ticked for the person, whatever the bridge pre-ticked; a person may still tick it.
        if (el.ProposalGuid != null && notLoaded?.Contains(el.ProposalGuid) == true) return false;
        // MA-4f: a measured survey create, as the bridge pre-ticked it — never one the office IDS rejected (a suggestion Apply's IDS stage would
        // ask to override straight after; GhostChangesetBuild's idiom).
        if (el.Op is null or "create")
            return cs.Claimed == false && el.Pretick == true && el.Accuracy?.Status == "within_tolerance" && el.Verdict?.Status != "rejected";
        // MA-2c: a set_parameter is a TYPE edit — it reaches every element on the type — so it is never pre-ticked (founder decision F1).
        // MA-5b-5: a rehost removes an element — a person ticks each, never pre-ticked.
        if (el.Op is "set_parameter" or "rehost") return false;
        // MA-8-7 (amendment 16, batch-3 amendment 13): a foreign type's retype, and any column or beam retype (structure is a person's), is never ticked -
        // whatever the bridge answered, and whatever the window's own rule would say from a bridge before this slice.
        if (el.Foreign == true || (el.Op == "retype" && (el.Kind == "column" || el.Kind == "beam"))) return false;
        return el.Pretick ?? (cs.Source == "promote" && (el.Op == "attach" || (el.Op == "retype" && el.Target?.TypeBefore != null)));
    }

    /// <summary>MA-8-7 review: why a retype is not pre-ticked, in a few words (a foreign type, structure, or the bridge could not judge it); null otherwise.</summary>
    public static string UntickedWords(ChangesetElementDto el) => el.Op != "retype" ? null
        : el.Foreign == true ? "not pre-ticked: a type that is not the office's"
        : el.Kind == "column" || el.Kind == "beam" ? "not pre-ticked: structure is a person's"
        : el.Foreign == null && el.Pretick == false ? "not pre-ticked: not judged, no type catalogue" : null;

    /// <summary>The element's accuracy in words ("not measured"); null when the bridge sent none.</summary>
    public static string Accuracy(ChangesetElementDto el) => el.Accuracy?.Status?.Replace('_', ' ');

    /// <summary>MA-2a: the review's words for an element the bridge typed — "typed by the bridge from the facts posted (guideline@1 ·
    /// office · …)"; null for one the caller typed, or from a bridge before MA-2a.</summary>
    public static string Typing(ChangesetElementDto el) => el.Typing?.TypedBy switch
    {
        "bridge" => "typed by the bridge from the facts posted (" + (el.Typing.Guideline ?? "guideline") + ")",
        // MA-5a: a scan door or window no office rule typed — the one catalogue row within the band of its measured size
        "bridge-size" => "typed by the bridge by size: " + (el.Typing.Size ?? "its measured size") + ", the one catalogue type within "
            + (el.Typing.BandMm ?? 100) + " mm (" + (el.Typing.Catalog ?? "catalogue") + ")",
        _ => null,
    };

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

    // ── Human-error guards §1 (spec 2026-10-21-human-error-guards-design.md): the review's risk tiers ──

    /// <summary>The creates that change the model's geometry or its datums — ticked one by one, with a reason.</summary>
    public static readonly HashSet<string> GeometryCreates = new HashSet<string>(StringComparer.Ordinal)
        { "wall", "floor", "roof", "column", "beam", "stair", "terrain", "level", "grid", "mass", "opening" };

    /// <summary>§4A3's 200: more rows ticked at once are applied in parts, or a person says why they go as one.</summary>
    public const int BatchLimit = 200;

    public enum Tier { Safe, Reason, Protected }

    /// <summary>A row's tier. <paramref name="guard"/> is what the command read on Revit's thread (ChangesetExecutor.Guarded): Own = the row's
    /// own element is protected (a non-create: the executor would keep it as it stands — shown locked), else near one. Reason: a reshape,
    /// rehost or delete, a create that replaces, a geometry create, or any row near a protected element. Safe: the rest (grouped).</summary>
    public static Tier TierOf(ChangesetElementDto el, (bool Own, string Why)? guard)
    {
        if (guard is { Own: true } && !(el.Op is null or "create")) return Tier.Protected;
        return guard != null || RiskyByOp(el) ? Tier.Reason : Tier.Safe;
    }

    /// <summary>The rows risky by what they do, whatever the model holds — the bridge's list too (changesets-logic riskyByOp), which marks
    /// one applied without a typed reason as unreasoned.</summary>
    public static bool RiskyByOp(ChangesetElementDto el) =>
        el.Op is "reshape" or "rehost" or "delete" || el.Replaces != null || ((el.Op is null or "create") && GeometryCreates.Contains(el.Kind ?? ""));

    public const string ReasonGroup = "Needs a reason — tick each row by hand";
    public const string ProtectedGroup = "Protected — kept as they stand";
    public const string TickReasonNeeded = "Rows under \"Needs a reason\" are ticked — type why you apply them in that group's box (one line, recorded on the ledger with your name), then press Apply.";

    /// <summary>Over the limit with no batch reason: the words; null otherwise.</summary>
    public static string BatchRefusal(int ticked, string batchReason) => ticked > BatchLimit && Blank(batchReason)
        ? $"{ticked} rows are ticked — more than the {BatchLimit} a person reviews at once. Untick some and apply in parts, or type why they go as one in the batch reason. Nothing was sent."
        : null;

    /// <summary>Human-error guards §3: a delete's row — the copy, the one kept, and that Revit removes it only when they are the same.</summary>
    public static string DeleteWords(ChangesetElementDto el) =>
        $"the copy {el.Target?.IfcGuid ?? "?"} of {el.Target?.KeeperIfcGuid ?? "?"} (clash triage: the same element modelled twice) — removed only if Revit finds it the same type, level, place and size as the one kept, and it takes nothing else with it";

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

    /// <summary>Apply claim (2026-10-20): a refused claim for the Apply window — the bridge's own words ("… is being applied by &lt;who&gt; on
    /// &lt;PC&gt; …") without the "Bridge 409:" prefix, and that nothing ran. Pure.</summary>
    public static string ClaimRefused(string error) =>
        $"Not applied — {System.Text.RegularExpressions.Regex.Replace(error ?? "the bridge did not answer", @"^Bridge \d{3}: ", "")}\n\nNothing was changed in the model; the proposals are still pending.";

    /// <summary>MA-8 nits (F-B4-2): a refusal's words — "Bridge &lt;code&gt;: &lt;message&gt;", the message alone when the body is the bridge's
    /// {"message": "…"}, else the body as sent (trimmed, capped at 400). The "Bridge &lt;code&gt;" prefix is what callers read (UnreportedResults.Outcome).</summary>
    public static string Refusal(int code, string body)
    {
        var said = (body ?? "").Trim();
        try
        {
            using var doc = JsonDocument.Parse(said);
            if (doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String) said = m.GetString().Trim();
        }
        catch (JsonException) { /* not JSON: the body as sent */ }
        return $"Bridge {code}: {(said.Length > 400 ? said.Substring(0, 400) + "…" : said)}";
    }

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

    /// <summary>MA-6 fix-b1 (F-3): said after the label of a row whose type this model does not hold — short, so the label keeps its width
    /// (review: the label names the type); the type and what to do are its tooltip (NotLoadedTip).</summary>
    public const string NotLoadedMark = "⚠ type not in this model";

    /// <summary>MA-6 fix-b1 (review): the mark's tooltip — the row's type, and words that fit a loadable family and a system type (a wall's,
    /// a floor's) alike.</summary>
    public static string NotLoadedTip(ChangesetElementDto el) =>
        $"\"{TypeWords(el)}\" is not in this model — load the family or add the type (Sentinel loads no families and creates no types), or leave this row unticked, and what it hosts";

    /// <summary>MA-6 fix-b1 (F-3): the window's footer line counting those rows; null when there is none.</summary>
    public static string NotLoadedLine(int n) => n > 0 ? $"⚠ {n} row(s) name a type this model does not hold (the ⚠ says which) — they open unticked; load the family or add the type, or leave them unticked, and what they host" : null;

    /// <summary>MA-6 fix-b1 (F-2): Apply's refusal when ticked rows name a type this model does not hold — the model's state, not a verdict on the
    /// changeset (C5's rule, as a missing level): nothing is placed, the changeset stays proposed, and the words say what the person does.</summary>
    public static string NotLoadedRefusal(IEnumerable<ChangesetElementDto> rows)
    {
        var named = (rows ?? Enumerable.Empty<ChangesetElementDto>()).Select(e => $"{e.Kind} \"{e.Validate?.Identity?.Name ?? e.ProposalGuid}\" ({TypeWords(e)})").ToList();
        var one = named.Count == 1;
        return $"{named.Count} ticked row(s) name a type this model does not hold — {string.Join(", ", named.Take(5))}{(named.Count > 5 ? $" and {named.Count - 5} more" : "")}: " +
               $"load the family or add the type (Sentinel loads no families and creates no types), or untick {(one ? "that row and what it hosts" : "those rows and what they host")} and apply the rest, " +
               "or propose again with a loaded type; nothing was placed, and this one stays proposed";
    }

    private static string TypeWords(ChangesetElementDto e) => (e?.Place?.FamilyName != null ? e.Place.FamilyName + " : " : "") + e?.Place?.TypeName;

    /// <summary>MA-6 fix-b1 (review): the create of this changeset a door, window or opening at (x, y) mm on <paramref name="level"/> would go into,
    /// left unticked (a type not loaded opens unticked, F-3) — a wall whose line passes the point (PlacementGeometry.HostTolMm), or, for a floor
    /// opening, a floor whose loop holds it — or null. Apply found no host there: the ticks, not a verdict on the changeset (the room rule's), so
    /// the row is refused in words and the changeset stays proposed. ponytail: a curved wall row is read as its chord (Sentinel hosts in straight walls only).</summary>
    public static ChangesetElementDto UntickedHost(IEnumerable<ChangesetElementDto> rows, ISet<string> ticked, string hostKind, string level, double x, double y) =>
        (rows ?? Enumerable.Empty<ChangesetElementDto>()).FirstOrDefault(h =>
            h != null && (h.Op is null or "create") && h.Kind == hostKind && h.ProposalGuid != null && !ticked.Contains(h.ProposalGuid)
            && string.Equals(h.Place?.LevelName ?? h.Place?.BaseLevel, level, StringComparison.OrdinalIgnoreCase)
            && (hostKind == "floor"
                ? h.Place.LocationLoop is { Length: >= 3 } r && r.All(q => q?.Length >= 2)
                  && Sentinel.GhostBuilder.PlacementGeometry.Holds(r.Select((q, i) => (q[0], q[1], r[(i + 1) % r.Length][0], r[(i + 1) % r.Length][1])), x, y)
                : h.Place.LocationCurve?.Start is { Length: >= 2 } s && h.Place.LocationCurve.End is { Length: >= 2 } e
                  && Sentinel.GhostBuilder.PlacementGeometry.Distance(s[0], s[1], e[0], e[1], x, y) <= Sentinel.GhostBuilder.PlacementGeometry.HostTolMm));

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
        // MA-3b3: a carried decline says where it was made (the web, or Revit), in which changeset, and that the bridge carried it.
        if (r.State == "declined")
            return (r.CarriedFrom is { } c
                ? $"declined {(c.Origin == "revit" ? "in Revit" : c.Origin == "web" ? "on the web" : "before")} by {Who(r)} in \"{c.Name}\", carried here by the bridge"
                : $"declined on the web by {Who(r)}") + $": {r.Reason} · a lead may re-open it on the web desk";
        if (r.State == "accepted") return $"accepted on the web by {Who(r)}" + (string.IsNullOrWhiteSpace(r.Reason) ? "" : $": {r.Reason}") + " — advice: it still needs your tick";
        return r.Action == "reopen" ? $"re-opened on the web by {Who(r)}: {r.Reason}" : null;
    }

    /// <summary>MA-3a: the window's header when the web declined ghosts of <paramref name="cs"/>; null when none did.</summary>
    public static string DeclinedHeader(ChangesetDto cs)
    {
        var declined = (cs.Elements ?? new List<ChangesetElementDto>()).Where(DeclinedOnWeb).ToList();
        int n = declined.Count, k = declined.Count(e => e.Review.CarriedFrom != null);
        // MA-3b3 (replaces MA-3a's C4): the bridge carries a decline to the next changeset that proposes the same change.
        // C5: a re-open is for a changeset that is still proposed (changesets-logic reopenDecline).
        return n == 0 ? null : $"{n} ghost(s) declined{(k == 0 ? " on the web" : $" ({k} carried here by the bridge from an earlier changeset)")} — shown unticked with the reason; they cannot be ticked here (a lead re-opens one on the web desk while its changeset is still proposed). " +
                               "Apply reports them as rejected; the changeset stays proposed until Revit reports it. A decline is carried: the next changeset that proposes the same change files the ghost already declined (a web decline, or a Revit decline with a reason).";
    }

    /// <summary>MA-3b3: the declines among <paramref name="els"/>, counted for a picker line or a group header — "3 declined on the web",
    /// or "3 declined (2 carried)" when the bridge carried some from an earlier changeset; null when none is declined.</summary>
    public static string DeclinedCount(IEnumerable<ChangesetElementDto> els)
    {
        var declined = (els ?? Enumerable.Empty<ChangesetElementDto>()).Where(DeclinedOnWeb).ToList();
        int k = declined.Count(e => e.Review.CarriedFrom != null);
        return declined.Count == 0 ? null : k == 0 ? $"{declined.Count} declined on the web" : $"{declined.Count} declined ({k} carried)";
    }

    /// <summary>MA-3b3: what the bridge could not carry when it filed <paramref name="cs"/>, in words; null when there is nothing to say.</summary>
    public static string NotCarriedLine(ChangesetDto cs)
    {
        var c = cs?.Carry;
        if (c == null) return null;
        var said = new List<string>();
        if (c.NoReason > 0)
            said.Add($"{c.NoReason} ghost(s) here were rejected in Revit before with no reason of their own — proposed again, undecided: the bridge cannot tell an unticked row from an element Revit removed or an Apply that rolled back. A reason in the group's box makes a decline carry.");
        if (c.Unverified > 0) // C1: a binding decline is a signed-in person's — under the machine credential the reporter's name is a claim
            said.Add($"{c.Unverified} ghost(s) here were rejected in Revit before with a reason, by a caller the bridge did not know as a signed-in member (the machine credential, or a report from before this version) — not carried: proposed again, undecided.");
        if (c.Creates > 0) // C7: only creates like one declined before
            said.Add($"{c.Creates} create(s) here are of the same kind, type and level as a create declined before on this project — a create names no existing element, so the bridge cannot tell whether it is the same one: proposed again, undecided.");
        return said.Count == 0 ? null : string.Join("\n", said);
    }

    /// <summary>MA-3a: Apply's re-check on the fresh copies — the ticked ghosts the web declined (one may land after the window opened).
    /// The refusal's words (nothing is created), or null when none is.</summary>
    public static string DeclinedTicked(IEnumerable<ChangesetDto> fresh, ICollection<string> ticked)
    {
        var hit = (fresh ?? Enumerable.Empty<ChangesetDto>()).SelectMany(c => c.Elements ?? new List<ChangesetElementDto>())
            .Where(e => ticked.Contains(e.ProposalGuid) && DeclinedOnWeb(e)).ToList();
        return hit.Count == 0 ? null : $"{hit.Count} ticked ghost(s) were declined after this window opened:\n" +
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

/// <summary>MA-3b6: one body's preview - what filing it would carry (POST /changesets/:key/preview).</summary>
public sealed class ChangesetPreviewDto
{
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("elements")] public int Elements { get; set; }
    [JsonPropertyName("carried")] public int Carried { get; set; }
    [JsonPropertyName("no_reason")] public int NoReason { get; set; }
    [JsonPropertyName("creates")] public int Creates { get; set; }
    [JsonPropertyName("unverified")] public int Unverified { get; set; }
    [JsonPropertyName("all_carried")] public bool AllCarried { get; set; }
}

public sealed class ChangesetDto
{
    [JsonPropertyName("id")] public string Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("source")] public string Source { get; set; }
    /// <summary>MA-1a item 8: the bridge marks the source a claim (true on every changeset until a bridge-run job backs
    /// one, MA-4); null from a bridge before item 8. MA-4f: false (a bridge-run survey job) is what lets Revit pre-tick a
    /// measured create (ChangesetTrust.PreTick) and re-read the walls it places.</summary>
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
    /// <summary>MA-3b3: what the bridge carried when it filed this changeset; null when there was nothing to say, and from a bridge
    /// before MA-3b3.</summary>
    [JsonPropertyName("carry")] public CarryDto Carry { get; set; }
    /// <summary>"Applied, then saved" (2026-10-20): what the last saved model held of it (POST …/persisted); null while never seen saved.</summary>
    [JsonPropertyName("persisted")] public PersistedDto Persisted { get; set; }
    /// <summary>Revert (2026-10-20): the last revert made in Revit (basis "revert"); null when none, or when Ctrl+Z took it back.</summary>
    [JsonPropertyName("reverted")] public RevertedDto Reverted { get; set; }
}

/// <summary>"Applied, then saved" (2026-10-20): state "confirmed" or "lost", how it was seen (saved, saved_locally, synced, reopened), the rows missing.</summary>
public sealed class PersistedDto
{
    [JsonPropertyName("state")] public string State { get; set; }
    [JsonPropertyName("how")] public string How { get; set; }
    [JsonPropertyName("at")] public string At { get; set; }
    [JsonPropertyName("missing")] public int? Missing { get; set; }
    [JsonPropertyName("ledger_id")] public long? LedgerId { get; set; }
}

/// <summary>Revert (2026-10-20): who reverted it, when, why, how many rows went back and how many were kept.</summary>
public sealed class RevertedDto
{
    [JsonPropertyName("at")] public string At { get; set; }
    [JsonPropertyName("by")] public string By { get; set; }
    [JsonPropertyName("guids")] public int? Guids { get; set; }
    [JsonPropertyName("kept")] public int? Kept { get; set; }
    [JsonPropertyName("reason")] public string Reason { get; set; }
    [JsonPropertyName("ledger_id")] public long? LedgerId { get; set; }
    /// <summary>A revert's own save (2026-10-20, spec 2026-10-20-apply-claim-isolation-revert-saved-design.md §4): null until seen.</summary>
    [JsonPropertyName("persisted")] public PersistedDto Persisted { get; set; }
}

public sealed class AppliedEntry
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("revit_element_id")] public long RevitElementId { get; set; }
    [JsonPropertyName("revit_unique_id")] public string RevitUniqueId { get; set; }
    /// <summary>MA-4f: Revit's re-read of a wall a survey changeset created (Claimed false) — its main solid's triangles, 9 numbers each (x, y, z
    /// of three corners, mm, Revit's internal frame), read after the commit (ChangesetExecutor). The add-in's claim: the bridge keeps its sha and
    /// two side faces and verify measures by them ("revit (claimed)"). Null — and then left out of every body and record, which stay
    /// byte-identical — for every other entry, and when the read threw or passed PlacementGeometry.MaxMeshTriangles.</summary>
    [JsonPropertyName("mesh")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public double[] Mesh { get; set; }
    /// <summary>MA-5b-5: a rehost's — the tags Revit removed with the old instance (counted by the probe before the delete); null, and left
    /// out of the body, for every other entry.</summary>
    [JsonPropertyName("removed_tags")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public int? RemovedTags { get; set; }
    /// <summary>MA-8-7 (batch-3 amendment 3): a replacing create's - the UniqueId of the element Revit deleted, set ONLY after the delete's count matched
    /// the probe's. The bridge lists in the ledger's `removed` only what is reported here; null (left out of the body) for every other entry.</summary>
    [JsonPropertyName("removed_unique_id")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string RemovedUniqueId { get; set; }
    /// <summary>MA-8-10: what Revit holds of the stair it built, read AFTER the stair edit scope's commit (the type's railings appear only there) - the
    /// bridge keeps it field by field (a signed-in member's report only) and the changeset_applied row sets it beside the plan. Null, and left out, for every other entry.</summary>
    [JsonPropertyName("built")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public StairBuiltDto Built { get; set; }
    /// <summary>MA-6-2 (design §4.6 step 3): Revit's re-read of the wall, floor, roof, ceiling, door, window, column or beam this entry applied,
    /// as the IDS reads it (GovernedElementExtractor), inside the open group before it is kept (PromoteContext.ReadAsBuilt). The add-in's claim:
    /// the bridge keeps its identity and psets field by field, judges them against the installed ids@n and stores the verdict (result.as_built).
    /// Null — and left out of the body — for any other kind, a set_parameter's type, and when the read threw (the note says so).</summary>
    [JsonPropertyName("as_built")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public GovElement AsBuilt { get; set; }
    /// <summary>MA-6-2 (risk R4): the requirement keys Sentinel has a Revit reader for on that element's class (PsetMap.Readable) — the bridge
    /// says "not read", never "fails", of an ids@n requirement outside them. Null with AsBuilt.</summary>
    [JsonPropertyName("readable")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public List<string> Readable { get; set; }
    /// <summary>Revert (2026-10-20): an attach's wall top as it stood before the attach - what Revert puts back. Null, and left out of the body,
    /// for every other entry; an attach applied before this field has none, and Revert keeps it ("the old top was not recorded").</summary>
    [JsonPropertyName("before")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public AttachBeforeDto Before { get; set; }
    /// <summary>Human-error guards §3: a delete's — the element kept and the copy's own writable values, read before the delete; what Revert
    /// re-creates the copy from. Null, and left out of the body, for every other entry.</summary>
    [JsonPropertyName("deleted")] [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public DeletedDto Deleted { get; set; }
}

/// <summary>Human-error guards §3: what a delete removed — the copy of <see cref="KeeperUniqueId"/>, and its writable instance values.</summary>
public sealed class DeletedDto
{
    [JsonPropertyName("keeper_unique_id")] public string KeeperUniqueId { get; set; }
    [JsonPropertyName("values")] public List<ParamValueDto> Values { get; set; } = new List<ParamValueDto>();
}

/// <summary>One instance value: the parameter's id (a built-in's negative number, or the shared/project parameter's element id), its name
/// for words, its storage (String, Integer, Double, ElementId) and its value as text (a double in Revit's internal units, "R" format).</summary>
public sealed class ParamValueDto
{
    [JsonPropertyName("id")] public long Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; }
    [JsonPropertyName("storage")] public string Storage { get; set; }
    [JsonPropertyName("value")] public string Value { get; set; }
}

/// <summary>Revert (2026-10-20): a row Revert left as it stands, and why (the executor's Kept pattern).</summary>
public sealed class KeptRow
{
    [JsonPropertyName("proposal_guid")] public string ProposalGuid { get; set; }
    [JsonPropertyName("why")] public string Why { get; set; }
}

/// <summary>Revert (2026-10-20): a wall's top before an attach - a level and its offset (mm), or an unconnected height (mm).</summary>
public sealed class AttachBeforeDto
{
    [JsonPropertyName("top_level")] public string TopLevel { get; set; }
    [JsonPropertyName("top_offset_mm")] public double? TopOffsetMm { get; set; }
    [JsonPropertyName("height_mm")] public double? HeightMm { get; set; }
}

/// <summary>MA-8-10: a built stair as Revit reads it back - risers, riser height, tread depth and run width (mm), runs and railings.</summary>
public sealed class StairBuiltDto
{
    [JsonPropertyName("risers")] public int Risers { get; set; }
    [JsonPropertyName("riser_mm")] public double RiserMm { get; set; }
    [JsonPropertyName("going_mm")] public double GoingMm { get; set; }
    [JsonPropertyName("width_mm")] public double WidthMm { get; set; }
    [JsonPropertyName("runs")] public int Runs { get; set; }
    [JsonPropertyName("railings")] public int Railings { get; set; }
}

/// <summary>MA-4f: GET /changesets/:key/:id/scan — the scan around a survey changeset's storey, thinned by sentinel-survey and moved into the
/// model's frame by the bridge (whole mm, Revit's internal frame).</summary>
public sealed class ScanDto
{
    [JsonPropertyName("job")] public string Job { get; set; }
    [JsonPropertyName("ledger_id")] public long? LedgerId { get; set; }
    [JsonPropertyName("cell_mm")] public int CellMm { get; set; }
    [JsonPropertyName("z_mm")] public double[] ZMm { get; set; }
    [JsonPropertyName("of")] public int? Of { get; set; }   // MA-8-9 review: null for a stair slice on a turned frame (the crop is larger than the box)
    [JsonPropertyName("crop")] public string Crop { get; set; }
    [JsonPropertyName("points")] public List<double[]> Points { get; set; } = new();
}

/// <summary>MA-8-14: GET …/scan?ground=1 - the ground a terrain is made of: the lowest scan point per 500 mm plan cell outside the survey storey's oriented box, in the
/// model's frame (whole mm, z absolute), with the level the lowest walls name and that box (the Toposolid's hole).</summary>
public sealed class GroundDto
{
    /// <summary>MA-8-14 review round 1: true on a ground answer. A bridge from before ?ground=1 ignores it and answers the plain scan (no ground, level or footprint).</summary>
    [JsonPropertyName("ground")] public bool? Ground { get; set; }
    [JsonPropertyName("job")] public string Job { get; set; }
    [JsonPropertyName("ledger_id")] public long? LedgerId { get; set; }
    [JsonPropertyName("level")] public string Level { get; set; }
    [JsonPropertyName("footprint")] public double[][] Footprint { get; set; }
    [JsonPropertyName("cell_mm")] public int CellMm { get; set; }
    [JsonPropertyName("z_mm")] public double[] ZMm { get; set; }
    [JsonPropertyName("of")] public int? Of { get; set; }
    [JsonPropertyName("points")] public List<double[]> Points { get; set; } = new();
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

    public static List<ChangesetDto> FetchProposed(BcfConfig cfg, string projectKey, out string error) => FetchList(cfg, projectKey, "?status=proposed", out error);

    /// <summary>MA-8-14 review round 3: every changeset of the project (GET /changesets/:key, no status) - Propose terrain reads the applied terrains to find one
    /// whose Toposolid this model no longer holds (TerrainPlanner.Gone).</summary>
    public static List<ChangesetDto> FetchAll(BcfConfig cfg, string projectKey, out string error) => FetchList(cfg, projectKey, "", out error);

    private static List<ChangesetDto> FetchList(BcfConfig cfg, string projectKey, string query, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}{query}";
            var (resp, body) = Send(ReadHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return null; }
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
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return null; }
            return JsonSerializer.Deserialize<ChangesetDto>(body);
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)ReadHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>MA-4f: the scan overlay's points. The bridge reads the job's scan again on its one survey slot (seconds on the drill), so this read
    /// waits as long as a write (120 s) — off Revit's thread, like every call here.</summary>
    public static ScanDto FetchScan(BcfConfig cfg, string projectKey, string id, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/scan";
            var (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return null; }
            return JsonSerializer.Deserialize<ScanDto>(body);
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>MA-8-9: a stair flag's scan slice - the same overlay, cut to that flag's box. A separate overload: the whole-storey read above is unchanged.</summary>
    public static ScanDto FetchScan(BcfConfig cfg, string projectKey, string id, string flag, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/scan?flag={Uri.EscapeDataString(flag)}";
            var (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return null; }
            return JsonSerializer.Deserialize<ScanDto>(body);
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>MA-8-14 review round 1: the words when the bridge's answer is not a ground answer.</summary>
    internal const string NotGround = "this bridge does not read ground — restart or update it; nothing was proposed";

    /// <summary>MA-8-14: the ground a terrain is made of (GET …/scan?ground=1). A new overload beside FetchScan, which is unchanged: the bridge reads the job's scan on its
    /// one survey slot, so this waits as long as a write; off Revit's thread. Null with the bridge's words (ServiceToken falls back to the machine credential,
    /// which the bridge refuses in words).</summary>
    public static GroundDto FetchGround(BcfConfig cfg, string projectKey, string id, out string error)
    {
        error = null;
        try
        {
            var url = $"{cfg.ServiceUrl.TrimEnd('/')}/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/scan?ground=1";
            var (resp, body) = Send(WriteHttp, () => Req(HttpMethod.Get, url, cfg.ServiceToken));
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return null; }
            var ground = JsonSerializer.Deserialize<GroundDto>(body);
            // MA-8-14 review round 1: fails closed - an older bridge answers the whole scan as a 200 (no ground, no footprint)
            if (ground?.Ground != true || ground.Footprint == null) { error = NotGround; return null; }
            return ground;
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)WriteHttp.Timeout.TotalSeconds); return null; }
    }

    /// <summary>MA-8-9: a person's stair pick, appended to the changeset's exceptions. Signed-in only: ServiceToken falls back to the machine
    /// credential, which the bridge refuses (403), so a signed-out Revit is told so here, before anything is sent. <paramref name="reply"/> is
    /// the bridge's {flag, ledger}.</summary>
    public static bool FlagStair(BcfConfig cfg, string projectKey, string id, Sentinel.GhostBuilder.StairFlag flag, out string reply, out string error)
    {
        reply = null;
        if (!UserSession.IsSignedIn) { error = "a stair flag is a person's pick — sign in (Standards ▸ Sign in); nothing was saved"; return false; }
        return Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/flags", flag.Body(), 201, out reply, out error);
    }

    /// <summary>MA-3a: <paramref name="reviewRev"/> is the review_rev Apply re-checked (null: no revision was re-checked — the bridge records any decline it applied as applied_over_decline_unchecked, C2);
    /// <paramref name="reply"/> is the bridge's answer, the stored changeset (ChangesetTrust.LateDeclines reads it). MA-3b2:
    /// <paramref name="reasons"/> is the reviewer's reason per rejected ghost ({proposal_guid: one line}); null sends none.</summary>
    public static bool ReportResult(BcfConfig cfg, string projectKey, string id,
        List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, out string reply, out string error, Dictionary<string, string> reasons = null, string attemptKey = null,
        Dictionary<string, string> tickReasons = null, string batchReason = null) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/result",
             ResultBody(applied, rejected, note, reviewRev, reasons, attemptKey, tickReasons, batchReason), 200, out reply, out error);

    /// <summary>The result's body (tools/promote-check reads it). `reasons` is written as null when there is none: the bridge reads
    /// null as none, and a bridge before MA-3b2 ignores the field. Apply claim (2026-10-20): `session` is this Revit's, and `attempt_key`
    /// the record's own (a retry of one result sends the same key, so the bridge answers the stored result — never a second record).
    /// Human-error guards §1: `tick_reasons` — the person's reason per ticked row of the "Needs a reason" tier — and `batch_reason` (over
    /// the 200), null when none; a bridge before them ignores both.</summary>
    internal static string ResultBody(List<AppliedEntry> applied, List<string> rejected, string note, int? reviewRev, Dictionary<string, string> reasons, string attemptKey = null,
                                      Dictionary<string, string> tickReasons = null, string batchReason = null) =>
        JsonSerializer.Serialize(new { applied, rejected, note, actor = UserSession.Actor, review_rev = reviewRev, reasons, session = Session, attempt_key = attemptKey,
                                       tick_reasons = tickReasons, batch_reason = batchReason });

    /// <summary>Apply claim (2026-10-20, spec 2026-10-20-apply-claim-isolation-revert-saved-design.md §1): this Revit's session — one per process.</summary>
    public static readonly string Session = Guid.NewGuid().ToString();

    /// <summary>Claims a proposed changeset for this Revit before its transaction — null with the bridge's words when another PC is applying
    /// it (or it is no longer proposed); the claimed changeset (its latest review_rev) otherwise.</summary>
    public static ChangesetDto Claim(BcfConfig cfg, string projectKey, string id, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/claim",
             JsonSerializer.Serialize(new { session = Session, pc = Environment.MachineName, actor = UserSession.Actor }), 200, out var reply, out error)
            ? JsonSerializer.Deserialize<ChangesetDto>(reply) : null;

    /// <summary>Drops this Revit's claim (nothing was placed). Best effort: a claim not dropped expires by itself.</summary>
    public static void Unclaim(BcfConfig cfg, string projectKey, string id) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/unclaim", JsonSerializer.Serialize(new { session = Session }), 200, out _, out _);

    private static bool Post(BcfConfig cfg, string path, string payload, int expect, out string body, out string error, HttpClient http = null)
    {
        body = null; error = null;
        try
        {
            // Review C1: the request — its token and its body — is built inside Send's pool thread; payload was serialized here.
            HttpResponseMessage resp;
            (resp, body) = Send(http ?? WriteHttp, () => Req(HttpMethod.Post, $"{cfg.ServiceUrl.TrimEnd('/')}{path}", cfg.ServiceToken, payload));
            if ((int)resp.StatusCode != expect) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return false; }
            return true;
        }
        catch (Exception ex) { error = ChangesetTrust.BridgeWords(ex, (int)(http ?? WriteHttp).Timeout.TotalSeconds); return false; }
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
            if (!resp.IsSuccessStatusCode) { error = ChangesetTrust.Refusal((int)resp.StatusCode, body); return null; }
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

    /// <summary>MA-3b6: what filing these bodies would carry (POST /changesets/:key/preview -> 200 { previews }), in their order - a read
    /// through the 8 s client, off Revit's thread (Promote's preview hop). Null with the error (a bridge before MA-3b6 answers 404).</summary>
    public static List<ChangesetPreviewDto> Preview(BcfConfig cfg, string projectKey, IReadOnlyList<object> bodies, out string error)
    {
        if (!Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/preview", JsonSerializer.Serialize(new { bodies }, WriteJson), 200, out var resp, out error, ReadHttp)) return null;
        try { return JsonSerializer.Deserialize<PreviewReply>(resp)?.Previews ?? new List<ChangesetPreviewDto>(); }
        catch (Exception ex) { error = ex.Message; return null; }
    }
    private sealed class PreviewReply { [JsonPropertyName("previews")] public List<ChangesetPreviewDto> Previews { get; set; } }

    /// <summary>Withdraw a proposed changeset (POST /changesets/:key/:id/withdraw → 200): a Ghost build that filed some of its
    /// changesets and then could not file the rest takes them back, so none is left for a later review to apply.</summary>
    public static bool Withdraw(BcfConfig cfg, string projectKey, string id, out string error) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/withdraw",
             JsonSerializer.Serialize(new { actor = UserSession.Actor }, WriteJson), 200, out _, out error);

    /// <summary>A person undid or redid an applied changeset in Revit: one changeset_reverted ledger row
    /// (POST /changesets/:key/:id/reverted → 201). Off Revit's thread (the undo watcher's Task.Run). Final verification round 2: <paramref name="basis"/> "absent"
    /// (the freeing of a terrain's scan only) marks an undo recorded on the person's word that the element is gone, not one Revit was seen doing; null sends none.</summary>
    /// Revert (2026-10-20): basis "revert" (a person's compensating change, ChangesetReverter) carries their <paramref name="reason"/> and the rows
    /// <paramref name="kept"/> as they stood, each with why.
    public static bool ReportReverted(BcfConfig cfg, string projectKey, string id, List<string> guids, string op, out string error, string basis = null,
                                      string reason = null, List<KeptRow> kept = null) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/reverted",
             JsonSerializer.Serialize(new { op, guids, actor = UserSession.Actor, basis, reason, kept = kept is { Count: > 0 } ? kept : null }, WriteJson), 201, out _, out error);

    /// <summary>"Applied, then saved" (2026-10-20): what the saved model holds of an applied changeset — held and missing proposal_guids, by its
    /// provenance stamps (SavedCheck). One changeset_confirmed or changeset_lost row (POST /changesets/:key/:id/persisted → 201). Off Revit's thread.</summary>
    public static bool ReportPersisted(BcfConfig cfg, string projectKey, string id, string how, List<string> held, List<string> missing, out string reply, out string error, string of = null) =>
        Post(cfg, $"/changesets/{Uri.EscapeDataString(projectKey)}/{Uri.EscapeDataString(id)}/persisted",
             JsonSerializer.Serialize(new { how, held, missing, of, actor = UserSession.Actor }, WriteJson), 201, out reply, out error);
}
