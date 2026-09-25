// Writes the canonical() fixture the add-in's C# port is checked against (tools/ruleset-install-check): each
// case is a raw JSON text, the bridge's canonical form of JSON.parse(raw) and its sha256. Deterministic, so a
// rewrite leaves no diff unless canonical() itself changed — and then the C# check fails until it is ported.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonical } from "./artefact-store.mjs";

const RAW = [
  '{"b":1,"a":[3,2,{"d":null,"c":true}],"B":false,"_":{}}',
  '{"é":"ü","Z":"\\"quoted\\" back\\\\slash","tab":"a\\tb\\nc\\r\\u0001\\u001f","slash":"a/b<c>&"}',
  '{"n":[0,-0,1.0,1.5,-3,100,1e2,0.1,1e21,1e-7,123456789012345678901,2.5e-3]}',
  '{"arabic":"مجموعة العمل \'{name}\' غير مدرجة","sect":"§4 …","emoji":"\\ud83d\\ude00"}',
  '[]', '"x"', '42', 'null',
  readFileSync(new URL("../../demo/aster/ruleset-AST.json", import.meta.url), "utf8"),
];

describe("canonical fixture for the add-in port", () => {
  it("writes bridge/fixtures/canonical-cases.json", () => {
    const cases = RAW.map((raw) => {
      const c = canonical(JSON.parse(raw));
      return { raw, canonical: c, sha256: createHash("sha256").update(c).digest("hex") };
    });
    const out = new URL("./fixtures/canonical-cases.json", import.meta.url);
    writeFileSync(out, JSON.stringify(cases, null, 2) + "\n");
    expect(JSON.parse(readFileSync(out, "utf8"))).toHaveLength(RAW.length);
    expect(cases[0].canonical).toBe('{"B":false,"_":{},"a":[3,2,{"c":true,"d":null}],"b":1}');
  });
});
