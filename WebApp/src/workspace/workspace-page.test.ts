import { describe, it, expect, vi, beforeEach } from "vitest";

// The page is built on the fake document; the project, the bridge and the other panes are stood in.
const proj = { key: "k", listeners: [] as (() => void)[] };
vi.mock("../setups/active-project", () => ({ activePid: () => proj.key, onActiveProjectChange: (cb: () => void) => { proj.listeners.push(cb); return () => {}; } }));
vi.mock("../setups/load-scope", () => ({ loadScope: (k: string) => `scope:${k}` }));
vi.mock("../setups/my-role", () => ({ myRoleRead: async () => ({ role: "lead" }) }));
vi.mock("../setups/auth", () => ({ currentUser: async () => ({ email: "l@x" }) }));
vi.mock("../setups/ask", () => ({ askYesNo: vi.fn(async () => true), askText: vi.fn() }));
vi.mock("../setups/ai-picker", async () => {
  const { fakeDocument } = await import("./fake-dom");
  return { aiBody: () => ({}), aiPicker: () => fakeDocument().createElement("span") };
});
const answers: Record<string, unknown> = {};
vi.mock("../setups/bridge-fetch", () => ({ bfetch: vi.fn(async (url: string) => {
  const path = url.replace(/^http:\/\/b/, "");
  const body = path in answers ? answers[path] : [];
  return { status: 200, ok: true, json: async () => body };
}) }));

import { workspacePage } from "./workspace-page";
import { fakeDocument, textOf } from "./fake-dom";

const tick = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const row = (doc_type: string, sections: unknown[]) => ({ id: "d1", doc_type, title: "Doc", status: "wip", stage: "confirmed", suitability: "S0", responds_to: null, responds_to_version: null,
  template_id: null, template_version: null, updated_at: "t1", sections });
const proposal = { doc_type: "EIR", title: "Client EIR", source: {}, proposal: { sections: [{ heading: "1. A", guidance: "", body: "", fragments: [] }], unassigned: [] } } as any;
function page() {
  const el = workspacePage({ baseUrl: "http://b", onBack: () => {}, doc: fakeDocument() }) as any;
  const grid = el.childNodes[2], [outline, centre, side] = grid.childNodes;
  return { el, grid, outline, centre, side };
}

beforeEach(() => { proj.key = "k"; for (const k of Object.keys(answers)) delete answers[k]; });

describe("workspace page: ingest", () => {
  it("shows the review full width with the outline and side columns hidden", () => {
    const p = page();
    p.el.openIngest(proposal);
    expect(textOf(p.centre)).toContain("Review ingestion: Client EIR");
    expect(p.outline.style.display).toBe("none");
    expect(p.side.style.display).toBe("none");
    expect(p.grid.style.gridTemplateColumns).toBe("minmax(0,1fr)");
  });
  it("drops the review when a render comes for another project", () => {
    const p = page();
    p.el.openIngest(proposal);
    proj.key = "other";
    for (const cb of proj.listeners) cb();
    expect(textOf(p.centre)).not.toContain("Review ingestion");
    expect(p.outline.style.display).toBe("");
  });
});

describe("workspace page: READINESS and TIDP", () => {
  it("a TIDP document opens in Read with the read-only note above it", async () => {
    answers["/bimdocs/k/d1"] = row("TIDP", []);
    const p = page();
    await p.el.open("d1");
    await tick();
    expect(textOf(p.centre).startsWith("Old task team plans are read here; plan deliveries in Deliverables.")).toBe(true);
  });
  it("a READINESS document's Read centre is the readiness view", async () => {
    answers["/bimdocs/k/d1"] = row("READINESS", [{ id: "r1", heading: "12. Training", kind: "declared", question: "Is there a training plan?", answer: null, due: null }]);
    answers["/bimdocs/k/d1/readiness"] = { score: { pillars: { standards: {}, people: {}, process: {} } } };
    const p = page();
    await p.el.open("d1");
    await tick();
    const t = textOf(p.centre);
    expect(t).toContain("Answer the questions and plan in the Documents tab.");
    expect(t).toContain("Standards: Measured 0 met");
    expect(t).toContain("Is there a training plan?");
  });
});
