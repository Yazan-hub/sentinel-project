import { describe, it, expect, vi } from "vitest";

const reply = { ok: true, body: {} as unknown };
vi.mock("./bridge-fetch", () => ({ bfetch: vi.fn(async () => ({ ok: reply.ok, json: async () => reply.body })) }));

import { loadMyWork, myWorkList, myWorkTotal, type MyWork } from "./my-work";
import { fakeDocument, findAll, textOf, click } from "../workspace/fake-dom";

const W: MyWork = {
  sections: [{ doc_id: "d1", title: "SNW BEP", section_id: "s2", heading: "2. Roles" }, { doc_id: "d1", title: "SNW BEP", section_id: "s3", heading: "3. Standards" }],
  reviews: [{ version_id: "v1", container_name: "SNW-ARC-01", step: 1, name: "Architect review" }],
  mentions: [{ doc_id: "d2", title: "SNW EIR", thread_id: "t1", section_id: "s5", by: "lead@x", at: "t", excerpt: "please check" }],
  assigned: [{ doc_id: "d3", title: "SNW TIDP", thread_id: "t2", excerpt: "fix the date" }],
};
const EMPTY: MyWork = { sections: [], reviews: [], mentions: [], assigned: [] };

describe("myWorkList", () => {
  it("four headed lists with their counts", () => {
    const t = textOf(myWorkList(fakeDocument(), W, vi.fn()));
    for (const w of ["My sections (2)", "My reviews (1)", "Mentions (1)", "Assigned to me (1)", "SNW BEP · 2. Roles", "SNW-ARC-01 · Architect review", "lead@x mentioned you in SNW EIR: please check", "SNW TIDP: fix the date"]) expect(t).toContain(w);
    expect(t).not.toContain("Nothing here.");
  });
  it("a click opens the document at its section — a mention or assignment too, when its thread has one; a review opens the Review desk", () => {
    const open = vi.fn(), review = vi.fn(), el = myWorkList(fakeDocument(), W, open, review);
    const line = (s: string) => findAll(el, "button").find((b) => textOf(b).startsWith(s))!;
    click(line("SNW BEP · 3.")); expect(open).toHaveBeenLastCalledWith("d1", { section: "s3" });
    click(line("lead@x mentioned")); expect(open).toHaveBeenLastCalledWith("d2", { section: "s5" });
    click(line("SNW TIDP")); expect(open).toHaveBeenLastCalledWith("d3", undefined); // a whole-document thread
    click(line("SNW-ARC-01")); expect(review).toHaveBeenCalledTimes(1);
  });
  it("empty lists say Nothing here., once each", () => {
    const t = textOf(myWorkList(fakeDocument(), EMPTY, vi.fn()));
    expect(t.split("Nothing here.").length - 1).toBe(4); expect(t).toContain("Mentions (0)");
  });
  it("comment text stays text", () => {
    const el = myWorkList(fakeDocument(), { ...EMPTY, assigned: [{ doc_id: "d", title: "T", thread_id: "t", excerpt: "<i>x</i>" }] }, vi.fn());
    expect(textOf(el)).toContain("<i>x</i>"); expect(findAll(el, "i")).toEqual([]);
  });
});

describe("loadMyWork / myWorkTotal", () => {
  it("reads the lists, fills any missing one, and is null when refused", async () => {
    reply.ok = true; reply.body = { sections: W.sections };
    const w = await loadMyWork("http://b", "k");
    expect(w).toEqual({ ...EMPTY, sections: W.sections }); expect(myWorkTotal(w)).toBe(2);
    reply.ok = false; expect(await loadMyWork("http://b", "k")).toBeNull(); expect(myWorkTotal(null)).toBe(0);
  });
});
