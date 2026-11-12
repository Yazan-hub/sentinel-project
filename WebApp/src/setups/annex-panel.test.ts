import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDocument, findAll, textOf, click } from "../workspace/fake-dom";

const bfetch = vi.fn();
const yes = vi.fn(async () => true);
vi.mock("./bridge-fetch", () => ({ bfetch: (...a: unknown[]) => bfetch(...a) }));
vi.mock("./ask", () => ({ askYesNo: (...a: unknown[]) => (yes as unknown as (...x: unknown[]) => Promise<boolean>)(...a) }));
import { annexPanel, NO_TEAM_WORDS } from "./annex-panel";

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const reply = (status: number, j: unknown) => ({ ok: status < 400, status, json: async () => j });
const MOB = { name: "mobilisation", words: "Mobilisation plan", rev: 4,
  columns: [{ key: "activity", words: "Activity", type: "text", required: true }, { key: "due", words: "Due", type: "date" }, { key: "done", words: "Done", type: "check" }],
  rows: [{ id: "r1", activity: "Kick-off", due: "2026-12-01", done: false }] };
const CAP = { name: "capability", words: "Capability", rev: 2,
  columns: [{ key: "team", words: "Task team", type: "text", required: true }, { key: "item", words: "Item", type: "text", required: true }],
  rows: [{ id: "a", team: "ARC", item: "Revit" }, { id: "s", team: "STR", item: "Tekla" }] };

/** bfetch routed by method + path: GET annex, GET members/me, and whatever writes the test lists. */
function serve(annex: unknown, me: unknown, writes: Record<string, unknown> = {}) {
  bfetch.mockImplementation(async (u: string, init?: RequestInit) => {
    const m = init?.method ?? "GET", p = u.replace("http://b", "");
    if (m === "GET" && p.endsWith("/members/me")) return reply(200, me);
    if (m === "GET") return reply(200, structuredClone(annex));
    const hit = writes[`${m} ${p}`] ?? writes[m];
    return (hit as ReturnType<typeof reply>) ?? reply(500, { message: "unexpected " + m + " " + p });
  });
}
const mount = async (name: string) => {
  const doc = fakeDocument(), root = doc.createElement("div");
  annexPanel(root, { base: "http://b", key: "p", name, doc });
  await flush();
  return root;
};
const btn = (root: HTMLElement, label: string) => findAll(root, "button").find((b) => textOf(b) === label)!;
const input = (root: HTMLElement, label: string) => findAll(root, "input").find((i) => i.getAttribute("aria-label") === label)! as HTMLInputElement;

beforeEach(() => { bfetch.mockReset(); yes.mockClear(); yes.mockResolvedValue(true); });

describe("annexPanel", () => {
  it("adds a row with the rev it read", async () => {
    serve(MOB, { role: "contributor", party: null, task_team: null }, { POST: reply(201, { rev: 5, row: { id: "r2", activity: "Order", due: "", done: false } }) });
    const root = await mount("mobilisation");
    expect(textOf(root)).toContain("Kick-off");
    input(root, "Activity").value = "Order";
    click(btn(root, "+ Add row")); await flush();
    const [url, init] = bfetch.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(url).toBe("http://b/annex/p/mobilisation");
    expect(JSON.parse(init.body)).toEqual({ row: { activity: "Order", due: "", done: false }, rev: 4 });
    expect(textOf(root)).toContain("Order");
  });
  it("edits a row (PATCH with rev) and removes one (DELETE ?rev=) after asking", async () => {
    serve(MOB, { role: "lead" }, { PATCH: reply(200, { rev: 5, row: { id: "r1", activity: "Kick-off 2", due: "2026-12-01", done: false } }), DELETE: reply(200, { rev: 6 }) });
    const root = await mount("mobilisation");
    click(btn(root, "Edit")); await flush();
    input(root, "Activity").value = "Kick-off 2";
    click(findAll(root, "button").find((b) => b.className === "annex-save")!); await flush();
    const patch = bfetch.mock.calls.find((c) => c[1]?.method === "PATCH")!;
    expect(patch[0]).toBe("http://b/annex/p/mobilisation/r1");
    expect(JSON.parse(patch[1].body)).toEqual({ row: { activity: "Kick-off 2", due: "2026-12-01", done: false }, rev: 4 });
    expect(textOf(root)).toContain("Kick-off 2");
    click(btn(root, "Remove")); await flush();
    expect(yes).toHaveBeenCalled();
    const del = bfetch.mock.calls.find((c) => c[1]?.method === "DELETE")!;
    expect(del[0]).toBe("http://b/annex/p/mobilisation/r1?rev=5");
    expect(textOf(root)).not.toContain("Kick-off");
  });
  it("a refused Remove question sends nothing", async () => {
    serve(MOB, { role: "lead" });
    const root = await mount("mobilisation");
    yes.mockResolvedValue(false);
    click(btn(root, "Remove")); await flush();
    expect(bfetch.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);
  });
  it("shows the bridge's words and reads again on a stale rev", async () => {
    serve(MOB, { role: "contributor" }, { POST: reply(409, { message: "Someone changed this list meanwhile — reload; nothing was saved." }) });
    const root = await mount("mobilisation");
    input(root, "Activity").value = "X";
    click(btn(root, "+ Add row")); await flush();
    expect(textOf(root)).toContain("Someone changed this list meanwhile");
    expect(bfetch.mock.calls.filter((c) => !c[1]?.method && String(c[0]).endsWith("/mobilisation")).length).toBe(2);
  });
  it("a viewer sees the rows and no controls", async () => {
    serve(MOB, { role: "viewer" });
    const root = await mount("mobilisation");
    expect(textOf(root)).toContain("Kick-off");
    expect(findAll(root, "button").length).toBe(0);
  });
  it("capability: only the caller's team rows are editable and the Add row's team is fixed", async () => {
    serve(CAP, { role: "contributor", party: "appointed", task_team: "ARC" }, { POST: reply(201, { rev: 3, row: { id: "n", team: "ARC", item: "Navis" } }) });
    const root = await mount("capability");
    expect(findAll(root, "button").filter((b) => textOf(b) === "Edit").length).toBe(1);
    expect(findAll(root, "button").filter((b) => textOf(b) === "Remove").length).toBe(1);
    const team = input(root, "Task team") as HTMLInputElement;
    expect(team.value).toBe("ARC"); expect(team.disabled).toBe(true);
    team.value = "STR"; // even if it were changed, the team sent is the caller's
    input(root, "Item").value = "Navis";
    click(btn(root, "+ Add row")); await flush();
    expect(JSON.parse(bfetch.mock.calls.find((c) => c[1]?.method === "POST")![1].body)).toEqual({ row: { team: "ARC", item: "Navis" }, rev: 2 });
  });
  it("capability: a member with no team is told who enters the rows, and cannot edit or add", async () => {
    serve(CAP, { role: "lead", party: "lead_appointed", task_team: null });
    const root = await mount("capability");
    expect(textOf(root)).toContain(NO_TEAM_WORDS);
    expect(textOf(root)).toContain("Tekla");
    expect(findAll(root, "button").length).toBe(0);
  });
});
