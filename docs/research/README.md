# Research inbox — from "I saw something interesting" to a Sentinel decision

You scroll LinkedIn, Instagram and That Open Company's feed and keep finding BIM tools, plugins and ideas worth thinking about. This folder is the pipeline that gets those links to Claude Code **without the WhatsApp detour**, and turns each one into an honest research note plus a brainstorm.

```
phone share sheet ──► GitHub issue  (label: inspiration) ─┐
GitHub app / web  ──► "💡 Inspiration link" issue form   ─┤
keyboard          ──► docs/research/inbox.md             ─┼─► /scout ─► notes/*.md + LEDGER.md ─► brainstorm ─► spec / roadmap
Claude Code chat  ──► /scout <url>                        ─┘
```

The inbox is **GitHub issues labelled `inspiration`** on this repo. Issues are the right store: they are reachable from any device with one HTTP call, they keep your "why I saved this" note next to the link, Claude can read and close them, and the closed issue plus the note is a permanent record of what you looked at and decided.

---

## 1. Capturing a link

### A. One tap from the phone share sheet (the WhatsApp replacement)

Both recipes make a single authenticated `POST` to the GitHub API that creates an `inspiration` issue. You need a token first.

**Token (one time, 2 minutes).** GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:
- Resource owner: `Yazan-hub` · Repository access: **Only select repositories → `sentinel-project`**
- Permissions → Repository permissions → **Issues: Read and write**. Nothing else.
- Expiration: the maximum offered. Copy the token once; it lives only inside the shortcut. **Never paste it into the repo or into a Claude session.**

**iPhone / iPad — Shortcuts app.** Create a new shortcut named *Sentinel inbox*:
1. Shortcut settings (ⓘ) → turn on **Show in Share Sheet** → Share Sheet Types: **URLs, Safari web pages, Text**.
2. Action **Get URLs from Input** (input: *Shortcut Input*).
3. Action **Ask for Input** → Text, prompt *Why did it catch your eye?* — optional; delete this step if you want zero friction.
4. Action **Get Contents of URL**:
   - URL: `https://api.github.com/repos/Yazan-hub/sentinel-project/issues`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <your token>` · `Accept` = `application/vnd.github+json` · `X-GitHub-Api-Version` = `2022-11-28`
   - Request Body: **JSON**
     - `title` (Text): `💡 ` followed by the *URLs* variable
     - `body` (Text):
       ```
       ### Link
       <URLs>

       ### Where you saw it
       iPhone share sheet

       ### Why it caught your eye
       <Provided Input>
       ```
     - `labels` (Array): one item, Text `inspiration`
5. Action **Show Notification**: *Saved to Sentinel inbox*.

Use: in LinkedIn / Instagram / Safari → Share → *Sentinel inbox*. Done.

**Android — HTTP Shortcuts app** (open source, Play Store / F-Droid). New shortcut *Sentinel inbox*:
- Method POST, URL as above, the same three headers, body type **JSON** with the same fields; use the variable `{{url}}` for the link.
- Variables: add `url` of type *Text*; in the shortcut's **Trigger & Execution → Share Sheet**, set it to receive shared text/URL into `url`. Add an optional `note` variable of type *Text input* if you want the prompt.
- Turn on "Show in share sheet". Use it from LinkedIn / Instagram → Share → *Sentinel inbox*.

A working body template for either platform:

```json
{
  "title": "💡 {{url}}",
  "body": "### Link\n{{url}}\n\n### Where you saw it\nPhone share sheet\n\n### Why it caught your eye\n{{note}}",
  "labels": ["inspiration"]
}
```

> **Permission note.** `/scout` comments on and closes issues through the Claude GitHub App. That app must have access to `sentinel-project` with *Issues: Read and write* (https://github.com/apps/claude/installations/select_target). Verified working 2026-09-16 on issue #1. If it ever returns `403 Resource not accessible by integration`, `/scout` still analyses every open issue and lists the numbers for you to close from the phone.

### B. GitHub app or github.com (no setup)
Repo → Issues → New issue → **💡 Inspiration link**. The form asks for the link, where you saw it, why it caught your eye, and your first instinct. Especially fill in *why* for LinkedIn / Instagram posts — Claude usually cannot open those.

### C. From a keyboard
Append a line to `docs/research/inbox.md` under `## Unprocessed`, or from a terminal:

```bash
curl -sS -X POST https://api.github.com/repos/Yazan-hub/sentinel-project/issues \
  -H "Authorization: Bearer $GITHUB_INBOX_TOKEN" -H "Accept: application/vnd.github+json" \
  -d '{"title":"💡 https://example.com/tool","body":"### Link\nhttps://example.com/tool\n\n### Why it caught your eye\n…","labels":["inspiration"]}'
```

### D. Straight into Claude
From the Claude app or claude.ai/code on your phone, open a Sentinel session and type `/scout <link>`. That skips the inbox entirely for a single link you want to discuss now.

---

## 2. Processing: `/scout`

In any Claude Code session on this repo, run `/scout`. The skill (`.claude/skills/scout/SKILL.md`) will:

1. Collect every open `inspiration` issue, every unprocessed line in `inbox.md`, and any URLs you passed.
2. Fetch each link. LinkedIn and Instagram are usually login-walled; it says so honestly and falls back to your note plus a web search for the tool's name.
3. Analyse it against `ROADMAP.md`, `docs/bim-tools-landscape.md`, the catalog, and the handbook's capability status — relation (`COMPETES / COMPLEMENTS / BUILDING BLOCK / IDEA TO ABSORB / MARKET SIGNAL / NOISE`), where it lands in the landscape, concrete Sentinel actions with effort, and a verdict (`ADOPT / ADAPT / WATCH / IGNORE`).
4. Write one note per link in `notes/` (template: `NOTE_TEMPLATE.md`) and a row in `LEDGER.md`.
5. Comment on and close the issue, move the inbox line to *Processed*, commit and push.
6. Open the brainstorm with you: what should become a spec in `docs/superpowers/specs/` or a roadmap item.

`/scout` never edits `ROADMAP.md`, the handbook or the landscape docs by itself. Those changes are yours to decide in the brainstorm — the notes carry the proposals.

### Running it on a schedule
If you would rather not remember to run it, ask Claude in a session: *"set up a Routine that runs /scout every Friday morning in a fresh session and pushes the notes"*. That uses Claude Code's scheduled Routines and costs a session per run, so it is opt-in.

---

## 3. Folder layout

| Path | What |
|---|---|
| `README.md` | This guide. |
| `inbox.md` | Plain-text drop zone for links pasted at a keyboard. |
| `NOTE_TEMPLATE.md` | The shape of a research note. |
| `LEDGER.md` | One row per processed link, newest first. |
| `notes/` | One note per link, `YYYY-MM-DD-<slug>.md`. |

A note is a record, not a pitch: it states what was actually fetched, what Sentinel actually has (with the handbook's status tags), and what is only a proposal.
