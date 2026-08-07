# Sentinel external-user run — document governance arc

**Purpose:** a person who did not build Sentinel exercises the full phases 1-6 surface and tells us
where it confuses, breaks, or fails to earn trust. This is a usability + honesty run, not a demo:
the tester drives, the facilitator watches.

**Time:** ~60-75 minutes. **Tester profile:** ideally someone who knows BIM delivery (BEP/EIR/MIDP
mean something to them); Sentinel knowledge zero.

## Ground rules

- The tester **thinks aloud**. Verbatim confusions are the most valuable output — write them down as
  said, not paraphrased.
- The facilitator answers questions **only after the tester has been stuck ~2 minutes**, and logs
  every intervention (each one is a finding).
- Nothing the tester does is wrong. If they take an unexpected path, follow it and note it.
- Record findings in the table at the bottom as you go; severity-tag later, not in the moment.

## Facilitator pre-flight (before the tester sits down)

- [ ] Bridge running on :4100 (`SentinelBridge` task) — `curl http://localhost:4100/ai/providers` responds.
- [ ] Web app dev server on :4000 (`SentinelWebAppDevServer` task); page loads; you are signed in
      (the tester uses your session — note that RLS-per-role behavior is NOT under test today).
- [ ] Ollama up: `curl http://localhost:11434/api/tags` responds (AI steps take 30s-3min on the
      local model — warn the tester when they get there).
- [ ] A real BEP or EIR file (PDF or DOCX, ~5-40 pages) on the desktop for the ingestion step.
      Any real-world one is better than a synthetic one.
- [ ] A small dummy file (any PDF/IFC/whatever, <5 MB) for the deliverables WIP step.
- [ ] This script printed or on a second screen; a blank findings table ready.
- [ ] Do NOT pre-create a project for the tester — creating one is Part A.

---

## Part A — Orientation & project (~5 min)

1. Hand over with only this: *"This is Sentinel, a BIM governance tool. Create yourself a project
   to work in."*
   **Expect:** they find the Projects hub and create a project without help.
   **Watch for:** do they understand the project card → project space transition? Do the tabs
   (Dashboard / Project Files / Documents / Deliverables / Settings) read as the project's home?
2. Ask: *"Without clicking further — what do you think each tab does?"* Record their guesses
   verbatim; mismatches are naming findings.

## Part B — Documents (~10 min)

3. *"Your project needs a BIM Execution Plan. Make one."*
   **Expect:** Documents tab → create BEP from template; a sectioned document appears.
4. *"Fill in the section about naming conventions — write whatever you'd really write."*
   **Expect:** section editor opens, body saves, no data loss on reopen.
5. *"Mark that section as ready for the team to see."*
   **Expect:** they find the section/document state controls (wip → shared). Note whether the ISO
   19650 state names mean anything to them.
6. *"Publish the document."* Then: *"Now try to edit that section again."*
   **Expect:** edit is blocked with a clear message that a published document is immutable.
   **Ask:** *"Does it make sense WHY it stopped you?"* (This is Sentinel's core pitch — if the
   immutability message doesn't land, that's a Major finding.)
7. *"Get it back to editable."* **Expect:** they discover archived → wip (or the revert path) —
   or they can't, which is a navigation finding.

## Part C — Ingestion (~10 min)

8. Give them the real BEP/EIR file: *"You've been sent this by a client. Get it into Sentinel as a
   structured document."*
   **Expect:** Documents → ingest/upload flow; a proposal screen appears mapping extracted text to
   template sections with page citations.
9. *"Check the mapping. Fix anything it got wrong."*
   **Expect:** they can edit mapped text, route unassigned fragments into sections, or discard
   them. **Watch:** do they understand NOTHING is saved yet? Ask them: *"Has anything been saved so
   far?"* — their answer is a finding either way.
10. *"Accept it."* **Expect:** the document commits and opens; the original file is linked/retrievable.
    **Watch the clock:** note how long the AI mapping took and whether the wait state communicated.

## Part D — Bindings & compliance (~10 min)

11. *"Sentinel can check parts of a BEP against what the project actually enforces. Wire the naming
    section you wrote to the naming check."*
    **Expect:** they find bindings on the section, see suggestions, bind `naming.ruleset` (or
    accept the suggestion).
12. *"Now check whether the project complies with the document."*
    **Expect:** compliance report runs; the bound section shows a real result.
13. Point at a "— not checkable" result (e.g. a section bound to nothing, or a planned topic).
    **Ask:** *"What is this telling you?"*
    **Expect (the honesty test):** they read it as "Sentinel can't measure this" — NOT as a pass
    and NOT as a failure. If they read it as either, that's a Major finding: the three-state
    honesty is the product.

## Part E — Deliverables (~12 min)

14. *"The client expects three deliverables from you this month. Set that up."* (Let them invent
    names/dates; nudge toward one past-due date.)
    **Expect:** Deliverables tab, add rows or paste a schedule; paste-import shows a preview before
    saving.
    **Expect after save:** the past-due one shows **overdue**; future ones **pending**.
15. *"Now actually deliver one of them."* Have them upload the dummy file in Project Files with a
    container name matching a deliverable (facilitator may help with exact-name matching — note if
    exact-match tripped them).
    **Expect:** the deliverable flips to **in WIP** — arrived but not issued.
    **Ask:** *"What is the tracker telling you about this file?"* — in_wip is the feature's whole
    point; if it reads as "delivered", that's a Major finding.
16. *"Finish the delivery."* **Expect:** they publish the container (wip → shared → published) and
    the row flips to **delivered** (or **late** if past due) with real dates, without touching the
    Deliverables tab.
17. *"Where does the BEP say how delivery is going?"*
    **Expect:** compliance report now shows `midp.milestones` with the same numbers the tracker
    shows (if the delivery-milestones section is bound; let them make the connection).

## Part F — AI drafting & integrity (~12 min; warn about model latency)

18. *"One of your BEP sections is still empty. Have Sentinel draft it."*
    **Expect:** Draft with AI fills the editor; it is clearly marked a proposal; nothing is saved
    until they hit the normal save.
    **Ask:** *"Read the draft — did it invent anything about your project that isn't true?"*
    (Grounding test: names/dates/tools not in the project would be a finding against the prompt.)
19. *"Now write something FALSE into a section — claim a naming convention or a deliverable that
    doesn't exist. Then run Check integrity."*
    **Expect:** the analysis flags their seeded contradiction, quoting the doc claim against the
    project reality. A local-model miss is possible — note it as a model observation, not a bug,
    but the report must never show an uncited finding.
20. Point at the findings banner. **Ask:** *"How much do you trust these findings vs the
    compliance results from earlier?"*
    **Expect (second honesty test):** they can articulate the difference — compliance =
    deterministic facts, integrity = AI suggestions. If the banner didn't communicate that, Major.

## Part G — MCP agent session (~10 min)

21. Register the MCP server in the tester's MCP client (or Claude Desktop on this machine) per
    `docs/mcp-server.md`, or use the scripted session there. Have the tester ask the agent, in
    their own words: *"What documents does my project have? Is it compliant? What's late?"*
    **Expect:** the agent answers from `sentinel_*` tools with the same numbers the UI showed.
22. *"Ask the agent to fix something — edit a section, mark a deliverable delivered."*
    **Expect (the read-only test):** the agent has no tool to do it and says so. If the agent
    fabricates success, capture the transcript — that's a Critical finding against tool
    descriptions.

## Part H — Governed AI modeling (~10 min; needs Revit + the deployed add-in)

23. Facilitator proposes a changeset via MCP (`sentinel_propose_changeset`: a level, a grid, two
    walls — mm geometry). *"An AI just proposed model elements for your project. Find where you
    review them."*
    **Expect:** the tester finds **Review AI Proposals** in Revit; the window lists each element
    with its verdict badge; with no IDS configured everything reads "— recorded" and NOTHING is
    pre-ticked.
    **Ask:** *"Why do you think nothing is ticked for you?"* (Honesty probe: a green tick must be
    earned by a spec; "recorded" means nothing was certified.)
24. *"Approve some of it."* **Expect:** they tick a subset, Create, elements appear; the bridge
    status becomes `partially_applied` with real ElementIds; the audit trail names THEM.
25. Facilitator proposes a changeset with a wall type that doesn't exist. *"Approve everything."*
    **Expect:** transaction fails, WHOLE changeset rolls back (nothing partial in the model),
    reported `declined` with the reason in the dialog.
    **Ask:** *"Did anything make it into the model?"* — the answer must be no, verified.
26. Facilitator withdraws a proposed changeset while the tester's review window is open; tester
    clicks Create. **Expect:** "Changeset is now \"withdrawn\" — nothing was created."
27. **Known honest limit (tell the tester, gauge reaction):** Revit's Undo can delete applied
    elements while the governed record still says `applied` — the trail and the model can drift.
    **Ask:** *"How much does that bother you?"* (Roadmapped: a DMU watcher flagging deletions of
    governed elements.)

## Wrap-up questions (ask verbatim, record verbatim)

- "What were you most unsure about while using it?"
- "Was there a moment you didn't trust what it told you? What?"
- "What would you expect it to do that it didn't?"
- "If your team had this tomorrow, what would you use weekly? What never?"
- "What one thing would you fix first?"

## Findings

| # | Part | What happened (verbatim where possible) | Severity (Critical / Major / Minor / Observation) |
|---|---|---|---|
| 1 | | | |
| 2 | | | |

**Severity guide:** Critical = wrong/fabricated information or data loss. Major = a core concept
(immutability, not-checkable, in_wip, AI-vs-facts) failed to communicate, or the tester was stuck
needing help. Minor = friction, naming, layout. Observation = model quality, latency, wishes.

**After the run:** facilitator commits this file's filled copy as
`docs/testing/2026-08-07-external-user-run-RESULTS.md`, and the findings become the next work
queue alongside the followups in `.superpowers/sdd/progress.md`.
