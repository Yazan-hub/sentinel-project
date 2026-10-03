#nullable disable
using Sentinel.Coordination;
using Sentinel.Engine;
using Sentinel.GhostBuilder;

static partial class Check
{
    // ── 37. MA-2d: a Promote storey of several changesets, reviewed and applied as one (StoreyBatch) ─────────────────────────
    static void StoreyBatchChecks()
    {
        Console.WriteLine("\nMA-2d — the storey batch");
        Ok(StoreyBatch.StoreyOf("Promote (DD) · GR-FFL (2/3)") == "Promote (DD) · GR-FFL" && StoreyBatch.StoreyOf("Promote (DD) · GR-FFL") == "Promote (DD) · GR-FFL"
           && StoreyBatch.StoreyOf("Promote (DD) · L1 (a/b)") == "Promote (DD) · L1 (a/b)" && StoreyBatch.StoreyOf("Promote (DD) · L1 (2/3) x") == "Promote (DD) · L1 (2/3) x"
           && StoreyBatch.StoreyOf("Promote (DD) · L1 (٢/٣)") == "Promote (DD) · L1 (٢/٣)" && StoreyBatch.StoreyOf(null) == "",
           "StoreyOf takes off the \" (i/n)\" Bodies writes at the end of a name (ASCII digits), and nothing else");

        // Bodies' own names: three walls of one storey, a retype and an attach each (6 ghosts), at most 4 a changeset → 2 changesets.
        var sp = new StoreyPlan { Storey = "GR-FFL" };
        foreach (var u in new[] { "w1", "w2", "w3" })
        {
            sp.Ghosts.Add(new PromoteGhost { Op = "retype", UniqueId = u, Label = u, TypeBefore = "Generic - 200mm", TypeName = "BDS_EXT_ARC_CMU_200 mm", Reason = "r" });
            sp.Ghosts.Add(new PromoteGhost { Op = "attach", UniqueId = u, Label = u, BaseLevel = "GR-FFL", TopLevel = "01-FFL", Reason = "r" });
        }
        var names = Json(PromoteWallsPlanner.Bodies(new[] { sp }, "yazan", max: 4, title: "Promote (DD)")).Select(b => (string)b["name"]).ToList();
        Ok(names.SequenceEqual(new[] { "Promote (DD) · GR-FFL (1/2)", "Promote (DD) · GR-FFL (2/2)" }) && names.All(n => StoreyBatch.StoreyOf(n) == "Promote (DD) · GR-FFL"),
           "a storey of more ghosts than one changeset holds is filed as \"(1/2)\", \"(2/2)\", and StoreyOf gives both the storey's one name");

        ChangesetDto Cs(string id, string name, string source, params string[] guids) => new ChangesetDto
        {
            Id = id, Name = name, Source = source, Status = "proposed", Claimed = true, Adjudication = new AdjudicationDto { Verdict = "recorded", IdsSource = "ids@1" },
            Elements = guids.Select(g => new ChangesetElementDto { ProposalGuid = g, Op = "retype", Kind = "wall", Place = new PlaceDto { TypeName = "BDS_INT_ARC_GYPS_100 mm" } }).ToList(),
            Exceptions = new List<ExceptionRowDto> { new ExceptionRowDto { UniqueId = "held-" + id, Name = "held " + id, Reason = "a person decides" } },
        };
        var c1 = Cs("c1000000-a", "Promote (DD) · GR-FFL (1/2)", "promote", "a", "b");
        var agent = Cs("ag000000-a", "Promote (DD) · GR-FFL (2/2)", "agent", "z");
        var c2 = Cs("c2000000-a", "Promote (DD) · GR-FFL (2/2)", "promote", "c");
        var other = Cs("c3000000-a", "Promote (DD) · GR-FFL (2/3)", "promote", "d");
        var l1 = Cs("l1000000-a", "Promote (DD) · 01-FFL", "promote", "e");
        var dup = Cs("dup00000-a", "Promote (DD) · GR-FFL (1/2)", "promote", "f");
        var pending = new List<ChangesetDto> { c1, agent, c2, other, l1 };
        Ok(StoreyBatch.Of(pending, c1).SequenceEqual(new[] { c1, c2 }) && StoreyBatch.Of(new[] { c2, c1 }, c2).SequenceEqual(new[] { c1, c2 }),
           "a Promote storey's parts are reviewed together, in part order — not an agent's changeset of the same name or another run's \"(2/3)\"");
        // Review C7: two runs of one storey (a part waits twice), or a part missing, are never guessed at — the part is reviewed alone.
        Ok(StoreyBatch.Of(pending, l1).SequenceEqual(new[] { l1 }) && StoreyBatch.Of(pending, agent).SequenceEqual(new[] { agent })
           && StoreyBatch.Of(pending.Concat(new[] { dup }), c1).SequenceEqual(new[] { c1 }) && StoreyBatch.Of(pending.Concat(new[] { dup }), c2).SequenceEqual(new[] { c2 })
           && StoreyBatch.Of(new[] { c1 }, c1).SequenceEqual(new[] { c1 }),
           "a storey of one changeset, any changeset that is not Promote's, and a part whose storey has a part waiting twice or missing, is reviewed alone");
        // Review C13: two runs of 02-FFL — A files (1/2), (2/2); B files (1/2), its (2/2) not filed. Pending A1, B1, A2: A1 is reviewed
        // alone (part 1 waits twice); B1 and A2 then look like one storey — they are never batched (each was pending when its storey
        // looked wrong), while a later run's parts still are.
        var a1 = Cs("ra100000-a", "Promote (DD) · 02-FFL (1/2)", "promote", "g");
        var b1 = Cs("rb100000-a", "Promote (DD) · 02-FFL (1/2)", "promote", "h");
        var a2 = Cs("ra200000-a", "Promote (DD) · 02-FFL (2/2)", "promote", "i");
        var n1 = Cs("rn100000-a", "Promote (DD) · 02-FFL (1/2)", "promote", "j");
        var n2 = Cs("rn200000-a", "Promote (DD) · 02-FFL (2/2)", "promote", "k");
        Ok(StoreyBatch.Of(new[] { a1, b1, a2 }, a1).SequenceEqual(new[] { a1 }) && StoreyBatch.Of(new[] { b1, a2 }, b1).SequenceEqual(new[] { b1 })
           && StoreyBatch.Of(new[] { a2 }, a2).SequenceEqual(new[] { a2 }) && StoreyBatch.Of(new[] { a2, n1, n2 }, n1).SequenceEqual(new[] { n1, n2 }),
           "once a part was reviewed alone, the leftover parts of two runs never batch as one storey (A1, B1, A2: B1 and A2 alone); a later run's parts still batch");

        var merged = StoreyBatch.Merge(new[] { c1, c2 });
        Ok(merged.Id == c1.Id && merged.Name == "Promote (DD) · GR-FFL (2 changesets, one Undo)" && merged.Source == "promote" && merged.Claimed == true
           && merged.Elements.Select(e => e.ProposalGuid).SequenceEqual(new[] { "a", "b", "c" }) && merged.Exceptions.Count == 2
           && ReferenceEquals(StoreyBatch.Merge(new[] { l1 }), l1),
           "the review window shows one storey: every part's elements and held rows, named as the storey; a changeset alone is shown as it is");
        Ok(StoreyBatch.Own(c1, new[] { "a", "c", "z" }).SequenceEqual(new[] { "a" }) && StoreyBatch.Own(c2, new[] { "a", "c", "z" }).SequenceEqual(new[] { "c" }),
           "the person's ticks and unticks are split back to the changeset each is reported on");
        Ok(StoreyBatch.UndoName(new[] { c1, c2 }) == UndoWatcher.TxName("Promote (DD) · GR-FFL", c1.Id) && StoreyBatch.UndoName(new[] { l1 }) == UndoWatcher.TxName(l1.Name, l1.Id)
           && GhostFailurePolicy.DoctorSkips(StoreyBatch.UndoName(new[] { c1, c2 })),
           "one Undo entry for the storey, named as a changeset's transaction (the undo watcher and the Doctor's skip key on that name); a changeset alone keeps its own");

        // MA-2c F11/C21: a type edit rides in the storey's first changeset, the retypes onto its type may be in a later one — one storey,
        // one window: the type edit's "+ M if … retypes onto it" counts every part.
        var edit = new ChangesetElementDto { ProposalGuid = "t", Op = "set_parameter", Kind = "wall", Place = new PlaceDto { TypeName = "BDS_INT_ARC_GYPS_100 mm" } };
        c1.Elements.Insert(0, edit);
        Ok(ChangesetTrust.RetypedOnto(c1, edit) == 2 && ChangesetTrust.RetypedOnto(StoreyBatch.Merge(new[] { c1, c2 }), edit) == 3,
           "a type edit's row counts the retypes onto its type in every changeset of the storey, not only its own (F11, C21)");
    }
}
