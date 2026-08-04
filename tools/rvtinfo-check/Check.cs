// Offline conformance for RvtFileInfo — the OLE byte-scan version reader. Pure, so we assert the real
// cases here rather than only finding out inside Revit: "Format: 20xx" marker wins over the
// "Autodesk Revit 20xx" build-string fallback, garbage/missing files never throw. Run: dotnet run --project tools/rvtinfo-check
using System;
using System.IO;
using System.Linq;
using Sentinel.Engine;

static byte[] FakeRvt(string marker, bool bigEndian = false)
{
    // Minimal fixture: OLE magic + padding + the marker as UTF-16 (LE by default), as it
    // appears inside BasicFileInfo. Parser must find it by byte scan. Real sample RVTs were
    // found to store this text as UTF-16BE, hence the bigEndian option (see task-1 report).
    var head = new byte[] { 0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1 };
    var pad = new byte[512];
    var enc = bigEndian ? System.Text.Encoding.BigEndianUnicode : System.Text.Encoding.Unicode;
    var text = enc.GetBytes(marker);
    return head.Concat(pad).Concat(text).Concat(pad).ToArray();
}

int fail = 0;
void Check(bool ok, string name)
{ if (ok) Console.WriteLine("PASS " + name); else { Console.WriteLine("FAIL " + name); fail++; } }

var dir = Path.Combine(Path.GetTempPath(), "rvtinfo-check");
Directory.CreateDirectory(dir);

// 1. Format marker wins
var p1 = Path.Combine(dir, "a.rvt");
File.WriteAllBytes(p1, FakeRvt("Format: 2023"));
Check(RvtFileInfo.Read(p1).SavedVersion == "2023", "format-marker");
Check(RvtFileInfo.Read(p1).Flavor == "Project", "flavor-rvt");

// 2. Build-string fallback
var p2 = Path.Combine(dir, "b.rfa");
File.WriteAllBytes(p2, FakeRvt("Autodesk Revit 2025 (Build: 25.1)"));
Check(RvtFileInfo.Read(p2).SavedVersion == "2025", "build-fallback");
Check(RvtFileInfo.Read(p2).Flavor == "Family", "flavor-rfa");

// 3. Garbage: no version, no throw
var p3 = Path.Combine(dir, "c.rte");
File.WriteAllBytes(p3, new byte[] { 1, 2, 3, 4 });
Check(RvtFileInfo.Read(p3).SavedVersion == "", "garbage-no-version");
Check(RvtFileInfo.Read(p3).Flavor == "Template", "flavor-rte");

// 4. Missing file: no throw
Check(RvtFileInfo.Read(Path.Combine(dir, "missing.rvt")).SavedVersion == "", "missing-no-throw");

// 5. UTF-16BE marker (real sample RVTs store BasicFileInfo text this way, not LE)
var p4 = Path.Combine(dir, "d.rvt");
File.WriteAllBytes(p4, FakeRvt("Format: 2022", bigEndian: true));
Check(RvtFileInfo.Read(p4).SavedVersion == "2022", "format-marker-be");

// 6. Zero-byte file: no throw, no version
var p5 = Path.Combine(dir, "e.rvt");
File.WriteAllBytes(p5, Array.Empty<byte>());
Check(RvtFileInfo.Read(p5).SavedVersion == "", "zero-byte-no-throw");

Console.WriteLine(fail == 0 ? "RVTINFO OK" : $"{fail} FAILURES");
return fail == 0 ? 0 : 1;
