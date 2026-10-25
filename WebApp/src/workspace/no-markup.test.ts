import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// Every non-test .ts under src/workspace/, recursive, "/"-separated.
const root = new URL("./", import.meta.url);
const files = readdirSync(root, { recursive: true })
  .map((f) => String(f).replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const hits = (re: RegExp): string[] =>
  files.flatMap((f) => readFileSync(new URL(f, root), "utf8").split(/\r?\n/).flatMap((line, n) => (re.test(line) ? [`${f}:${n + 1}`] : [])));

describe("src/workspace builds DOM only (spec section 12: document text never reaches innerHTML)", () => {
  it("scans the workspace", () => expect(files).toContain("workspace-page.ts"));
  // `\bdocument\.write`, not a bare `.write(`: the controller's own `ws.write(...)` is not a sink.
  it("no markup sink", () => expect(hits(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|\bdocument\.write(ln)?\(|createContextualFragment|DOMParser/)).toEqual([]));
  it("no browser modal and no in-frame print (the published sandbox has no allow-modals)", () =>
    expect(hits(/(^|[^.\w])(prompt|confirm|alert)\(|window\.(prompt|confirm|alert|print)\(/)).toEqual([]));
});
