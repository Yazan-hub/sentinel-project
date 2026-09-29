# Account corner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two floating pills bottom-right with a professional avatar menu in the app's top-right corner, and move the Live plan pill off the project chip.

**Architecture:** One plain-DOM widget (`auth-widget.ts`) with a small view state machine (closed · menu · password · signin) and one injected stylesheet; the words it shows come from a pure helper module (`account-line.ts`) with unit tests. Auth logic is unchanged (`auth.ts`).

**Tech Stack:** TypeScript, plain DOM, vitest, Supabase auth via `auth.ts`.

## Global Constraints

- Placement: fixed to the app's top-right corner (`top:.6rem; right:.6rem`), 32px avatar.
- Palette: card `#16161a`, border `#2c2c34`, radius 12px, accent `#6528d7`, text `#e5e7eb`, muted `#9ca3af`, danger `#f87171`, success `#34d399`.
- No emoji icons: inline SVG line icons.
- Header line: "Signed in · <role> on <project>" only when the role was read and a project is open; "read-only" for a viewer; "Signed in" alone otherwise — never a guessed role.
- Escape and an outside click close the menu; arrow keys move through items; focus returns to the avatar.
- The toast after a password change fades after 6 s.
- Live plan pill: `top: 3rem` (under the project chip).

---

### Task 1: The words — `account-line.ts`

**Files:**
- Create: `WebApp/src/setups/account-line.ts`
- Test: `WebApp/src/setups/account-line.test.ts`

**Interfaces:**
- Produces: `initialOf(email: string | null | undefined): string`; `accountLine(r: { role: string; read: boolean } | null, projectKey: string | null): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { initialOf, accountLine } from "./account-line";

describe("initialOf", () => {
  it("the email's first character, upper-cased; ? when there is none", () => {
    expect(initialOf("yazan@firm.com")).toBe("Y");
    expect(initialOf("  bob@x.io")).toBe("B");
    expect(initialOf("")).toBe("?");
    expect(initialOf(null)).toBe("?");
  });
});

describe("accountLine — the role only when it was read, never a guess", () => {
  it("names the role and the open project", () => {
    expect(accountLine({ role: "lead", read: true }, "aster-tower")).toBe("Signed in · lead on aster-tower");
  });
  it("a viewer (or a non-member — the bridge answers both the same) is read-only", () => {
    expect(accountLine({ role: "viewer", read: true }, "aster-tower")).toBe("Signed in · read-only on aster-tower");
  });
  it("an unread role or no open project says only 'Signed in'", () => {
    expect(accountLine({ role: "viewer", read: false }, "aster-tower")).toBe("Signed in");
    expect(accountLine({ role: "lead", read: true }, null)).toBe("Signed in");
    expect(accountLine(null, "aster-tower")).toBe("Signed in");
  });
});
```

- [ ] **Step 2: Run it — expect a failure (module not found)**

Run: `npx vitest run src/setups/account-line.test.ts` (from `WebApp/`)

- [ ] **Step 3: Implement**

```ts
// The account corner's words (spec 2026-09-29 account-corner): the avatar's initial and the menu header's one line —
// the role only when it was read (myRoleRead), never a guessed one.

/** The email's first character, upper-cased; "?" when there is none. */
export const initialOf = (email: string | null | undefined): string => {
  const c = (email ?? "").trim().charAt(0);
  return c ? c.toUpperCase() : "?";
};

/** "Signed in · lead on aster-tower"; a viewer — or a non-member, which the bridge answers the same — is "read-only";
 *  an unread role or no open project is "Signed in" alone. */
export function accountLine(r: { role: string; read: boolean } | null, projectKey: string | null): string {
  if (!r || !r.read || !projectKey) return "Signed in";
  return `Signed in · ${r.role === "viewer" ? "read-only" : r.role} on ${projectKey}`;
}
```

- [ ] **Step 4: Run it — expect PASS (5 tests)**
- [ ] **Step 5: Commit** `feat(web): the account corner's words — initial and role line, never a guessed role`

### Task 2: The widget and the Live plan pill

**Files:**
- Modify (rewrite): `WebApp/src/setups/auth-widget.ts`
- Modify: `WebApp/src/setups/live-plan.ts` (the pill's `top`)

**Interfaces:**
- Consumes: `initialOf`, `accountLine` (Task 1); `currentSession, signInWithPassword, signOut, onAuthChange, changePassword, passwordProblem, MIN_PASSWORD` (`./auth`); `myRoleRead` (`./my-role`); `activePid, hasProjectOverride` (`./active-project`); `SERVICE_URL` (`../config`).
- Produces: `authWidget(opts?: { anchor?: string }): HTMLElement` — same export, same mount (`main.ts`).

- [ ] **Step 1: Rewrite `auth-widget.ts`** — the file as committed (views closed · menu · password · signin; one injected `<style id="sx-acct-style">`; inline SVG icons; the same auth-event rules as before: a sign-in or sign-out clears ✕-dismissal; a same-person event never rebuilds an open card; `sentinel:signin-needed` opens the sign-in card unless dismissed).
- [ ] **Step 2: Live plan pill** — in `showPill`, `top:.6rem` → `top:3rem`.
- [ ] **Step 3: Type-check and the suite** — `npx tsc --noEmit -p .` stays at the baseline (17); `npx vitest run` all pass.
- [ ] **Step 4: Live check (local app, signed in)** — the avatar top-right; the menu opens with the role line; Escape and an outside click close it; Change password shows the form and refuses an empty current password in words (nothing sent); a screenshot. Then the published app signed out: the Sign in button and its card.
- [ ] **Step 5: Commit, merge, publish 1.0.37.**
