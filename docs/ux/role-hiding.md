# Role hiding on the web (UX slice 6)

Simplification map rule 4: "Role hides what isn't yours." Hiding is a view choice. Nothing is deleted and nothing
becomes unreachable. Sentinel still checks every permission itself; hiding only tidies the tab bars.

## What each role hides

| Role (web) | Person | Hidden tabs | Why |
|---|---|---|---|
| owner, lead | BIM manager | nothing | Everything is theirs. |
| contributor | Modeller | Settings ▸ Project | Read-only below lead: setting up the project is the BIM manager's. |
| | | Settings ▸ Standards library | Installing standards is a lead's or owner's work; Sentinel refuses it below lead. |
| | | Documents ▸ Reports ▸ Tender | Commercial work, not modelling. |
| | | Documents ▸ Reports ▸ Owner view | For the client, not the modeller. |
| viewer | Reviewer | Documents ▸ Proposed changes | Accepting or declining a change is a contributor's or above. |
| | | Settings ▸ Project | Read-only below lead. |
| | | Settings ▸ Standards library | Installing standards is a lead's or owner's work. |

Nothing is hidden when the role is not known: no project chosen, signed out, not a member, or Sentinel's server not
answering. The table lives in `WebApp/src/setups/role-view.ts` (one place to change it).

## The switch

**Settings ▸ "Show all tools"** (a tick box at the right of the Settings tab bar). No role hides that bar. When tabs are
hidden it says how many, e.g. "Show all tools (4 hidden for your role)". Ticked, every tab comes back. The choice is
remembered per person in this browser.

## Opening a hidden tab

A jump to a hidden tab (the Next strip, a "→" link, a Home card) still opens it. Its button comes back for that visit,
with a dashed border and a tooltip saying why it is normally hidden, and goes away again when another tab is picked.
A hidden tab never leaves an area blank.

## What is not changed

- Whole tabs only. Nothing inside a panel changed.
- No area is ever hidden; Home, Models, Documents, Issues and Settings are always in the sidebar.
- Every panel stays mounted; `src/nav-coverage.test.ts` checks this, that every tab in the table exists, and that no
  role empties an area or a tab group.
- The Revit add-in is not changed.
