# The only two things left that need a human

Everything else in the July security audit is closed and verified. These two need a browser or Revit —
things an assistant can't drive. Both are short. Follow them literally; no BIM or SQL knowledge needed.

---

## Task 1 — Turn on leaked-password protection (2 minutes)

**What it does:** when someone sets a Sentinel password, Supabase checks it against the HaveIBeenPwned
breach list and refuses passwords already known to attackers. It is off today. This is the last open item
from the audit (F15).

**You need:** the Supabase dashboard, signed in as the project owner.

1. Go to **https://supabase.com/dashboard/project/autqqtwhxqrfjaztablm/auth/policies**
   (if that lands somewhere odd: dashboard → your project **Yazan-hub's Project** → **Authentication** in
   the left sidebar → **Policies**, sometimes labelled **Password / Attack Protection** or
   **Auth Protection** depending on the dashboard version).
2. Find the row **"Prevent use of leaked passwords"** (it may read *Leaked password protection* or
   *HaveIBeenPwned*).
3. Flip the toggle **on**.
4. Click **Save** if the page has a save button. Some versions save immediately — if there is no button,
   it's already done.

**How you'll know it worked:** ask me next session to re-run the Supabase security advisors. The warning
*"Leaked Password Protection Disabled"* should be gone. That's the whole check — nothing to type.

**If you can't find the toggle:** tell me which menu items you *do* see under Authentication and I'll
point at the right one. Dashboard layouts move around.

---

## Task 2 — Run GhostBuilder once in Revit (10 minutes)

**Why:** I rebuilt a lot of GhostBuilder this session (it now reads your project's PDFs, writes spec
values like fire ratings onto the geometry, and asks for your approval before building anything). It
compiles clean and its logic is tested offline, but **it has never been run in a real Revit**. Until it
is, "it works" is a claim, not a fact. You are the only one who can turn that claim into a fact.

### Before you start

- Close Revit. Open a terminal in the project folder and run:
  `dotnet build SentinelAddin/Sentinel.csproj -p:RevitVersion=2026`
  (change `2026` to whichever Revit you use). It must say **Build succeeded**. This installs the add-in.
- Make sure **Ollama is running** (GhostBuilder needs the local model — nothing leaves your machine).

### Set up a test folder

1. Make a new folder anywhere, e.g. `C:\GhostTest`.
2. Put in it: **one DWG floor plan**, and **one PDF** that says something specific about the walls —
   even a one-line PDF reading *"All external walls shall be FR60 fire rated."* is a perfect test.
3. In Revit: **Sentinel ribbon → Project Setup**, set the **Ghost source folder** to `C:\GhostTest`.

### The run

4. Link or import the DWG into a Revit view.
5. **Sentinel ribbon → Ghost Builder**, then click the DWG when it asks you to select it.
6. Wait. A progress window shows what it's doing ("reading the project documents…", "mapping CAD
   layers…"). This can take a minute or two — the model runs locally.

### What to check — this is the actual test

7. **A review window appears and NOTHING has been built yet.** ← the single most important thing. If
   geometry appears in your model before you click Build, tell me: the safety gate failed.
8. Look at the list. Each row is one CAD layer: what it will become, how many elements, a confidence
   dot, and any parameters read from your PDF (e.g. `⚙ Fire Rating = FR60`).
9. **Untick one layer that is ticked.** Click **Build**.
10. Check the model: the layer you unticked must **not** have been built. The ticked ones must be there.
11. Click a wall from a ticked layer → look at its properties (or its type's properties) → the value
    from your PDF should be there.
12. Press **Ctrl+Z once**. The entire build should disappear in that single undo.

### Tell me what happened

Just say which of steps 7–12 did what you expected and which didn't — plain words are fine
("the window came up but the fire rating wasn't on the wall"). I don't need logs or screenshots to start
debugging; if I do, I'll ask for something specific.

**If it fails early:** the two usual causes are Ollama not running, and no model pulled. In a terminal:
`ollama list` — if it's empty, run `ollama pull qwen2.5:7b-instruct`. Vision (reading sketch images) is
optional; if no vision model is installed, images are skipped and the rest still works.
