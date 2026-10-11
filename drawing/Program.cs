// MA-5a-3 — sentinel-drawing's process: the job JSON on stdin (UTF-8), the result JSON on stdout, exit 0. Anything else — a body that
// is not a job, a crash — is one line on stderr and exit 1: the bridge fails the job in its own words (the stderr goes to its log only).
using System;
using System.IO;
using System.Text;
using System.Text.Json.Nodes;

namespace Sentinel.Drawing
{
    static class Program
    {
        static int Main()
        {
            try
            {
                string input;
                using (var r = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false))) input = r.ReadToEnd();
                var bytes = new UTF8Encoding(false).GetBytes(DrawingJob.Run(JsonNode.Parse(input)).ToJsonString());
                using (var o = Console.OpenStandardOutput()) o.Write(bytes, 0, bytes.Length);
                return 0;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"sentinel-drawing: {e.GetType().Name}: {e.Message}");
                return 1;
            }
        }
    }
}
