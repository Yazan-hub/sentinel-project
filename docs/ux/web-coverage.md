# Web coverage: 12 sidebar areas → 5 (UX slice 2, 2026-11-18)

Founder rule: every tool and feature that exists on the web today stays reachable. Nothing is removed. A feature may move,
be renamed, or sit under "More" / "Advanced".

## How this was checked

1. **Feature audit** (workflow `web-coverage-audit`, 58 agents): 10 readers split `WebApp/src`, the bridge API and the
   handbook, each read in full; a second reader per slice listed only what the first missed (252 added). 1,326 features
   after de-duplication, each mapped to one of the five areas; 7 had no clear home, all plumbing (boot waits, query
   parameters, Revit-only bridge routes). Full list: [web-coverage.csv](web-coverage.csv) (id, feature, today, new area,
   new place, kind, what, file:line).
2. **Design** (workflow `web-5-areas-design`, Fable): one designer, one independent critic against all 1,326 rows. The
   critic's fixes were taken (Copilot and Guide reachable with no project open; Next strip on every area; stale
   directions; guarded jumps).
3. **Code guard**: `WebApp/src/nav-coverage.test.ts` fails if any panel of the old wiring is missing from the five areas,
   mounted twice, if the sidebar holds anything but the five areas, or if a jump names a tab that does not exist.
   Checked by removing one panel (Clash): the test failed.

The code moves whole panels. A panel keeps every button, form and option inside it; only its place and tab label change.

## Panel by panel

| Today (12 areas) | Now (5 areas) |
|---|---|
| Projects ▸ hub (all projects) | **Home ▸ Overview** (hub, until a project is opened; "← All projects" and the switcher's "Manage projects…" return to it) |
| Projects ▸ project ▸ Dashboard | **Home ▸ Overview** (the open project's header + Dashboard: lifecycle rail, KPIs, stage gate, My work) |
| Projects ▸ project ▸ Next strip | **Above every area's panel** (Home, Models, Documents, Issues and Settings), once a project is chosen |
| Copilot | **Home ▸ Copilot** |
| Guide | **Home ▸ Guide** |
| — | Home links: **Waiting for approval →** (Documents ▸ Files, where the holding list is) · **Platform deliveries →** (Documents ▸ Folders) |
| BIM Tools ▸ Browser / Properties / Visibility / Views / Sheets | **Models ▸ Browser / Properties / Visibility / Views / Sheets** |
| QA | **Models ▸ Check** |
| Coordination ▸ Clash | **Models ▸ Clash** (groups sent as issues appear in Issues) |
| Explorer (model tree + properties) | **Models ▸ More ▸ Model tree** |
| Data (data table) | **Models ▸ More ▸ Data table** |
| — (platform objects list, in no layout before) | **Models ▸ More ▸ Sections & measurements** (newly reachable) |
| — | Models link: **Open a model →** (Documents ▸ Files, where Open 3D is) |
| Projects ▸ project ▸ Project Files | **Documents ▸ Files** |
| Projects ▸ project ▸ Documents | **Documents ▸ Project documents** |
| Projects ▸ project ▸ Deliverables | **Documents ▸ Delivery plan** |
| BIM Tools ▸ Review (review desk) | **Documents ▸ Proposed changes** |
| Coordination ▸ CDE | **Documents ▸ Folders** |
| Lifecycle ▸ Cost 5D / Carbon 6D / 4D Sequence / COBie 7D / Tender / Owner | **Documents ▸ Reports ▸ Cost / Carbon / Construction sequence / Handover / Tender / Owner view** (always shown) |
| Workspace (full-page document editor, own icon) | **Full-page editor over the app**, opened from Project documents, Delivery plan, My work, the Next strip and the **Document editor →** link (reopens the last document, as the old icon did) |
| Coordination ▸ Issues / RFIs | **Issues ▸ Issues / RFIs** |
| Projects ▸ project ▸ Settings | **Settings ▸ Project** |
| Standards (marketplace) | **Settings ▸ Standards library** |
| Lifecycle ▸ Data feed | **Settings ▸ Advanced ▸ Data feed** |
| BIM Tools ▸ Performance | **Settings ▸ Advanced ▸ Performance** |
| Settings (platform viewer settings) | **Settings ▸ Advanced ▸ Viewer settings** |
| Project switcher, account corner, 3D viewer + toolbar | Unchanged, always on screen |

Directions that named old places were updated: the journey hints (bridge `journey-logic.mjs`, incl. the Revit paths from
slice 1: "Sentinel ▸ More ▸ Project Setup", "Sentinel ▸ Publish"), the Guide (titles, the sidebar tip, its journey list),
the Next strip's install hint, and five messages (`Models ▸ Clash ▸ Run gate`, `Documents ▸ Delivery plan`,
`Documents ▸ Files ▸ Open 3D`, `Documents ▸ Files ▸ Deleted items`), then a sweep of the remaining directions after the
review (Revit "Sentinel ▸ More ▸ …", "the Assets panel" → "Documents ▸ Files ▸ Open 3D", Packs → "Settings ▸ Standards
library", and others). The bridge's journey now names each step's new place ("Documents ▸ Files", "Settings ▸ Project",
…), so the web strip, the Guide and the Revit pane all print it; `main.ts` `JOURNEY_TABS` opens it, and still accepts the
old names from a bridge that has not been restarted.

The Next strip shows only while a project is chosen, as it did inside the project space.

## Decisions taken (the map's open points)

- **Reports** (Lifecycle 4D–7D, Tender, Owner) live in Documents ▸ Reports and are **always shown**: "only when the stage
  is reached" would hide features, against the rule. Only Data feed goes to Settings ▸ Advanced.
- **The document editor** belongs to Documents (it edits the BEP/EIR); what belongs to Home is My work, which opens it.
- **The editor is an overlay**, not a sixth sidebar icon.
- **Sections & measurements** (`<top-objects-panel>`, the platform's list of clip planes and measurements with show,
  hide and delete) was in no layout before; it is now Models ▸ More ▸ Sections & measurements. Founder to confirm: keep
  it (recommended, it only lists what the viewer already made), or take it out again.

## Review (2026-11-18, Fable)

One reviewer read the whole change. Fixed: the strip showed a red "Journey unavailable" above every area with no project
open; the Revit pane printed the old tab names; directions still naming old places; the coverage test did not notice a
dropped group or area root (now it does: checked by removing Settings ▸ Advanced, pointing a jump at the wrong area, and
unmounting Issues — each failed the test); the Check panel shrank inside its tab; the platform's tree and data table were
built at start-up (now on first view, as before).

## Not changed by this slice (and why)

- **The platform file list** (`<top-models-list>`) is still registered and still in no area, as before. It is the only
  way to open a reality-capture `.3tz` scan, so that viewer is unreachable today and stays so. Founder decision owed:
  the list shows every project's files and bypasses the per-project Files path.
- **Four features the handbook describes that have no web screen today** (two-step sign-in, public receipt check, the MCP
  agent interface, the shareable explainer) and **bridge routes only Revit or agents call** were never on the web; nothing
  is lost.
- **Words inside panels** (149 rows with internal words in the inventory) are the next slice: this one renames areas and
  tabs and fixes directions only.
- **Role-based hiding** (map rule 3) needs new code; here rare tools are hidden by depth (More, Advanced, Reports last).
