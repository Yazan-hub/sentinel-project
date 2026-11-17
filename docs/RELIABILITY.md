# Running Sentinel reliably on the bridge PC

Date 2026-11-16. Recommendation 2 of `docs/strategy/2026-11-16-sentinel-full-picture-ar.html`.

Today the bridge, the outbox watcher and the files they keep live on one PC, reached through a Tailscale Funnel. In the
P0 run (`docs/testing/snowdon-lifecycle/P0/P0-RUN_2026-10-22.md`) the bridge stopped twice and the Funnel stayed down
for hours. Hosting the bridge elsewhere waits for the founder's decision (the 2026-10-19 answer: after Sentinel is
published). Until then, this page makes the PC as dependable as a PC can be.

**Status: written 2026-11-16 in a cloud session that cannot run PowerShell. Steps A1 and A2 passed on the bridge PC on 2026-11-17
(`keeper started`, nothing to repair; the Startup shortcut made, one keeper process running). B is owed.**

## A. Keep the bridge up: the keeper

`tools/sentinel-keeper.ps1` checks every minute and repairs what it can:

| It sees | It does |
|---|---|
| No bridge process | Starts `bridge/bcf-service.mjs` hidden, waits up to a minute for `/health`, then refreshes the Funnel |
| A bridge process that has not answered `/health` for three checks in a row | Stops it and starts a fresh one (three checks, because a big IFC can block the bridge for a while) |
| No outbox watcher | Starts `bridge/watch-outbox.mjs` hidden |
| The public address fails three checks in a row while the bridge answers locally | `tailscale funnel reset` and `tailscale funnel --bg 4100`, at most once every 15 minutes |

Logs: `%APPDATA%\Sentinel\logs\keeper.log` (what the keeper did), `bridge.log` and `watcher.log` (their output). A
bridge you start yourself with `tools\bridge-start.cmd` is left alone while it answers. Only one keeper runs per
signed-in user.

1. **First run by hand:** `powershell -ExecutionPolicy Bypass -File tools\sentinel-keeper.ps1 -Once`. Check that
   `keeper.log` says what it found, and that `http://127.0.0.1:4100/health` and the Funnel address both answer.
2. **At every sign-in:** `tools\keeper-install.cmd` puts a "Sentinel keeper" shortcut in your Startup folder (no
   administrator needed; a scheduled task was dropped on 2026-11-17 because Windows refuses it without one). Remove it
   with `tools\keeper-uninstall.cmd`. Run the keeper only from the main checkout, never from a `.claude\worktrees\…`
   copy: a keeper started there would start that copy's bridge, which has no `config\.env`.
3. **Drill:** close the bridge (Task Manager, the `node` process with `bcf-service.mjs`). Within about two minutes
   `keeper.log` says it started the bridge again and refreshed the Funnel; the published app works again after a
   reload.
4. **Power:** Settings ▸ System ▸ Power ▸ Sleep: Never when plugged in. A sleeping PC is a stopped bridge.

## B. Backups

`tools/sentinel-backup.ps1` backs up the two things that would be lost with this PC or with the database:

| What | Where it is | How it is backed up |
|---|---|---|
| Files the bridge keeps: CDE files, document files, evidence, sheets, views, outbox | `%APPDATA%\Sentinel` | `robocopy` into `<Destination>\files`, new and changed files only, never deleting there |
| The database: projects, members, documents, deliverables, the ledger | Supabase (free plan: no backups you can download) | `pg_dump` into `<Destination>\db\sentinel-<date>.dump`, the newest 14 kept |
| Keys (`config\.env (the repository root)`) | This PC | Not copied. Keep them in a password manager |

Steps:

1. **B1. pg_dump.** Install PostgreSQL 17 command line tools (the EDB installer, tick only "Command Line Tools"), and
   add `C:\Program Files\PostgreSQL\17\bin` to PATH. Check: `pg_dump --version`.
2. **B2. The connection string.** Supabase dashboard ▸ the project ▸ Connect ▸ Session pooler. Then, once:
   `setx SENTINEL_BACKUP_DB_URL "postgresql://…"` (it holds the database password; it stays in your Windows user
   settings, never in the repository or the backup folder).
3. **B3. Where to.** The default is `%USERPROFILE%\SentinelBackups`. A folder synced by OneDrive or on an external
   drive survives the PC: pass `-Destination`.
4. **B4. Daily:** `tools\backup-install.cmd` (a scheduled task "Sentinel backup" at 21:10, and one run now). Check
   `backup.log`: both "files:" and "database:" lines, no "skipped".
5. **B5. Restore drill, once a quarter.** A backup is a test, not a hope. Restore the newest dump into a scratch
   database (a new free Supabase project, or a local PostgreSQL 17):
   `pg_restore --no-owner --no-privileges --dbname=<scratch url> sentinel-<date>.dump`, then compare
   `select count(*) from audit_log` with the live project. Record the result in this file.

## C. The PC itself

- **Disk encryption.** The CDE files sit on this disk as plain files. Windows 11 Pro: BitLocker (Control Panel ▸
  BitLocker Drive Encryption ▸ Turn on); Windows 11 Home: Settings ▸ Privacy & security ▸ Device encryption. Save the
  recovery key outside this PC. Check: `manage-bde -status` in an administrator terminal.
- A Windows sign-in password and automatic screen lock.
- Windows Update on; Node.js LTS kept current.

## D. Accounts

- **Two-step sign-in for leads and owners: not built.** Supabase's TOTP factor is free, but a factor protects nothing
  until the bridge refuses a lead's write without it, and then Revit's sign-in must ask for the code too (web, bridge
  and the add-in, with a live drill on the four test accounts). It is the first build after the lifecycle freeze
  (P1 to P4), before anyone outside the test accounts gets a lead or owner role.
- **Leaked-password protection:** Supabase Pro only. Accepted while sign-up is by invitation (`docs/handbook/07-decisions.md`
  D-12). Revisit when the platform opening brings people you did not invite.

## E. When the PC is no longer enough

Move the bridge to a host (`docs/superpowers/specs/2026-09-27-hosted-bridge-design.md`) when either happens first: a
person outside the four test accounts depends on Sentinel for daily work, or the That Open opening sends users to the
Delivery Gate. The pen test moves with hosting, so it tests the hosted version (the 2026-10-19 answer 3).
