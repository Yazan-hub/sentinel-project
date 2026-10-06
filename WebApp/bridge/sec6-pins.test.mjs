// SEC-6: hardenings outside the stores, pinned by their text (source pins read files with CRLF normalised).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r/g, "");

describe("SEC-6 one-liners", () => {
  it("S27: the bridge's default origins are the platform's and this PC's app ports — no vite dev server (the app runs in the platform's frame)", () => {
    const src = read("./bcf-service.mjs");
    const at = src.indexOf("const DEFAULT_CORS = [");
    const list = src.slice(at, src.indexOf("];", at));
    expect(list).toContain('"https://platform.thatopen.com"');
    expect(list).not.toContain("5173");
  });

  it("S21: the template names the upload floor and its grace, commented out at their defaults", () => {
    const t = read("../../config/.env.template");
    expect(t).toMatch(/^# BCF_MIN_UPLOAD_KBPS=16$/m);
    expect(t).toMatch(/^# BCF_UPLOAD_GRACE_S=120$/m);
    expect(t).toMatch(/^# An empty or 0 value keeps the default: the floor is never off, 1 is its lowest\.$/m); // review C16
  });
});
