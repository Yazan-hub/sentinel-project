import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const src = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const fns = (text) => Object.fromEntries([...text.matchAll(/^export async function (\w+)\(/gm)]
  .map((m, i, all) => [m[1], text.slice(m.index, all[i + 1]?.index ?? text.length)]));
const WRITE = /patchSections\(|writeDoc\(|writeStatus\(|method: "POST"|docInsert\(|docReplaceIfField\(/;
const ACCESS = /requireDocAccess\(|openForWrite\(/;
// Every document writer. A new writer must be added here AND call requireDocAccess (directly or through openForWrite).
const WRITERS = ["createDoc", "patchSection", "transitionDoc", "publishDoc", "createDocFromIngest", "setSectionBindings", "setSectionAnswer", "setSectionPlan", "setDocAccess", "addSection", "removeSection", "renameSection", "reorderSections", "addBlock", "editBlock", "removeBlock", "reorderBlocks", "pickStart"];
describe("every document writer calls requireDocAccess (design §6)", () => {
  const all = fns(src("bimdocs-store.mjs"));
  it("the list names exactly the store functions that write", () =>
    expect(Object.keys(all).filter((n) => WRITE.test(all[n])).sort()).toEqual([...WRITERS].sort()));
  // Review R2c-6: the level each writer asks, pinned — a writer moved from "edit" to "read" fails here, not in a drill.
  // patchSection asks govern too when the section lead changes; pickStart reads the EIR it starts from.
  const LEVELS = { createDoc: ["edit"], patchSection: ["edit", "govern"], transitionDoc: ["govern"], publishDoc: ["govern"], createDocFromIngest: ["edit"],
    setSectionBindings: ["govern"], setSectionAnswer: ["edit"], setSectionPlan: ["govern"], setDocAccess: ["govern"], addSection: ["govern"], removeSection: ["govern"],
    renameSection: ["govern"], reorderSections: ["govern"], addBlock: ["edit"], editBlock: ["edit"], removeBlock: ["edit"], reorderBlocks: ["edit"], pickStart: ["govern", "read"] };
  it("each writer asks the level it should", () => {
    expect(Object.keys(LEVELS).sort()).toEqual([...WRITERS].sort());
    for (const n of WRITERS) expect([...all[n].matchAll(/(?:requireDocAccess\([^,]+,[^,]+,|openForWrite\([^,]+,[^,]+,) *"(\w+)"/g)].map((m) => m[1]), n).toEqual(LEVELS[n]);
  });
  // R2d: a document out for review changes only through its round. Every writer of an existing document reaches requireUnlocked
  // (openForWrite calls it; the two that do not open through it call it themselves); a new document and an access list have no round to lock.
  it("every writer of an existing document reaches the lock helper", () => {
    expect(all.openForWrite ?? src("bimdocs-store.mjs")).toMatch(/requireUnlocked\(doc\)/);
    expect(src("bimdocs-store.mjs").match(/async function openForWrite[\s\S]*?\n}/)[0]).toMatch(/requireUnlocked\(doc\)/);
    const NO_ROUND = ["createDoc", "createDocFromIngest", "setDocAccess"];
    for (const n of WRITERS.filter((w) => !NO_ROUND.includes(w))) expect(all[n], n).toMatch(/openForWrite\(|requireUnlocked\(/);
  });
  it("each writer asks requireDocAccess; the store never asks only the project role", () => {
    for (const n of WRITERS) expect(all[n], n).toMatch(ACCESS);
    expect(src("bimdocs-store.mjs")).not.toMatch(/requireMinRole\(/);
  });
});

// R2c: the comment writers live in comments-store.mjs and append through appendEvent; each asks requireDocAccess (through its own load()).
describe("every comment writer calls requireDocAccess (R2c)", () => {
  const COMMENT_WRITERS = ["addThread", "reply", "resolveThread", "assignThread"];
  const all = fns(src("comments-store.mjs"));
  it("the list names exactly the comment functions that write", () =>
    expect(Object.keys(all).filter((n) => /appendEvent\(|load\(d, key, docId, "comment"\)/.test(all[n])).sort()).toEqual([...COMMENT_WRITERS].sort()));
  it("each asks for comment access; the store never asks only the project role", () => {
    for (const n of COMMENT_WRITERS) expect(all[n], n).toMatch(/load\(d, key, docId, "comment"\)/);
    expect(src("comments-store.mjs")).toMatch(/d\.requireDocAccess\(key, doc, level\)/);
    expect(src("comments-store.mjs")).not.toMatch(/requireMinRole\(/);
  });
  it("the old panel's addComment writes only through addThread", () => expect(fns(src("bimdocs-store.mjs")).addComment).toMatch(/addThread\(/));
});

describe("the AI runs only for those who may edit the document", () => {
  const ai = fns(src("bimdocs-ai.mjs"));
  it("draftSection and integrityReport ask requireDocAccess on the document read", () => {
    for (const n of ["draftSection", "integrityReport"]) expect(ai[n], n).toMatch(/mayRunAi\(key, doc,/);
    expect(src("bimdocs-ai.mjs")).toMatch(/requireDocAccess\(key, doc, "edit"\)/);
    expect(src("bimdocs-ai.mjs")).not.toMatch(/requireMinRole\(/);
  });
});
