// The web signs out of THIS browser only (H4, spec 2026-09-28 Decision 7): the default scope revokes every session of
// the account, including a Revit signed in as the same person.
import { describe, it, expect, vi } from "vitest";

const signOut = vi.fn(async () => ({ error: null }));
const clientOptions: unknown[] = [];
vi.mock("@supabase/supabase-js", () => ({ createClient: (_u: string, _k: string, o: unknown) => { clientOptions.push(o); return { auth: { signOut } }; } }));

describe("signOut", () => {
  it("passes scope 'local' so other devices — a Revit session — stay signed in", async () => {
    const { signOut: webSignOut } = await import("./auth");
    await webSignOut();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("SEC-5 (S38): the client reads no session out of the page's URL — the sign-in is a code or a password", async () => {
    const { supabase } = await import("./auth");
    supabase();
    expect(clientOptions[0]).toMatchObject({ auth: { detectSessionInUrl: false } });
  });
});
