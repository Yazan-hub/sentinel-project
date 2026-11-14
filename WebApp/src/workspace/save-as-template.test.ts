import { describe, it, expect, vi } from "vitest";

vi.mock("../setups/ask", () => ({ askText: vi.fn(), askYesNo: vi.fn() }));
vi.mock("./read-view", () => ({ startPrint: vi.fn(), readVersion: vi.fn() }));

import { askText, askYesNo } from "../setups/ask";
import { versionsView } from "./versions-view";
import { emptyState } from "./workspace-state";
import { click, fakeDocument, findAll, textOf } from "./fake-dom";

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
function ctxOf(role: string, docType = "BEP", post: unknown = { template_id: "office-our-bep", office_version: 2 }, list: unknown = []) {
  const st = { ...emptyState("k"), role, doc: { id: "d1", doc_type: docType, title: "T", status: "published", sections: [] } as any, versions: [] };
  const posts: [string, unknown][] = [];
  const ws = { state: () => st, post: async (p: string, b: unknown) => { posts.push([p, b]); return post; }, get: async () => list };
  return { ctx: { ws, st, doc: fakeDocument(), base: "http://b", show: vi.fn() } as any, posts };
}
const button = (el: HTMLElement) => findAll(el, "button").find((b) => textOf(b) === "Save as office template…");

describe("Save as office template…", () => {
  it("is offered to a lead on a BEP or an EIR, with or without versions, and to nobody else", () => {
    expect(button(versionsView(ctxOf("lead").ctx))).toBeDefined();
    expect(button(versionsView(ctxOf("owner", "EIR").ctx))).toBeDefined();
    expect(button(versionsView(ctxOf("contributor").ctx))).toBeUndefined();
    expect(button(versionsView(ctxOf("lead", "READINESS").ctx))).toBeUndefined();
    expect(button(versionsView(ctxOf("lead", "TIDP").ctx))).toBeUndefined();
  });
  it("asks name, when to use, variant and how much to keep, posts, and says what was saved", async () => {
    vi.mocked(askText).mockResolvedValueOnce("Our BEP").mockResolvedValueOnce("For small jobs.");
    vi.mocked(askYesNo).mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true); // full variant; structure only; save
    const { ctx, posts } = ctxOf("lead"), el = versionsView(ctx);
    click(button(el)!); await flush();
    expect(posts).toEqual([["/bimdocs/k/d1/save-as-template", { name: "Our BEP", when_to_use: "For small jobs.", variant: "full", keep_content: false }]]);
    expect(vi.mocked(askYesNo).mock.calls.at(-1)![0]).toBe("Save \"Our BEP\" as an office template? Every member of every project of this office will be able to read it.");
    expect(textOf(el)).toContain('Saved as office template "Our BEP" (version 2).');
  });
  it("a minimal variant with its text and rows; neither variant posts null", async () => {
    vi.mocked(askText).mockResolvedValueOnce("A").mockResolvedValueOnce("");
    vi.mocked(askYesNo).mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true); // not full; minimal; with text; save
    const one = ctxOf("lead"); click(button(versionsView(one.ctx))!); await flush();
    expect(one.posts[0][1]).toEqual({ name: "A", when_to_use: "", variant: "minimal", keep_content: true });
    expect(vi.mocked(askYesNo).mock.calls.at(-1)![0]).toContain("with the text, names and rows this document holds."); // review finding 6: who will read it
    vi.mocked(askText).mockResolvedValueOnce("B").mockResolvedValueOnce("");
    vi.mocked(askYesNo).mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const two = ctxOf("lead"); click(button(versionsView(two.ctx))!); await flush();
    expect(two.posts[0][1]).toMatchObject({ variant: null, keep_content: false });
  });
  it("cancelling the name asks nothing more and posts nothing; a refusal shows the bridge's words", async () => {
    vi.mocked(askText).mockResolvedValueOnce(null);
    const a = ctxOf("lead"); click(button(versionsView(a.ctx))!); await flush();
    expect(a.posts).toEqual([]);
    vi.mocked(askText).mockResolvedValueOnce("N").mockResolvedValueOnce("");
    vi.mocked(askYesNo).mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const b = ctxOf("lead", "BEP", null);
    (b.ctx.st as any).message = "Only a lead of the office saves an office template.";
    const el = versionsView(b.ctx); click(button(el)!); await flush();
    expect(textOf(el)).toContain("Only a lead of the office saves an office template.");
  });
  it("review findings 8 and 14: the last question can be cancelled (nothing saved); a template of the same name and type is replaced, not doubled", async () => {
    vi.mocked(askText).mockResolvedValueOnce("N").mockResolvedValueOnce("");
    vi.mocked(askYesNo).mockReset().mockResolvedValue(false); // every question closed
    const a = ctxOf("lead"), el = versionsView(a.ctx); click(button(el)!); await flush();
    expect(a.posts).toEqual([]); expect(textOf(el)).toContain("The template was not saved.");
    const list = [{ template_id: "bep-comprehensive", doc_type: "BEP", title: "Our BEP" }, { template_id: "office-our-eir", doc_type: "EIR", title: "Our BEP", office: true }, { template_id: "office-our-bep", doc_type: "BEP", title: "Our BEP", office: true }];
    vi.mocked(askText).mockResolvedValueOnce(" our bep ").mockResolvedValueOnce("");
    vi.mocked(askYesNo).mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const b = ctxOf("lead", "BEP", undefined, list); click(button(versionsView(b.ctx))!); await flush();
    expect(vi.mocked(askYesNo).mock.calls.at(-1)![0]).toMatch(/^An office template named "Our BEP" already exists\. Replace it\? /);
    expect(b.posts[0][1]).toEqual({ id: "our-bep", name: "our bep", when_to_use: "", variant: "full", keep_content: false });
  });
});
