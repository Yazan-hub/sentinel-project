// Switching accounts must reload what every panel shows (roles, review controls, members), but a token refresh — the
// same person, a new JWT every hour — must not, and neither must the first session the app restores at start.
import { describe, it, expect } from "vitest";
import { userChangeFilter } from "./user-change";

const as = (id: string) => ({ user: { id } });

describe("userChangeFilter", () => {
  it("records the session the app starts with without calling it a change", () => {
    expect(userChangeFilter()(as("hotmail"))).toBe(false);
    expect(userChangeFilter()(null)).toBe(false);
  });

  it("is a change when the person changes — another account, a sign-out, a sign-in", () => {
    const changed = userChangeFilter();
    changed(as("hotmail"));
    expect(changed(as("gmail"))).toBe(true);  // another account
    expect(changed(null)).toBe(true);         // signed out
    expect(changed(as("gmail"))).toBe(true);  // signed back in
  });

  it("is no change for the same person again (a token refresh, a user update)", () => {
    const changed = userChangeFilter();
    changed(as("hotmail"));
    expect(changed(as("hotmail"))).toBe(false);
    expect(changed(as("hotmail"))).toBe(false);
    changed(null);
    expect(changed(null)).toBe(false);
  });
});
