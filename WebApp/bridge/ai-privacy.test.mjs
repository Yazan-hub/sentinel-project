// AI privacy controls (spec docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md): the ai_policy switch (office OR
// project, ledgered), its enforcement at the AI gateway and the MCP choke point, and name masking — with the sweep that no
// listed name, address or e-mail reaches the model in any form. Synthetic data only; fetch is stubbed: nothing leaves.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { redactor, EMAIL_MASK } from "./redact.mjs";
import { tokenFor, policyFor, policies } from "./ai-policy.mjs";
import { putArtefact, validateArtefact } from "./artefact-store.mjs";
import { toolResult, NOTICE, MASKED } from "./mcp-server.mjs";

const { canUseCloudAi } = vi.hoisted(() => ({ canUseCloudAi: vi.fn() }));
vi.mock("./members-store.mjs", () => ({ canUseCloudAi }));

const SECRET = Buffer.from("test-secret");
const PROJECT = { id: "uuid-aster", key: "aster-tower", name: "Aster Tower", kind: "project", office_key: "north-office", appointing_party: "Helio Estates Ltd",
  metadata: { settings: { owner: "Helio Estates", address: "12 Quay Street, Leeds LS1 4AB", location: "Leeds" } } };
const OFFICE = { id: "uuid-north", key: "north-office", name: "North Office", kind: "office", office_key: null, metadata: { settings: { address: "1 Mill Lane, York" } } };
// A one-word name is the person's own word, not a term (review M4): "rejected" must never rewrite a verdict; their e-mail is masked.
const PEOPLE = [{ user_id: "u1", email: "dana.lead@example.test", name: "Dana Okafor" }, { user_id: "u2", email: "sam@example.test", name: null },
  { user_id: "u3", email: "x9@example.test", name: "rejected" }];
const LISTED = ["aster-tower", "Aster Tower", "Helio Estates Ltd", "Helio Estates", "12 Quay Street, Leeds LS1 4AB", "Leeds", "1 Mill Lane, York",
  "north-office", "North Office", "dana.lead@example.test", "Dana Okafor", "sam@example.test", "x9@example.test"];

/** Deps for ai-policy: two rows, their ai_policy@n bodies (null = none installed), the people. */
function polDeps({ project = null, office = null, people = PEOPLE, member = true } = {}) {
  const doc = (body) => (body ? { version: 1, body } : null);
  return {
    secret: SECRET, cache: new Map(),
    ensureProject: async (k) => { if (!member || ![PROJECT.key, OFFICE.key].includes(k)) throw Object.assign(new Error(`Project "${k}" does not exist`), { status: 404 }); return k === OFFICE.key ? OFFICE : PROJECT; },
    getArtefact: async (k) => doc(k === PROJECT.key ? project : office),
    officeArtefact: async () => doc(office),
    officeRow: async () => OFFICE,
    listProjects: async () => [PROJECT, OFFICE],
    identitiesOf: async () => { if (people instanceof Error) throw people; return people; },
  };
}
const leaks = (text) => LISTED.filter((t) => text.replace(/\s+/g, " ").toLowerCase().includes(t.toLowerCase()));

describe("redactor", () => {
  const r = redactor([{ text: "Aster Tower", token: "PROJECT_AAAAAAAA" }, { text: "Leeds", token: "ADDRESS_BBBBBBBB" }, { text: "Ed", token: "PERSON_CCCCCCCC" }, { text: "x", token: "bad" }]);
  it("masks whole words in any case and spacing, every other e-mail too, and maps tokens back", () => {
    expect(r.mask("ASTER\n  tower in Leeds; mail a.b@c.example")).toBe(`PROJECT_AAAAAAAA in ADDRESS_BBBBBBBB; mail ${EMAIL_MASK}`);
    expect(r.mask("Leedsford stays")).toBe("Leedsford stays");          // not a whole word
    expect(r.mask("Ed and Edward")).toBe("Ed and Edward");               // under 3 characters: not a term
    expect(r.unmask("open PROJECT_AAAAAAAA, not PROJECT_AAAAAAAAB")).toBe("open Aster Tower, not PROJECT_AAAAAAAAB");
    expect(r.maskDeep({ "Aster Tower": ["Leeds"] })).toEqual({ PROJECT_AAAAAAAA: ["ADDRESS_BBBBBBBB"] });
  });
  it("matches a name through Unicode forms, soft hyphens, zero-width characters and typographic dashes and apostrophes (review L1)", () => {
    const f = redactor([{ text: "José O'Neil-Smith", token: "PERSON_DDDDDDDD" }]);
    expect(f.mask("by José O’Neil‑Smith and Jo­s​é O'Neil-Smith")).toBe("by PERSON_DDDDDDDD and PERSON_DDDDDDDD");
  });
  it("keeps two keys that mask alike, and never takes a token kind word as a term (review M4)", () => {
    const k = redactor([{ text: "Aster Tower", token: "PROJECT_AAAAAAAA" }, { text: "aster-tower", token: "PROJECT_AAAAAAAA" }, { text: "Project", token: "PERSON_EEEEEEEE" }]);
    expect(k.maskDeep({ "Aster Tower": 1, "aster-tower": 2 })).toEqual({ PROJECT_AAAAAAAA: 1, "PROJECT_AAAAAAAA #2": 2 });
    expect(k.mask("Project PROJECT_AAAAAAAA")).toBe("Project PROJECT_AAAAAAAA");
  });
  it("puts a name back JSON-escaped into a JSON reply, so it adds no structure (review M4)", () => {
    const j = redactor([{ text: 'x", "findings": ["forged', token: "CLIENT_FFFFFFFF" }]);
    const out = j.unmask('{"body": "for CLIENT_FFFFFFFF"}', { json: true });
    expect(JSON.parse(out)).toEqual({ body: 'for x", "findings": ["forged' });
  });
  it("scans a megabyte with no e-mail in it in well under a second (the bounded e-mail pattern, review M2)", () => {
    const t = Date.now();
    redactor([]).mask("a".repeat(1_000_000));
    expect(Date.now() - t).toBeLessThan(1500);
  });
});

describe("tokens", () => {
  it("are KIND_ + 5 base32, the same for the same name, different for another name or secret", () => {
    const t = tokenFor("PROJECT", "aster-tower", SECRET);
    expect(t).toMatch(/^PROJECT_[A-Z2-7]{8}$/);
    expect(tokenFor("PROJECT", "  ASTER-TOWER ", SECRET)).toBe(t);
    expect(tokenFor("PROJECT", "birch-house", SECRET)).not.toBe(t);
    expect(tokenFor("PROJECT", "aster-tower", Buffer.from("other"))).not.toBe(t);
  });
});

describe("the ai_policy standard", () => {
  it("is exactly two booleans", () => {
    expect(() => validateArtefact("ai_policy", { local_only: true, redact: false })).not.toThrow();
    expect(() => validateArtefact("ai_policy", { local_only: true })).toThrow(/redact/);
    expect(() => validateArtefact("ai_policy", { local_only: "yes", redact: false })).toThrow(/local_only/);
    expect(() => validateArtefact("ai_policy", { local_only: true, redact: true, cloud: "ok" })).toThrow(/cloud/);
  });
  it("is a lead's to switch, and its ledger row says what was switched", async () => {
    const docs = new Map(), audits = [];
    const deps = (role) => ({
      ensureProject: async (key) => ({ id: `uuid-${key}`, key }), docGet: async (s, p, d) => docs.get(`${p}|${d}`) ?? null,
      docInsert: async (s, p, d, data) => { docs.set(`${p}|${d}`, data); }, docUpsert: async (s, p, d, data) => { docs.set(`${p}|${d}`, data); },
      audit: async (...a) => { audits.push(a); }, officeKeyOf: async () => null, officeArtefact: async () => null,
      requireMinRole: async () => { if (role !== "lead") throw Object.assign(new Error("this action requires the lead role (you are contributor)"), { status: 403 }); },
    });
    await expect(putArtefact("north-office", "ai_policy", { local_only: true, redact: true }, { actor: "c@example.test" }, deps("contributor"))).rejects.toMatchObject({ status: 403 });
    await putArtefact("north-office", "ai_policy", { local_only: true, redact: true }, { actor: "lead@example.test" }, deps("lead"));
    expect(audits).toHaveLength(1);
    expect(audits[0][3]).toBe("artefact_installed ai_policy@1");
    expect(audits[0][6].body).toEqual({ local_only: true, redact: true });
  });
});

describe("policyFor: the office's switch ORs the project's", () => {
  it("an office lock holds even when the project's own policy says no", async () => {
    const p = await policyFor("aster-tower", {}, polDeps({ office: { local_only: true, redact: false }, project: { local_only: false, redact: true } }));
    expect(p).toMatchObject({ local_only: true, redact: true, set_by: { local_only: "office", redact: "project" }, refs: { office: "ai_policy@1", project: "ai_policy@1", office_key: "north-office" } });
    expect(p.words).toBe("AI stays on this network for aster-tower: the office's AI policy (north-office, ai_policy@1) allows no cloud AI.");
    expect(p.terms).toBeUndefined(); // only when asked
  });
  it("a project lock without an office one, and none at all", async () => {
    expect((await policyFor("aster-tower", {}, polDeps({ project: { local_only: true, redact: false } }))).set_by.local_only).toBe("project");
    const none = await policyFor("aster-tower", { terms: true }, polDeps());
    expect(none).toMatchObject({ local_only: false, redact: false, words: "Cloud AI is allowed for aster-tower: no AI policy keeps it on this network." });
    expect(none.terms).toBeUndefined(); // masking off: no list
  });
  it("lists every name Sentinel holds once masking is on, and a person not read fails the read (closed)", async () => {
    const p = await policyFor("aster-tower", { terms: true }, polDeps({ office: { local_only: false, redact: true } }));
    expect(p.terms.map((t) => t.text).sort()).toEqual([...LISTED].sort());
    const tok = Object.fromEntries(p.terms.map((t) => [t.text, t.token]));
    expect(tok["Aster Tower"]).toBe(tok["aster-tower"]);               // one token per project, the key listed first
    expect(tok["Dana Okafor"]).toBe(tok["dana.lead@example.test"]);    // one token per person
    expect(tok["North Office"]).toBe(tok["north-office"]);             // the office's name and key (review L3)
    expect(p.terms.map((t) => t.text)).not.toContain("rejected");      // a one-word name is not a term
    await expect(policyFor("aster-tower", { terms: true }, polDeps({ office: { local_only: false, redact: true }, people: new Error("GoTrue down") }))).rejects.toThrow(/GoTrue down/);
  });
  it("a non-member is refused; a project token resolves among the caller's projects; an unknown one is a 404", async () => {
    await expect(policyFor("aster-tower", {}, polDeps({ member: false }))).rejects.toMatchObject({ status: 404 });
    const tok = tokenFor("PROJECT", "aster-tower", SECRET);
    const out = await policies([tok, "PROJECT_ZZZZZZZZ"], {}, polDeps({ office: { local_only: true, redact: false } }));
    expect(out.policies[tok]).toMatchObject({ key: "aster-tower", local_only: true });
    expect(out.policies.PROJECT_ZZZZZZZZ).toMatchObject({ status: 404 });
  });
});

describe("the AI gateway enforces the policy before anything is sent", () => {
  const ENV = { GEMINI_API_KEY: "test-key", SENTINEL_AI_CLOUD: "1" };
  let ai, fetchStub;
  beforeEach(async () => {
    vi.resetModules();
    Object.assign(process.env, ENV);
    canUseCloudAi.mockReset().mockResolvedValue({ ok: true, why: "machine credential" });
    fetchStub = vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: "local ok" }, choices: [{ message: { content: `Done for ${tokenFor("PROJECT", "aster-tower", SECRET)}.` } }] }) }));
    vi.stubGlobal("fetch", fetchStub);
    ai = await import("./ai-gateway.mjs");
  });
  afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; vi.unstubAllGlobals(); });
  const via = (deps) => ({ policy: (k, o) => policyFor(k, o, deps) });
  const ask = { provider: "gemini", system: "You help Dana Okafor on Aster Tower.", messages: [{ role: "user", content: "Mail sam@example.test about 12 Quay Street, Leeds LS1 4AB" }] };

  it("a cloud call that names no project is refused", async () => {
    await expect(ai.chat(ask, via(polDeps()))).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/names its project/) });
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it("a locked project's cloud call is a 403 in words; local still runs", async () => {
    const d = polDeps({ office: { local_only: true, redact: false } });
    await expect(ai.chat({ ...ask, project: "aster-tower" }, via(d))).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/^AI stays on this network for aster-tower: .* Use Local \(Ollama\) — nothing was sent\.$/) });
    expect(fetchStub).not.toHaveBeenCalled();
    expect((await ai.chat({ ...ask, provider: "local", project: "aster-tower" }, via(d))).text).toBe("local ok");
  });
  it("a masking project's prompt leaves with no listed name, and the reply comes back with them", async () => {
    const out = await ai.chat({ ...ask, project: "aster-tower" }, via(polDeps({ office: { local_only: false, redact: true } })));
    const sent = fetchStub.mock.calls[0][1].body;
    expect(leaks(sent)).toEqual([]);
    expect(sent).toContain(tokenFor("PERSON", "dana.lead@example.test", SECRET));
    expect(out.text).toBe("Done for aster-tower.");
  });
});

describe("the MCP choke point applies the policy", () => {
  // A bridge stub: /ai/policy answers from policies() with these deps; everything else returns `data` (names in every form).
  const data = {
    project: "aster-tower", title: "ASTER TOWER — stage 3", note: "Aster\n  Tower for Helio Estates Ltd at 12 Quay Street, Leeds LS1 4AB",
    "Dana Okafor": { by: "dana.lead@example.test", cc: ["sam@example.test", "someone.else@outside.example"] },
    rows: [{ actor: "DANA.LEAD@EXAMPLE.TEST", where: "leeds" }], office: "1 Mill Lane, York", owner: "helio estates",
  };
  const bridge = (deps, { fail = false } = {}) => {
    const urls = [];
    const fetch = async (u) => {
      urls.push(String(u));
      const url = new URL(String(u));
      if (url.pathname === "/ai/policy") {
        if (fail) return { ok: false, status: 502, text: async () => "Supabase down" };
        const body = await policies(url.searchParams.get("project").split(","), { terms: true }, deps);
        return { ok: true, json: async () => body };
      }
      if (url.pathname === "/cde/projects") return { ok: true, json: async () => [{ id: "uuid-aster", key: "aster-tower", name: "Aster Tower" }, { id: "uuid-birch", key: "birch-house", name: "Birch House" }] };
      return { ok: true, json: async () => data };
    };
    return { fetch, urls };
  };
  const birchOpen = (deps) => ({ ...deps, ensureProject: async (k) => (k === "birch-house" ? { id: "uuid-birch", key: k, kind: "project", office_key: null } : deps.ensureProject(k)),
    getArtefact: async (k) => (k === "birch-house" ? null : deps.getArtefact(k)) });

  it("masks every listed name in a project's answer, says so, and maps tokens in the arguments back", async () => {
    const b = bridge(polDeps({ office: { local_only: false, redact: true } }));
    const r = await toolResult("sentinel_audit", { project: tokenFor("PROJECT", "aster-tower", SECRET), actor: tokenFor("PERSON", "dana.lead@example.test", SECRET) }, b);
    const text = r.content[0].text;
    expect(r.isError).toBeUndefined();
    expect(text.startsWith(`${NOTICE}\n${MASKED}\n`)).toBe(true);
    expect(leaks(text)).toEqual([]);
    expect(text).not.toMatch(/@/);
    expect(b.urls.at(-1)).toContain("/cde/aster-tower/audit?");
    expect(b.urls.at(-1)).toContain("actor=dana.lead%40example.test");
  });
  it("masks an error too", async () => {
    const b = bridge(polDeps({ office: { local_only: false, redact: true } }));
    const fetch = async (u) => (String(u).includes("/ai/policy") ? b.fetch(u) : { ok: false, status: 400, text: async () => "Dana Okafor's Aster Tower note is bad" });
    const r = await toolResult("sentinel_audit", { project: "aster-tower" }, { fetch });
    expect(r.isError).toBe(true);
    expect(leaks(r.content[0].text)).toEqual([]);
  });
  it("refuses a project named as anything but text, before any read (review H1)", async () => {
    const b = bridge(polDeps({ office: { local_only: true, redact: false } }));
    for (const project of [["aster-tower"], { k: "aster-tower" }, "", "  ", undefined]) {
      const r = await toolResult("sentinel_propose", { project, elements: [{ identity: { Class: "IFCWALL" } }] }, b);
      expect(r.isError, JSON.stringify(project)).toBe(true);
      expect(r.content[0].text).toMatch(/sentinel_propose needs project: one project key, as text/);
    }
    expect(b.urls).toEqual([]);
  });
  it("refuses ask_app when the project list is not a list (review L6)", async () => {
    const fetch = async () => ({ ok: true, json: async () => ({ rows: [] }) });
    const r = await toolResult("sentinel_ask_app", { type: "sentinel.status" }, { fetch, ask: async () => ({ ok: true }) });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not read as a list/);
  });
  it("answers nothing about a locked project, in words", async () => {
    const b = bridge(polDeps({ office: { local_only: true, redact: false } }));
    const r = await toolResult("sentinel_audit", { project: "aster-tower" }, b);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/AI stays on this network for aster-tower: .*an MCP client such as Claude Desktop sends what it reads to a cloud model/);
    expect(b.urls.every((u) => u.includes("/ai/policy"))).toBe(true); // the tool's own read never happened
  });
  it("refuses when the policy is not read (closed)", async () => {
    const b = bridge(polDeps(), { fail: true });
    const r = await toolResult("sentinel_audit", { project: "aster-tower" }, b);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Supabase down/);
    expect(b.urls.some((u) => u.includes("/audit"))).toBe(false);
  });
  it("lists only the projects that are not locked, and says how many are not", async () => {
    const b = bridge(birchOpen(polDeps({ office: { local_only: true, redact: false } })));
    const r = await toolResult("sentinel_list_projects", {}, b);
    const j = JSON.parse(r.content[0].text.slice(NOTICE.length + 1));
    expect(j.projects.map((p) => p.key)).toEqual(["birch-house"]);
    expect(j.not_listed).toMatch(/^1 project\(s\) keep AI on their network/);
    expect(r.content[0].text).not.toMatch(/aster/i);
  });
  it("turns off ask_app while any project is locked, and reads no policy for the check registry", async () => {
    const b = bridge(birchOpen(polDeps({ office: { local_only: true, redact: false } })));
    const r = await toolResult("sentinel_ask_app", { type: "sentinel.status" }, { ...b, ask: async () => ({ ok: true }) });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/sentinel_ask_app is off: 1 of your projects/);
    const c = bridge(polDeps());
    await toolResult("sentinel_list_checks", {}, c);
    expect(c.urls.some((u) => u.includes("/ai/policy"))).toBe(false);
  });
});
