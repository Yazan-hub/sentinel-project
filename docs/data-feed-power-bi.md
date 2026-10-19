# Sentinel data feed: your model quantities in Power BI and Excel

Sentinel keeps every model revision's element quantities (IFC GUID, category, type, count, length, area, volume, weight). The
data feed gives them to Power BI and Excel at a fixed web address that refreshes. The data comes from Sentinel, not from
Autodesk's cloud, so Autodesk's data-out charge (since 6 October 2026) does not apply.

## 1 · Make your feed key (once)

1. In the Sentinel web app, open your project, then **Lifecycle ▸ Data feed**.
2. Under **2 · Your feed key**, type what it is for (for example "Power BI on my laptop") and press **Make a feed key**.
3. Press **Copy** next to the key and keep it somewhere safe, such as your password manager. **It is shown once.**

The key is yours. It reads only the projects you are a member of. If you leave a project, your key stops reading that
project at the next refresh. If you lose the key, revoke it on the same screen and make a new one.

## 2 · Power BI Desktop

1. On the Data feed screen, press **Copy** next to **Elements, newest revision (CSV)**.
2. In Power BI Desktop: **Home ▸ Get data ▸ Web**. Paste the address, press **OK**.
3. In the sign-in window choose **Basic**. **User name:** your email. **Password:** your feed key.
   Apply the setting to the address shown, then press **Connect**.
4. Press **Load**, or **Transform data** to shape the table first.
5. To get the newest revision later, press **Home ▸ Refresh**.

**Windows with a decimal comma** (German, French, Czech…): the quantities use a decimal point. Choose **Transform data**,
select `count, length, area, volume, weight`, then **Change type ▸ Using locale… ▸ Decimal number, English (United States)**.
(Or once for the file: **File ▸ Options and settings ▸ Options ▸ Current file ▸ Regional settings ▸ English (United States)**.)

## 3 · Excel

1. **Data ▸ From Web**. Paste the same address, press **OK**.
2. Choose **Basic**: your email and your feed key. Press **Connect**, then **Load**.
3. **Data ▸ Refresh All** gets the newest revision.
4. With a decimal comma in Windows, use **Transform Data** and the same **Using locale…** step as in Power BI.

## The addresses

| Address | What it gives |
|---|---|
| `…/feed/<project>/elements.csv` | The newest complete revision's elements. A refresh picks up a new revision. |
| `…/feed/<project>/elements.csv?rev=P02` | One fixed revision (its revision code). |
| `…/feed/<project>/revisions.csv` | Every revision: id, code, date, who uploaded it, element count. |
| `…/feed/<project>/elements.json` | The newest revision's elements as JSON, for scripts. |

Columns: `revision, revision_date, guid, category, type_name, count, length, area, volume, weight`. Quantities are in the
take-off's units. A text cell that a spreadsheet would read as a formula starts with `'`.

## When a refresh fails

| Power BI / Excel says | Why | What to do |
|---|---|---|
| The sign-in failed / 401 | The key was revoked or mistyped | Make a new key. Power BI: **File ▸ Options and settings ▸ Data source settings**, select the address, **Edit Permissions… ▸ Credentials: Edit…**. Excel: **Data ▸ Get Data ▸ Data Source Settings…** |
| Not found / 404 | `?rev=` names a revision this project does not have | Open `revisions.csv` for the codes |
| Access forbidden / 403 | You are not a member of this project, or the project name in the address is wrong | Ask the project lead to add you, or copy the address again |
| Too many requests / 429 | More than 60 reads in a minute with one key | Wait a minute and refresh again |
| Cannot connect | The Sentinel bridge is offline | Try again later, or tell your Sentinel admin |

## For the admin

- The feed is served by the Sentinel bridge at `GET /feed/<project>/…` and signs in with HTTP Basic (the password is the feed key).
  The machine credential is refused there.
- Keys are stored only as their SHA-256 hash (`feed_keys`, migration 0044). The key check and the membership check run in
  the database (`feed_rows`, `feed_revisions`), so the two-office isolation suite covers the feed.
- Limits: 60 reads a minute per key, 600 a minute in total.
