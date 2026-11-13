// F-R2a-4 (2026-11-13): an invitation saved but not mailed shows as a warning in plain words (the bridge sends `sent: false` and
// keeps the mail service's JSON in its log), and the Members note names no hourly number that custom mail made stale.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MAIL_NOTE } from "./members-people";

const panel = readFileSync(new URL("./project-settings-panel.ts", import.meta.url), "utf8");

describe("invitation mail on the Members screen", () => {
  it("the note names no hourly number", () => {
    expect(MAIL_NOTE).toBe("Invitations go out as a sign-in code by e-mail. Sentinel's mail service sends a limited number of e-mails an hour, so a code can take a while; Resend sends another.");
  });
  it("Send invitation and Resend both show a not-sent answer as a warning, never the good-news green", () => {
    expect(panel.match(/told\(j\)/g)?.length).toBe(2);
    expect(panel).toContain('if (j.sent === false) { memberErr(t); if (membersErrDiv) membersErrDiv.style.color = "#fbbf24"; } else said(t);');
  });
});
