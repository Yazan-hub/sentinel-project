using Sentinel.Engine;

static class Check
{
    static int _pass, _fail;
    static void Is(string? got, string? want, string n)
    {
        if (got == want) { _pass++; Console.WriteLine("  PASS  " + n); return; }
        _fail++;
        Console.WriteLine("  FAIL  " + n + "\n        got:  " + (got ?? "(null)") + "\n        want: " + (want ?? "(null)"));
    }

    static int Main()
    {
        Console.WriteLine("DocPin — a Sentinel job runs on the model it was started on, or says why not\n");
        Is(DocPin.Refusal(true, true, "Aster.rvt", "rename the element"), null, "open and active → runs (no refusal)");
        Is(DocPin.Refusal(true, false, "Aster.rvt", "rename the element"),
           "Sentinel did not rename the element: switch back to Aster.rvt — nothing was changed.",
           "open, another model active → switch back, the model named");
        Is(DocPin.Refusal(false, false, "", "rename the element"),
           "Sentinel did not rename the element: the model it was started on is closed — nothing was changed.",
           "closed → says closed and names no title (a closed document has none to read)");
        Is(DocPin.Refusal(false, true, "Aster.rvt", "place the proposals"),
           "Sentinel did not place the proposals: the model it was started on is closed — nothing was changed.",
           "closed wins over active");
        Console.WriteLine($"\n{_pass}/{_pass + _fail} checks pass");
        return _fail == 0 ? 0 : 1;
    }
}
