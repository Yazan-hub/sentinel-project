# The account corner — a professional sign-in / account control

Status: approved by the founder 2026-09-29 ("this needs better graphics, more professional"; option A, then "yes, build it").

## Problem

`auth-widget.ts` draws two floating pills at the app's bottom-right — "🔑 Password" and "◕ email · Sign out" — over the
viewer's axis gizmo and toolbar. Emoji icons, clipped text, no menu. The Live plan pill (`live-plan.ts`) sits top-centre
on the project switcher chip.

## Design

1. **Placement** — a 32px avatar fixed to the app's top-right corner (clear of the gizmo and toolbar, and of the
   project chip at top-centre). Signed in: the email's initial on Sentinel purple (#6528d7) with a green presence dot,
   the email as its tooltip. Signed out: a quiet "Sign in" button with a person icon, same spot.
2. **Menu** — a 272px card below the avatar in the app's palette (#16161a, 1px #2c2c34 border, 12px radius, soft
   shadow). Header: a larger avatar, the email (ellipsized), and "Signed in · <role> on <project>" from `myRoleRead`
   (the role the app already reads) — "Signed in" alone when the role was not read, never a guessed role. Items with
   inline line icons (no emoji): Change password; a divider; Sign out of this browser. Escape and a click outside close
   it; arrow keys move through the items; focus returns to the avatar; menu roles for screen readers.
3. **Forms in the same card** — Change password (back arrow, title, labelled fields, the sign-out-others checkbox, one
   primary button, errors in red under the fields; the same `changePassword` logic). Sign in (same shape: email,
   password). A successful change shows a toast under the avatar ("Password changed · other sessions signed out") that
   fades after 6 s.
4. **Live plan pill** — moves down (top ≈ 3rem) so it sits under the project chip, not over it.
5. **Out of scope** — no change to how signing in works (auth.ts) or to the platform's own top bar.

## Tests

Pure helpers unit-tested: `initialOf(email)` and `accountLine(role)`. Live, in the local app: signed in → the avatar;
the menu opens and closes (Escape, outside click); the password form's refusals (no password sent); signed out → Sign
in; a screenshot.
