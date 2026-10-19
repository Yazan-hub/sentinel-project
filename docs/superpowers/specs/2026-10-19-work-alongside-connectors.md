# Work-alongside connectors: BCF round trip + no-toll data feed

Date: 2026-10-19 · Source: `docs/strategy/2026-10-19-sentinel-technical-market-evaluation.md` §3.6 item 8, §5 (Connectors).
Founder decision Q2: work alongside ACC now. Models stay in ACC; approvals, gates and the record stay in Sentinel.
Founder decisions in this session: the feed signs in with a **personal feed key over HTTP Basic**; the buildingSMART
BCF-XML sample files may be downloaded as fixtures.

## 1 · BCF round trip (files only, no Autodesk cloud API)

**Today.** Sentinel serves BCF-API 3.0 + openCDE (`bcf-open.mjs`). The only file path is Revit's per-issue BCF 2.1 export
(`Engine/BcfExporter.cs`). There is no `.bcfzip` import anywhere and no web export. Topics are stored whole in
`bcf_topics.data` (jsonb), or in the local `bcf-store.json` when the CDE is off.

**Build.**
- `WebApp/bridge/bcf-xml.mjs` (pure): `readBcfZip(bytes) → { version, project, topics[], files }` and
  `writeBcfZip(topics, { version: "2.1" | "3.0" }) → bytes`. It reads BCF-XML 2.1 and 3.0 (a 2.0 file is refused in words:
  2.0's shapes differ enough that a half read would lose data silently) and writes 2.1 and 3.0, each to its own XSD (what a
  version requires and a topic lacks is filled: 2.1 Visibility, 3.0 AspectRatio/TopicType/TopicStatus/Title; a 3.0 viewpoint
  without a camera keeps its snapshot only, and the export says so). A snapshot is stored as a data URL, related topics as GUIDs —
  the store's own shapes.
  Topics use the BCF-API JSON shape Sentinel already stores (`guid`, `topic_type`, `topic_status`, `title`, `priority`,
  `labels`, `comments[]`, `viewpoints[]`, …) plus the fields BCF-XML has and the API has not (header files, BIM snippet,
  document references, bitmaps, viewpoint index). Embedded files (snapshots, bitmaps, internal documents, snippets) travel
  as base64. An XML element the reader does not know is kept as an XML node and written back in place, so extension
  content is not dropped.
- Zip: `fflate`. XML: `fast-xml-parser` (both already installed transitively, now pinned as direct dependencies).
- Routes (contributor to import, member to export):
  - `POST /bcf/3.0/projects/:pid/import` with the file as the body → `{ created, updated, topics:[guid], skipped:[{guid, why}] }`.
    A topic GUID that already exists in the project is merged: new comments and viewpoints (by GUID) are added and the
    newer field values win (by `modified_date`). A GUID that belongs to another project is skipped (topic GUIDs are
    global). A governed topic (IDS, review, federation) keeps the lead rule: an import cannot close or rename it unless the
    caller is a lead.
  - `GET /bcf/3.0/projects/:pid/export?version=2.1|3.0[&status=all]` → `<pid>.bcfzip`. Default `2.1`, because ACC's
    Issues BCF import takes 2.1. BIMcollab reads both.
- Sentinel-only fields (`history`, `resolved_by_version`, `project_id`, `model`) are not written into the file: other
  tools treat unknown elements unreliably. They stay in Sentinel, and a re-import merges by GUID so they are kept.

**Loss checks (tests).**
1. *Same-version round trip, XML level.* For every buildingSMART sample (v2.1 and v3.0, zipped `.bcf`), import → export in
   the same version → compare the two XML trees file by file (markup, viewpoints, project, version, documents), ignoring
   whitespace, attribute order, comments, namespace declarations and number spelling (`10.0` = `10`). Binary files are
   compared byte for byte. Any difference fails with the path of the missing node.
2. *Model level.* `read(write(read(x)))` deep-equals `read(x)` for each sample.
3. *GUIDs.* Topic, comment and viewpoint GUIDs, and every component `IfcGuid`, survive both versions.
4. *Cross-version.* 2.1 → 3.0 → 2.1 keeps title, status, type, priority, labels, assignee, dates, description, comments
   (text, author, date, viewpoint link), viewpoints (camera, components, colouring, clipping, lines), snapshots and related
   topics. What does not map between versions is listed in the export reply, never silently dropped.
5. *Store round trip.* Import into the store, export, compare (catches store-side loss).
6. *Real files.* A BIMcollab and an ACC export, when the founder provides them, go through 1–5 as well.

Fixtures: the zipped `.bcf` files from `buildingSMART/BCF-XML` `Test Cases/v2.1` and `v3.0` (commit `bc48611`),
unmodified, under `WebApp/bridge/fixtures/bcf-xml/` with the CC BY-ND 4.0 notice.

**For ACC (no ACC account to test with — built to Autodesk's documented import rules).** No ACC/BIM 360 BCF export is published
anywhere public (web, open-source BCF libraries, GitHub code search, 2026-10-20), and the founder has no ACC export to give. So
"for ACC" follows Autodesk Build help ("Import Issues from BCF File", "About BCF File Format"): `GET …/export?for=acc` writes BCF
2.1 in which every issue has a status, a type and a title (ACC rejects a file with missing status information), and at most
**100 issues a file** (ACC's import limit; `&part=k`, the screens fetch every part: `<pid>-for-acc-1-of-3.bcfzip`, …). On import
ACC opens every issue that is not closed and asks for a default assignee — Sentinel's statuses beyond Open/Closed arrive as Open.
A real ACC import stays owed to whoever has ACC.

**Screens.**
- Web, Coordination ▸ Issues: "Import BCF…" (a file picker) and "Export BCF" with a choice "for ACC (2.1)" / "BCF 3.0".
  The import result is shown in words (created, updated, skipped and why).
- Revit, BCF Issues window: the same two buttons. They use the Windows open/save dialogs and send the bytes to the bridge,
  so there is one reader and writer.

## 2 · No-toll data feed

**Routes** (outside the bearer gate; their own check):
- `GET /feed/:key/elements.csv?rev=latest|<rev_code>|<revision id>`: one row per element of that revision —
  `revision, revision_date, guid, category, type_name, count, length, area, volume, weight`. With `rev=latest` (the default)
  the URL stays the same as new revisions arrive, so a Power BI refresh picks up the newest take-off.
- `GET /feed/:key/elements.json`: the same rows as JSON. `GET /feed/:key/revisions.csv`: the revision list.
- CSV is RFC 4180, UTF-8 with BOM (Excel opens it as UTF-8); cells that start with `= + - @` get a leading `'` (CSV injection).

**Sign-in (founder's choice: feed key over Basic).**
- A signed-in user makes a personal feed key on the Data feed screen. It is shown once, stored only as its SHA-256, and can
  be revoked. Power BI / Excel use **Basic**: user name = anything (the email), password = the key. The key is never in the
  URL. The machine credential is refused on the feed routes. (A sign-in JWT is not accepted there: it expires hourly, and
  scripts can use a feed key too.) Keys are made, listed and revoked at `/feed/keys` by a signed-in person only.
- Migration `0044_feed_keys.sql`: table `feed_keys (id, user_id, key_hash unique, label, created_at, last_used_at,
  revoked_at)`; RLS: a user reads, inserts and revokes only their own rows. Function `feed_rows(key_hash, project_key, rev)`
  (security definer, executable by `anon`): resolves a live key to its user, checks that user is a member of the project, and
  returns that revision's rows. The bridge calls it with the anon key, so membership is enforced in the database, not in
  bridge code. Removing a member stops their feed at the next refresh.
- Rate limit: 60 requests a minute per key, 600 a minute in all (the limiter the public receipt check uses).

**Built as:** `bridge/feed.mjs` (routes, Basic, CSV), `cde-store.mjs` `feedRpc` (anon key), `db/migrations/0044_feed_keys.sql`,
`src/setups/data-feed-panel.ts` (Lifecycle ▸ Data feed).

**Two-office isolation.** The suite gains: office B's key returns nothing for office A's project; a revoked key returns
nothing; a removed member's key returns nothing; user A cannot read or revoke user B's keys. `feed_keys` is user-scoped, so
it joins the suite's list with that reason.

**Screen.** Web "Data feed" (project menu): the feed URLs with Copy buttons, "Make my feed key" (shown once, with Copy), my
keys with Revoke, and plain steps for Power BI Desktop (Get data ▸ Web ▸ Basic) and Excel (Data ▸ From Web ▸ Basic).
How-to: `docs/data-feed-power-bi.md`.

## Drills
- BCF: a real BIMcollab or ACC export from the founder: import → export → re-import into the source tool where possible.
- Feed: Power BI Desktop on this PC reads `elements.csv` through the Funnel with a feed key; a refresh after a new revision
  shows the new rows; a revoked key fails the refresh.
