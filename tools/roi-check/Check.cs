using System.Text.Json;
using Sentinel.Coordination;
using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Ok(bool c, string n) { if (c) { _pass++; Console.WriteLine("  PASS  " + n); } else { _fail++; Console.WriteLine("  FAIL  " + n); } }
    static void Is(string got, string want, string n)
    {
        Ok(got == want, n);
        if (got != want) Console.WriteLine("        got:  " + got.Replace("\n", "\\n") + "\n        want: " + want.Replace("\n", "\\n"));
    }

    const string Sha = "3f07a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddee"; // roi@1's sha
    const string Key = "aster-tower";
    // A roi body as the bridge validator accepts it (Task 1): 90 EUR/h; 20 min a gate run, 6 a rename, 15 a heal.
    const string Body = "{\"currency\":\"EUR\",\"hourly_rate\":90,\"minutes\":{\"delivery_gate\":20,\"naming\":6,\"family_heal\":15},\"basis\":\"office estimate\"}";
    const string Partial = "{\"currency\":\"GBP\",\"hourly_rate\":60,\"minutes\":{\"naming\":10}}";
    const string NotCounted = "Not counted: auto-fix, doctor resolutions, CDE intercepts, MEP voids, BCF export, clash views, fix-in-place — they write no ledger row";

    static ResolvedArtefact Roi(string body, string origin) => new ResolvedArtefact
    {
        Kind = "roi", Ref = "roi@1", Source = "office", Sha256 = Sha, BodyJson = body, Origin = origin,
        Label = ArtefactClient.RefLabel("roi@1", "office", Sha) + (origin == "cache" ? " (cached 14:03)" : ""),
    };
    static readonly ResolvedArtefact None = ArtefactClient.None("roi", "not installed for aster-tower or its office");

    // Audit rows as GET /cde/:key/audit returns them (cde-store.mjs listAudit: {rows, total, limit, offset}, newest
    // first); only new_value is read here. Cloned, so the parsed document may go.
    static JsonElement[] Rows(string json) { using var d = JsonDocument.Parse(json); return d.RootElement.EnumerateArray().Select(e => e.Clone()).ToArray(); }

    static readonly JsonElement[] GateRows = Rows("[" +
        "{\"id\":812,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate PASS: a.ifc\",\"new_value\":{\"file\":\"a.ifc\",\"result\":\"pass\",\"passed\":true}}," +
        "{\"id\":811,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate FAIL: b.ifc\",\"new_value\":{\"file\":\"b.ifc\",\"result\":\"fail\",\"passed\":false}}," +
        "{\"id\":810,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate NOT CHECKED: c.ifc\",\"new_value\":{\"file\":\"c.ifc\",\"result\":\"not_checked\",\"passed\":null}}," +
        "{\"id\":809,\"entity_type\":\"delivery_gate\",\"action\":\"IFC delivery gate PASS: d.ifc\",\"new_value\":{\"file\":\"d.ifc\",\"result\":\"pass\",\"passed\":true}}," +
        "{\"id\":808,\"entity_type\":\"delivery_gate\",\"action\":\"odd row\",\"new_value\":null}" +
        "]");
    static readonly JsonElement[] NamingRows = Rows("[" +
        "{\"id\":820,\"entity_type\":\"naming\",\"action\":\"Naming Manager renamed 3 item(s) in Revit\",\"new_value\":{\"rows\":[{\"id\":1},{\"id\":2},{\"id\":3}],\"source\":\"revit\"}}," +
        "{\"id\":819,\"entity_type\":\"naming\",\"action\":\"Naming Manager renamed 2 item(s) in Revit\",\"new_value\":{\"rows\":[{\"id\":4},{\"id\":5}],\"source\":\"revit\"}}," +
        "{\"id\":818,\"entity_type\":\"naming\",\"action\":\"naming standard installed\",\"new_value\":{\"ref\":\"naming@2\"}}" +
        "]");
    static readonly JsonElement[] HealRows = Rows("[" +
        "{\"id\":830,\"entity_type\":\"family_heal\",\"action\":\"Family heal: 2 healed, 1 for a human, 0 failed of 10\",\"new_value\":{\"healed_total\":2,\"human_total\":1,\"failed_total\":0}}," +
        "{\"id\":829,\"entity_type\":\"family_heal\",\"action\":\"Family heal: 0 healed, 0 for a human, 0 failed of 4\",\"new_value\":{\"healed_total\":0}}," +
        "{\"id\":828,\"entity_type\":\"family_heal\",\"action\":\"Family heal: 5 healed, 0 for a human, 1 failed of 12\",\"new_value\":{\"healed_total\":5}}," +
        "{\"id\":827,\"entity_type\":\"family_heal\",\"action\":\"odd row\",\"new_value\":{\"healed\":[\"x\"]}}" +
        "]");
    static readonly JsonElement[] NoRows = Rows("[]");

    static int Main()
    {
        Console.WriteLine("RoiCounts + RoiMoney + RoiLines — counts from the ledger only, money only by a named roi@n, the dashboard's lines\n");
        Counts();
        Money();
        Lines();
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }

    // ── 1. the counts: only what the ledger holds ────────────────────────────────────────────────────────
    static void Counts()
    {
        var c = RoiCounts.From(GateRows, NamingRows, HealRows, false);
        Ok(c.GateRuns == 3, "delivery_gate: passed true and passed false are runs; passed null (not checked) and a row without new_value are not");
        Ok(c.Renames == 5, "naming: rows.length summed over the batches; a naming row without rows adds nothing");
        Ok(c.Heals == 7, "family_heal: healed_total summed; a row without it adds nothing");
        Ok(c.RowsRead == 12 && !c.Truncated, "every row the bridge returned counts as read (12), counted or not; not truncated");
        Ok(RoiCounts.From(GateRows, NamingRows, HealRows, true).Truncated, "truncated is carried to the lines");
        Ok(RoiCounts.From(NoRows, NoRows, NoRows, false) is { GateRuns: 0, Renames: 0, Heals: 0, RowsRead: 0, Truncated: false }, "no rows → zeros, never a guess");
        Ok(RoiCounts.From(Rows("[{\"new_value\":{\"passed\":\"true\"}},{\"new_value\":{\"passed\":1}}]"), NoRows, NoRows, false).GateRuns == 0,
           "passed must be a JSON boolean: \"true\" and 1 are not runs");
        Ok(RoiCounts.From(NoRows, Rows("[{\"new_value\":{\"rows\":3}}]"), Rows("[{\"new_value\":{\"healed_total\":-3}},{\"new_value\":{\"healed_total\":2.5}},{\"new_value\":{\"healed_total\":\"2\"}}]"), false) is { Renames: 0, Heals: 0 },
           "rows must be an array and healed_total a whole number ≥ 0: anything else adds nothing");
    }

    // ── 2. the money: only by roi@n, per kind and in total, naming the artefact ─────────────────────────
    static void Money()
    {
        var c = RoiCounts.From(GateRows, NamingRows, HealRows, false);
        var m = RoiMoney.From(c, Roi(Body, "bridge"));
        Ok(m is not null && m.Currency == "EUR" && m.HourlyRate == 90, "roi@1 from the bridge prices the counts in its currency at its rate");
        Ok(m!.GateMinutes == 20 && Math.Round(m.Gate, 2) == 90.00, "3 gate runs × 20 min at 90 EUR/h = 90.00");
        Ok(m.NamingMinutes == 6 && Math.Round(m.Naming, 2) == 45.00, "5 renames × 6 min = 45.00");
        Ok(m.HealMinutes == 15 && Math.Round(m.Heal, 2) == 157.50, "7 heals × 15 min = 157.50");
        Ok(Math.Round(m.Total, 2) == 292.50, "the total is the three summed (292.50)");
        Is(m.Label, "roi@1 · office · 3f07a1b2c3d4…", "money names what priced it: the bridge's refLabel");
        Is(RoiMoney.From(c, Roi(Body, "cache"))!.Label, "roi@1 · office · 3f07a1b2c3d4… (cached 14:03)", "a cached roi prices too, and its label says it is the cached copy");
        Ok(RoiMoney.From(c, None) is null, "no roi installed → no money");
        Ok(RoiMoney.From(c, ArtefactClient.None("roi", "bridge unreachable (No connection could be made)")) is null, "no bridge and no cache → no money");
        var p = RoiMoney.From(c, Roi(Partial, "bridge"));
        Ok(p is { GateMinutes: null, HealMinutes: null, Gate: 0, Heal: 0 } && Math.Round(p.Naming, 2) == 50.00 && Math.Round(p.Total, 2) == 50.00,
           "a kind the roi sets no minutes for is not priced and adds nothing (5 renames × 10 min at 60 GBP/h = 50.00, the total)");
        foreach (var body in new[]
        {
            "{}",
            "{\"currency\":\"EUR\",\"hourly_rate\":0,\"minutes\":{\"naming\":5}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":-1,\"minutes\":{\"naming\":5}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":\"90\",\"minutes\":{\"naming\":5}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":90}",
            "{\"currency\":\"EUR\",\"hourly_rate\":90,\"minutes\":{\"naming\":-1}}",
            "{\"currency\":\"EUR\",\"hourly_rate\":90,\"minutes\":{\"naming\":\"5\"}}",
            "{\"currency\":\"\",\"hourly_rate\":90,\"minutes\":{\"naming\":5}}",
            "{\"currency\":5,\"hourly_rate\":90,\"minutes\":{\"naming\":5}}",
            "[]", "", "not json",
        })
            Ok(RoiMoney.From(c, Roi(body, "bridge")) is null, "a body that is not {currency, hourly_rate > 0, minutes ≥ 0} (" + (body.Length == 0 ? "empty" : body) + ") → no money");
    }

    // ── 3. the lines: exactly six, every number a ledger count or that count priced by a named roi ─────
    static void Lines()
    {
        var c = RoiCounts.From(GateRows, NamingRows, HealRows, false);
        var withMoney = RoiLines.Lines(Key, c, RoiMoney.From(c, Roi(Body, "bridge")), Roi(Body, "bridge"));
        Ok(withMoney.Length == 6, "exactly six lines");
        Is(string.Join("\n", withMoney),
           "ROI · aster-tower · counted from the ledger (12 rows read)\n" +
           "Delivery gate runs: 3 · 20 min each · 90.00 EUR\n" +
           "Naming renames: 5 · 6 min each · 45.00 EUR\n" +
           "Family heals: 7 · 15 min each · 157.50 EUR\n" +
           "Money: 292.50 EUR at 90 EUR/h · roi@1 · office · 3f07a1b2c3d4…\n" + NotCounted,
           "the six lines with roi@1 from the bridge");

        var noRoi = RoiLines.Lines(Key, c, RoiMoney.From(c, None), None);
        Is(string.Join("\n", noRoi),
           "ROI · aster-tower · counted from the ledger (12 rows read)\n" +
           "Delivery gate runs: 3\n" +
           "Naming renames: 5\n" +
           "Family heals: 7\n" +
           "Money: not shown — roi: none — not installed for aster-tower or its office\n" + NotCounted,
           "without roi@n: the counts, no money, the none reason");
        Ok(!noRoi.Any(l => l.Contains(" min each") || l.Contains(" EUR") || l.Contains("/h")), "without roi@n no line carries minutes, money or a rate");

        Is(RoiLines.Lines(Key, RoiCounts.From(GateRows, NamingRows, HealRows, true), null, None)[0],
           "ROI · aster-tower · counted from the ledger (12 rows read, the newest only — the ledger holds more)",
           "the header says when the ledger holds more than was read");

        var cached = Roi(Body, "cache");
        Is(RoiLines.Lines(Key, c, RoiMoney.From(c, cached), cached)[4],
           "Money: 292.50 EUR at 90 EUR/h · roi@1 · office · 3f07a1b2c3d4… (cached 14:03)",
           "the money line names the cached copy as such");

        var partial = Roi(Partial, "bridge");
        var pl = RoiLines.Lines(Key, c, RoiMoney.From(c, partial), partial);
        Is(pl[1], "Delivery gate runs: 3 · not priced — the roi sets no minutes for it", "a kind the roi sets no minutes for says so");
        Is(pl[2], "Naming renames: 5 · 10 min each · 50.00 GBP", "…while a kind it prices is priced");
        Is(pl[4], "Money: 50.00 GBP at 60 GBP/h · roi@1 · office · 3f07a1b2c3d4…", "…and the total holds only what was priced");

        var rate = Roi(Body.Replace("\"hourly_rate\":90", "\"hourly_rate\":87.6"), "bridge");
        Is(RoiLines.Lines(Key, c, RoiMoney.From(c, rate), rate)[4], "Money: 284.70 EUR at 87.6 EUR/h · roi@1 · office · 3f07a1b2c3d4…",
           "money to 2 dp, the rate as written (195 min = 3.25 h × 87.6)");

        var bad = Roi("{}", "bridge");
        Is(RoiLines.Lines(Key, c, RoiMoney.From(c, bad), bad)[4],
           "Money: not shown — roi@1 · office · 3f07a1b2c3d4… did not parse: the body is not {currency, hourly_rate, minutes}",
           "an installed body the dashboard cannot use: no money, naming the artefact");

        Is(string.Join("\n", RoiLines.NotBound()),
           "ROI · not bound — Sentinel ▸ Project Setup\nNothing was read: this document has no web project, so it has no ledger to count.",
           "unbound: nothing is read, and the window says so");
        Is(RoiLines.Unavailable(Key, "403: Not authorized: you are not a member of this project")[0],
           "ROI · aster-tower · not counted — the ledger could not be read (403: Not authorized: you are not a member of this project)",
           "a failed read counts nothing — never 0 — and names the bridge's refusal");
    }
}
