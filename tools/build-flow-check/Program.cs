using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Sentinel.UI;

var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
string Src(string rel) => File.ReadAllText(Path.Combine(root, "SentinelAddin", rel));
var app = Src("App.cs");
var allSrc = string.Join("\n", Directory.GetFiles(Path.Combine(root, "SentinelAddin"), "*.cs", SearchOption.AllDirectories).Select(File.ReadAllText));
int fails = 0;
void Ok(bool c, string what) { Console.WriteLine((c ? "PASS " : "FAIL ") + what); if (!c) fails++; }

Ok(string.Join(" | ", BuildSteps.All.Select(s => s.Number + " " + s.Title)) ==
   "1 Levels and grids | 2 Model from drawings | 3 Massing from photos | 4 Annotate views | 5 Promote to DD", "the five steps, in order");
Ok(string.Join(",", BuildSteps.All.SelectMany(s => s.Buttons).Select(b => b.Command)) ==
   "DatumFromDrawingsCommand,GhostBuilderCommand,MassingFromImagesCommand,ShellMassCommand,AnnotateViewsCommand,PromoteWallsCommand",
   "each step's buttons run the old Build tools, in their order");
Ok(BuildSteps.WhereFrom.Buttons.Single().Command == "ProvenanceCommand", "Where did this come from? runs Provenance");
foreach (var (label, cmd) in BuildSteps.All.Append(BuildSteps.WhereFrom).SelectMany(s => s.Buttons))
{
    Ok(app.Contains($"\"Sentinel.Commands.{cmd}\""), $"'{label}' -> {cmd} is registered on the ribbon");
    Ok(Regex.IsMatch(allSrc, $@"public sealed class {cmd} : IExternalCommand"), $"{cmd} is a command class");
}
Ok(app.Contains("\"Sentinel_Build\", \"Build\", \"Sentinel.Commands.BuildCommand\""), "the Build button opens BuildCommand");
Ok(Src("Commands.Journey.cs").Contains("GetType(\"Sentinel.Commands.\" + cls"), "BuildCommand runs the class the window names");
Console.WriteLine(fails == 0 ? "build-flow-check: all passed" : $"build-flow-check: {fails} failed");
return fails == 0 ? 0 : 1;
