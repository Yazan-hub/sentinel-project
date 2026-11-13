// R2a row 7: the invitation e-mail already holds a code, so the code form offers "I already have a code" — it shows the
// code box for the typed e-mail without sending a second e-mail (Sentinel's mail service sends a limited number an hour).
import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {} }) }));
const { codeRefusal } = await import("./auth");
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./auth-widget.ts", import.meta.url), "utf8");

describe("Sign in with a code", () => {
  it("before a code is sent the form offers I already have a code; after, Send another code", () => {
    expect(src).toContain('id="sx-have">I already have a code</button>');
    expect(src).toContain('id="sx-again">Send another code</button>');
  });
  it("I already have a code needs the e-mail, shows the code box and sends nothing", () => {
    const handler = src.slice(src.indexOf('q("sx-have")'), src.indexOf("});", src.indexOf('q("sx-have")')));
    expect(handler).toContain('msg = "Enter your email."');
    expect(handler).toContain("codeSent = true");
    expect(handler).not.toMatch(/sendEmailCode|codeSubmit/);
  });
});
describe("the code box names no length", () => {
  it("Supabase sends codes of the project's Email OTP length (8 today), so the box says The code from the e-mail", () => {
    expect(src).toContain("<span>The code from the e-mail</span>");
    expect(src).not.toContain("6-digit");
  });
});
describe("a refused code is explained in words (R2a row 7)", () => {
  it("names the address and what to check; other errors keep their words", () => {
    expect(codeRefusal(" a@firm.com ", "Token has expired or is invalid")).toBe("That code does not work for a@firm.com. Check that this is the address the code was sent to (the back arrow lets you change it) and that you typed the newest code, or send another code.");
    expect(codeRefusal("a@firm.com", "network down")).toBe("network down");
  });
});

