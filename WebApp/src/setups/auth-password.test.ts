// Change password: the current password is checked first; a refusal changes nothing and says why; "sign out my other
// sessions" ends the account's other sessions (other browsers, Revit) — never this one.
import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {} }) }));
const { changePassword, passwordProblem } = await import("./auth");

const fakeAuth = (o: { email?: string | null; life?: number | null; checkFails?: string; updateFails?: string; signOutFails?: string; signOutThrows?: boolean } = {}) => ({
  getSession: vi.fn(async () => ({ data: { session: o.email === null ? null : { user: { email: o.email ?? "a@firm.com" } } }, error: null })),
  signInWithPassword: vi.fn(async () => (o.checkFails ? { data: {}, error: { message: o.checkFails } } : { data: { session: o.life === null ? null : { expires_in: o.life ?? 3600 } }, error: null })),
  updateUser: vi.fn(async () => ({ data: {}, error: o.updateFails ? { message: o.updateFails } : null })),
  signOut: vi.fn(async () => { if (o.signOutThrows) throw new Error("offline"); return { error: o.signOutFails ? { message: o.signOutFails } : null }; }),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (auth: ReturnType<typeof fakeAuth>, others = true, cur = "old-pass-1", next = "new-pass-12") => changePassword(cur, next, others, auth as any);

describe("passwordProblem", () => {
  it("names the first thing wrong, in words; null when the change may be asked", () => {
    expect(passwordProblem("", "new-pass-12", "new-pass-12")).toBe("Type your current password.");
    expect(passwordProblem("old", "short", "short")).toBe("The new password needs at least 8 characters.");
    expect(passwordProblem("old", "new-pass-12", "new-pass-13")).toBe("The two new passwords are not the same.");
    expect(passwordProblem("same-pass-1", "same-pass-1", "same-pass-1")).toBe("The new password is the same as the current one.");
    expect(passwordProblem("old", "new-pass-12", "new-pass-12")).toBeNull();
  });
});

describe("changePassword", () => {
  it("checks the current password, sets the new one, then signs out the OTHER sessions only", async () => {
    const auth = fakeAuth();
    expect(await run(auth)).toEqual({ ok: true, message: "Password changed. Your other sessions (other browsers, Sentinel in Revit) are signed out — each stops within 60 minutes." });
    // No lifetime in the answer: nothing is claimed about when.
    expect((await run(fakeAuth({ life: null }))).message).toMatch(/each stops at its next token refresh\.$/);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@firm.com", password: "old-pass-1" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-pass-12" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("keeps the other sessions when asked to", async () => {
    const auth = fakeAuth();
    expect((await run(auth, false)).message).toBe("Password changed. Your other sessions stay signed in.");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("a wrong current password changes nothing", async () => {
    const auth = fakeAuth({ checkFails: "Invalid login credentials" });
    expect(await run(auth)).toEqual({ ok: false, message: "The current password was not accepted (Invalid login credentials) — nothing was changed." });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("a new password the server refuses changes nothing; signed out, nothing is asked", async () => {
    const refused = fakeAuth({ updateFails: "Password is known to be weak" });
    expect(await run(refused)).toEqual({ ok: false, message: "The new password was refused: Password is known to be weak — nothing was changed." });
    expect(refused.signOut).not.toHaveBeenCalled();
    const out = fakeAuth({ email: null });
    expect((await run(out)).message).toBe("Not signed in — sign in first; nothing was changed.");
    expect(out.signInWithPassword).not.toHaveBeenCalled();
  });

  it("the change stands when signing the others out fails — said, never 'not changed'", async () => {
    expect(await run(fakeAuth({ signOutFails: "rate limited" }))).toEqual({ ok: true, message: "Password changed — but your other sessions were not signed out: rate limited." });
    expect(await run(fakeAuth({ signOutThrows: true }))).toEqual({ ok: true, message: "Password changed — but your other sessions were not signed out: offline." });
  });

  it("a problem found before asking asks nobody", async () => {
    const auth = fakeAuth();
    expect((await run(auth, true, "old-pass-1", "short")).ok).toBe(false);
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});
