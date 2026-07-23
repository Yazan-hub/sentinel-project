# What's left that needs a human

Everything else in the July security audit is closed and verified. These need a browser or Revit —
things an assistant can't drive. Follow them literally; no BIM or SQL knowledge needed.

> **Checked on your machine, 2026-07-23** — so you can skip the usual setup worries:
> Ollama is **running**, with `qwen2.5:7b-instruct` (the mapping model) **and** `llava` (the vision
> model) already pulled. Your **Ghost source folder** is already set to `C:\Users\yazan\Desktop\ghost-docs`,
> which already contains a spec naming FR60 external walls **and** a sketch PNG — so the vision path
> gets exercised too. You're running **Revit 2024**. Nothing to install.

---

## Task 0 — Close Revit and tell me (30 seconds) ⬅ **do this first**

The add-in currently installed in Revit 2024 is from **before** today's work — it has none of the
document-reading, the parameter writing, or the review window. Revit locks the add-in files while it's
open, so it cannot be replaced underneath a running session. (The build refuses rather than pretending
to succeed — that guard is deliberate; a silently stale install is worse than a failed build.)

**Just close Revit and say "closed".** I'll rebuild and install the current version, and confirm it
landed. Then reopen Revit and do Task 2.

---

## Task 1 — Leaked-password protection ⛔ **BLOCKED: needs a paid plan**

**Don't go looking for this — the toggle is not in your dashboard.** Checked 2026-07-23:
`Yazan-hub's Org` is on the **free** plan, and Supabase gates leaked-password protection to **Pro and
above**. It is absent, not hidden.

*(Two earlier versions of this file sent you to the wrong place. The setting lives under
**Authentication → Providers → Email** — `/auth/providers?provider=Email` — **not** `/auth/policies`,
which is the RLS policies page for database tables. Even at the right address, the free plan doesn't
show it.)*

**What it would do:** reject any password already known from a public breach, by checking it against
HaveIBeenPwned. Supabase does this server-side using k-anonymity — only the first 5 characters of the
password's SHA-1 hash ever leave the server, never the password.

### What to do instead — three options, cheapest first

1. **Tighten the password rules that *are* free.** On the same page (**Authentication → Providers →
   Email**) you can set a **minimum password length** and **required character types**. Set the length to
   at least 12. This is free, takes a minute, and closes most of the same risk. ⬅ **recommended**
2. **Do the breach check ourselves.** The HaveIBeenPwned range API is free and needs no key — the same
   k-anonymity trick Supabase uses. ~20 lines at the sign-up path. **But** it is an outbound call to a
   third party, which cuts against this project's local-default privacy stance, so it is your call, not
   mine to assume. Say the word and I'll build it.
3. **Accept it.** This is a **LOW** finding, and the practical exposure today is one maintainer account
   on a pilot. Accepting it explicitly — as was done for the F16 dev-only CVEs — is a legitimate answer.

**Whichever you pick, tell me and I'll record the decision** in the audit so this stops resurfacing as
an open item.

---

## Task 2 — Run GhostBuilder once in Revit (10 minutes)

**Why:** GhostBuilder was largely rebuilt this session — it now reads your project's documents, writes
spec values like fire ratings onto the geometry, and asks your approval before building anything. It
compiles clean and its logic passes 33 offline checks, but **it has never run in a real Revit**. Until
it does, "it works" is a claim, not a fact.

### The drawing — already made for you

**`demo/ghost-sample/sample-plan.dxf`** in this repo: a 10 × 7 m plan with external walls, an internal
partition, a floor slab, two doors, one deliberately non-standard layer, and two layers that must be
ignored. You don't need to draw anything.

*(It's a DXF, not a DWG — DWG is a closed binary format I can't author. Revit imports DXF through the
same Import CAD command and GhostBuilder reads it identically.)*

Your existing `ghost-docs` folder supplies the spec, so **there is no setting to change**.

### The run

1. Open Revit 2024, open or start any project **that has at least one Level**.
2. **Insert → Import CAD**, choose `demo/ghost-sample/sample-plan.dxf`. If it asks for units, pick
   **Millimeters**.
3. **Sentinel ribbon → Ghost Builder**, then click the imported drawing when it asks you to select it.
4. Wait. A progress window narrates ("reading sketches with the local vision model…", "reading
   parameters from the project documents…"). A minute or two is normal — the model runs on your machine.

### What to check — this is the actual test

5. **A review window appears and NOTHING has been built yet.** ← the single most important check. If
   geometry appears before you click Build, the safety gate failed and I need to know immediately.
6. Read the list. Expect roughly:
   - `A-WALL-EXT` → Walls, 4 elements — **ideally with `⚙ Fire Rating = FR60`** lifted from your spec
   - `A-WALL-INT` → Walls, 1 element
   - `A-FLOR` → Floors, 1 element
   - `A-DOOR` → Doors, 2 elements
   - `EXTERIOR-ENVELOPE` → whatever the local model decided. **I cleared this one from the cache** so it
     genuinely goes to the model this time — your spec says it "represents the building's outer wall
     envelope", so a good answer is Walls. Its confidence dot may be amber; that's the point of showing it.
   - **`A-ANNO` and `DEFPOINTS` must NOT appear** — they're on the ignore list. If you see them, tell me.
7. **Untick `A-WALL-INT`.** Click **Build**.
8. In the model: `A-WALL-INT` must **not** be there; the ticked layers must be.
9. Click an external wall → **Edit Type** → **Fire Rating** should read `FR60`. *(Type or instance,
   either is a pass. Review window showed the `⚙` but the model has no value = the interesting failure.)*
10. Press **Ctrl+Z once**. The whole build should vanish in that single undo.

### Tell me what happened

Plain words are fine — "the window came up but the fire rating wasn't on the wall". I'll ask for
specifics only if I need them.

**Things that are NOT bugs:** doors skipping if your project has no door family loaded (it says so
honestly in the report); the envelope layer getting a low confidence score; warnings about a wall
**type** parameter being set, which by design affects every wall of that type.
