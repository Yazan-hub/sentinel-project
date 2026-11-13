// R2a row 7: the invitation e-mail already holds a code, so the code form offers "I already have a code" — it shows the
// code box for the typed e-mail without sending a second e-mail (Sentinel's mail service sends two an hour).
import { describe, it, expect } from "vitest";
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
