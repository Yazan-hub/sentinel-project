## Area: spend — the founder's money and disk need a trusted caller (D2, D10)

Closes: ai-1, ai-2, ifc-1, cdefiles-1, cdefiles-2, cde-8, cde-2, cde-rem-2, bimdocs-1, bimdocs-4.

**Order and dependencies.** Run these tasks in order (SPEND-1 … SPEND-11) as ORDER.md interleaves them: SPEND-1 before
gate-limits-3 (which calls `requireSpend`), SPEND-2 onward after area gate-limits' tasks that give `readBody(req, { max })`,
`readRaw(req, { max })`, `uploadSlot(sub)`, `SMALL_JSON` (gate-limits-2) and `createKeyedLimiter` (gate-limits-8), and
SPEND-9 onward after area zero-rows' ZR-8 and ZR-12 (they extend the same test import). gate-limits-3 already put
`requireSpend` first in the intake and ingest routes, so SPEND-7 and SPEND-10 add tests only. The tests below assume gate-limits' contract:
`readBody`/`readRaw` reject with an Error whose `.status` is 413 (with words) when the bytes actually streamed pass
`max`, and `uploadSlot(sub)` is synchronous, returns a release function, and throws an Error with `.status` 429 when
2 uploads run globally or 1 for that sub. Line numbers below are today's (`e208b0a`); gate-limits and reads edit
nearby lines first, so each edit names the text it anchors on.

**Trust model used everywhere here** (`requireSpend` / `canUseCloudAi`, members-store.mjs): the machine credential
(BCF_TOKEN, `myRole` → `"service"`), a signed-in contributor+ of a project whose `office_key` is set, or a lead+ of an
office row itself (one rule for both functions). This is only as strong as the office attachment: migration 0033 (area migration) must be applied
before the bridge faces the internet, or a stranger can still set `office_key` on their own project through PostgREST.

**Web callers.** `src/setups/model-panel.ts:669-670` already sends the active key as `projectId` on `POST /ifc` — no web
change. `src/setups/copilot-panel.ts` needs none: `/ai/chat` names no project (account-level check), and the agent's
write-tool schemas now require `project`, which the agent prompt already gives (`The current project key is "…"`).
`src/setups/secure-store.ts` changes in SPEND-6.

Run every test command from `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project/WebApp`.

---

### Task SPEND-1: `requireSpend` and `canUseCloudAi` in members-store

**Closes:** (foundation for ai-1, ifc-1, cdefiles-1, cde-8, cde-2, cde-rem-2, bimdocs-1, bimdocs-4)

**Files:**
- Modify: `WebApp/bridge/members-store.mjs:142` (append after `requireMinRole`)
- Test: `WebApp/bridge/members-store.test.mjs:3` (import line) and append after line 142

**Interfaces:**
- Consumes: `myRole(key, deps)`, `ROLE_RANK`, `wire(deps)`, `subOf(d)`, `currentUserToken()` (all existing in members-store.mjs); `cde.ensureProject`, `cde.sb` (existing).
- Produces:
  - `requireSpend(key: string, deps?) -> Promise<projectRow>` — resolves the project row (`select=*`, so `id`, `key`, `kind`, `office_key`); throws Error `.status` 403 with words when the caller is below contributor (below lead on an office row — the same rule as `canUseCloudAi`) or the project belongs to no office. The machine credential always passes, but its project is still read (`ensureProject`), so a bridge with no CDE answers it with an error. (A non-member is refused by `ensureProject` itself: 404 after READS-1.)
  - `canUseCloudAi(deps?) -> Promise<{ ok: boolean, why: string }>` — `ok` for the machine credential, a contributor+ of any office-attached project, or a lead+ of an office row.

- [ ] **Step 1: Write the failing test**

In `WebApp/bridge/members-store.test.mjs` replace line 3:

```js
import { ROLES, ROLE_RANK, listMembers, listMemberRows, addMember, changeRole, removeMember, myRole, requireMinRole, requireSpend, canUseCloudAi } from "./members-store.mjs";
```

Append at the end of the file:

```js
describe("requireSpend — who may spend the founder's storage or AI on a project (H0, D2)", () => {
  const office = { id: "o1", key: "office-a", kind: "office", office_key: null };
  const attached = { id: "p1", key: "demo", kind: "project", office_key: "office-a" };
  const lone = { id: "p1", key: "demo", kind: "project", office_key: null }; // anyone who signs up can make one
  const on = (proj, over) => baseDeps({ ensureProject: vi.fn(async () => proj), ...over });

  it("the machine credential passes, office or not, and gets the project row", async () => {
    await expect(requireSpend("demo", on(lone, { sub: null }))).resolves.toEqual(lone);
  });

  it("a contributor or above of an office project passes; the project is read once", async () => {
    const deps = on(attached, { sub: "u-owner" });
    await expect(requireSpend("demo", deps)).resolves.toEqual(attached);
    expect(deps.ensureProject).toHaveBeenCalledTimes(1);
  });

  it("an office row is its lead's or owner's to spend on; its contributor is refused, as canUseCloudAi refuses them", async () => {
    await expect(requireSpend("office-a", on(office, { sub: "u-owner" }))).resolves.toEqual(office);
    const deps = on(office, { sub: "u-con" });
    deps.rows.push({ project_id: "p1", user_id: "u-con", role: "contributor" });
    await expect(requireSpend("office-a", deps))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/lead role on office-a.*you are contributor.*nothing was sent/) });
  });

  it("a viewer is refused in words that name the role", async () => {
    await expect(requireSpend("demo", on(attached, { sub: "u-view" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/contributor role.*you are viewer.*nothing was sent/) });
  });

  it("the owner of a project with no office is refused — owning a self-made project is not trust", async () => {
    await expect(requireSpend("demo", on(lone, { sub: "u-owner" })))
      .rejects.toMatchObject({ status: 403, message: expect.stringMatching(/belongs to no office.*nothing was sent/) });
  });
});

describe("canUseCloudAi — /ai/* names no project, so the account is checked (H0, D2)", () => {
  const deps = (sub, rows) => baseDeps({
    sub,
    sb: vi.fn(async (path, opts) => {
      expect(path).toBe(`memberships?user_id=eq.${sub}&select=role,projects(kind,office_key)`);
      expect(opts).toEqual({ service: true });
      return rows;
    }),
  });
  const row = (role, kind, office_key) => ({ role, projects: { kind, office_key } });

  it("the machine credential may, with no read", async () => {
    const d = deps(null, []);
    await expect(canUseCloudAi(d)).resolves.toMatchObject({ ok: true });
    expect(d.sb).not.toHaveBeenCalled();
  });

  it("a contributor of an office project may; a lead of an office may", async () => {
    await expect(canUseCloudAi(deps("u1", [row("contributor", "project", "office-a")]))).resolves.toMatchObject({ ok: true });
    await expect(canUseCloudAi(deps("u2", [row("lead", "office", null)]))).resolves.toMatchObject({ ok: true });
  });

  it("a viewer of an office project, a contributor of an office row, a self-made project's owner and a member of nothing may not — why says what is needed", async () => {
    for (const rows of [[row("viewer", "project", "office-a")], [row("contributor", "office", null)], [row("owner", "project", null)], []]) {
      const r = await canUseCloudAi(deps("u3", rows));
      expect(r.ok).toBe(false);
      expect(r.why).toMatch(/office/);
      expect(r.why).toMatch(/Local AI still works/);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run bridge/members-store.test.mjs`
Expected: FAIL — `Tests  8 failed | 14 passed (22)`: the eight new cases fail with `TypeError: requireSpend is not a function` / `canUseCloudAi is not a function` (vitest resolves a missing named export to undefined); the old cases pass.

- [ ] **Step 3: Implement**

Append to `WebApp/bridge/members-store.mjs` after line 142:

```js

/** H0 (D2): spending the founder's money or disk for a project — a platform upload (POST /ifc, intake), an encrypted
 *  blob (/cde/files), a stored document original (bimdocs ingest), cloud AI on a document — needs a trusted caller:
 *  the machine credential, a contributor or above of a project that belongs to an office, or a lead or above of an
 *  office row itself (the rule canUseCloudAi applies to /ai/*). Attaching a project to an office is itself gated
 *  (migration 0033), so a project anyone can make by signing up is not enough. Answers the project row; a refusal is a
 *  403 in words, before anything is read or sent. */
export async function requireSpend(key, deps) {
  const d = wire(deps);
  const proj = await d.ensureProject(key);
  const role = await myRole(key, { ...deps, ensureProject: async () => proj }); // one project read, not two
  if (role === "service") return proj;
  const need = proj.kind === "office" ? "lead" : "contributor";
  if ((ROLE_RANK[role] || 0) < ROLE_RANK[need])
    throw err(403, `this spends the office's storage or AI and needs the ${need} role on ${key} (you are ${role || "not a member"}) — nothing was sent`);
  if (!proj.office_key && proj.kind !== "office")
    throw err(403, `${key} belongs to no office — uploads and cloud AI are for office projects (a lead of the office attaches it in Project settings ▸ Office) — nothing was sent`);
  return proj;
}

/** H0 (D2) for /ai/* (a chat names no project): may this caller spend the founder's cloud AI keys? The machine
 *  credential; or a signed-in user who is contributor or above on a project that belongs to an office, or lead or
 *  above of an office. { ok, why } — `why` is what a refusal shows, in the picker and in the 403. */
export async function canUseCloudAi(deps) {
  const d = wire(deps);
  if (d.sub === null || (d.sub === undefined && !currentUserToken())) return { ok: true, why: "machine credential" };
  const sub = subOf(d);
  const rows = sub ? (await d.sb(`memberships?user_id=eq.${enc(sub)}&select=role,projects(kind,office_key)`, { service: true })) || [] : [];
  const rank = (role) => ROLE_RANK[role] || 0;
  const trusted = rows.some((m) => (m.projects?.office_key && rank(m.role) >= ROLE_RANK.contributor)
    || (m.projects?.kind === "office" && rank(m.role) >= ROLE_RANK.lead));
  return trusted
    ? { ok: true, why: "office member" }
    : { ok: false, why: "Cloud AI is for office members — it needs the contributor role on a project that belongs to an office, or lead of an office. Local AI still works." };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/members-store.test.mjs`
Expected: PASS — `Tests  22 passed (22)` (measured on e208b0a's members-store).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/members-store.mjs WebApp/bridge/members-store.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
feat(bridge): requireSpend and canUseCloudAi — who may spend the founder's storage or AI (H0 D2): the machine credential, a contributor+ of a project that belongs to an office, or a lead+ of an office row — one rule for a project (requireSpend) and for /ai/*, which checks the account (canUseCloudAi). A refusal is a 403 in words; a self-made project is not trust

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-2: The AI gateway spends only on a trusted caller, a listed model, a capped reply and a budget

**Closes:** ai-1 (gateway half), bimdocs-1 (cloud-spend half: the guard sits in `chat()`, which /ai/chat, draft, integrity and ingest all call)

**Files:**
- Modify: `WebApp/bridge/ai-gateway.mjs:12-14` (imports), `:23` (comment), `:67-68` (comment), `:79` (budget after it), `:101-103` (blockedReason), `:112-121` (listProviders), `:123-165` (listModels), `:179-184` (chat), `:225-226` (max_tokens)
- Modify: `WebApp/bridge/bimdocs-ingest.mjs:66` (chunk calls pass `{ budget: false }`)
- Create test: `WebApp/bridge/ai-gateway-spend.test.mjs`
- Test: `WebApp/bridge/bimdocs-ingest.test.mjs` (append)

**Interfaces:**
- Consumes: `canUseCloudAi()` (from SPEND-1, members-store.mjs; lazily imported), `createLimiter({ max, windowMs })` (public-verify.mjs, existing), `createKeyedLimiter({ max, windowMs, maxKeys })` (public-verify.mjs, area gate-limits' Task 8), `currentSub()` (bridge-auth.mjs, existing).
- Produces:
  - `chat(request, { budget = true } = {}) -> Promise<{ text, toolCalls, provider, model }>` — new second argument (never read from an HTTP body). Throws 400 (off-list cloud model / unknown provider), 403 (`canUseCloudAi` refused; its `why` verbatim), 429 (budget).
  - `listProviders({ cloudRefusal = null } = {})` — with a refusal, cloud rows are `{ id, label, cloud, models, note, auth, available: false, blocked: cloudRefusal }` (no `configured`).
  - `listModels(id)` — a cloud provider returns `PROVIDERS[id].models` without calling the provider.
  - Env knobs: `SENTINEL_AI_PER_MIN` (default 60, all signed-in callers), `SENTINEL_AI_PER_USER_PER_MIN` (default 20).

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/ai-gateway-spend.test.mjs`:

```js
// H0 (D2): a cloud AI call is billed to the founder's key — only a model on the provider's list, only for a caller
// members-store's canUseCloudAi trusts, with a capped reply; and every signed-in caller stays inside the AI budget.
// ai-gateway reads its env at import, so each test imports a fresh copy together with a fresh bridge-auth (runWithAuth
// and the gateway then share one auth context). fetch is stubbed in every test: nothing leaves the machine.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { canUseCloudAi } = vi.hoisted(() => ({ canUseCloudAi: vi.fn() }));
vi.mock("./members-store.mjs", () => ({ canUseCloudAi }));

const ENV = { GEMINI_API_KEY: "test-key", SENTINEL_AI_CLOUD: "1", SENTINEL_AI_PER_MIN: "5", SENTINEL_AI_PER_USER_PER_MIN: "3", OLLAMA_URL: "http://127.0.0.1:59996" };
const jwt = (sub) => "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub })).toString("base64url") + ".sig";
const hi = [{ role: "user", content: "hi" }];

let ai, runWithAuth, fetchStub;
beforeEach(async () => {
  vi.resetModules();
  Object.assign(process.env, ENV);
  canUseCloudAi.mockReset().mockResolvedValue({ ok: true, why: "office member" });
  // One reply both paths accept: Ollama reads .message, the OpenAI-compatible path reads .choices.
  fetchStub = vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: "ok" }, choices: [{ message: { content: "ok" } }] }) }));
  vi.stubGlobal("fetch", fetchStub);
  ({ runWithAuth } = await import("./bridge-auth.mjs"));
  ai = await import("./ai-gateway.mjs");
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  vi.unstubAllGlobals();
});
const as = (sub, fn) => runWithAuth(jwt(sub), fn);

describe("cloud calls (D2)", () => {
  it("a model not on the provider's list is refused 400 before anything is sent", async () => {
    await expect(as("u1", () => ai.chat({ provider: "gemini", model: "gemini-ultra-max", messages: hi })))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not on Sentinel's list/) });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("a caller canUseCloudAi refuses gets a 403 in its words; nothing is sent", async () => {
    canUseCloudAi.mockResolvedValue({ ok: false, why: "Cloud AI is for office members." });
    await expect(as("u1", () => ai.chat({ provider: "gemini", messages: hi })))
      .rejects.toMatchObject({ status: 403, message: "Cloud AI is for office members." });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("a trusted caller's call goes out with max_tokens, as the Claude path does", async () => {
    const out = await as("u1", () => ai.chat({ provider: "gemini", model: "gemini-flash-latest", messages: hi }));
    expect(out.text).toBe("ok");
    expect(JSON.parse(fetchStub.mock.calls[0][1].body)).toMatchObject({ model: "gemini-flash-latest", max_tokens: 4096 });
  });

  it("a local call never asks canUseCloudAi; a name that is not a provider is a 400", async () => {
    await as("u1", () => ai.chat({ provider: "local", messages: hi }));
    expect(canUseCloudAi).not.toHaveBeenCalled();
    await expect(ai.chat({ provider: "__proto__", messages: hi })).rejects.toMatchObject({ status: 400 });
  });
});

describe("the AI budget (D2)", () => {
  it("each signed-in caller has a window of their own, one shared window caps them all, the machine credential is not counted", async () => {
    const call = (sub) => as(sub, () => ai.chat({ provider: "local", messages: hi }));
    for (let i = 0; i < 3; i++) await call("u1");                      // u1: 3 of 3 (shared: 3 of 5)
    await expect(call("u1")).rejects.toMatchObject({ status: 429 });  // over their own — the shared window is not spent
    await call("u2");
    await call("u3");                                                   // shared: 5 of 5
    await expect(call("u4")).rejects.toMatchObject({ status: 429 });  // room of their own, none shared
    for (let i = 0; i < 10; i++) await ai.chat({ provider: "local", messages: hi }); // no session: the machine credential
  });

  it("budget:false — one document ingest's chunks — is not counted", async () => {
    for (let i = 0; i < 10; i++) await as("u1", () => ai.chat({ provider: "local", messages: hi }, { budget: false }));
  });
});

describe("the pickers (D2)", () => {
  it("listModels for a cloud provider is its list — the provider is never called", async () => {
    expect(await ai.listModels("nemotron")).toEqual(ai.PROVIDERS.nemotron.models);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("listProviders with a refusal: cloud rows say why and not whether a key is armed; local is untouched", () => {
    const rows = ai.listProviders({ cloudRefusal: "Cloud AI is for office members." });
    for (const p of rows.filter((r) => r.cloud)) {
      expect(p).toMatchObject({ available: false, blocked: "Cloud AI is for office members." });
      expect(p).not.toHaveProperty("configured");
    }
    expect(rows.find((r) => r.id === "local")).toMatchObject({ available: true, configured: true });
  });
});
```

Append to `WebApp/bridge/bimdocs-ingest.test.mjs`:

```js
describe("ingest and the AI budget (H0, D2)", () => {
  it("each chunk's model call is budget:false — one upload, whose route already required a trusted caller", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    await ingestDocument(buf, opts);
    expect(chat.mock.calls[0][1]).toEqual({ budget: false });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run bridge/ai-gateway-spend.test.mjs bridge/bimdocs-ingest.test.mjs`
Expected: FAIL — the off-list model reaches `fetch` (no 400), `canUseCloudAi` is never called (no 403), the request body has no `max_tokens`, no 429 is ever thrown, `listModels("nemotron")` calls `fetch`, cloud rows still carry `configured`, `chat.mock.calls[0][1]` is `undefined`.

- [ ] **Step 3: Implement**

`WebApp/bridge/ai-gateway.mjs` lines 12-14 become:

```js
import Anthropic from "@anthropic-ai/sdk";
import { readdirSync } from "node:fs";
import { loadEnv } from "./thatopen-client.mjs";
import { createLimiter, createKeyedLimiter } from "./public-verify.mjs";
import { currentSub } from "./bridge-auth.mjs";
```

Line 23 becomes:

```js
// For a cloud provider the list IS the allowlist (H0, D2): chat() refuses any other model, because every call is billed
// to the founder's key. For local it is the picker's defaults — Ollama serves whatever is pulled.
```

Lines 67-68 (inside `nemotron`) become:

```js
    // NVIDIA rotates these often, and this list is exactly what chat() allows (H0) — update it here when a model is
    // retired (a retired one answers 404 at call time).
```

After line 79 (`const CLOUD_OPTIN = …`) insert:

```js

// H0 (D2): signed-in callers share one AI budget a minute, and each has their own — a per-user limit alone is bypassed
// by signing up again. Keyed on the verified sub (Funnel traffic all arrives from 127.0.0.1, so there is no per-IP);
// the machine credential (no sub) is not counted. ponytail: in-process fixed windows, reset on restart; past 1000 users
// the oldest user's window is dropped (createKeyedLimiter).
const AI_PER_MIN = Number(env.SENTINEL_AI_PER_MIN) || 60;
const AI_PER_USER_PER_MIN = Number(env.SENTINEL_AI_PER_USER_PER_MIN) || 20;
const aiShared = createLimiter({ max: AI_PER_MIN, windowMs: 60000 });
const aiPerUser = createKeyedLimiter({ max: AI_PER_USER_PER_MIN, windowMs: 60000, maxKeys: 1000 });
// Their own window first: a caller over it never spends the shared one.
const takeAiBudget = (sub) => !sub || (aiPerUser.take(sub) && aiShared.take());
```

Lines 101-103 (`blockedReason` head) become:

```js
export function blockedReason(id) {
  const p = Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : undefined; // "__proto__" is not a provider
  if (!p) return "Unknown provider.";
```

Lines 112-121 (`listProviders`) become:

```js
/** What the picker renders. Never leaks a key — only whether one is present, and not even that to a caller who may not
 *  use cloud AI (`cloudRefusal`: members-store canUseCloudAi's why): their cloud rows say only why not. */
export function listProviders({ cloudRefusal = null } = {}) {
  return Object.entries(PROVIDERS).map(([id, p]) => {
    const row = { id, label: p.label, cloud: p.cloud, models: p.models, note: p.note, auth: !p.cloud ? "none" : id === "claude" ? "login-or-key" : "key" };
    if (p.cloud && cloudRefusal) return { ...row, available: false, blocked: cloudRefusal };
    return {
      ...row,
      configured: p.cloud ? !!keyOf(id) || (id === "claude" && hasAnthropicProfile()) : true,
      available: blockedReason(id) === null,
      blocked: blockedReason(id),
    };
  });
}
```

Lines 123-165 (`listModels` with its doc comment) become:

```js
/**
 * The models a picker offers. A cloud provider offers exactly its list above — the list chat() allows (H0, D2) — and is
 * never asked, so opening a picker spends nothing on the founder's key. Local asks Ollama what is pulled, curated
 * first; the static list on any error.
 */
export async function listModels(id) {
  if (!Object.hasOwn(PROVIDERS, id)) throw Object.assign(new Error("Unknown provider."), { status: 404 });
  const p = PROVIDERS[id];
  if (p.cloud || blockedReason(id)) return p.models;
  try {
    const url = (env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
    const r = await fetch(`${url}/api/tags`);
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name).filter(Boolean);
    if (!names.length) return p.models;
    // Curated first here too — Ollama lists in its own order, which put "llava" (a VISION model)
    // at the top and made it the chat default. Match loosely: a pulled model is "qwen2.5:7b-instruct"
    // while the curated name may be "qwen2.5" or vice-versa.
    const pref = p.models.flatMap((c) => names.filter((n) => n === c || n.startsWith(`${c}:`) || c.startsWith(`${n.split(":")[0]}`)));
    const seen = new Set(pref);
    return [...pref, ...names.filter((n) => !seen.has(n)).sort()];
  } catch {
    return p.models; // Ollama offline or an unexpected shape — the static list is still usable
  }
}
```

Lines 179-184 (`chat` head) become:

```js
export async function chat({ provider = "local", model, system, messages = [], tools = [], format } = {}, { budget = true } = {}) {
  const blocked = blockedReason(provider);
  if (blocked) throw Object.assign(new Error(blocked), { status: 400 });

  const p = PROVIDERS[provider];
  const chosen = model || p.models[0];
  // H0 (D2): a cloud call is billed to the founder's key — only a model on the list above, and only for a caller
  // members-store's canUseCloudAi trusts (the machine credential, or an office member); both before anything is sent.
  if (p.cloud) {
    if (!p.models.includes(chosen))
      throw Object.assign(new Error(`${p.label} model "${chosen}" is not on Sentinel's list — use one of: ${p.models.join(", ")}`), { status: 400 });
    const may = await (await import("./members-store.mjs")).canUseCloudAi();
    if (!may.ok) throw Object.assign(new Error(may.why), { status: 403 });
  }
  // Every signed-in caller's call counts, local too (it runs on the founder's GPU). `budget: false` is only for one
  // document ingest's chunks (bimdocs-ingest), whose route already required a trusted caller for the project.
  if (budget && !takeAiBudget(currentSub()))
    throw Object.assign(new Error("Too many AI requests — wait a minute, then try again."), { status: 429 });
```

(the `const out = …` dispatch and `return` that follow stay as they are.)

Lines 225-226 (`viaOpenAiCompatible` body head) become:

```js
  const body = {
    model,
    max_tokens: 4096, // H0 (D2): capped as the Claude path is — an uncapped completion is billed in full
```

`WebApp/bridge/bimdocs-ingest.mjs` line 66 becomes:

```js
      ({ text } = await chat({ system, messages: [{ role: "user", content: user }], format: "json" }, { budget: false }));
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/ai-gateway-spend.test.mjs bridge/ai-gateway.test.mjs bridge/bimdocs-ingest.test.mjs bridge/bimdocs-ai.test.mjs`
Expected: PASS (the existing gemini/Ollama connection tests still pass: no session there means the machine credential).

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/ai-gateway.mjs WebApp/bridge/ai-gateway-spend.test.mjs WebApp/bridge/bimdocs-ingest.mjs WebApp/bridge/bimdocs-ingest.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(bridge): the AI gateway spends the founder's keys only on a trusted caller (H0 D2, ai-1, bimdocs-1) — chat() refuses a cloud model off the provider's list (400) and a caller canUseCloudAi does not trust (403, its words), caps OpenAI-compatible replies at 4096 tokens, and keeps every signed-in caller inside a shared and a per-user budget (429); cloud pickers list the allowlist without calling the provider; an untrusted caller's picker says why, never which keys are armed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-3: /ai/providers and /ai/chat — the refusal reaches the picker, and a chat body is at most 1 MB

**Closes:** ai-1 (route half: the picker leak and the 256 MB body on /ai/chat)

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs:620-628` (comment + /ai/providers), `:657-667` (/ai/chat)
- Create test: `WebApp/bridge/spend-routes.test.mjs` (the spawned-bridge harness SPEND-4, -5, -6, -7 and -10 append to)

**Interfaces:**
- Consumes: `canUseCloudAi()` (SPEND-1), `listProviders({ cloudRefusal })`, `chat()` (SPEND-2), `readBody(req, { max })` and `SMALL_JSON` (1 MB; area gate-limits' Task 2 imports it into bcf-service.mjs and already reads `/ai/chat` and `/ai/run-tool` with it; rejects `.status` 413).
- Produces: the test harness `spend-routes.test.mjs` with `call(method, path, { as, json, body, headers })`, `partial(path, as)`, `seen`, `tmp`, `P_OFF`, `P_LONE`.

- [ ] **Step 1: Write the failing test**

Create `WebApp/bridge/spend-routes.test.mjs`:

```js
// H0 spend routes (decisions D2, D10), end to end. A COPY of the bridge (as in request-boundary.test.mjs: a temp dir, a
// spare port, every store under a temp APPDATA, no .env reachable, never the managed bridge on :4100) talks to a FAKE
// PostgREST in this process, so a signed-in caller's role and office come from the real bridge code. Every refusal is
// checked to come before the body is read (partial()) and before anything is written (seen). Gemini is "armed" with a
// fake key so a refusal can be shown to come first; no test makes an allowed cloud call, so nothing leaves the machine.
// Projects: office-a (an office row), p-office (in office-a: u-contrib contributor, u-view viewer), p-lone (u-owner's
// self-made project with no office — what anyone who signs up can have).
// ponytail: the spawn harness is copied from request-boundary.test.mjs (reads-boundary.test.mjs has another); extract a
// shared helper when a fourth spawn test needs one.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <repo>/WebApp/bridge
const SECRET = "spend-only-jwt-secret", TOKEN = "spend-only-token";
const OFFICE = "00000000-0000-4000-8000-00000000000a";
const P_OFF = "00000000-0000-4000-8000-00000000000b";
const P_LONE = "00000000-0000-4000-8000-00000000000c";
const PROJECTS = [
  { id: OFFICE, key: "office-a", name: "Office A", kind: "office", office_key: null },
  { id: P_OFF, key: "p-office", name: "Office project", kind: "project", office_key: "office-a" },
  { id: P_LONE, key: "p-lone", name: "Self-made", kind: "project", office_key: null },
];
const MEMBERS = [
  { project_id: P_OFF, user_id: "u-contrib", role: "contributor" },
  { project_id: P_OFF, user_id: "u-view", role: "viewer" },
  { project_id: P_LONE, user_id: "u-owner", role: "owner" },
];
const seen = []; // "METHOD /rest/v1/…" for every call the fake PostgREST answered

const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwtFor = (sub) => {
  const head = part({ alg: "HS256", typ: "JWT" });
  const body = part({ sub, email: `${sub}@example.test`, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
const auth = (as) => ({ Authorization: `Bearer ${as === "service" ? TOKEN : jwtFor(as)}` });
const subOf = (header) => { try { return JSON.parse(Buffer.from(String(header).split(" ")[1].split(".")[1], "base64url")).sub ?? null; } catch { return null; } };

// Only the reads ensureProject / myRole / requireSpend / canUseCloudAi make; any other call answers [] (and is in seen).
function fakePostgrest(req, res) {
  const u = new URL(req.url, "http://fake");
  const json = (code, b) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  if (!u.pathname.startsWith("/rest/v1/")) return json(404, {}); // the JWKS fetch at start-up: none here
  seen.push(decodeURIComponent(`${req.method} ${u.pathname}${u.search}`));
  if (req.method !== "GET") return json(200, []);
  const eq = (k) => (u.searchParams.get(k) || "").replace(/^eq\./, "");
  const path = u.pathname.slice("/rest/v1/".length);
  if (path === "projects" && u.searchParams.has("key")) return json(200, PROJECTS.filter((p) => p.key === eq("key")));
  if (path === "projects" && u.searchParams.has("id")) // forwarded: RLS shows a member their project, nobody else
    return json(200, MEMBERS.some((m) => m.project_id === eq("id") && m.user_id === subOf(req.headers.authorization)) ? [{ id: eq("id") }] : []);
  if (path === "memberships" && u.searchParams.has("project_id"))
    return json(200, MEMBERS.filter((m) => m.project_id === eq("project_id")).map(({ user_id, role }) => ({ user_id, role })));
  if (path === "memberships" && u.searchParams.has("user_id"))
    return json(200, MEMBERS.filter((m) => m.user_id === eq("user_id")).map((m) => {
      const p = PROJECTS.find((x) => x.id === m.project_id);
      return { role: m.role, projects: { kind: p.kind, office_key: p.office_key } };
    }));
  return json(200, []);
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on("error", reject);
});

let tmp, child, fake, port, stderr = "";

beforeAll(async () => {
  fake = createServer(fakePostgrest);
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  tmp = mkdtempSync(join(tmpdir(), "sentinel-bridge-spend-"));
  const copy = join(tmp, "x", "bridge");
  mkdirSync(copy, { recursive: true });
  cpSync(here, copy, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
  symlinkSync(join(here, "..", "node_modules"), join(tmp, "x", "node_modules"), "junction");
  mkdirSync(join(tmp, "appdata"), { recursive: true });
  port = await freePort();
  const env = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot, // Windows crypto needs it
    TEMP: tmp, TMP: tmp, HOME: tmp, USERPROFILE: tmp,
    APPDATA: join(tmp, "appdata"),
    BCF_HOST: "127.0.0.1", BCF_PORT: String(port), BCF_TOKEN: TOKEN, SUPABASE_JWT_SECRET: SECRET,
    SUPABASE_URL: `http://127.0.0.1:${fake.address().port}`, SUPABASE_SERVICE_KEY: "fake-service-key", SUPABASE_ANON_KEY: "fake-anon-key",
    BCF_EVENT_POLL_MS: "0", // no cross-machine poll against the fake
    GEMINI_API_KEY: "fake-gemini-key", SENTINEL_AI_CLOUD: "1", OLLAMA_URL: "http://127.0.0.1:9",
  };
  child = spawn(process.execPath, [join(copy, "bcf-service.mjs")], { cwd: copy, env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { stderr += d; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the bridge copy exited with ${child.exitCode} before listening:\n${stderr}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 200) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`the bridge copy did not answer /health within 20 s:\n${stderr}`);
}, 30_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const gone = new Promise((r) => child.once("exit", r));
    child.kill();
    await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  }
  if (fake) await new Promise((r) => fake.close(r));
  if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); // the junction is unlinked, never followed
});

/** One whole request → { status, json, text }. */
const call = async (method, path, { as, json, body, headers = {} } = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    body: json !== undefined ? JSON.stringify(json) : body,
    headers: { ...auth(as), ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
  });
  const text = Buffer.from(await r.arrayBuffer()).toString("utf8");
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* a blob */ }
  return { status: r.status, json: parsed, text };
};

/** A POST whose head declares 10 MB and whose body stops after 16 bytes. A route that checks the caller first answers
 *  at once; one that reads the body first waits for bytes that never come, and this rejects after 3 s. */
const partial = (path, as) => new Promise((resolve, reject) => {
  const req = request({ host: "127.0.0.1", port, path, method: "POST", headers: { ...auth(as), "Content-Length": 10 * 1024 * 1024 } }, (res) => {
    let text = "";
    res.setEncoding("utf8");
    res.on("data", (d) => { text += d; });
    res.on("end", () => { req.destroy(); resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }); });
  });
  req.setTimeout(3000, () => req.destroy(new Error(`no answer to POST ${path} within 3 s — the route read the body before it checked the caller`)));
  req.on("error", reject);
  req.write(Buffer.alloc(16, 0x41));
});

describe("/ai/* — cloud AI only for a trusted caller (D2)", () => {
  it("GET /ai/providers: a caller outside every office sees why on each cloud row, never whether a key is armed", async () => {
    const { status, json } = await call("GET", "/ai/providers", { as: "u-owner" });
    expect(status).toBe(200);
    const cloud = json.providers.filter((p) => p.cloud);
    expect(cloud.length).toBeGreaterThan(0);
    for (const p of cloud) {
      expect(p).toMatchObject({ available: false, blocked: expect.stringMatching(/office/) });
      expect(p).not.toHaveProperty("configured");
    }
    expect(json.providers.find((p) => p.id === "local")).toMatchObject({ available: true });
  });

  it("GET /ai/providers: an office contributor sees the bridge's own state (gemini is armed in this copy)", async () => {
    const { json } = await call("GET", "/ai/providers", { as: "u-contrib" });
    expect(json.providers.find((p) => p.id === "gemini")).toMatchObject({ available: true, configured: true });
  });

  it("POST /ai/chat to a cloud provider from outside every office: 403 in words, before any provider call", async () => {
    const { status, json } = await call("POST", "/ai/chat", { as: "u-owner", json: { provider: "gemini", messages: [{ role: "user", content: "hi" }] } });
    expect(status).toBe(403);
    expect(json.message).toMatch(/office/);
  });

  it("POST /ai/chat with a model not on the list: 400, even for an office contributor", async () => {
    const { status, json } = await call("POST", "/ai/chat", { as: "u-contrib", json: { provider: "gemini", model: "gemini-ultra-max", messages: [] } });
    expect(status).toBe(400);
    expect(json.message).toMatch(/not on Sentinel's list/);
  });

  it("POST /ai/chat over 1 MB: 413 — a chat turn is not a document", async () => {
    const { status } = await call("POST", "/ai/chat", { as: "service", json: { provider: "local", messages: [{ role: "user", content: "x".repeat(1_100_000) }] } });
    expect(status).toBe(413);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run bridge/spend-routes.test.mjs`
Expected: FAIL — only the /ai/providers cases can fail: the first gets cloud rows with `available: true` and a `configured` field (today's route calls `listProviders()` with no refusal). The two chat refusals already pass after SPEND-2, and the 1.1 MB chat already answers 413 after gate-limits' Task 2 (`readBody(req, { max: SMALL_JSON })`); both stay as regression tests.

- [ ] **Step 3: Implement**

In `WebApp/bridge/bcf-service.mjs`, lines 620-628 (the AI gateway comment and the /ai/providers route) become:

```js
  // ── AI gateway: GET /ai/providers · GET /ai/tools · POST /ai/run-tool · GET /ai/models · POST /ai/chat ──
  // The one seam every AI feature calls. Provider keys stay on the bridge; the SPA never holds one
  // and never talks to a provider directly. Cloud providers need a key AND SENTINEL_AI_CLOUD=1 —
  // local (Ollama) is the default and needs neither. A cloud call also needs a trusted caller and a listed model, and
  // every signed-in call spends from the AI budget (ai-gateway chat(), H0 D2). Lazily imported so a bridge with no AI
  // configured never pays for loading the SDK.
  if (url.pathname === "/ai/providers" && req.method === "GET") {
    const ai = await import("./ai-gateway.mjs");
    // A caller who may not use cloud AI sees why on each cloud row — never whether a paid key is armed.
    let may;
    try { may = await (await import("./members-store.mjs")).canUseCloudAi(); }
    catch (e) { may = { ok: false, why: `Cloud AI unavailable — the office check failed: ${String(e?.message || e).slice(0, 120)}` }; }
    return send(res, 200, { providers: ai.listProviders({ cloudRefusal: may.ok ? null : may.why }) });
  }
```

Lines 657-667 (/ai/chat, as gate-limits' Task 2 left them) become:

```js
  if (url.pathname === "/ai/chat" && req.method === "POST") {
    const ai = await import("./ai-gateway.mjs");
    try {
      return send(res, 200, await ai.chat(await readBody(req, { max: SMALL_JSON })));
    } catch (e) {
      // A blocked provider, a refused caller (403), the budget (429), an over-size body (413) or an unreachable local
      // model is the caller's problem to fix and the message says how — pass it through rather than a generic 500.
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/spend-routes.test.mjs bridge/request-boundary.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/bcf-service.mjs WebApp/bridge/spend-routes.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(bridge): /ai/providers tells an untrusted caller why cloud AI is off instead of which paid keys are armed, and /ai/chat reads its body (at most SMALL_JSON, 1 MB) inside its try, so every refusal — 400, 403, 413, 429 — comes back in words (H0 D2, ai-1). Adds the spawned-bridge spend test with a fake PostgREST

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-4: /ai/run-tool — a write tool needs the caller's role on the project it names, not the `approved` flag

**Closes:** ai-2 (the /ai/run-tool path; the zero-row `set live` refusal inside `setLiveVersion` is area zero-rows' cde-11)

**Files:**
- Modify: `WebApp/bridge/ai-tools.mjs:10-17` (comment + imports), `:102-107` (raise_issue run), `:123-125` (propose_elements run), `:131-140` (transition_container schema), `:145-150` (set_live_version schema), `:175-186` (runTool)
- Modify: `WebApp/bridge/bcf-service.mjs:638-648` (/ai/run-tool route)
- Test: `WebApp/bridge/ai-tools.test.mjs` (replace whole file), `WebApp/bridge/spend-routes.test.mjs` (append)

**Interfaces:**
- Consumes: `requireMinRole(key, min)` (members-store.mjs, existing), `cde.versionOnKey(key, version_id)` (cde-store.mjs:674, existing), `currentUserToken()` (bridge-auth.mjs), `readBody(req, { max })` and `SMALL_JSON` (area gate-limits' Task 2).
- Produces: `runTool(name, args, { allowWrites })` — for `policy: "write"`: 403 without `allowWrites` (unchanged), 400 when `args.project` is missing, then `requireMinRole(project, "contributor")`, then `versionOnKey(project, version_id)` when the call names a version — all before `run`. `set_live_version` and `transition_container` schemas require `project`.

- [ ] **Step 1: Write the failing tests**

Replace `WebApp/bridge/ai-tools.test.mjs` with:

```js
// The in-app agent's write tools (cohesion phase 5a, spec 2026-09-26 Decision 4): an agent can propose elements and
// ask for a transition, but it can never stamp a verdict on a version, register one, or override the verdict guard.
// H0 (D10): the review gate's `approved` is a UX step — every write tool also needs the caller's contributor role on
// the project the call names, and a version the call names must be on that project.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireMinRole } = vi.hoisted(() => ({ requireMinRole: vi.fn(async () => {}) }));
vi.mock("./members-store.mjs", () => ({ requireMinRole }));
vi.mock("./cde-store.mjs", () => ({
  adjudicateProposal: vi.fn(async () => ({ verdict: "recorded" })),
  transition: vi.fn(async () => ({ state: "published" })),
  setLiveVersion: vi.fn(async () => ({ ok: true })),
  versionOnKey: vi.fn(async () => ({})),
  ensureProject: vi.fn(async () => ({ id: "row-uuid", key: "aster-tower" })),
  newTopicObject: vi.fn((pid, t) => ({ project_id: pid, ...t })),
  bcfCreateTopic: vi.fn(async (t) => t),
  createFolder: vi.fn(async () => ({})),
  listProjects: vi.fn(async () => []),
}));

import * as cde from "./cde-store.mjs";
import { runWithAuth } from "./bridge-auth.mjs";
import { runTool, TOOLS } from "./ai-tools.mjs";

const V = "aaaaaaaa-0000-4000-8000-000000000001";
const ANY = { project: "aster-tower", version_id: V, state: "shared", title: "t", name: "f", elements: [] };
const writes = TOOLS.filter((t) => t.policy === "write").map((t) => t.name);
const session = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64url") + ".sig";

beforeEach(() => {
  vi.clearAllMocks();
  requireMinRole.mockImplementation(async () => {});
});

describe("the agent's write tools pass only what they declare", () => {
  it("propose_elements hands the referee source, elements and note — never version_id, register or override", async () => {
    await runTool("propose_elements", {
      project: "aster-tower", source: "copilot", elements: [], note: "n",
      version_id: V, register: { name: "x.ifc", size_bytes: 1, sha256: "ab".repeat(32) }, override: "because",
    }, { allowWrites: true });
    expect(cde.adjudicateProposal).toHaveBeenCalledTimes(1);
    expect(cde.adjudicateProposal.mock.calls[0][0]).toBe("aster-tower");
    expect(cde.adjudicateProposal.mock.calls[0][1]).toEqual({ source: "copilot", elements: [], note: "n" });
  });

  it("transition_container never passes an override (only a signed-in lead can, on the web)", async () => {
    await runTool("transition_container", { project: "aster-tower", version_id: V, state: "published", actor: "copilot", note: "n", override: "because" }, { allowWrites: true });
    expect(cde.transition).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(cde.transition.mock.calls[0])).not.toMatch(/override|because/);
  });

  it("transition_container tells the model that a version under review is published only by its last approval (phase 6b)", () => {
    const d = TOOLS.find((t) => t.name === "transition_container").description;
    expect(d).toMatch(/a version under review is published only by its last approval/);
    expect(d).toMatch(/the database refuses this tool/);
  });
});

describe("approved is a UX step, not a permission (H0, D10)", () => {
  it("every write tool asks requireMinRole(project, 'contributor') before it runs", async () => {
    for (const name of writes) await runTool(name, ANY, { allowWrites: true });
    expect(requireMinRole.mock.calls).toEqual(writes.map(() => ["aster-tower", "contributor"]));
  });

  it("a viewer's approved write is refused in the role's words and runs nothing", async () => {
    requireMinRole.mockRejectedValue(Object.assign(new Error("this action requires the contributor role (you are viewer)"), { status: 403 }));
    for (const name of writes) await expect(runTool(name, ANY, { allowWrites: true })).rejects.toMatchObject({ status: 403 });
    for (const fn of ["adjudicateProposal", "transition", "setLiveVersion", "bcfCreateTopic", "createFolder"]) expect(cde[fn]).not.toHaveBeenCalled();
  });

  it("a write that names no project is a 400 and runs nothing", async () => {
    await expect(runTool("set_live_version", { version_id: V }, { allowWrites: true }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/project/) });
    expect(requireMinRole).not.toHaveBeenCalled();
    expect(cde.setLiveVersion).not.toHaveBeenCalled();
  });

  it("a version the call names must be on the named project", async () => {
    cde.versionOnKey.mockRejectedValueOnce(Object.assign(new Error(`version ${V} is not on aster-tower`), { status: 400 }));
    await expect(runTool("set_live_version", { project: "aster-tower", version_id: V }, { allowWrites: true })).rejects.toMatchObject({ status: 400 });
    expect(cde.setLiveVersion).not.toHaveBeenCalled();
  });

  it("without the tick a write is still refused (403) before any role read; a read tool never asks for a role", async () => {
    await expect(runTool("create_folder", { project: "aster-tower", name: "x" })).rejects.toMatchObject({ status: 403 });
    await runTool("list_projects", {});
    expect(requireMinRole).not.toHaveBeenCalled();
  });

  it("set_live_version and transition_container declare the project they act on", () => {
    for (const name of ["set_live_version", "transition_container"])
      expect(TOOLS.find((t) => t.name === name).input_schema.required).toContain("project");
  });
});

describe("what a write tool records", () => {
  it("raise_issue files the topic under the project key (bcf_topics resolves project_id as the key)", async () => {
    await runTool("raise_issue", { project: "aster-tower", title: "t" }, { allowWrites: true });
    expect(cde.newTopicObject.mock.calls[0][0]).toBe("aster-tower");
  });

  it("a signed-in caller's proposal is labelled copilot-agent, not a source the model claims; the machine credential keeps its label", async () => {
    await runWithAuth(session, () => runTool("propose_elements", { project: "aster-tower", source: "Revit", elements: [] }, { allowWrites: true }));
    expect(cde.adjudicateProposal.mock.calls[0][1].source).toBe("copilot-agent");
    await runTool("propose_elements", { project: "aster-tower", source: "pipeline", elements: [] }, { allowWrites: true });
    expect(cde.adjudicateProposal.mock.calls[1][1].source).toBe("pipeline");
  });
});
```

Append to `WebApp/bridge/spend-routes.test.mjs`:

```js
describe("/ai/run-tool — the caller's role, not the approved flag (D10)", () => {
  it("a viewer's approved write is a 403 in words and nothing is written", async () => {
    const from = seen.length;
    const { status, json } = await call("POST", "/ai/run-tool", { as: "u-view", json: { name: "create_folder", args: { project: "p-office", name: "x" }, approved: true } });
    expect(status).toBe(403);
    expect(json.message).toMatch(/contributor/);
    expect(seen.slice(from).filter((line) => !line.startsWith("GET "))).toEqual([]);
  });

  it("a write that names no project: 400, nothing read or written", async () => {
    const from = seen.length;
    const { status, json } = await call("POST", "/ai/run-tool", { as: "u-contrib", json: { name: "set_live_version", args: { version_id: randomUUID() }, approved: true } });
    expect(status).toBe(400);
    expect(json.message).toMatch(/project/);
    expect(seen.slice(from)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run bridge/ai-tools.test.mjs bridge/spend-routes.test.mjs`
Expected: FAIL — `requireMinRole` is never called; the viewer's write runs (`createFolder`/`bcfCreateTopic` called; the spawned bridge answers the viewer's create_folder with 200 or a Supabase error, not 403); `set_live_version` without project runs; `newTopicObject` gets `"row-uuid"`; the signed-in proposal keeps `"Revit"`; the schemas lack `project`.

- [ ] **Step 3: Implement**

`WebApp/bridge/ai-tools.mjs` lines 10-17 become:

```js
// So capability is broad and CONTROL is per-tool:
//   policy "read"  — no side effects. Runs immediately, no approval, no ledger entry.
//   policy "write" — changes project state. NEVER auto-runs. The model can only ever PROPOSE it; a
//                    human ticks it in the review gate, and the result lands in the audit trail. The tick is a UX
//                    step, not a permission: runTool also needs the caller's contributor role on the project the call
//                    names (H0, D10).
//
// That's the same shape as GhostBuilder's review window, for the same reason: the model proposes, a
// person disposes, and the record is written either way.
import * as cde from "./cde-store.mjs";
import { requireMinRole } from "./members-store.mjs";
import { currentUserToken } from "./bridge-auth.mjs";
```

Lines 102-107 (`raise_issue` run) become:

```js
    run: async ({ project, title, description, priority, assigned_to }) => {
      await cde.ensureProject(project);
      // bcf_topics.project_id is the project KEY (RLS resolves it as the key, 0016) — the row id filed an orphan topic.
      return cde.bcfCreateTopic(
        cde.newTopicObject(project, { title, description, priority, assigned_to, creation_author: "copilot-agent" }),
      );
    },
```

Lines 123-125 (`propose_elements` run and its comment) become:

```js
    // Only the declared fields reach the referee: an agent can neither stamp a verdict on a version (version_id),
    // register one (register) nor override anything — whatever else the model puts in the call is dropped. A signed-in
    // caller's proposal is labelled by the tool, not by a source the model claims ("from Revit"); the ledger's actor
    // column carries the verified identity (D6). The machine credential keeps its own label.
    run: ({ project, source, elements, note }) => cde.adjudicateProposal(project, { source: currentUserToken() ? "copilot-agent" : source, elements, note }),
```

Lines 131-139 (`transition_container` input_schema) become:

```js
    input_schema: {
      type: "object", required: ["project", "version_id", "state"],
      properties: {
        project: { type: "string", description: "project key — the version must be on it" },
        version_id: { type: "string", description: "the container VERSION id, from list_containers" },
        state: { type: "string", enum: ["wip", "shared", "published", "archived"] },
        actor: { type: "string" },
        note: { type: "string" },
      },
    },
```

Lines 146-149 (`set_live_version` input_schema) become:

```js
    input_schema: {
      type: "object", required: ["project", "version_id"],
      properties: { project: { type: "string", description: "project key — the version must be on it" }, version_id: { type: "string" }, actor: { type: "string" } },
    },
```

Lines 175-186 (`runTool` with its doc comment) become:

```js
/**
 * Execute one tool. `allowWrites` MUST come from a human decision, never from the model — a `write`
 * tool called without it throws rather than silently doing nothing, so a missing gate is a loud bug
 * instead of an agent that appears to work and quietly changes nothing. It is a UX step, not a permission (H0, D10):
 * a write also needs the caller's contributor role on the project the call names (the machine credential passes), and a
 * version the call names must be on that project — all before the tool runs.
 */
export async function runTool(name, args = {}, { allowWrites = false } = {}) {
  const t = byName.get(name);
  if (!t) throw Object.assign(new Error(`Unknown tool: ${name}`), { status: 400 });
  if (t.policy === "write") {
    if (!allowWrites)
      throw Object.assign(new Error(`"${name}" changes project state and needs explicit approval.`), { status: 403 });
    const project = typeof args.project === "string" ? args.project.trim() : "";
    if (!project) throw Object.assign(new Error(`"${name}" changes a project and must name it (project) — nothing was run`), { status: 400 });
    await requireMinRole(project, "contributor");
    if (args.version_id !== undefined) await cde.versionOnKey(project, args.version_id);
  }
  return t.run(args);
}
```

`WebApp/bridge/bcf-service.mjs` lines 638-648 (/ai/run-tool) become:

```js
  // Run ONE tool. `approved:true` is the human's tick from the review gate: without it a write-policy tool is refused,
  // so a missing gate fails loudly. It is not a permission — runTool checks the caller's role on the project the call
  // names (H0, D10). The body is one tool call, at most SMALL_JSON (1 MB).
  if (url.pathname === "/ai/run-tool" && req.method === "POST") {
    const t = await import("./ai-tools.mjs");
    try {
      const { name, args, approved } = await readBody(req, { max: SMALL_JSON });
      return send(res, 200, { name, result: await t.runTool(name, args || {}, { allowWrites: approved === true }) });
    } catch (e) {
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/ai-tools.test.mjs bridge/spend-routes.test.mjs bridge/mcp-server.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/ai-tools.mjs WebApp/bridge/ai-tools.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/spend-routes.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(bridge): an AI write tool needs the caller's contributor role on the project it names, not the approved flag (H0 D10, ai-2) — runTool refuses a write that names no project (400), checks requireMinRole and that a named version is on that project before running; set_live_version and transition_container declare project; raise_issue files under the key, not the row id; a signed-in caller's proposal is labelled copilot-agent; /ai/run-tool reads at most 1 MB inside its try

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-5: POST /ifc — the project it is for, checked before one byte is read; only an IFC reaches the platform

**Closes:** ifc-1

**Files:**
- Modify: `WebApp/bridge/platform-publish.mjs:1-2` (add `isIfcStep` export above `uploadIfcAsFrag`)
- Modify: `WebApp/bridge/bcf-service.mjs:543` (insert `requireSpendFor` after `publicReceiptVerify`), `:943-964` (/ifc route)
- Create test: `WebApp/bridge/platform-publish.test.mjs`
- Test: `WebApp/bridge/spend-routes.test.mjs` (append)

**Interfaces:**
- Consumes: `requireSpend(key)` (SPEND-1); gate-limits' Task 3 `holdUpload` / `readRaw` lines in the /ifc block (kept as gate-limits leaves them — batch 2's review made the slot line `holdUpload(req, res, currentSub())`; Task 3 deleted the `MAX_UPLOAD` line and the constant).
- Produces:
  - `isIfcStep(bytes: Buffer|Uint8Array) -> boolean` (platform-publish.mjs) — the first 64 bytes open with `ISO-10303-21;` after an optional UTF-8 BOM and whitespace.
  - `requireSpendFor(key: string|null, param: string) -> Promise<projectRow>` (bcf-service.mjs module function) — 400 when `key` is empty, 503 when the CDE is not configured, else `requireSpend(key)`. Used again by SPEND-6.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/bridge/platform-publish.test.mjs`:

```js
// Only an IFC goes to the platform (H0, ifc-1): uploadIfcAsFrag uploads the raw bytes when fragment conversion fails
// (Governed Intake relies on that), so POST /ifc refuses anything that is not a STEP file before it gets there.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isIfcStep } from "./platform-publish.mjs";

describe("isIfcStep", () => {
  it("an IFC opens with ISO-10303-21; — after a BOM or blank lines too, from a Buffer or a Uint8Array", () => {
    expect(isIfcStep(readFileSync(new URL("./fixtures/minimal.ifc", import.meta.url)))).toBe(true);
    expect(isIfcStep(Buffer.from("\uFEFF\r\n  ISO-10303-21;\nHEADER;"))).toBe(true);
    expect(isIfcStep(new TextEncoder().encode("ISO-10303-21;"))).toBe(true);
  });

  it("anything else is not", () => {
    for (const s of ["", "hello", "PK\u0003\u0004", "<html>", "ISO-10303-2", "x ISO-10303-21;"]) expect(isIfcStep(Buffer.from(s))).toBe(false);
  });
});
```

Append to `WebApp/bridge/spend-routes.test.mjs`:

```js
describe("POST /ifc — the founder's platform storage (D2, ifc-1)", () => {
  it("names no project: 400 before the body is read", async () => {
    const { status, json } = await partial("/ifc?name=a.ifc", "service");
    expect(status).toBe(400);
    expect(json.message).toMatch(/projectId/);
  });

  it("a viewer is refused before one byte of the body is read", async () => {
    const { status, json } = await partial("/ifc?projectId=p-office&name=a.ifc", "u-view");
    expect(status).toBe(403);
    expect(json.message).toMatch(/contributor role/);
  });

  it("the owner of a self-made project (no office) is refused before the body is read", async () => {
    const { status, json } = await partial("/ifc?projectId=p-lone&name=a.ifc", "u-owner");
    expect(status).toBe(403);
    expect(json.message).toMatch(/no office/);
  });

  it("an office contributor's body that is not an IFC is refused before it reaches the platform", async () => {
    const { status, json } = await call("POST", "/ifc?projectId=p-office&name=a.ifc", { as: "u-contrib", body: "hello, not a model", headers: { "Content-Type": "application/x-step" } });
    expect(status).toBe(400);
    expect(json.message).toMatch(/Not an IFC/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run bridge/platform-publish.test.mjs bridge/spend-routes.test.mjs`
Expected: FAIL — `isIfcStep` is not exported (`TypeError: isIfcStep is not a function`); the three `partial` cases reject with "no answer to POST /ifc… within 3 s — the route read the body before it checked the caller"; the non-IFC body gets 503 (platform not configured), not 400.

- [ ] **Step 3: Implement**

`WebApp/bridge/platform-publish.mjs` lines 1-2 become:

```js
// IFC bytes → fragments → That Open Platform item. Shared by the /ifc upload route and Governed Intake
// so a file published by either path lands the same way (viewable .frag first, raw .ifc as fallback).

/** True when the bytes open as an IFC: a STEP physical file, "ISO-10303-21;" first (after a UTF-8 BOM or whitespace).
 *  POST /ifc checks it before uploadIfcAsFrag, whose raw-bytes fallback would otherwise upload anything (H0, ifc-1). */
export const isIfcStep = (bytes) =>
  /^(\xEF\xBB\xBF)?\s*ISO-10303-21;/.test(Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(64, bytes.byteLength)).toString("latin1"));
```

In `WebApp/bridge/bcf-service.mjs`, after the closing `}` of `publicReceiptVerify` (line 543) insert:

```js

/** H0 (D2): an upload that spends the founder's platform storage or disk names its project in the query, and the caller
 *  is checked against that project (members-store requireSpend) before one byte of the body is read. */
async function requireSpendFor(key, param) {
  if (!key) throw Object.assign(new Error(`name the project: ?${param}=<project key> — nothing was uploaded`), { status: 400 });
  if (!(await import("./cde-store.mjs")).cdeConfigured())
    throw Object.assign(new Error("CDE not configured — an upload is checked against its project's office, so the bridge needs SUPABASE_URL + SUPABASE_SERVICE_KEY in config/.env."), { status: 503 });
  return (await import("./members-store.mjs")).requireSpend(key);
}
```

The /ifc block (lines 943-964) changes as below. Lines without `+`/`-` are the text gate-limits' Task 3 and its batch 2 review left (its `holdUpload` and `readRaw` lines):

```diff
   // ── IFC upload → That Open Platform (Phase C: browser bakes → bridge uploads; token stays server-side) ──
-  //   POST /ifc?name=<x.ifc>&version=<vN>&projectId=<id>   body = raw .ifc bytes
+  //   POST /ifc?name=<x.ifc>&version=<vN>&projectId=<Sentinel project key>   body = raw .ifc bytes
   // The browser can't hold THATOPEN_API_KEY, so it POSTs the baked IFC here; the bridge converts it to
-  // fragments and uploads via the same @thatopen/services client the outbox watcher uses.
+  // fragments and uploads via the same @thatopen/services client the outbox watcher uses. That spends the founder's
+  // platform storage, so the caller must be trusted for the project it names before one byte is read (H0, D2).
   if (url.pathname === "/ifc" && req.method === "POST") {
     try {
+      await requireSpendFor(url.searchParams.get("projectId"), "projectId");
       holdUpload(req, res, currentSub()); // held until this answer is done
       const bytes = await readRaw(req);
       if (!bytes.length) return send(res, 400, { message: "Empty body — POST the .ifc file as the request body." });
+      // Only an IFC reaches the platform: the shared publish path uploads the raw bytes when conversion fails (Governed
+      // Intake relies on that fallback), so a body that is not a STEP file is refused here.
+      const { uploadIfcAsFrag, isIfcStep } = await import("./platform-publish.mjs");
+      if (!isIfcStep(bytes)) return send(res, 400, { message: "Not an IFC file — it must start with ISO-10303-21; nothing was uploaded." });
       const name = url.searchParams.get("name") || "sentinel-model.ifc";
       const versionTag = url.searchParams.get("version") || "v1";
-
-      const { uploadIfcAsFrag } = await import("./platform-publish.mjs");
-      return send(res, 200, await uploadIfcAsFrag(bytes, name, versionTag));
-    } catch (e) {
-      const msg = String(e?.message || e);
-      // A revoked/rotated platform token 401s "Token not found" here — turn that into an actionable message.
-      if (e?.status === 401 || /token not found|unauthor/i.test(msg))
-        return send(res, 401, { message: `Platform API token invalid or expired — regenerate THATOPEN_API_KEY (dashboard → Data → API Tokens) in config/.env and restart the bridge. [${msg.slice(0, 40)}]` });
-      return send(res, e?.status || 500, { message: msg });
+      let out;
+      try { out = await uploadIfcAsFrag(bytes, name, versionTag); }
+      catch (e) {
+        const msg = String(e?.message || e);
+        // A revoked/rotated platform token 401s "Token not found" here — turn that into an actionable message. Only the
+        // upload's errors: a refused caller above keeps its own 401/403 words.
+        if (e?.status === 401 || /token not found|unauthor/i.test(msg))
+          return send(res, 401, { message: `Platform API token invalid or expired — regenerate THATOPEN_API_KEY (dashboard → Data → API Tokens) in config/.env and restart the bridge. [${msg.slice(0, 40)}]` });
+        throw e;
+      }
+      return send(res, 200, out);
+    } catch (e) {
+      return send(res, e?.status || 500, { message: String(e?.message || e) });
     }
   }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/platform-publish.test.mjs bridge/spend-routes.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/platform-publish.mjs WebApp/bridge/platform-publish.test.mjs WebApp/bridge/bcf-service.mjs WebApp/bridge/spend-routes.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(bridge): POST /ifc spends the founder's platform storage only for a trusted caller of the project it names (H0 D2, ifc-1) — ?projectId is required, requireSpend runs before one byte is read, a body that is not an ISO-10303-21 file is refused before the upload, and the platform-token message is kept for the upload's own errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-6: /cde/files — encrypted blobs belong to a project; the web names it

**Closes:** cdefiles-1, cdefiles-2, cde-8

**Files:**
- Modify: `WebApp/bridge/bcf-service.mjs:16` (fs import), `:20` (bridge-auth import), `:63` (insert `MAX_BLOB` after `MAX_DOC_UPLOAD`), `:966-994` (both /cde/files routes, replaced whole)
- Modify: `WebApp/src/setups/secure-store.ts:57-81`
- Create test: `WebApp/src/setups/secure-store.test.ts`
- Test: `WebApp/bridge/spend-routes.test.mjs` (append)

**Interfaces:**
- Consumes: `requireSpendFor(key, param)` (SPEND-5), `readRaw(req, { max })` and `holdUpload(req, res, sub)` (from area gate-limits: the slot is held until the answer is done, and a caller that went away during the role check is refused with its slot freed), `currentSub()`, `currentUserToken()` (bridge-auth.mjs; READS-3 adds the same import — whichever lands first adds it), `cde.ensureProject` (existing; a non-member is refused — 404 after READS-1).
- Produces:
  - `POST /cde/files?project=<key>` → 201 `{ id, size }`, blob at `CDE_FILES_ROOT/<project id>/<id>.bin`; 400 no project, 503 CDE off, 403 untrusted, 413 over `MAX_BLOB` (env `SENTINEL_MAX_BLOB_MB`, default 100), 429 no upload slot.
  - `GET /cde/files/<id>?project=<key>` → the blob streamed, for members of the project; without `?project` only the machine credential reads, and only a pre-H0 blob in the root folder.
  - `putEncryptedFile(base, projectKey, file)` / `getDecryptedFile(base, projectKey, id)` (secure-store.ts, same signatures) — send `?project=`, and throw the bridge's words on refusal.

- [ ] **Step 1: Write the failing tests**

Create `WebApp/src/setups/secure-store.test.ts`:

```ts
// Encrypted CDE files belong to a project (H0, cdefiles-1/2): the upload and the download both name it, so the bridge
// stores the blob in that project's folder and checks the caller against that project. A refusal keeps the bridge's words.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { bfetch } = vi.hoisted(() => ({ bfetch: vi.fn() }));
vi.mock("./bridge-fetch", () => ({ bfetch }));
vi.mock("./crypto", () => ({
  encryptBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  decryptBytes: vi.fn(async (_key: string, cipher: ArrayBuffer) => cipher),
}));

import { putEncryptedFile, getDecryptedFile } from "./secure-store";

const res = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new Uint8Array([9, 9]).buffer }) as unknown as Response;

describe("secure-store names the project on every blob call", () => {
  beforeEach(() => bfetch.mockReset());

  it("uploads to /cde/files?project=<key>", async () => {
    bfetch.mockResolvedValue(res(201, { id: "b1", size: 3 }));
    const stored = await putEncryptedFile("http://b/", "tower one", new File(["plain"], "a.pdf", { type: "application/pdf" }));
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/files?project=tower%20one");
    expect(stored).toEqual({ id: "b1", name: "a.pdf", size: 5, mime: "application/pdf" });
  });

  it("a refused upload throws the bridge's words", async () => {
    bfetch.mockResolvedValue(res(403, { message: "tower belongs to no office — nothing was sent" }));
    await expect(putEncryptedFile("http://b", "tower", new File(["x"], "a.pdf")))
      .rejects.toThrow("Upload failed (HTTP 403): tower belongs to no office — nothing was sent");
  });

  it("downloads from /cde/files/<id>?project=<key>; a refusal without words names the status", async () => {
    bfetch.mockResolvedValue(res(200, null));
    await getDecryptedFile("http://b", "tower one", "b2");
    expect(bfetch.mock.calls[0][0]).toBe("http://b/cde/files/b2?project=tower%20one");
    bfetch.mockResolvedValue(res(404, null));
    await expect(getDecryptedFile("http://b", "tower one", "b3")).rejects.toThrow("Download failed (HTTP 404)");
  });
});
```

Append to `WebApp/bridge/spend-routes.test.mjs`:

```js
describe("/cde/files — encrypted blobs belong to a project (D2, cdefiles-1/2, cde-8)", () => {
  const blobs = () => join(tmp, "appdata", "Sentinel", "cde-files");
  let id;

  it("POST that names no project is a 400, a self-made project's owner a 403 — both before the body is read", async () => {
    const none = await partial("/cde/files", "u-contrib");
    expect(none.status).toBe(400);
    expect(none.json.message).toMatch(/project/);
    const lone = await partial("/cde/files?project=p-lone", "u-owner");
    expect(lone.status).toBe(403);
    expect(lone.json.message).toMatch(/no office/);
  });

  it("an office contributor stores a blob in the project's own folder", async () => {
    const r = await call("POST", "/cde/files?project=p-office", { as: "u-contrib", body: "ciphertext-bytes", headers: { "Content-Type": "application/octet-stream" } });
    expect(r.status).toBe(201);
    id = r.json.id;
    expect(existsSync(join(blobs(), P_OFF, `${id}.bin`))).toBe(true);
    expect(existsSync(join(blobs(), `${id}.bin`))).toBe(false);
  });

  it("a viewer of the project reads it back; a non-member cannot", async () => {
    const ok = await call("GET", `/cde/files/${id}?project=p-office`, { as: "u-view" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("ciphertext-bytes");
    const stranger = await call("GET", `/cde/files/${id}?project=p-office`, { as: "u-owner" });
    expect([403, 404]).toContain(stranger.status);
  });

  it("a signed-in caller must name the project", async () => {
    const r = await call("GET", `/cde/files/${id}`, { as: "u-contrib" });
    expect(r.status).toBe(400);
  });

  it("a blob from before H0 (unbound, in the root folder) is read by the machine credential only", async () => {
    const old = randomUUID();
    mkdirSync(blobs(), { recursive: true });
    writeFileSync(join(blobs(), `${old}.bin`), "old-cipher");
    const machine = await call("GET", `/cde/files/${old}`, { as: "service" });
    expect(machine.status).toBe(200);
    expect(machine.text).toBe("old-cipher");
    expect((await call("GET", `/cde/files/${old}?project=p-office`, { as: "u-contrib" })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/setups/secure-store.test.ts bridge/spend-routes.test.mjs`
Expected: FAIL — secure-store posts to `http://b/cde/files` with no `?project`, and a refusal throws `Upload failed (HTTP 403)` without the words; the bridge answers `POST /cde/files` with no project by reading the whole body (the `partial` case times out), stores the blob in the root folder, and serves `GET /cde/files/<id>` to a signed-in caller without a project.

- [ ] **Step 3: Implement**

`WebApp/bridge/bcf-service.mjs` line 16 becomes:

```js
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, existsSync, createReadStream } from "node:fs";
```

Line 20 needs `currentUserToken` and `currentSub`: gate-limits' Tasks 3 and 4 already made it `import { runWithAuth, resolveActor, currentSub, currentUserToken } from "./bridge-auth.mjs";`, so leave it as it is (add the two names only if they are missing).

After the `const MAX_DOC_UPLOAD = …` line (63) insert:

```js
// Encrypted CDE attachments (POST /cde/files): drawings and documents, not models — far below the 2 GB upload cap (request-limits uploadCap). H0 (cde-8).
const MAX_BLOB = (Number(process.env.SENTINEL_MAX_BLOB_MB) || 100) * 1024 * 1024;
```

Replace the whole encrypted-blob section — from the comment `// ── Encrypted file blobs (Phase 2, private CDE)` (line 966) through the end of the `GET /cde/files/:id` block (line 994), whatever gate-limits left in it — with:

```js
  // ── Encrypted file blobs (Phase 2, private CDE): POST /cde/files?project=<key> · GET /cde/files/:id?project=<key> ──
  // The body is already AES-GCM ciphertext (IV‖ct) from the browser; we store/serve opaque bytes only. Each blob lives
  // in its project's folder (CDE_FILES_ROOT/<project id>/<id>.bin): storing one spends the founder's disk, so the
  // caller must be trusted for that project before one byte is read (H0 D2, cdefiles-1), and reading one needs
  // membership of it (cdefiles-2). Above the /cde/ block: these routes answer their own 503 when the CDE is off.
  if (url.pathname === "/cde/files" && req.method === "POST") {
    try {
      const proj = await requireSpendFor(url.searchParams.get("project"), "project");
      holdUpload(req, res, currentSub()); // held until this answer is done
      const bytes = await readRaw(req, { max: MAX_BLOB });
      if (!bytes.length) return send(res, 400, { message: "Empty body — nothing was stored." });
      const id = randomUUID();
      const dir = join(CDE_FILES_ROOT, proj.id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.bin`), bytes);
      return send(res, 201, { id, size: bytes.length });
    } catch (e) {
      if (!(e?.status === 401 || e?.status === 403)) console.error(`[cde] ${req.method} ${url.pathname} → ${e?.status || 500}:`, e?.message || e);
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
  const fm = url.pathname.match(/^\/cde\/files\/([A-Za-z0-9-]+)$/);
  if (fm && req.method === "GET") {
    try {
      const key = url.searchParams.get("project");
      const name = `${basename(fm[1])}.bin`; // basename() guards path traversal
      let file = null;
      if (key) {
        const cde = await import("./cde-store.mjs");
        if (!cde.cdeConfigured()) return send(res, 503, { message: "CDE not configured — encrypted files are stored per project, so the bridge needs SUPABASE_URL + SUPABASE_SERVICE_KEY." });
        file = join(CDE_FILES_ROOT, (await cde.ensureProject(key)).id, name); // a non-member is refused here
      }
      // Blobs stored before H0 sit unbound in the root folder: only the machine credential still reads those.
      if (!currentUserToken() && (!file || !existsSync(file))) file = join(CDE_FILES_ROOT, name);
      if (!file) return send(res, 400, { message: "name the project: GET /cde/files/<id>?project=<project key>" });
      if (!existsSync(file)) return send(res, 404, { message: "Blob not found" });
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-cache", ...corsHeaders(res) });
      const stream = createReadStream(file); // streamed: parallel reads of a large blob never hold it whole in memory
      stream.on("error", () => res.destroy());
      return stream.pipe(res);
    } catch (e) {
      return send(res, e?.status || 500, { message: String(e?.message || e) });
    }
  }
```

`WebApp/src/setups/secure-store.ts` lines 57-81 become:

```ts
/** The bridge's own words for a refusal (a 403 names the missing role or office), else the status. */
async function failure(r: Response, what: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as { message?: string } | null;
  return `${what} failed (HTTP ${r.status})${j?.message ? `: ${j.message}` : ""}`;
}

/** Encrypt a file client-side, upload only the ciphertext, cache it locally, and return its ref. The bridge keeps each
 *  blob in its project's folder and checks the caller against that project (H0), so the upload names it. */
export async function putEncryptedFile(base: string, projectKey: string, file: File): Promise<StoredFile> {
  const cipher = await encryptBytes(projectKey, await file.arrayBuffer());
  const r = await bfetch(`${base.replace(/\/$/, "")}/cde/files?project=${encodeURIComponent(projectKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: cipher,
  });
  if (!r.ok) throw new Error(await failure(r, "Upload"));
  const { id } = await r.json();
  await cachePut(id, cipher.buffer);
  return { id, name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
}

/** Fetch the ciphertext for a ref (cache-first) and decrypt it to plaintext bytes. */
export async function getDecryptedFile(base: string, projectKey: string, id: string): Promise<ArrayBuffer> {
  let cipher = await cacheGet(id);
  if (!cipher) {
    const r = await bfetch(`${base.replace(/\/$/, "")}/cde/files/${encodeURIComponent(id)}?project=${encodeURIComponent(projectKey)}`);
    if (!r.ok) throw new Error(await failure(r, "Download"));
    cipher = await r.arrayBuffer();
    await cachePut(id, cipher);
  }
  return decryptBytes(projectKey, cipher);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/setups/secure-store.test.ts src/setups/crypto.test.ts bridge/spend-routes.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/bcf-service.mjs WebApp/bridge/spend-routes.test.mjs WebApp/src/setups/secure-store.ts WebApp/src/setups/secure-store.test.ts
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(cde): encrypted blobs belong to a project (H0 D2, cdefiles-1, cdefiles-2, cde-8) — POST /cde/files?project= needs a trusted caller of that project before one byte is read, is capped at SENTINEL_MAX_BLOB_MB (100) and one upload slot, and stores under the project's folder; GET needs membership and streams; a pre-H0 unbound blob is read by the machine credential only; the web names the project and shows the bridge's words on a refusal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-7: POST /cde/:key/intake — a trusted caller before one byte is read

**Closes:** cde-2, cde-rem-2 (with SPEND-5, which gates the other door into `uploadIfcAsFrag`; the route's `requireSpend` is gate-limits-3's, this task pins it end to end)

**Files:**
- Test: `WebApp/bridge/spend-routes.test.mjs` (append). No code change: gate-limits' Task 3 already put `const { requireSpend } = await import("./members-store.mjs"); await requireSpend(p1);` first in the intake route (bcf-service.mjs:1233), and a second call would read the project twice. This task pins that route's refusals end to end.

**Interfaces:**
- Consumes: `requireSpend(key)` (SPEND-1), called by gate-limits' Task 3. No new names.
- Note: `runIntake` keeps its order (upload, then `registerFileVersion`). The route now admits only the machine credential or a contributor+ — exactly who `cde.couldRegister` (cde-store.mjs:856) says could register — so the `couldRegister`-before-upload change in cde-2/cde-rem-2's fix text adds nothing and is not made; `runIntake` has no other caller.

- [ ] **Step 1: Write the failing test**

Append to `WebApp/bridge/spend-routes.test.mjs`:

```js
describe("POST /cde/:key/intake — the founder's platform storage (D2, cde-2, cde-rem-2)", () => {
  it("a viewer is refused before one byte of the body is read", async () => {
    const { status, json } = await partial("/cde/p-office/intake?name=a.ifc&source=cli", "u-view");
    expect(status).toBe(403);
    expect(json.message).toMatch(/contributor role/);
  });

  it("the owner of a self-made project (no office) is refused before the body is read, and nothing reaches the ledger", async () => {
    const from = seen.length;
    const { status, json } = await partial("/cde/p-lone/intake?name=a.ifc&source=cli", "u-owner");
    expect(status).toBe(403);
    expect(json.message).toMatch(/no office/);
    expect(seen.slice(from).filter((line) => !line.startsWith("GET "))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — it passes on arrival**

Run: `npx vitest run bridge/spend-routes.test.mjs bridge/intake-logic.test.mjs`
Expected: PASS — gate-limits' Task 3 already checks the caller before the body (without it, both intake cases would reject with "no answer to POST /cde/p-…/intake… within 3 s — the route read the body before it checked the caller"). Do not add a second `requireSpend` to the route.

- [ ] **Step 3: (no code change)**

- [ ] **Step 4: (covered by Step 2)**

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/spend-routes.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
test(bridge): Governed Intake spends the founder's platform project only for a trusted caller of the project (H0 D2, cde-2, cde-rem-2) — pins, end to end, that a viewer or the owner of a self-made project gets a 403 in words before one byte of the IFC is read, and nothing is judged, audited or uploaded (the check is gate-limits-3's requireSpend)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-8: AI draft and integrity on a document — contributor+, and a cloud provider needs a trusted caller

**Closes:** bimdocs-1 (route half; the gateway half is SPEND-2)

**Files:**
- Modify: `WebApp/bridge/bimdocs-ai.mjs:5` (imports), `:19-27` (wire), `:56-58` and `:75-77` (the two entry points)
- Test: `WebApp/bridge/bimdocs-ai.test.mjs:13-21` (baseDeps) and append

**Interfaces:**
- Consumes: `requireMinRole(key, min)` (members-store.mjs, existing), `requireSpend(key)` (SPEND-1), `PROVIDERS` (ai-gateway.mjs).
- Produces: `draftSection(key, docId, sectionId, { provider, model }, deps)` and `integrityReport(key, docId, { provider, model }, deps)` — same signatures; `deps.requireMinRole` / `deps.requireSpend` test seams. Both check before the document is read.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/bimdocs-ai.test.mjs` replace `baseDeps` (lines 13-21) with:

```js
const baseDeps = (chat) => ({
  chat,
  getDoc: vi.fn(async () => ({ ...DOC })),
  complianceReport: vi.fn(async () => ({ sections: [] })),
  listChecks: vi.fn(() => ({ checks: [{ id: "c1", label: "L", description: "D" }], planned: [] })),
  deliverableStatus: vi.fn(async () => ({ summary: { total: 0 } })),
  ensureProject: vi.fn(async () => ({ id: "p1", key: "demo", name: "Demo" })),
  projectNamingRuleset: vi.fn(async () => ({ ruleset: null, source: "unknown" })),
  requireMinRole: vi.fn(async () => {}),
  requireSpend: vi.fn(async () => ({ id: "p1", key: "demo" })),
});
```

Append at the end of the file:

```js
describe("who may run the AI on a document (H0, bimdocs-1)", () => {
  const refuse = (words) => vi.fn(async () => { throw Object.assign(new Error(words), { status: 403 }); });

  it("a viewer is refused before the document is read or any AI call — the panel's canEdit, server-side", async () => {
    const deps = baseDeps(vi.fn());
    deps.requireMinRole = refuse("this action requires the contributor role (you are viewer)");
    await expect(draftSection("demo", "d1", "s2", {}, deps)).rejects.toMatchObject({ status: 403 });
    await expect(integrityReport("demo", "d1", {}, deps)).rejects.toMatchObject({ status: 403 });
    expect(deps.requireMinRole).toHaveBeenCalledWith("demo", "contributor");
    expect(deps.getDoc).not.toHaveBeenCalled();
    expect(deps.chat).not.toHaveBeenCalled();
  });

  it("a cloud provider also asks requireSpend for this project; local does not", async () => {
    const deps = baseDeps(vi.fn(async () => ({ text: '{"body":"x"}', provider: "gemini", model: "m" })));
    await draftSection("demo", "d1", "s2", { provider: "gemini" }, deps);
    expect(deps.requireSpend).toHaveBeenCalledWith("demo");
    deps.requireSpend.mockClear();
    await draftSection("demo", "d1", "s2", {}, deps);
    expect(deps.requireSpend).not.toHaveBeenCalled();
  });

  it("requireSpend's refusal stops a cloud integrity run: 403, the document unread, no AI", async () => {
    const deps = baseDeps(vi.fn());
    deps.requireSpend = refuse("demo belongs to no office — nothing was sent");
    await expect(integrityReport("demo", "d1", { provider: "nemotron" }, deps)).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/no office/) });
    expect(deps.getDoc).not.toHaveBeenCalled();
    expect(deps.chat).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run bridge/bimdocs-ai.test.mjs`
Expected: FAIL — `requireMinRole` and `requireSpend` are never called; the viewer's draft reaches `getDoc` and `chat`.

- [ ] **Step 3: Implement**

`WebApp/bridge/bimdocs-ai.mjs` line 5 becomes:

```js
import { chat as realChat, PROVIDERS } from "./ai-gateway.mjs";
import * as members from "./members-store.mjs";
```

Lines 19-27 (`wire`) become:

```js
const wire = (deps) => ({
  chat: deps.chat || realChat,
  getDoc: deps.getDoc || store.getDoc,
  complianceReport: deps.complianceReport || store.complianceReport,
  listChecks: deps.listChecks || registry.listChecks,
  deliverableStatus: deps.deliverableStatus || deliverables.deliverableStatus,
  ensureProject: deps.ensureProject || cde.ensureProject,
  projectNamingRuleset: deps.projectNamingRuleset || cde.projectNamingRuleset,
  requireMinRole: deps.requireMinRole || members.requireMinRole,
  requireSpend: deps.requireSpend || members.requireSpend,
});

/** H0 (bimdocs-1): running the AI on a document is editing work — contributor or above, as the panel's canEdit — and
 *  a cloud provider spends the founder's key, so it also needs a trusted caller for this project (members-store
 *  requireSpend). Both before the document is read. */
async function mayRunAi(key, provider, d) {
  await d.requireMinRole(key, "contributor");
  if (PROVIDERS[provider || "local"]?.cloud) await d.requireSpend(key);
}
```

In `draftSection`, lines 57-58 become:

```js
  const d = wire(deps);
  await mayRunAi(key, provider, d);
  const doc = await d.getDoc(key, docId);
```

In `integrityReport`, lines 76-77 become:

```js
  const d = wire(deps);
  await mayRunAi(key, provider, d);
  const doc = await d.getDoc(key, docId);
```

(`PROVIDERS[provider]` for a name that is not a provider, e.g. `"__proto__"`, has no `cloud: true`; chat() then refuses it as "Unknown provider." — SPEND-2.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/bimdocs-ai.test.mjs bridge/bimdocs-ai-logic.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/bimdocs-ai.mjs WebApp/bridge/bimdocs-ai.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(bimdocs): AI draft and integrity need the contributor role, and a cloud provider needs a trusted caller of the project (H0 D2, bimdocs-1) — both checked before the document is read, so a viewer or the owner of a self-made project cannot send a document to a paid provider on the founder's key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-9: Document originals are bound to their project

**Closes:** bimdocs-4

**Files:**
- Modify: `WebApp/bridge/bimdocs-ingest.mjs:5` (fs import), `:28-35` (sourceFilePath → projectSourceDir + sourceFilePath), `:44-52` (ingestDocument)
- Modify: `WebApp/bridge/bimdocs-store.mjs:139` (commit check after `ensureProject`), `:160-164` (getSourceRef)
- Modify: `WebApp/bridge/bcf-service.mjs` — the ingest route's `ingestDocument(…)` call (`:1511` at e208b0a; passes the project id) and the source route (`:1521`). The ingest route's `const proj = await requireSpend(p1);` is gate-limits' Task 3's and stays.
- Test: `WebApp/bridge/bimdocs-ingest.test.mjs` (imports, `opts`, append), `WebApp/bridge/bimdocs-store-guards.test.mjs` (imports, append)

**Interfaces:**
- Consumes: `ensureProject` (cde-store.mjs, existing); the ingest route's `proj` (gate-limits' Task 3: `const proj = await requireSpend(p1);`).
- Produces (bimdocs-ingest.mjs):
  - `projectSourceDir(projectId: uuid) -> string` — `sourceDir()/<projectId>`, created; 400 when `projectId` is not a uuid.
  - `sourceFilePath(projectId, file_id, { legacy = false } = {}) -> string` — the file in the project's folder; with `legacy: true` also the flat folder (documents committed before H0); a directory never matches; 404 otherwise. (Signature change: the old `sourceFilePath(file_id)` had one caller, bcf-service.mjs:1521.)
  - `ingestDocument(buffer, { filename, doc_type, project_id })` — `project_id` now required.
- Produces (bimdocs-store.mjs): `getSourceRef(key, docId) -> { ...source, project_id } | null`; `createDocFromIngest` answers 400 "the original file was not uploaded to this project — …; nothing was saved" when `source.file_id` is not in the project's folder.

- [ ] **Step 1: Write the failing tests**

In `WebApp/bridge/bimdocs-ingest.test.mjs` replace lines 2 and 18 with:

```js
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
```

```js
const { ingestDocument, sourceFilePath } = await import("./bimdocs-ingest.mjs");
```

Replace line 32 (`const opts = …`) with:

```js
const P = "11111111-2222-4333-8444-555555555555";     // the project the upload is for
const OTHER = "66666666-7777-4888-8999-aaaaaaaaaaaa"; // someone else's project
const opts = { filename: "doc.txt", doc_type: "EIR", project_id: P };
const statusOf = (fn) => { try { fn(); return "no throw"; } catch (e) { return e.status; } };
```

Append at the end:

```js
describe("originals are bound to their project (H0, bimdocs-4)", () => {
  it("ingest keeps the original in the project's own folder", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const { source } = await ingestDocument(buf, opts);
    expect(existsSync(join(dir, P, source.file_id))).toBe(true);
    expect(existsSync(join(dir, source.file_id))).toBe(false);
    expect(sourceFilePath(P, source.file_id)).toBe(join(dir, P, source.file_id));
  });

  it("another project's file_id names nothing here: 404", async () => {
    chat.mockResolvedValue({ text: '{"assignments":[]}' });
    const { source } = await ingestDocument(buf, opts);
    expect(statusOf(() => sourceFilePath(OTHER, source.file_id))).toBe(404);
  });

  it("a file from before H0 (the flat folder) is found only with legacy — the commit check never passes it", () => {
    const old = "12345678-1234-4123-8123-123456789abc.txt";
    writeFileSync(join(dir, old), "old original");
    expect(statusOf(() => sourceFilePath(P, old))).toBe(404);
    expect(sourceFilePath(P, old, { legacy: true })).toBe(join(dir, old));
  });

  it("a project folder is never read as a file", () => {
    mkdirSync(join(dir, OTHER), { recursive: true });
    expect(statusOf(() => sourceFilePath(P, OTHER, { legacy: true }))).toBe(404);
  });

  it("no project id: 400 before anything is stored or asked", async () => {
    await expect(ingestDocument(buf, { filename: "doc.txt", doc_type: "EIR" })).rejects.toMatchObject({ status: 400 });
    expect(readdirSync(dir)).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });
});
```

In `WebApp/bridge/bimdocs-store-guards.test.mjs` replace line 1 (`import { describe, it, expect, vi, beforeEach } from "vitest";`) with:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
```

(ZR-12's separate `import { runWithAuth } from "./bridge-auth.mjs";` stays.) Add `getSourceRef` to the `await import("./bimdocs-store.mjs")` destructuring (line 47 at e208b0a), which area zero-rows' ZR-8 (`patchSection`) and ZR-12 (`createDoc`, `createDocFromIngest`) have already extended — add the name, do not replace the line; after all three it reads:

```js
const { setSectionBindings, complianceReport, MAX_COMPLIANCE_CHECKS, transitionDoc, publishDoc, setSectionAnswer, setSectionPlan, readinessReport, patchSection, createDoc, createDocFromIngest, getSourceRef } = await import("./bimdocs-store.mjs");
```

Append at the end:

```js
describe("ingest commit — the original must belong to this project (H0, bimdocs-4)", () => {
  const P = "22222222-2222-4222-8222-222222222222", OTHER = "33333333-3333-4333-8333-333333333333";
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sentinel-bind-"));
    process.env.SENTINEL_BIMDOCS = dir;
    ensureProject.mockResolvedValue({ id: P });
    sb.mockResolvedValue([{ id: "d1", doc_type: "EIR", title: "t" }]);
  });
  afterEach(() => {
    delete process.env.SENTINEL_BIMDOCS;
    rmSync(dir, { recursive: true, force: true });
  });
  const put = (sub, fid) => { mkdirSync(join(dir, ...sub), { recursive: true }); writeFileSync(join(dir, ...sub, fid), "x"); return fid; };
  const commit = (file_id) => createDocFromIngest("k", { doc_type: "EIR", sections: [{ heading: "A" }], source: { file_id, name: "a.txt" } });

  it("a file uploaded to this project commits", async () => {
    await expect(commit(put([P], `${randomUUID()}.txt`))).resolves.toMatchObject({ id: "d1" });
  });

  it("another project's file, or a pre-H0 file in the flat folder, is a 400 and nothing is saved", async () => {
    for (const fid of [put([OTHER], `${randomUUID()}.txt`), put([], `${randomUUID()}.txt`)])
      await expect(commit(fid)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not uploaded to this project/) });
    expect(sb).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("getSourceRef names the document's project, so the source route reads that project's folder", async () => {
    doc = makeDoc({ source: { file_id: "f.txt", name: "a.txt" } });
    sb.mockImplementation(async () => [doc]);
    expect(await getSourceRef("k", doc.id)).toEqual({ file_id: "f.txt", name: "a.txt", project_id: "proj1" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run bridge/bimdocs-ingest.test.mjs bridge/bimdocs-store-guards.test.mjs`
Expected: FAIL — the original lands in the flat folder; `sourceFilePath(P, id)` treats `P` as the file id (404); an ingest without `project_id` stores the file and succeeds; a commit naming another project's file resolves; `getSourceRef` has no `project_id`.

- [ ] **Step 3: Implement**

`WebApp/bridge/bimdocs-ingest.mjs` line 5 becomes:

```js
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
```

Lines 28-35 (`sourceFilePath`) become:

```js
/** Where one project's originals live — bound by folder, so a file_id copied from another project names nothing here
 *  (H0, bimdocs-4). Project ids come from the database; anything else is refused before a path is built. */
export function projectSourceDir(projectId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(projectId || "")))
    throw err(400, "an original is stored under its project — project id required");
  const dir = join(sourceDir(), projectId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Traversal-safe path for a stored original of `projectId`. `legacy` also looks in the flat folder originals went to
 *  before H0 — only for reading a document committed then; the ingest commit check never passes it. */
export function sourceFilePath(projectId, file_id, { legacy = false } = {}) {
  const name = basename(String(file_id || ""));
  if (!/^[a-f0-9-]{36}(\.[a-z0-9]{1,8})?$/i.test(name)) throw err(404, "source not found");
  for (const dir of legacy ? [projectSourceDir(projectId), sourceDir()] : [projectSourceDir(projectId)]) {
    const path = join(dir, name);
    if (resolve(path).startsWith(resolve(dir) + sep) && existsSync(path) && statSync(path).isFile()) return path;
  }
  throw err(404, "source not found");
}
```

The `ingestDocument` head, as gate-limits' Task 3 left it (extract, chunk, the MAX_INGEST_CHUNKS 413, then store the original), from its signature through the `const source = …` line, becomes (gate-limits' order kept: a refused document stores nothing):

```js
export async function ingestDocument(buffer, { filename, doc_type, project_id } = {}) {
  const dir = projectSourceDir(project_id); // no project, no work: refused before anything is stored or asked
  const tpl = loadTemplates().find((t) => t.doc_type === doc_type);
  if (!tpl) throw err(400, `unknown doc_type '${doc_type}'`);

  const { pages, kind } = await extractText(buffer, filename);

  const chunks = chunkPages(pages);
  // A document too large to map is refused before its original is stored: a refusal keeps nothing on disk.
  if (chunks.length > MAX_INGEST_CHUNKS) {
    throw err(413, `document produced ${chunks.length} chunks, over the ${MAX_INGEST_CHUNKS} limit — split the document or raise SENTINEL_MAX_DOC_MB/the chunk limit`);
  }
  // Store the original BEFORE the AI work: a 503 from an unreachable model must not cost the upload.
  const file_id = `${randomUUID()}${extname(String(filename || "")).toLowerCase()}`;
  writeFileSync(join(dir, file_id), Buffer.from(buffer));
  const source = { file_id, name: basename(String(filename || "document")), kind, pages: pages.length, ingested_at: new Date().toISOString() };
```

(`projectSourceDir` creates the project's folder before the chunk check; gate-limits' "keeps nothing on disk" test counts files, not folders, so it stays green.)

`WebApp/bridge/bimdocs-store.mjs`: after line 139 (`const proj = await ensureProject(key);` inside `createDocFromIngest`) insert:

```js
  // H0 (bimdocs-4): the original must have been uploaded to THIS project — it lives in the project's own folder, so a
  // file_id copied from another project, or one from before H0, names nothing here.
  if (normalizedSource?.file_id !== undefined) {
    const { sourceFilePath } = await import("./bimdocs-ingest.mjs");
    try { sourceFilePath(proj.id, normalizedSource.file_id); }
    catch { throw err(400, "the original file was not uploaded to this project — ingest it here again; nothing was saved"); }
  }
```

Lines 160-164 (`getSourceRef` with its comment) become:

```js
/** The original uploaded file's descriptor for a document, or null when hand-authored — with the document's project id,
 *  whose folder holds the file (H0, bimdocs-4). */
export async function getSourceRef(key, docId) {
  const doc = await getDoc(key, docId);
  return doc.source ? { ...doc.source, project_id: doc.project_id } : null;
}
```

`WebApp/bridge/bcf-service.mjs`, in the ingest route: leave gate-limits' `const proj = await requireSpend(p1);` as it is (if it reads `await requireSpend(p1);`, make it `const proj = await requireSpend(p1);`; never re-add `ensureProject` here). Replace

```js
        return send(res, 200, await ingest.ingestDocument(raw, { filename: name, doc_type: docType }));
```

with

```js
        return send(res, 200, await ingest.ingestDocument(raw, { filename: name, doc_type: docType, project_id: proj.id }));
```

Line 1521 becomes:

```js
        // The document's own project folder; the flat folder too, only for a document committed before H0 bound originals.
        const buf = readFileSync(ingest.sourceFilePath(ref.project_id, ref.file_id, { legacy: true }));
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bridge/bimdocs-ingest.test.mjs bridge/bimdocs-store-guards.test.mjs bridge/bimdocs-store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/bimdocs-ingest.mjs WebApp/bridge/bimdocs-ingest.test.mjs WebApp/bridge/bimdocs-store.mjs WebApp/bridge/bimdocs-store-guards.test.mjs WebApp/bridge/bcf-service.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
fix(bimdocs): document originals are bound to their project (H0, bimdocs-4) — ingest stores under the project's own folder, the commit refuses a file_id that was not uploaded to that project (400, nothing saved), and the source route reads the document's project folder; originals from before H0 stay readable through the documents that already name them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-10: Document ingest keeps an original on the founder's disk only for a trusted caller

**Closes:** D2's "document ingest originals" (with SPEND-9, completes bimdocs-4's store side; the route's `requireSpend` and bimdocs-2's byte cap are gate-limits-3's, this task pins the refusals end to end)

**Files:**
- Test: `WebApp/bridge/spend-routes.test.mjs` (append). No code change: gate-limits' Task 3 already put `const proj = await requireSpend(p1);` before the upload slot and `readRaw` in the ingest route, and SPEND-9 passes `proj.id` on.

**Interfaces:**
- Consumes: `requireSpend(key)` (SPEND-1), called by gate-limits' Task 3 — returns the project row, whose `id` the ingest call uses (SPEND-9).

- [ ] **Step 1: Write the failing test**

Append to `WebApp/bridge/spend-routes.test.mjs`:

```js
describe("POST /bimdocs/:key/ingest — an original on the founder's disk (D2)", () => {
  it("a viewer is refused before one byte of the document is read", async () => {
    const { status, json } = await partial("/bimdocs/p-office/ingest?name=a.txt&doc_type=EIR", "u-view");
    expect(status).toBe(403);
    expect(json.message).toMatch(/contributor role/);
  });

  it("the owner of a self-made project (no office) is refused before the body is read, and nothing is stored", async () => {
    const { status, json } = await partial("/bimdocs/p-lone/ingest?name=a.txt&doc_type=EIR", "u-owner");
    expect(status).toBe(403);
    expect(json.message).toMatch(/no office/);
    expect(existsSync(join(tmp, "appdata", "Sentinel", "bimdocs", P_LONE))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — it passes on arrival**

Run: `npx vitest run bridge/spend-routes.test.mjs`
Expected: PASS — gate-limits' Task 3 checks the caller before the body (without it both cases would reject with "no answer to POST /bimdocs/p-…/ingest… within 3 s — the route read the body before it checked the caller"). Do not add a second `requireSpend` to the route.

- [ ] **Step 3: (no code change)**

- [ ] **Step 4: (covered by Step 2)**

- [ ] **Step 5: Commit**

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add WebApp/bridge/spend-routes.test.mjs
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
test(bimdocs): document ingest stores an original on the founder's disk only for a trusted caller of the project (H0 D2) — pins, end to end, that a viewer or the owner of a self-made project gets a 403 before one byte of the document is read and nothing is stored (the check is gate-limits-3's requireSpend)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task SPEND-11: Whole-suite check and the founder's projects

**Closes:** none (verification)

**Files:** none changed by code; `graphify-out/` may update.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS — every file green (the 1381-test baseline plus this area's and the other areas' new tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: 23 errors, the pre-existing baseline (ui-manager.ts etc.) — none in `src/setups/secure-store.ts` or `secure-store.test.ts`.

- [ ] **Step 3: Refresh the knowledge graph**

Run: `graphify update .` from `C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project`.
Then `git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" status --short graphify-out` — if it lists changes, commit them:

```bash
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" add graphify-out
git -C "C:/Users/yazan/Claude/Projects/Co BIM Assistant/sentinel-project" commit -m "$(cat <<'EOF'
chore(graphify): graph updated after the H0 spend changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: The founder's projects (read-only; report, do not change)**

After these tasks, signed-in web actions that spend — bake-upload (`POST /ifc`), attaching an encrypted file, Versions intake, document ingest, cloud AI — answer 403 on a project with no office. In the web app's Projects hub each card names its office: list for the founder every project he uploads to, attaches files in, ingests into or runs cloud AI on that shows no office, so he can attach it (Project settings ▸ Office) before this merges. Revit and every machine-credential path are unaffected. Also tell him: the office test is only as strong as migration 0033 (area migration) — it must be applied before the bridge faces the internet.

---

### Deferred

- **cde-8 (part): a total-disk budget for /cde/files.** Pure hardening once D2 holds: only the machine credential or an office contributor+ can store, each blob is capped at `MAX_BLOB` (100 MB) and one upload runs per user (gate-limits' `uploadSlot`). A quota needs size accounting over a folder tree — more than a few lines — with no live exposure left.
- **cde-8 / cde-rem-3 (part): streaming uploads to disk instead of buffering.** `readRaw` belongs to area gate-limits; with the caps and upload slots, memory is bounded at `MAX_BLOB` × 2 for blobs.
- **ai-1 / ai-2 / ifc-1 / cde-2 / cdefiles-1 (part, D13): the machine credential is trusted everywhere here** — it passes `requireSpend`, `canUseCloudAi` and write tools, and is not counted in the AI budget. The shared BCF_TOKEN god-key is owned by H4 (per-user Revit sign-in) and H6 (rotation).

Not deferred but closed elsewhere: ai-2's zero-row `set live` ledger row inside `setLiveVersion` is area zero-rows (cde-11); bimdocs-2's streamed-byte cap and cde-rem-3's lower `BCF_MAX_UPLOAD_MB` are area gate-limits; the SENTINEL_AI_USERS allowlist in ai-1's fix text is superseded by D2's office-based trust.
