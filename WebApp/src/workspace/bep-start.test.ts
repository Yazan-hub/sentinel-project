import { describe, it, expect } from "vitest";
import { hasStart, isComprehensive } from "./bep-start";

const part = (id: string) => ({ id, kind: "text" as const, title: "", data: { markdown: "x" } });
const sec = (id: string, o: Record<string, unknown> = {}) => ({ id, heading: id, guidance: "", body: "", state: "wip", owner: null, bindings: {}, ...o }) as never;
const doc = (o: Record<string, unknown> = {}) => ({ doc_type: "BEP", template_id: "bep-comprehensive", responds_to: null, sections: [sec("s1")], ...o }) as never;

describe("bep-start", () => {
  it("hasStart: responds_to set, or a block id ending .part-e", () => {
    expect(hasStart(doc())).toBe(false);
    expect(hasStart(doc({ responds_to: "e1" }))).toBe(true);
    expect(hasStart(doc({ sections: [sec("s1", { blocks: [part("s1.part-e")] })] }))).toBe(true);
    expect(hasStart(doc({ sections: [sec("s1", { blocks: [part("s1.part-e2")] })] }))).toBe(false);
  });
  it("hasStart never throws on odd stored data", () => {
    expect(hasStart(doc({ sections: [null, sec("s1", { blocks: "x" })] }))).toBe(false);
    expect(hasStart(doc({ sections: undefined }))).toBe(false);
  });
  it("isComprehensive: a BEP of the comprehensive template with an eir-response section", () => {
    const fresh = doc({ sections: [sec("s1"), sec("s2", { template_key: "eir-response" })] });
    expect(isComprehensive(fresh)).toBe(true);
    expect(isComprehensive(doc())).toBe(false);
    expect(isComprehensive({ ...(fresh as object), template_id: "bep" } as never)).toBe(false);
    expect(isComprehensive({ ...(fresh as object), doc_type: "EIR" } as never)).toBe(false);
    expect(isComprehensive({ ...(fresh as object), template_id: null } as never)).toBe(false);
  });
});
