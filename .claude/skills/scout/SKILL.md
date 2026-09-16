---
name: scout
description: Process the Sentinel research inbox — fetch every BIM / BIM-software link the user has collected (open GitHub issues labelled `inspiration`, lines in docs/research/inbox.md, or URLs passed as arguments), analyse each one against Sentinel's landscape and roadmap, write a status-tagged research note, close the loop on the issue, and open the brainstorm. Use when the user says /scout, "process my links", "what did I save", "analyse the inbox", or pastes one or more BIM-related links to brainstorm.
---

# /scout — turn saved links into Sentinel research

The user collects links while scrolling (LinkedIn experts, That Open Company posts, Instagram, GitHub). They land in the **research inbox** (see `docs/research/README.md`). Your job is to drain the inbox into honest, useful research notes and then brainstorm with the user about what Sentinel should do about each one.

Arguments: `/scout` alone drains the whole inbox. `/scout <url> [<url>…]` also processes those URLs, even if they are not in the inbox. `/scout #12` processes only that issue.

## 1. Collect

Gather every unprocessed item from all three sources:

1. **GitHub issues** in `Yazan-hub/sentinel-project` that are OPEN and labelled `inspiration`. Use the GitHub MCP tools if present (`list_issues` with `labels: ["inspiration"]`, `state: OPEN`), otherwise `gh issue list --label inspiration --state open --json number,title,body,url`. The issue body is an issue-form: it carries the **Link**, **Where you saw it**, **Why it caught your eye**, and **Your first instinct**. Keep those — they are the user's own signal.
2. **`docs/research/inbox.md`**, every line under `## Unprocessed` (one URL per line, optional ` — note` after the URL).
3. **URLs given as arguments.**

Deduplicate by URL. If there is nothing at all, say so in one line and stop.

## 2. Fetch — and be honest about what you could not open

For each link, try `WebFetch` (or `curl -L` if that is what you have). Expect:

- **LinkedIn and Instagram posts are usually login-walled.** Do not pretend you read them. Try once; if you get a login page or a stub, fall back to: (a) any outbound URL embedded in the post URL or the user's note, (b) the user's "Why it caught your eye" text, (c) a `WebSearch` for the tool/plugin/author name. Record in the note exactly which of these you used.
- **GitHub repos**: read the README, the latest release, license, stars/activity, and the language. Check whether it is a Revit add-in, a That Open (`@thatopen/*`) component, an IFC library, a web viewer, etc.
- **That Open Company posts** usually point at a community-built plugin or a `@thatopen/components` feature. Find the underlying repo or docs page.
- **Vendor pages**: capture what it does, deployment (desktop / web / plugin), pricing if public, IFC / IDS / BCF posture.

If a link cannot be characterised at all, write the note anyway with status `⬜ Unfetched — needs the user's description` and ask for it in the brainstorm. Never invent product details.

## 3. Analyse against Sentinel

Ground every judgement in the repo, not in general knowledge. Read as needed:

- `ROADMAP.md` — the two lanes and what is `✅ / 🟠 / ⬜ / 🔭`.
- `docs/bim-tools-landscape.md` (§0 findings, §1 stage tables, §4 ranked targets) and `docs/bim-tools-catalog-full.md` — is this tool already mapped? Under which lifecycle stage?
- `docs/CAPABILITY_MAP.md` and `docs/handbook/05-capability-status.md` — what Sentinel actually has, with honest tags.
- `docs/killer-features-vision.md` and `docs/STRATEGIC_REVIEW_2026-07.md` — the wedge: governance / referee / IDS / immutable ledger, *not* authoring.

Answer, for each link:

1. **What is it, in one sentence.** Who built it, what problem it solves, how it is delivered.
2. **Relation to Sentinel** — pick exactly one primary: `COMPETES` · `COMPLEMENTS` (ally / integration target) · `BUILDING BLOCK` (we could use it) · `IDEA TO ABSORB` (a feature or UX pattern) · `MARKET SIGNAL` (tells us something about where the market is going) · `NOISE`.
3. **Where it lands in the landscape** — which stage table in `bim-tools-landscape.md`, and whether it changes any row or the §4 ranking.
4. **Concrete Sentinel actions**, ranked, each with: what to change (file / subsystem), why, rough effort (hours / days / weeks), and which roadmap lane and item it attaches to. Zero actions is a valid answer — say so.
5. **Verdict**: `ADOPT` · `ADAPT` · `WATCH` · `IGNORE`, with the one-line reason.

Hold the handbook's standard: if you are unsure whether Sentinel already does something, check the code before claiming a gap or an overlap.

## 4. Record

For each link write `docs/research/notes/YYYY-MM-DD-<slug>.md` from the template in `docs/research/NOTE_TEMPLATE.md`. Slug = the tool or post name, kebab-case, ≤ 40 chars. One note per link; a note is a permanent record, so keep it factual and cite what you fetched.

Then append one row per note to `docs/research/LEDGER.md` (date · link · relation · verdict · note path · issue #).

Do **not** edit `ROADMAP.md`, the handbook, or the landscape docs on your own in this pass. Proposals go in the note; the user decides in the brainstorm. The one exception: if the tool is missing from `docs/bim-tools-catalog-full.md` and you fetched real vendor data, you may add a row to the matching table — cite the source.

## 5. Close the loop

- For each GitHub issue: post one comment with the one-sentence summary, the relation + verdict, the top action, and the note path. Then close the issue with reason `completed`. If the link could not be fetched, leave the issue **open**, comment asking for a description, and add the label `needs-description` if you can.
- For `docs/research/inbox.md`: move processed lines from `## Unprocessed` to `## Processed` with the date and note path.
- Commit on the current branch (or `claude/scout-YYYY-MM-DD` if on `master`) with message `research: scout <n> links — <slugs>` and push. Do not open a PR unless asked.

## 6. Brainstorm

Finish with a short message to the user, standing on its own:

- One line per link: name · relation · verdict.
- The two or three proposed actions that matter most across all links, with effort.
- Anything you could not open and need described.
- A question to start the brainstorm: which of these should become a spec in `docs/superpowers/specs/` or a roadmap item?

Keep the analysis in the notes; keep the message short.
