#nullable disable

static partial class Check
{
    // ── MA-5b-2: GHB-3 (Ghost reads the drawing fresh and removes the import it made) + DAT-4 (the drawing's units) — source pins ──
    static void Ma5b2Checks()
    {
        Console.WriteLine("\nMA-5b-2 — Ghost and Datum DWG hygiene: a fresh import removed at the end, the drawing's units");
        string pickWin = Src("UI", "DwgPickWindow.cs"), cmd = Src("Commands.GhostBuilder.cs"), build = Src("GhostBuilder", "GhostChangesetBuild.cs"), datum = Src("Commands.Datum.cs"), builder = Src("GhostBuilder", "DatumBuilder.cs");
        int At(string s, string what) => s.IndexOf(what, StringComparison.Ordinal);
        Ok(!cmd.Contains("existingImports") && !cmd.Contains("reuse.Instance") && cmd.Contains("var pick = new DwgPickWindow(folderDwgs);"),
           "GHB-3: no import is reused by its name — every run imports the file, so an edited drawing is read again");
        Ok(At(cmd, "madeImport = cadLink.Id;") > At(cmd, "t.Commit();") && At(cmd, "madeImport = cadLink.Id;") < At(cmd, "if (pickFromModel)")
           && !cmd.Substring(At(cmd, "if (pickFromModel)")).Contains("madeImport = cadLink"),
           "…only the import this run made is marked for removal — one picked from the model is the person's");
        string release = cmd.Substring(At(cmd, "void Release()"), 420);
        Ok(release.Contains("madeImport = null;") && release.Contains("App.Events!.Enqueue(_ => RemoveImport(doc, made)"),
           "…every end of the run (Release: closed, cancelled, refused, failed, built) removes it once, on Revit's thread");
        Ok(cmd.Split("RemoveImport(doc, madeImport);").Length == 3, "…the two early ends on Revit's thread (the read failed, no layer) remove it at once");
        Ok(cmd.Contains("MadeImport = madeImport,") && At(build, "DropImport(doc, r.MadeImport);") > 0 && At(build, "DropImport(doc, r.MadeImport);") < At(build, "group.SetName(undo);"),
           "…a build removes it inside its own Undo group, before the group is named and kept — one Ctrl+Z brings back the build and the drawing");
        Ok(build.Contains("doc.Delete(type);") && build.Contains(".Any(e => e.GetTypeId().Equals(type))"), "…its type too, when no other instance uses it");
        Ok(pickWin.Contains("{ (\"file\", \"as the file says\"), (\"mm\", \"millimetres\"), (\"cm\", \"centimetres\"), (\"m\", \"metres\"), (\"in\", \"inches\"), (\"ft\", \"feet\") };")
           && builder.Contains("\"mm\" => ImportUnit.Millimeter, \"cm\" => ImportUnit.Centimeter, \"m\" => ImportUnit.Meter,")
           && builder.Contains("\"in\" => ImportUnit.Inch, \"ft\" => ImportUnit.Foot, _ => ImportUnit.Default,"),
           "DAT-4: the pick window's units are Revit's import units; \"as the file says\" is the file's own header");
        Ok(cmd.Contains("Unit = DatumBuilder.UnitOf(pick.Units),") && datum.Contains("unit: DatumBuilder.UnitOf(pick.Units)") && builder.Contains("Unit = unit,"),
           "…Ghost Builder and Datum both import in the chosen units");
        Ok(builder.Contains("res.Warnings.AddRange(DatumFromDrawing.SpacingWarnings(res.Levels));"), "…Datum says a storey spacing that names wrong units (datum-check pins the words)");
    }
}
