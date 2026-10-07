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
  it("a viewer is read-only; a non-member is told so (W-2 G7); a refused session says so", () => {
    expect(accountLine({ role: "viewer", read: true }, "aster-tower")).toBe("Signed in · read-only on aster-tower");
    expect(accountLine({ role: "not-member", read: true }, "aster-tower")).toBe("Signed in · not a member of aster-tower");
    expect(accountLine({ role: "signed-out", read: true }, "aster-tower")).toBe("Signed in · not accepted by the bridge — sign in again");
  });
  it("an unread role or no open project says only 'Signed in'", () => {
    expect(accountLine({ role: "viewer", read: false }, "aster-tower")).toBe("Signed in");
    expect(accountLine({ role: "lead", read: true }, null)).toBe("Signed in");
    expect(accountLine(null, "aster-tower")).toBe("Signed in");
  });
});
